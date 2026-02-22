'use strict';

let Promise = require('bluebird'),
	MongoClient = require('mongodb'),
	os = require('os');


//
// map-reduce functions for calculating statistics on test runs
//
// NB: below functions must use Mongo JS compatible syntax
//     as they are serialised and sent to the Mongo server.
//

var counter, emit;			// to fool eslint

function test_stats_map() {
	// ignore the first (likely unstable) result unless it is the only one
	if (counter++ > 0 || tests_per_run == 1) {
		emit(this.run_id, {
			sum: this.count, // the field you want stats for
			min: this.count,
			max: this.count,
			count: 1,
			diff: 0
		});
	}
}

function memory_stats_map() {
	// data[1] is resident set size (RSS) in pages
	var rss_pages = this.data[1] || 0;
	emit(this.run_id, {
		peak_mem: rss_pages
	});
}

function test_stats_reduce(key, values) {
	return values.reduce(function reduce(previous, current, index, array) {
		var delta = previous.sum / previous.count - current.sum / current.count;
		var weight = (previous.count * current.count)/(previous.count + current.count);

		return {
			sum: previous.sum + current.sum,
			min: Math.min(previous.min, current.min),
			max: Math.max(previous.max, current.max),
			count: previous.count + current.count,
			diff: previous.diff + current.diff + delta*delta*weight
		};
	});
}

function memory_stats_reduce(key, values) {
	return values.reduce(function reduce(previous, current) {
		return {
			peak_mem: Math.max(previous.peak_mem, current.peak_mem)
		};
	});
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
	if (tests_per_run > 1) {  // include the first skipped value in total count
		++value.count;
	}
	return value;
}

/* eslint no-undef: "error" */

//
// wrapper class for all database access methods
//
class Database {

