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

		this.updateConfigById = (id, config) =>
			query((db) => {
				delete config._id;
				config.created = new Date(config.created);
				config.updated = new Date();
				return db.collection('config')
					.update({_id: oid(id)}, config);
			});

		this.insertConfig = (config) =>
			query((db) => {
				config.created = new Date();
				config.updated = new Date();
				return db.collection('config')
					.insert(config).then(() => config._id);
			});

		this.getAllConfigs = () =>
			query((db) => db.collection('config').find().toArray());

		this.insertRun = (results) =>
			query((db) => db.collection('run')
					.insertOne(results));

		this.insertTest = (results) =>
			query((db) => db.collection('test')
					.insertOne(results));

		this.getId = () => new ObjectID(Math.floor(new Date().getTime()/1000));

	}
}

module.exports = Database;
