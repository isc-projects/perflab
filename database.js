#!/usr/bin/env node

'use strict';

var MongoClient = require('mongodb');

var notNull = (o) => o === null ? Promise.reject('npe') : Promise.resolve(o);

class Database {
	constructor (url) {
		var db;
		var connect = () => MongoClient.connect(url).then((_db) => db = _db);
		var open = () => db ? Promise.resolve(db) : connect();
		var close = () => {
			db.close();
			db = null;
		}

		var getConfig = (db, name) => 
			db.collection('config')
				.findOne({name})
				.then(notNull);

		var insertRun = (db, results) =>
			db.collection('run')
				.insert(results);

		this.getConfig = (name) => {
			var res = open().then((db) => getConfig(db, name));
			res.then(close, close);
			return res;
		}

		this.insertRun = (results) => {
			var res = open().then((db) => insertRun(db, results));
			res.then(close, close);
			return res;
		}
	}
}

module.exports = Database;
