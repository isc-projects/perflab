"use strict";

let Database = require('./database.js'),
	parseUrl = require('parseurl'),
	querystring = require('querystring');

const mongoUrl = 'mongodb://localhost/perflab';

let db = new Database(mongoUrl);

function handler(f) {
	return function(req, res, next) {
		var ok = (data) => data ? res.json(data) : res.error();
		var err = (e) => res.error(e.message);
		var args = [].slice.call(arguments, 3);
		return f.apply(this, args).then(ok, err);
	}
}

function pageHandler(f) {
	return function(req, res, next) {
		var url = parseUrl(req);
		var query = querystring.parse(url.query);
		var err = (e) => res.error(e.message);
		var args = [].slice.call(arguments, 3);

		var skip = +query.skip || 0;
		var limit = +query.limit || 15;
		args.push(skip, limit);

		function link(skip, limit, rel) {
			return `<?skip=${skip}&limit=${limit}>; rel="${rel}"`;
		}

		return f.apply(this, args).then((data) => {
			var links = [];
			if (skip > 0) {
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

// appends an implicit request body arg to the parameters
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
		'GET /':			handler(db.getAllConfigs),
		'GET /:id':			handler(db.getConfigById),
		'DELETE /:id':		handler(db.deleteConfigById),
		'PUT /:id':			bodyHandler(db.updateConfig),
		'POST /':			bodyHandler(db.insertConfig),
		'GET /run/:id/':	pageHandler(db.getRunsByConfigId)
	},
	'/run': {
		'GET /test/:id/':	handler(db.getAllTestsByRunId)
	},
	'/test': {
		'GET /:id':			handler(db.getTestById)
	},
	'/queue': {
		'GET /':			handler(db.getQueue),
		'GET /paused/':		handler(db.getPaused),
		'PUT /paused/':		bodyHandler(db.setPaused)
	},
	'/log': {
		'GET /':			handler(db.getLog)
	}
}
