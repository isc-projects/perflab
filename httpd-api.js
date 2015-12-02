"use strict";

let Database = require('./database.js');

const mongoUrl = 'mongodb://localhost/perflab';

let db = new Database(mongoUrl);

let getAllConfigs = (req, res, next) =>
	db.getAllConfigs().then(
		(data) => res.json(data),
		(e) => res.error(e.message)
	);

let getConfigById = (req, res, next, id) =>
	db.getConfigById(id).then(
		(data) => data ? res.json(data) : res.error("ID not found"),
		(e) => res.error(e.message)
	);

let insertConfig = (req, res, next) =>
	db.insertConfig(req.body).then(
		(data) => data ? res.json(data) : res.error(),
		(e) => res.error(e.message)
	);

let updateConfig = (req, res, next, id) =>
	db.updateConfigById(id, req.body).then(
		(data) => data ? res.json(data) : res.error("ID not found"),
		(e) => res.error(e.message)
	);

module.exports = {
	'/config': {
		'GET /': getAllConfigs,
		'GET /:id': getConfigById,
		'PUT /:id': updateConfig,
		'POST /': insertConfig
	}
}
