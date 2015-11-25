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

		this.getConfigById = (id) =>
			query((db) => db.collection('config')
					.findOne({_id: oid(id)}));

		this.getConfig = (name) =>
			query((db) => db.collection('config')
					.findOne({name}));

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
