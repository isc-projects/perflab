'use strict';

let { describe, it, beforeEach, afterEach } = require('node:test');
let assert = require('node:assert/strict');
let Database = require('../lib/database');

describe('Database', () => {
	let db;

	beforeEach(() => {
		db = new Database(':memory:');
	});

	afterEach(async () => {
		await db.close();
	});

	// ---- Config CRUD ----

	describe('insertConfig', () => {
		it('returns object with _id', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			assert.ok(config._id, 'should have _id');
			assert.equal(typeof config._id, 'string');
			assert.equal(config._id.length, 24, '_id should be 24-char hex');
		});

		it('sets queue defaults', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			assert.ok(config.queue, 'should have queue object');
			assert.equal(config.queue.enabled, true);
			assert.equal(config.queue.repeat, true);
		});

		it('resets runtime state even if queue provided', async () => {
			let config = await db.insertConfig({
				name: 'test', type: 'bind',
				queue: { enabled: true, repeat: false, running: true, state: 'building', priority: 5, started: new Date().toISOString(), completed: new Date().toISOString() }
			});
			assert.equal(config.queue.running, false, 'running should be reset');
			assert.equal(config.queue.state, '', 'state should be reset');
			assert.equal(config.queue.priority, 0, 'priority should be reset');
			assert.equal(config.queue.started, null, 'started should be reset');
			assert.equal(config.queue.completed, null, 'completed should be reset');
		});
	});

	describe('getConfig', () => {
		it('returns object with _id and nested queue', async () => {
			let inserted = await db.insertConfig({ name: 'test', type: 'bind', branch: 'main' });
			let config = await db.getConfig(inserted._id);
			assert.ok(config);
			assert.equal(config._id, inserted._id);
			assert.equal(config.name, 'test');
			assert.equal(config.type, 'bind');
			assert.equal(config.branch, 'main');
			assert.ok(config.queue, 'should have queue object');
			assert.equal(typeof config.queue.enabled, 'boolean');
		});

		it('returns null for nonexistent id', async () => {
			let config = await db.getConfig('000000000000000000000000');
			assert.equal(config, null);
		});

		it('includes extra data fields', async () => {
			let inserted = await db.insertConfig({ name: 'test', type: 'bind', args: { configure: '--with-foo' } });
			let config = await db.getConfig(inserted._id);
			assert.deepEqual(config.args, { configure: '--with-foo' });
		});
	});

	describe('getConfigListAll', () => {
		it('returns array with _id and queue on each entry', async () => {
			await db.insertConfig({ name: 'a', type: 'bind' });
			await db.insertConfig({ name: 'b', type: 'knot' });
			let list = await db.getConfigListAll();
			assert.equal(list.length, 2);
			for (let entry of list) {
				assert.ok(entry._id);
				assert.ok(entry.queue);
				assert.equal(typeof entry.queue.enabled, 'boolean');
			}
		});

		it('returns empty array when no configs', async () => {
			let list = await db.getConfigListAll();
			assert.deepEqual(list, []);
		});
	});

	describe('updateConfig', () => {
		it('merges fields and preserves unmodified ones', async () => {
			let inserted = await db.insertConfig({ name: 'test', type: 'bind', branch: 'main', args: { configure: '--foo' } });
			let updated = await db.updateConfig(inserted._id, { branch: 'v9.20' });
			assert.equal(updated.branch, 'v9.20');
			assert.equal(updated.name, 'test', 'name should be preserved');
			assert.deepEqual(updated.args, { configure: '--foo' }, 'data fields should be preserved');
		});

		it('updates the updated timestamp', async () => {
			let inserted = await db.insertConfig({ name: 'test', type: 'bind' });
			let originalUpdated = inserted.updated;
			// Small delay to ensure timestamp differs
			await new Promise(r => setTimeout(r, 10));
			let updated = await db.updateConfig(inserted._id, { name: 'renamed' });
			assert.notEqual(updated.updated, originalUpdated);
		});

		it('returns null for nonexistent id', async () => {
			let result = await db.updateConfig('000000000000000000000000', { name: 'x' });
			assert.equal(result, null);
		});
	});

	describe('deleteConfigs', () => {
		it('removes config and cascades to run/test/memory', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			let run = await db.insertRun({ config_id: config._id, testsPerRun: 1 });
			await db.insertTest({ config_id: config._id, run_id: run._id, count: 100 });

			await db.deleteConfigs([config._id], {}, { really: true });

			let got = await db.getConfig(config._id);
			assert.equal(got, null);
			let gotRun = await db.getRunById(run._id);
			assert.equal(gotRun, null);
		});

		it('throws without really flag', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			await assert.rejects(() => db.deleteConfigs([config._id], {}, {}));
		});
	});

	describe('archiveConfigs', () => {
		it('sets archived to boolean true', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			await db.archiveConfigs([config._id]);
			let got = await db.getConfig(config._id);
			assert.equal(got.archived, true);
			assert.equal(typeof got.archived, 'boolean', 'archived should be boolean, not integer');
		});
	});

	// ---- Queue operations ----

	describe('takeNextFromQueue', () => {
		it('returns config with _id respecting priority', async () => {
			let low = await db.insertConfig({ name: 'low', type: 'bind' });
			let high = await db.insertConfig({ name: 'high', type: 'bind' });
			await db.setQueueEntryPriority(high._id, { priority: 10 });

			let taken = await db.takeNextFromQueue({ type: { $in: ['bind'] } });
			assert.ok(taken);
			assert.ok(taken._id);
			assert.equal(taken._id, high._id, 'should take highest priority first');
		});

		it('skips archived configs', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			await db.archiveConfigs([config._id]);
			let taken = await db.takeNextFromQueue({ type: { $in: ['bind'] } });
			assert.equal(taken, null);
		});

		it('skips disabled configs', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			await db.setQueueEntryEnabled(config._id, { enabled: false });
			let taken = await db.takeNextFromQueue({ type: { $in: ['bind'] } });
			assert.equal(taken, null);
		});

		it('returns null when queue empty', async () => {
			let taken = await db.takeNextFromQueue({ type: { $in: ['bind'] } });
			assert.equal(taken, null);
		});

		it('returns null with empty type filter', async () => {
			await db.insertConfig({ name: 'test', type: 'bind' });
			let taken = await db.takeNextFromQueue({ type: { $in: [] } });
			assert.equal(taken, null);
		});
	});

	describe('clearQueue', () => {
		it('resets running on all entries', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			await db.takeNextFromQueue({ type: { $in: ['bind'] } });
			await db.clearQueue({ type: { $in: ['bind'] } });
			// Should be able to take again
			let taken = await db.takeNextFromQueue({ type: { $in: ['bind'] } });
			assert.ok(taken);
			assert.equal(taken._id, config._id);
		});
	});

	describe('markQueueEntryDone', () => {
		it('sets running=false and priority=0', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			await db.setQueueEntryPriority(config._id, { priority: 5 });
			await db.takeNextFromQueue({ type: { $in: ['bind'] } });
			await db.markQueueEntryDone(config._id);

			let got = await db.getConfig(config._id);
			assert.equal(got.queue.running, false);
			assert.equal(got.queue.priority, 0);
			assert.ok(got.queue.completed);
		});
	});

	describe('disableOneshotQueue', () => {
		it('disables non-repeat entry', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind', queue: { repeat: false } });
			let result = await db.disableOneshotQueue(config._id);
			assert.ok(result);
			let got = await db.getConfig(config._id);
			assert.equal(got.queue.enabled, false);
		});

		it('returns null for repeat entry', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind', queue: { repeat: true } });
			let result = await db.disableOneshotQueue(config._id);
			assert.equal(result, null);
		});
	});

	describe('setQueueEntryEnabled', () => {
		it('disabling also sets repeat=false', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind', queue: { repeat: true } });
			await db.setQueueEntryEnabled(config._id, { enabled: false });
			let got = await db.getConfig(config._id);
			assert.equal(got.queue.enabled, false);
			assert.equal(got.queue.repeat, false);
		});
	});

	// ---- Run operations ----

	describe('insertRun', () => {
		it('returns object with _id', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			let run = await db.insertRun({ config_id: config._id, testsPerRun: 3 });
			assert.ok(run._id);
			assert.equal(typeof run._id, 'string');
			assert.equal(run._id.length, 24);
		});
	});

	describe('getRunById', () => {
		it('returns object with _id, stats object, commit, testsPerRun', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			let run = await db.insertRun({ config_id: config._id, testsPerRun: 3, commit: 'commit abc123' });
			let got = await db.getRunById(run._id);
			assert.ok(got);
			assert.equal(got._id, run._id);
			assert.ok('stats' in got, 'should have stats object');
			assert.equal(typeof got.stats, 'object');
			assert.equal(got.commit, 'commit abc123', 'should have commit field not commit_');
			assert.equal(got.testsPerRun, 3, 'should have testsPerRun not tests_per_run');
			assert.equal(got.id, undefined, 'should not have id field');
			assert.equal(got.commit_, undefined, 'should not have commit_ field');
			assert.equal(got.tests_per_run, undefined, 'should not have tests_per_run field');
		});

		it('returns null for nonexistent id', async () => {
			let got = await db.getRunById('000000000000000000000000');
			assert.equal(got, null);
		});
	});

	describe('updateRunById', () => {
		it('merges data correctly', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			let run = await db.insertRun({ config_id: config._id, testsPerRun: 1 });
			await db.updateRunById(run._id, { commit: 'commit def456', completed: new Date().toISOString() });
			let got = await db.getRunById(run._id);
			assert.equal(got.commit, 'commit def456');
			assert.ok(got.completed);
		});
	});

	describe('updateRunStats', () => {
		it('skips warmup test when testsPerRun > 1', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			let run = await db.insertRun({ config_id: config._id, testsPerRun: 3 });
			// Insert 3 tests: warmup=100, real=200, real=300
			await db.insertTest({ config_id: config._id, run_id: run._id, count: 100 });
			await db.insertTest({ config_id: config._id, run_id: run._id, count: 200 });
			await db.insertTest({ config_id: config._id, run_id: run._id, count: 300 });

			await db.updateRunStats({ _id: run._id, testsPerRun: 3 });
			let got = await db.getRunById(run._id);
			assert.equal(got.stats.count, 3, 'count includes all tests');
			assert.equal(got.stats.min, 200, 'min should exclude warmup');
			assert.equal(got.stats.max, 300, 'max should exclude warmup');
			assert.equal(got.stats.average, 250, 'average should exclude warmup');
		});

		it('includes first test when it is the only one', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			let run = await db.insertRun({ config_id: config._id, testsPerRun: 1 });
			await db.insertTest({ config_id: config._id, run_id: run._id, count: 500 });

			await db.updateRunStats({ _id: run._id, testsPerRun: 1 });
			let got = await db.getRunById(run._id);
			assert.equal(got.stats.min, 500);
			assert.equal(got.stats.max, 500);
			assert.equal(got.stats.average, 500);
		});

		it('handles no tests', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			let run = await db.insertRun({ config_id: config._id, testsPerRun: 1 });
			await db.updateRunStats({ _id: run._id, testsPerRun: 1 });
			let got = await db.getRunById(run._id);
			assert.equal(got.stats.count, 1);
		});
	});

	// ---- Test operations ----

	describe('insertTest', () => {
		it('returns object with _id', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			let run = await db.insertRun({ config_id: config._id });
			let test = await db.insertTest({ config_id: config._id, run_id: run._id, count: 42 });
			assert.ok(test._id);
			assert.equal(typeof test._id, 'string');
		});
	});

	describe('getTestsByRunId', () => {
		it('returns array excluding stdout/stderr, each with _id', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			let run = await db.insertRun({ config_id: config._id });
			await db.insertTest({ config_id: config._id, run_id: run._id, count: 10, stdout: 'out', stderr: 'err' });
			await db.insertTest({ config_id: config._id, run_id: run._id, count: 20 });

			let tests = await db.getTestsByRunId(run._id);
			assert.equal(tests.length, 2);
			for (let t of tests) {
				assert.ok(t._id);
				assert.equal(t.stdout, undefined, 'should exclude stdout');
				assert.equal(t.stderr, undefined, 'should exclude stderr');
			}
		});
	});

	describe('getTestById', () => {
		it('returns full object with _id including stdout/stderr', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			let run = await db.insertRun({ config_id: config._id });
			let test = await db.insertTest({ config_id: config._id, run_id: run._id, count: 42, stdout: 'hello', stderr: 'world' });

			let got = await db.getTestById(test._id);
			assert.ok(got);
			assert.equal(got._id, test._id);
			assert.equal(got.stdout, 'hello');
			assert.equal(got.stderr, 'world');
		});
	});

	// ---- Runs by config IDs ----

	describe('getRunsByConfigIds', () => {
		it('returns _id, nested stats, peak_mem, config array', async () => {
			let config = await db.insertConfig({ name: 'myconfig', type: 'bind', branch: 'main' });
			let run = await db.insertRun({ config_id: config._id, testsPerRun: 1 });
			await db.insertTest({ config_id: config._id, run_id: run._id, count: 100 });
			await db.updateRunStats({ _id: run._id, testsPerRun: 1 });

			let runs = await db.getRunsByConfigIds([config._id], {}, {});
			assert.equal(runs.length, 1);
			let r = runs[0];
			assert.ok(r._id);
			assert.equal(typeof r.stats, 'object');
			assert.ok('min' in r.stats);
			assert.ok('max' in r.stats);
			assert.ok('average' in r.stats);
			assert.ok('stddev' in r.stats);
			assert.equal(typeof r.peak_mem, 'number');
			assert.ok(Array.isArray(r.config));
			assert.equal(r.config[0].name, 'myconfig');
			assert.equal(r.config[0].branch, 'main');
		});

		it('stats fields are null not undefined when missing', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			await db.insertRun({ config_id: config._id });

			let runs = await db.getRunsByConfigIds([config._id], {}, {});
			assert.equal(runs.length, 1);
			// null, not undefined
			assert.equal(runs[0].stats.min, null);
			assert.equal(runs[0].stats.max, null);
			assert.equal(runs[0].stats.average, null);
			assert.equal(runs[0].stats.stddev, null);
		});

		it('with_commit includes commit field', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			await db.insertRun({ config_id: config._id, commit: 'commit abc123' });

			let runs = await db.getRunsByConfigIds([config._id], {}, { with_commit: true });
			assert.equal(runs.length, 1);
			assert.equal(runs[0].commit, 'commit abc123');
		});
	});

	// ---- Log operations ----

	describe('insertLog', () => {
		it('sets _id on log object', async () => {
			let log = { channel: 'test', text: 'hello', host: 'localhost' };
			await db.insertLog(log);
			assert.ok(log._id, 'should set _id from lastInsertRowid');
		});
	});

	describe('getLog', () => {
		it('returns entries with _id not id', async () => {
			await db.insertLog({ channel: 'a', text: 'first', host: 'h1' });
			await db.insertLog({ channel: 'b', text: 'second', host: 'h2' });

			let logs = await db.getLog();
			assert.ok(logs.length >= 2);
			for (let log of logs) {
				assert.ok(log._id !== undefined, 'should have _id');
				assert.equal(log.id, undefined, 'should not have id');
			}
		});
	});

	// ---- Control operations ----

	describe('getPaused', () => {
		it('returns {paused: false} by default', async () => {
			let result = await db.getPaused();
			assert.deepEqual(result, { paused: false });
		});
	});

	describe('setPaused', () => {
		it('toggles paused state', async () => {
			await db.setPaused({ paused: true });
			let result = await db.getPaused();
			assert.deepEqual(result, { paused: true });

			await db.setPaused({ paused: false });
			result = await db.getPaused();
			assert.deepEqual(result, { paused: false });
		});
	});

	// ---- Change notifications ----

	describe('change events', () => {
		it('emits change on insert', async () => {
			let changes = [];
			db.on('change', c => changes.push(c));
			await db.insertConfig({ name: 'test', type: 'bind' });
			assert.ok(changes.length > 0);
			assert.equal(changes[0].op, 'i');
			assert.equal(changes[0].ns, 'config');
			assert.ok(changes[0].doc);
		});

		it('emits change on update', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			let changes = [];
			db.on('change', c => changes.push(c));
			await db.updateConfig(config._id, { name: 'renamed' });
			assert.ok(changes.length > 0);
			assert.equal(changes[0].op, 'u');
			assert.equal(changes[0].ns, 'config');
		});

		it('emits change on delete', async () => {
			let config = await db.insertConfig({ name: 'test', type: 'bind' });
			let changes = [];
			db.on('change', c => changes.push(c));
			await db.deleteConfigs([config._id], {}, { really: true });
			assert.ok(changes.length > 0);
			assert.equal(changes[0].op, 'd');
			assert.equal(changes[0].ns, 'config');
		});
	});
});