	constructor (settings) {

		Promise.longStackTraces();

		this.init = async () => {

			let db = await MongoClient.connect(settings.url, {promiseLibrary: Promise});
			this.handle = db;

			let ObjectID = MongoClient.ObjectID;
			let oid = (id) => (id instanceof ObjectID) ? id : ObjectID.createFromHexString(id);

			this.close = async () => db.close();

			// build required indexes
			this.createIndexes = async () => Promise.all([
				db.collection('run').createIndex({config_id: 1, created: -1}),
				db.collection('test').createIndex({run_id: 1, created: 1}),
				db.collection('test').createIndex({config_id: 1}),
				db.collection('memory').createIndex({run_id: 1, created: 1}),
				db.collection('memory').createIndex({config_id: 1}),
			]);

			// 'obj' must contain {"enabled": <boolean>}
			// disabling the entry also disables auto-repeat
			this.setQueueEntryEnabled = async (id, {enabled}) => {
				var set = {
					'queue.enabled': !!enabled
				};
				if (!enabled) {
					set['queue.repeat'] = false;
				}
				return db.collection('config').updateOne({_id: oid(id)}, {$set: set});
			};

			// returns {"enabled": <boolean>}
			this.getQueueEntryEnabled = async (id) => {
				let r = await db.collection('config').findOne({_id: oid(id) });
				return r ? { enabled: !!r.queue.enabled } : { enabled: false };
			};

			// 'obj' must contain {"repeat": <boolean>}
			// job always get enabled at the same time
			this.setQueueEntryRepeat = async (id, {repeat}) => {
				let set = { 'queue.repeat': !!repeat };
				set['queue.enabled'] = true;
				return db.collection('config').updateOne({_id: oid(id)}, {$set: set});
			};

			// returns {"repeat": <boolean>}
			this.getQueueEntryRepeat = async (id) => {
				let r = await db.collection('config').findOne({_id: oid(id) });
				return r ? { repeat: !!r.queue.repeat } : { repeat: false };
			};

			// 'obj' must contain {"priority": <number>}
			this.setQueueEntryPriority = async (id, {priority}) =>
				db.collection('config').updateOne({_id: oid(id)}, {$set: {'queue.priority': priority}});

			// sets a text label showing the queued entry's state
			this.setQueueState = async (id, label) =>
				db.collection('config').updateOne({_id: oid(id)}, {$set: {'queue.state': label}});

			// atomically finds the oldest non-running entry in
			// the queue, marks it as running and returns it
			this.takeNextFromQueue = async (filter) => {
				let res = await db.collection('config')
					.findOneAndUpdate(
						{$and: [filter, {'queue.running': {$ne: true}, 'queue.enabled': true, 'archived': {$ne: true}}]},
						{$set: {
							'queue.running': true,
							'queue.started': new Date()
						}},
						{sort: {'queue.priority': -1, 'queue.completed': 1}}
					);
				return res.value;
			};

			// mark all jobs as stopped
			this.clearQueue = async (filter) =>
				db.collection('config')
					.update(
						{$and: [filter, {'queue.running': true} ]},
						{$set: { 'queue.running' : false }},
						{multi: true}
					);

			// sets the queue entry to "non-running" and updates the
			// "last completed" field, and resets its priority
			this.markQueueEntryDone = async (id) =>
				db.collection('config')
					.updateOne(
						{_id: oid(id)},
						{$set: {
							'queue.running': false,
							'queue.priority': 0,
							'queue.completed': new Date()
						}});

			// atomically disables the given entry if it's not
			// set to auto-repeat
			this.disableOneshotQueue = async (id) => {
				let res = await db.collection('config')
					.findOneAndUpdate(
						{_id: oid(id), 'queue.repeat': {$ne: true}},
						{$set: {'queue.enabled': false}}
					);
				return res.value;
			};

			// retrieve the specified configuration
			this.getConfig = async (id) =>
				db.collection('config').findOne({_id: oid(id)});

			// deletes the specified configurations - always takes an array of config IDs
			this.deleteConfigs = async (config_ids, _, {really}) => {
				really = really || false;
				try {
					really = JSON.parse(really);
				} finally {
					// no-op
				}

				if (!really) {
					throw 'config DELETE operation didn\'t really happen';
				}

				config_ids = config_ids.map(id => oid(id));
				
				let results = await Promise.all([
					db.collection('run').remove({config_id: {$in: config_ids}}),
					db.collection('test').remove({config_id: {$in: config_ids}}),
					db.collection('memory').remove({config_id: {$in: config_ids}})
				]);
				results.push(await db.collection('config').remove({_id: {$in: config_ids}}));
				return { results, deletedCount: config_ids.length };
			};

			// updates the configuration with the given block, taking
			// care to update the 'updated' field and not to modify the
			// 'created' field or the queue settings.  NB: other fields
			// not in 'config' are left unmodified
			this.updateConfig = async (id, config) => {
				config._id = oid(config._id);
				config.updated = new Date();
				delete config.created;
				delete config.queue;
				return db.collection('config')
					.findAndModify(
						{_id: config._id},
						[],
						{$set: config},
						{'new': true}
					);
			};

			// batch archive multiple configurations - expects array of ID strings
			this.archiveConfigs = async (ids) => {
				let objectIds = ids.map(id => oid(id));
				return db.collection('config').updateMany(
					{_id: {$in: objectIds}},
					{$set: {archived: true, updated: new Date()}}
				);
			};


			// batch clone multiple configurations with optional overrides
			this.batchCloneConfigs = async (ids, { overrides = {} } = {}) => {
				let objectIds = ids.map(id => oid(id));
				let configs = await db.collection('config').find({_id: {$in: objectIds}}).toArray();
				return Promise.all(configs.map(config => {
					let { _id, created, updated, queue, ...clone } = config;
					Object.assign(clone, overrides.branch && { branch: overrides.branch });
					if (overrides.namePattern) {
						let vars = { BRANCH: overrides.branch || '' };
						clone.name.split('/').forEach((p, i) => vars[i + 1] = p);
						clone.name = overrides.namePattern.replace(/\$\{(\w+)\}/g, (_, key) => vars[key] || '');
					}
					if (overrides.args && overrides.args.configure) {
						clone.args = { ...clone.args, configure: overrides.args.configure };
					}
					return this.insertConfig(clone).then(saved => saved._id);
				}));
			};

			// store a new configuration in the database, automatically
			// setting the 'created' and 'updated' fields to 'now'
			this.insertConfig = async (config) => {
				config.created = new Date();
				config.updated = new Date();
				config.queue = {
					enabled: true, repeat: true, priority: 0
				};
				return db.collection('config')
					.insert(config).then(() => config);
			};

			// common list of fields returned for configuration listings
			const listView = {_id: 1, name: 1, queue: 1, type: 1, archived: 1};

			// retrieve the short-form list of all configurations
			this.getConfigListAll = async () =>
				db.collection('config')
				  .find({}, listView)
				  .toArray();

			// retrieve the short-form version of a single configuration
			this.getConfigListOne = async (id) =>
				db.collection('config').findOne({_id: oid(id)}, listView);

			// store a new daemon run in the database, automatically
			// setting the 'created' and 'updated' fields to 'now'
			this.insertRun = async (run) => {
				run.created = new Date();
				run.updated = new Date();
				await db.collection('run').insert(run);
				return run;
			};

			// retrieve the specified run entry
			this.getRunById = async (id) =>
				db.collection('run').findOne({_id: oid(id)});

			// updates the run with the given data block.  NB: other
			// fields not in 'data' are left unmodified
			this.updateRunById = async (id, data) => {
				data.updated = new Date();
				return db.collection('run').update({_id: oid(id)}, {$set: data});
			};

			// finds all 'test' entries for the given run and uses an
			// in-memory mapReduce function to generate statistics for that
			// run
			this.updateRunStats = async (run) => {
				let mr = await db.collection('test').mapReduce(test_stats_map, test_stats_reduce, {
					scope: { counter: 0, tests_per_run: run.testsPerRun },
					finalize: test_stats_finalize,
					query: { run_id: oid(run._id) },
					out: { inline: 1 }
				});

				mr = mr.results || mr || [];
				let stats = (mr.length === 0) ? { count: 1 } : mr[0].value;
				return db.collection('run').update( {_id: oid(run._id)}, {$set: { stats }});
			};

			// stores raw memory usage statistics associated with a run
			this.insertMemoryStats = async (memory) => {
				memory.ts = new Date();
				return db.collection('memory').insert(memory);
			};

			// gets all memory usage statistics associated with a run
			this.getMemoryStatsByRunId = async (run_id) =>
				db.collection('memory')
				  .find({run_id: oid(run_id)}, {ts:1, data: 1, _id: 0})
				  .sort({ts: 1})
				  .toArray();

			// store a new daemon run in the database, automatically
			// setting the 'created' and 'updated' fields to 'now'
			this.insertTest = async (test) => {
				test.created = new Date();
				test.updated = new Date();
				await db.collection('test').insert(test);
				return test;
			};

			// updates the test with the given block, taking
			// care to update the 'updated' field and not to modify the
			// 'created' field.  NB: other fields not in 'data' are left
			// unmodified
			this.updateTestById = async (id, data) => {
				data.updated = new Date();
				delete data.created;
				return db.collection('test').update({_id: oid(id)}, {$set: data});
			};

			// get all runs for the given config(s) in reverse order,
			// optionally paginated - always takes an array of config IDs
			this.getRunsByConfigIds = async (config_ids, _, {skip, limit, from_datetime, with_commit} = {}) => {
				skip = +skip || 0;
				limit = +limit || 0;
				skip = Math.max(skip, 0);
				limit = Math.max(limit, 0);
				config_ids = config_ids.map(id => oid(id));

				// Build query filter with datetime constraint
				let dateFilter = from_datetime ? new Date(from_datetime) : new Date('1970-01-02');
				let filter = {
					config_id: {$in: config_ids},
					created: {$gte: dateFilter}
				};

				// Build projection
				let projection = { _id: 1, created: 1, config_id: 1, stats: 1 };
				if (with_commit) projection.commit = 1;

				// Phase 1: Run queries in parallel - runs and configs
				let [runs, configs] = await Promise.all([
					db.collection('run')
						.find(filter, projection)
						.sort({created: -1})
						.skip(skip).limit(limit)
						.toArray(),

					// Get config info (we know config_ids upfront)
					db.collection('config')
						.find({_id: {$in: config_ids}}, {_id: 1, name: 1, branch: 1})
						.toArray()
				]);

				// Extract run_ids for memory stats calculation
				let run_ids = runs.map(run => run._id);

				// Phase 2: Calculate peak memory for each run using mapReduce
				let memoryStats = {};
				if (run_ids.length > 0) {
					let mr = await db.collection('memory').mapReduce(memory_stats_map, memory_stats_reduce, {
						query: { run_id: {$in: run_ids} },
						out: { inline: 1 }
					});

					mr = mr.results || mr || [];
					mr.forEach(result => {
						memoryStats[result._id.toString()] = result.value.peak_mem;
					});
				}

				// Create config lookup map
				let configMap = {};
				configs.forEach(config => {
					configMap[config._id.toString()] = config;
				});

				// Join runs with config data and peak memory (convert pages to MB)
				return runs.map(run => {
					let config = configMap[run.config_id.toString()];
					let peak_mem_pages = memoryStats[run._id.toString()] || 0;
					return {
						...run,
						peak_mem: peak_mem_pages * 4096 / 1048576, // Convert pages to MB
						config: config ? [{
							name: config.name,
							branch: config.branch
						}] : []
					};
				});
			};

			// get all tests for the given run, in time order
			this.getTestsByRunId = async (run_id) => {
				run_id = oid(run_id);
				return db.collection('test')
					  .find({run_id}, {stdout: 0, stderr: 0})
					  .sort({created: 1})
					  .toArray();
			};

			// get a specific test result
			this.getTestById = async (id) => db.collection('test').findOne({_id: oid(id)});

			// get the global control object
			this.getControl = async () => db.collection('control').findOne();

			// set the global paused status
			// 'obj' must contain {"paused": <boolean>}
			this.setPaused = async ({paused}) =>
				db.collection('control')
				  .updateOne({}, {$set: {paused: !!paused}}, {upsert: true});

			// get the global paused status
			// return will be {"paused": <boolean>}
			this.getPaused = async () => {
				let r = await db.collection('control').findOne({paused: {$exists: 1}}, {paused: 1, _id: 0});
				return r || {paused: false};
			};

			// store a single log entry
			this.insertLog = async (log) =>db.collection('log').insert(log);

			this.insertErrorLog = async(e) => {
				let host = os.hostname().split('.')[0];
				let text, channel
				if (e.stdout) {
					channel = 'stdout'
					text = e.stdout
				} else if (e.stderr) {
					channel = 'stderr'
					text = e.stderr
				} else {
					channel = 'perflab'
					if (e.stack) {
						text = e.stack
					} else {
						text = e
					}
				}
				if (!e)
					return;
				let log = {channel, text, host, time: new Date()};
				this.insertLog(log);
			}

			// get all log entries
			this.getLog = async () => db.collection('log').find().toArray();

			return this;
		};
	}
}

module.exports = Database;
