#!/usr/bin/env node

'use strict';

var MongoClient = require('mongodb');

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
	}
}

module.exports = Database;
