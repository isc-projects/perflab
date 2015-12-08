"use strict";

let Database = require('./database.js');

const mongoUrl = 'mongodb://localhost/perflab';

let db = new Database(mongoUrl);

function handler(f) {
	return function(req, res, next) {
		var args = [].slice.call(arguments, 3);
		args.push(req.body);		// implicit additional arg
		return f.apply(this, args).then(
			(data) => data ? res.json(data) : res.error(),
			(e) => res.error(e.message)
		);
	}
}

module.exports = {
	'/config': {
		'GET /':			handler(db.getAllConfigs),
		'GET /:id':			handler(db.getConfigById),
		'DELETE /:id':		handler(db.deleteConfigById),
		'PUT /:id':			handler(db.updateConfig),
		'POST /':			handler(db.insertConfig),
		'GET /run/:id/':	handler(db.getAllRunsByConfigId)
	},
	'/run': {
		'GET /test/:id/':	handler(db.getAllTestsByRunId)
	},
	'/test': {
		'GET /:id':			handler(db.getTestById)
	},
	'/queue': {
		'GET /':			handler(db.getQueue)
	},
	'/log': {
		'GET /':			handler(db.getLog)
	}
}
