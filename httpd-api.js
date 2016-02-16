"use strict";

let Database = require('./database.js'),
	parseUrl = require('parseurl'),
	querystring = require('querystring');

let db = new Database();

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
function pageHandler(f) {
	return function(req, res, next) {
		var url = parseUrl(req);
		var query = querystring.parse(url.query);
		var ok = (data) => data ? res.json(data) : res.error();
		var err = (e) => res.error(e.message);
		var args = [].slice.call(arguments, 3);

		var skip = +query.skip || 0;
		var limit = +query.limit || 0;
		if (limit < 0) { limit = 0; }
		args.push(skip, limit);

		return f.apply(this, args).then(ok, err);
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
		'GET /':						handler(db.getConfigs),
		'GET /:id':						handler(db.getConfigById),
		'DELETE /:id':					handler(db.deleteConfigById),
		'PUT /:id':						bodyHandler(db.updateConfig),
		'POST /':						bodyHandler(db.insertConfig),
		'GET /:id/queue/enabled':		handler(db.getQueueEntryEnabled),
		'PUT /:id/queue/enabled/':		bodyHandler(db.setQueueEntryEnabled),
		'GET /:id/queue/repeat':		handler(db.getQueueEntryRepeat),
		'PUT /:id/queue/repeat/':		bodyHandler(db.setQueueEntryRepeat),
		'PUT /:id/queue/priority/':		bodyHandler(db.setQueueEntryPriority),
		'GET /run/:id/':				pageHandler(db.getRunsByConfigId)
	},
	'/run': {
		'GET /:id':						handler(db.getRunById),
		'GET /:id/recalc':				handler(db.updateStatsByRunId),
		'GET /test/:id/':				handler(db.getTestsByRunId)
	},
	'/test': {
		'GET /:id':						handler(db.getTestById)
	},
	'/queue': {
	},
	'/control': {
		'GET /':						handler(db.getControl),
		'GET /paused':					handler(db.getPaused),
		'PUT /paused/':					bodyHandler(db.setPaused)
	},
	'/log': {
		'GET /':						handler(db.getLog)
	}
}
