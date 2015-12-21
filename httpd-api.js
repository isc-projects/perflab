"use strict";

let Database = require('./database.js'),
	parseUrl = require('parseurl'),
	querystring = require('querystring'),
	settings = require('./settings');

let db = new Database(settings.mongoUrl);

// calls the given function, converting the result into
// JSON, or returning an HTTP error response if there's
// no data
function handler(f) {
	return function(req, res, next) {
		var ok = (data) => data ? res.json(data) : res.error();
		var err = (e) => res.error(e.message);
		var args = [].slice.call(arguments, 3);
		return f.apply(this, args).then(ok, err);
	}
}

// as above, but looks at the 'skip' and 'limit' parameters
// and passes those to the callback (after any bound parameters)
// and then adds 'Link:' headers to the result allowing the
// client to automatically find the next page of data
function pageHandler(f) {
	return function(req, res, next) {
		var url = parseUrl(req);
		var query = querystring.parse(url.query);
		var err = (e) => res.error(e.message);
		var args = [].slice.call(arguments, 3);

		var skip = +query.skip || 0;
		var limit = +query.limit || 15;
		if (limit < 0) { limit = 0; }
		args.push(skip, limit);

		function link(skip, limit, rel) {
			return `<?skip=${skip}&limit=${limit}>; rel="${rel}"`;
		}

		return f.apply(this, args).then((data) => {
			var links = [];
			if (skip > 0) {
				links.push(link(0, limit, "first"));
				links.push(link(Math.max(0, skip - limit), limit, "prev"));
			}
			if (data.length >= limit) {
				links.push(link(skip + limit, limit, "next"));
			}
			if (links.length) {
				res.headers({Link: links.join(', ')});
			}
			return res.json(data)
		}, err);
	}
}

// as 'handler' above, but takes any JSON that was passed
// in the request body and adds it as a parameter to those
// passed to the callback
function bodyHandler(f) {
	return function(req, res, next) {
		var args = [].slice.call(arguments, 3);
		args.push(req.body);
		var ok = (data) => data ? res.json(data) : res.error();
		var err = (e) => res.error(e.message);
		return f.apply(this, args).then(ok, err);
	}
}

module.exports = {
	'/config': {
		'GET /':				handler(db.getAllConfigs),
		'GET /:id':				handler(db.getConfigById),
		'DELETE /:id':			handler(db.deleteConfigById),
		'PUT /:id':				bodyHandler(db.updateConfig),
		'POST /':				bodyHandler(db.insertConfig),
		'GET /run/:id/':		handler(db.getRunsByConfigId),
		'GET /run/:id/paged/':	pageHandler(db.getRunsByConfigId)
	},
	'/run': {
		'GET /:id':				handler(db.getRunById),
		'GET /test/:id/':		handler(db.getAllTestsByRunId)
	},
	'/test': {
		'GET /:id':				handler(db.getTestById)
	},
	'/queue': {
		'GET /':				handler(db.getQueue),
		'GET /:id/enabled':		handler(db.getQueueEntryEnabled),
		'PUT /:id/enabled/':	bodyHandler(db.setQueueEntryEnabled),
		'GET /:id/repeat':		handler(db.getQueueEntryRepeat),
		'PUT /:id/repeat/':		bodyHandler(db.setQueueEntryRepeat)
	},
	'/control': {
		'GET /':				handler(db.getControl),
		'GET /paused':			handler(db.getPaused),
		'PUT /paused/':			bodyHandler(db.setPaused)
	},
	'/log': {
		'GET /':				handler(db.getLog)
	}
}
