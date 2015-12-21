#!/usr/bin/env node

'use strict';

let MongoClient = require('mongodb'),
	ObjectID = MongoClient.ObjectID;

// map-reduce functions for calculating statistics on test runs
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

//
// wrapper class for all database access methods
//
class Database {
	constructor (url) {

		let oid = (id) => (id instanceof ObjectID) ? id : ObjectID.createFromHexString(id);

		// connects to DB, passes DB handle to given callback,
		// then ensures the DB is closed again afterwards
		let query = (f) => 
			MongoClient.connect(url).then((db) => {
				let close = () => db.close();
				let res = f.call(this, db);
				res.then(close, close);
				return res;
			});

		// get every queue entry
		this.getQueue = () =>
			query((db) => db.collection('queue').find().toArray());

		// 'obj' must contain {"enabled": <boolean>}
		this.setQueueEntryEnabled = (id, obj) =>
			query((db) => db.collection('queue')
					.updateOne({_id: oid(id)}, {$set: {enabled: !!obj.enabled}}, {upsert: true}));

		// returns {"enabled": <boolean>}
		this.getQueueEntryEnabled = (id) =>
			query((db) => db.collection('queue')
					.findOne({_id: oid(id) })
					.then((r) => r ? { enabled: !!r.enabled } : {enabled: false}));

		// 'obj' must contain {"repeat": <boolean>}
		this.setQueueEntryRepeat = (id, obj) =>
			query((db) => db.collection('queue')
					.updateOne({_id: oid(id)}, {$set: {repeat: !!obj.repeat}}, {upsert: true}));

		// returns {"repeat": <boolean>}
		this.getQueueEntryRepeat = (id) =>
			query((db) => db.collection('queue')
					.findOne({_id: oid(id) })
					.then((r) => r ? { repeat: !!r.repeat } : {repeat: false}));

		// atomically finds the oldest non-running entry in the queue,
		// marks it as running and returns it
		this.takeNextFromQueue = () =>
			query((db) => db.collection('queue')
					.findOneAndUpdate(
						{running: {$ne: true}, enabled: true},
						{$set: {
							running: true,
							started: new Date()
						}},
						{sort: {completed: 1}}
					)).then((res) => res.value);

		// sets the queue entry to "non-running" and updates the
		// "last completed" field
		this.markQueueEntryDone = (id) =>
			query((db) => {
				return db.collection('queue')
					.update({_id: oid(id)},
							{$set: {
								running: false,
								completed: new Date()
							}})
			});

		// atomically disables the given entry if it's not
		// set to auto-repeat
		this.disableOneshotQueue = (id) =>
			query((db) => db.collection('queue')
					.findOneAndUpdate(
						{_id: oid(id), repeat: false},
						{$set: {enabled: false}}
					)).then((res) => res.value);

		// retrieve the specified configuration
		this.getConfigById = (id) =>
			query((db) => db.collection('config')
					.findOne({_id: oid(id)}));

		// delete the specified configuration and any associated
		// queue record.  NB: does not delete any orphaned test
		// results
		this.deleteConfigById = (id) =>
			query((db) => Promise.all([
				db.collection('config').remove({_id: oid(id)}),
				db.collection('queue').remove({config_id: oid(id)})
			]));

		// updates the configuration with the given block, taking
		// care to update the 'updated' field and not to modify the
		// 'created' field.  NB: other fields not in 'config' are left
		// unmodified
		this.updateConfig = (id, config) =>
			query((db) => {
				config._id = oid(config._id);
				config.updated = new Date();
				delete config.created;
				return db.collection('config')
					.update({_id: config._id}, {$set: config});
			});

		// store a new configuration in the database, automatically
		// setting the 'created' and 'updated' fields to 'now'
		this.insertConfig = (config) =>
			query((db) => {
				config.created = new Date();
				config.updated = new Date();
				return db.collection('config')
					.insert(config).then(() => config);
			});

		// retrieve all configurations
		this.getAllConfigs = () =>
			query((db) => db.collection('config').find().toArray());

		// store a new daemon run in the database, automatically
		// setting the 'created' and 'updated' fields to 'now'
		this.insertRun = (run) =>
			query((db) => {
				run.created = new Date();
				run.updated = new Date();
				return db.collection('run')
					.insertOne(run).then(() => run);
			});

		// retrieve the specified run entry
		this.getRunById = (id) =>
			query((db) => db.collection('run').findOne({_id: oid(id)}));

		// updates the run with the given data block.  NB: other
		// fields not in 'data' are left unmodified
		this.updateRunById = (id, data) =>
			query((db) => {
				data.updated = new Date();
				return db.collection('run')
					.update({_id: oid(id)}, {$set: data});
			});

		// finds all 'test' entries for the given run and uses an
		// in-memory mapReduce function to generate statistics for that
		// run
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

		// store a new daemon run in the database, automatically
		// setting the 'created' and 'updated' fields to 'now'
		this.insertTest = (test) =>
			query((db) => {
				test.created = new Date();
				test.updated = new Date();
				return db.collection('test')
					.insertOne(test).then(() => test);
			});

		// updates the test with the given block, taking
		// care to update the 'updated' field and not to modify the
		// 'created' field.  NB: other fields not in 'data' are left
		// unmodified
		this.updateTestById = (id, data) =>
			query((db) => {
				data.updated = new Date();
				delete data.created;
				return db.collection('test')
					.update({_id: oid(id)}, {$set: data});
			});

		// get all runs for the given config in reverse order,
		// optionally paginated
		this.getRunsByConfigId = (config_id, skip, limit) =>
			query((db) => {
				skip = skip || 0;
				limit = limit || 0;
				config_id = oid(config_id);
				return db.collection('run')
					.find({config_id}, {stdout: 0, stderr: 0})
					.sort({created: -1})
					.skip(skip).limit(limit)
					.toArray();
			});

		// get all tests for the given run, in time order
		this.getAllTestsByRunId = (run_id) =>
			query((db) => {
				run_id = oid(run_id);
				return db.collection('test').find({run_id}).sort({created: 1}).toArray();
			});

		// get a specific test result
		this.getTestById = (id) =>
			query((db) => db.collection('test')
					.findOne({_id: oid(id)}));

		// get the global control object
		this.getControl = (obj) =>
			query((db) => db.collection('control').findOne());

		// set the global paused status
		// 'obj' must contain {"paused": <boolean>}
		this.setPaused = (obj) =>
			query((db) => db.collection('control')
					.updateOne({}, {$set: {paused: !!obj.paused}}, {upsert: true}));

		// get the global paused status
		// return will be {"paused": <boolean>}
		this.getPaused = () =>
			query((db) => db.collection('control')
					.findOne({paused: {$exists: 1}}, {paused: 1, _id: 0})
					.then((r) => r || {paused: false}));

		// store a single log entry
		this.insertLog = (log) =>
			query((db) => db.collection('log').insert(log));

		// get all log entries
		this.getLog = () =>
			query((db) => db.collection('log').find().toArray());
	}
}

module.exports = Database;
