#!/usr/bin/env node

'use strict';

var MongoClient = require('mongodb');

var notNull = (o) => o === null ? Promise.reject('npe') : Promise.resolve(o);

class Database {
	constructor (url) {
		var db;
		var connect = () => MongoClient.connect(url).then((_db) => db = _db);
		var open = () => db ? Promise.resolve(db) : connect();
		var close = () => db.close();

		var getConfig = (db, name) => 
			db.collection('config')
				.findOne({name})
				.then(notNull);

		this.getConfig = (name) => {
			var res = open().then((db) => getConfig(db, name));
			res.then(close, close);
			return res;
		}
	}
}

module.exports = Database;
