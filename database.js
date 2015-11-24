#!/usr/bin/env node

'use strict';

var MongoClient = require('mongodb'),
	ObjectID = MongoClient.ObjectID;

var notNull = (o) => o === null ? Promise.reject('npe') : Promise.resolve(o);

class Database {
	constructor (url) {

		var query = (f) => 
			MongoClient.connect(url).then((db) => {
				var close = () => db.close();
				var res = f.call(null, db);
				res.then(close, close);
				return res;
			});

		this.getConfig = (name) =>
			query((db) => db.collection('config')
					.findOne({name})
					.then(notNull));

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
