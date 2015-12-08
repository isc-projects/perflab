#!/usr/bin/env node

'use strict';

let MongoClient = require('mongodb'),
	ObjectID = MongoClient.ObjectID;

//
// NB: below functions must use Mongo JS compatible syntax
//     as they are serialised and sent to the Mongo server.
//
function test_stats_map() {
	emit(this.run_id, {
		sum: this.count, // the field you want stats for
		min: this.count,
		max: this.count,
		count: 1,
		diff: 0
	});
}

function test_stats_reduce(key, values) {
	return values.reduce(function reduce(previous, current, index, array) {
		var delta = previous.sum/previous.count - current.sum/current.count;
		var weight = (previous.count * current.count)/(previous.count + current.count);

		return {
			sum: previous.sum + current.sum,
			min: Math.min(previous.min, current.min),
			max: Math.max(previous.max, current.max),
			count: previous.count + current.count,
			diff: previous.diff + current.diff + delta*delta*weight
		};
	})
}

function test_stats_finalize(key, value) { 
	if (value.count > 1) {
		var variance = value.diff / (value.count - 1);
		value.stddev = Math.sqrt(variance);
	}
	if (value.count > 0) {
		value.average = value.sum / value.count;
	}
	delete value.sum;
	delete value.diff;
	return value;
}

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

		this.getQueue = () =>
			query((db) => db.collection('queue').find().toArray());

		this.insertQueue = (config_id, repeat) =>
			query((db) => db.collection('queue')
				.insert({
					config_id: oid(config_id),
					running: false,
					queued: false,
					repeat
				}));

		this.takeNextFromQueue = () =>
			query((db) => db.collection('queue')
					.findOneAndUpdate(
						{running: false, queued: true},
						{$set: {
							running: true,
							queued: false,
							started: new Date()
						}},
						{sort: {completed: 1}}
					)).then((res) => res.value);

		this.markQueueEntryDone = (id) =>
			query((db) => {
				return db.collection('queue')
					.update({_id: oid(id)},
							{$set: {
								running: false,
								completed: new Date()
							}})
			});

		this.reQueueEntry = (id) =>
			query((db) => db.collection('queue')
					.findOneAndUpdate(
						{running: false, queued: false, repeat: true},
						{$set: { queued: true }},
						{sort: {completed: 1}}
					)).then((res) => res.value);

		this.getConfigByName = (name) =>
			query((db) => db.collection('config')
					.findOne({name}));

		this.getConfigById = (id) =>
			query((db) => db.collection('config')
					.findOne({_id: oid(id)}));

		this.deleteConfigById = (id) =>
			query((db) => Promise.all([
				db.collection('config').remove({_id: oid(id)}),
				db.collection('queue').remove({config_id: oid(id)})
			]));

		this.updateConfig = (id, config) =>
			query((db) => {
				config._id = oid(config._id);
				config.updated = new Date();
				delete config.created;
				return db.collection('config')
					.update({_id: config._id}, {$set: config});
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

		this.updateRunById = (id, data) =>
			query((db) => {
				data.updated = new Date();
				return db.collection('run')
					.update({_id: oid(id)}, {$set: data});
			});

		this.updateStatsByRunId = (run_id) =>
			query((db) => db.collection('test')
				.mapReduce(test_stats_map, test_stats_reduce, {
					finalize: test_stats_finalize,
					query: { run_id: oid(run_id) },
					out: { inline: 1 }
				}).then((mr) => db.collection('run').update(
					{_id: mr.results[0]._id},
					{$set: { stats: mr.results[0].value }}
				)));

		this.insertTest = (test) =>
			query((db) => {
				test.created = new Date();
				test.updated = new Date();
				return db.collection('test')
					.insertOne(test).then(() => test);
			});

		this.updateTestById = (id, data) =>
			query((db) => {
				data.updated = new Date();
				return db.collection('test')
					.update({_id: oid(id)}, {$set: data});
			});

		this.getAllRunsByConfigId = (config_id) =>
			query((db) => {
				config_id = oid(config_id);
				return db.collection('run').find({config_id}).sort({created: -1}).toArray();
			});

		this.getAllTestsByRunId = (run_id) =>
			query((db) => {
				run_id = oid(run_id);
				return db.collection('test').find({run_id}).sort({created: -1}).toArray();
			});

		this.getTestById = (id) =>
			query((db) => db.collection('test')
					.findOne({_id: oid(id)}));

		this.setPaused = (paused) =>
			query((db) => db.collection('control')
					.updateOne({}, {$set: {paused: !!paused}}, {upsert: true}));

		this.getPaused = () =>
			query((db) => db.collection('control')
					.findOne({}, {paused: 1, _id: 0}))
			.then((r) => (r === null) ? false : !!r.paused);

		this.insertLog = (log) =>
			query((db) => db.collection('log').insert(log));

		this.getLog = () =>
			query((db) => db.collection('log').find().toArray());
	}
}

module.exports = Database;
