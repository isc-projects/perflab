#!/usr/bin/env node

'use strict';

let MongoClient = require('mongodb'),
	ObjectID = MongoClient.ObjectID;

class Database {
	constructor (url) {

		let oid = (id) => (id instanceof ObjectID) ? id : ObjectID.createFromHexString(id);

		let query = (f) => 
			MongoClient.connect(url).then((db) => {
				let close = () => db.close();
				let res = f.call(null, db);
				res.then(close, close);
				return res;
			});

		this.getConfigByName = (name) =>
			query((db) => db.collection('config')
					.findOne({name}));

		this.getConfigById = (id) =>
			query((db) => db.collection('config')
					.findOne({_id: oid(id)}));

		this.deleteConfigById = (id) =>
			query((db) => db.collection('config')
					.remove({_id: oid(id)}));

		this.updateConfig = (id, config) =>
			query((db) => {
				config._id = oid(config._id);
				config.created = new Date(config.created);
				config.updated = new Date();
				return db.collection('config')
					.update({_id: config._id}, config);
			});

		this.insertConfig = (config) =>
			query((db) => {
				config.created = new Date();
				config.updated = new Date();
				return db.collection('config')
					.insert(config).then(() => config);
			});

		this.getAllConfigs = () =>
			query((db) => db.collection('config').find().toArray());

		this.insertRun = (run) =>
			query((db) => {
				run.created = new Date();
				run.updated = new Date();
				return db.collection('run')
					.insertOne(run).then(() => run);
			});

		this.updateRun = (run) =>
			query((db) => {
				run._id = oid(run._id);
				run.created = new Date(run.created);
				run.updated = new Date();
				return db.collection('run')
					.update({_id: run._id}, run).then(() => run);
			});

		this.insertTest = (test) =>
			query((db) => {
				test.created = new Date();
				test.updated = new Date();
				return db.collection('test')
					.insertOne(test).then(() => test);
			});

		this.updateTest = (test) =>
			query((db) => {
				test._id = oid(test._id);
				test.created = new Date(test.created);
				test.updated = new Date();
				return db.collection('test')
					.update({_id: test._id}, test).then(() => test);
			});

		this.getAllRunsByConfigId = (config_id) =>
			query((db) => {
				config_id = oid(config_id);
				return db.collection('run').find({config_id}).toArray();
			});

		this.getAllTestsByRunId = (run_id) =>
			query((db) => {
				run_id = oid(run_id);
				return db.collection('test').find({run_id}).toArray();
			});

		this.getTestById = (id) =>
			query((db) => db.collection('test')
					.findOne({_id: oid(id)}));

	}
}

module.exports = Database;
