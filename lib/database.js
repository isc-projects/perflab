'use strict';

let BetterSqlite3 = require('better-sqlite3'),
	EventEmitter = require('events'),
	crypto = require('crypto'),
	os = require('os');

function genId() {
	return crypto.randomBytes(12).toString('hex');
}

function toISO(d) {
	if (!d) return new Date().toISOString();
	if (d instanceof Date) return d.toISOString();
	if (typeof d === 'string') return d;
	return new Date(d).toISOString();
}

// ---- config row <-> document mapping ----

const CONFIG_COLUMNS = new Set([
	'id', 'name', 'type', 'branch', 'archived', 'created', 'updated',
	'queue_enabled', 'queue_repeat', 'queue_priority', 'queue_running',
	'queue_state', 'queue_started', 'queue_completed', 'data'
]);

function configFromRow(row) {
	if (!row) return null;
	let {data, ...rest} = row;
	let config = {...rest, ...JSON.parse(data || '{}')};
	config._id = config.id; delete config.id;
	config.queue = {
		enabled: !!config.queue_enabled,
		repeat: !!config.queue_repeat,
		priority: config.queue_priority || 0,
		running: !!config.queue_running,
		state: config.queue_state || '',
		started: config.queue_started || null,
		completed: config.queue_completed || null
	};
	for (let k of Object.keys(config)) {
		if (k.startsWith('queue_')) delete config[k];
	}
	if (config.archived !== undefined) {
		config.archived = !!config.archived;
	}
	return config;
}

function configToRow(config) {
	let {_id, name, type, branch, archived, created, updated, queue, ...rest} = config;
	return {
		id: _id || genId(),
		name, type,
		branch: branch || '',
		archived: archived ? 1 : 0,
		created: toISO(created),
		updated: toISO(updated),
		queue_enabled: queue?.enabled ? 1 : 0,
		queue_repeat: queue?.repeat ? 1 : 0,
		queue_priority: queue?.priority || 0,
		queue_running: queue?.running ? 1 : 0,
		queue_state: queue?.state || '',
		queue_started: queue?.started ? toISO(queue.started) : null,
		queue_completed: queue?.completed ? toISO(queue.completed) : null,
		data: JSON.stringify(rest)
	};
}

// ---- run row <-> document mapping ----

const RUN_KNOWN_COLS = new Set([
	'id', 'config_id', 'created', 'updated', 'completed', 'tests_per_run',
	'commit', 'stats_count', 'stats_min', 'stats_max', 'stats_average',
	'stats_stddev', 'stdout', 'stderr', 'data'
]);

function runFromRow(row) {
	if (!row) return null;
	let {data, ...rest} = row;
	let run = {...rest, ...JSON.parse(data || '{}')};
	run._id = run.id; delete run.id;
	// reassemble stats object
	run.stats = {
		count: run.stats_count,
		min: run.stats_min,
		max: run.stats_max,
		average: run.stats_average,
		stddev: run.stats_stddev
	};
	delete run.stats_count; delete run.stats_min; delete run.stats_max;
	delete run.stats_average; delete run.stats_stddev;
	// convert tests_per_run -> testsPerRun for API compat
	if (run.tests_per_run !== undefined) {
		run.testsPerRun = run.tests_per_run;
		delete run.tests_per_run;
	}
	return run;
}

function runToRow(doc) {
	let {_id, config_id, created, updated, completed, testsPerRun,
		commit, stats, stdout, stderr, ...rest} = doc;
	return {
		id: _id || genId(),
		config_id: config_id || null,
		created: toISO(created),
		updated: toISO(updated),
		completed: completed ? toISO(completed) : null,
		tests_per_run: testsPerRun || null,
		commit: commit || null,
		stats_count: stats?.count ?? null,
		stats_min: stats?.min ?? null,
		stats_max: stats?.max ?? null,
		stats_average: stats?.average ?? null,
		stats_stddev: stats?.stddev ?? null,
		stdout: stdout || '',
		stderr: stderr || '',
		data: JSON.stringify(rest)
	};
}

// ---- test row <-> document mapping ----

function testFromRow(row) {
	if (!row) return null;
	let {data, ...rest} = row;
	let test = {...rest, ...JSON.parse(data || '{}')};
	test._id = test.id; delete test.id;
	return test;
}

function testToRow(doc) {
	let {_id, config_id, run_id, created, updated, completed,
		count, stdout, stderr, ...rest} = doc;
	return {
		id: _id || genId(),
		config_id: config_id || null,
		run_id: run_id || null,
		created: toISO(created),
		updated: toISO(updated),
		completed: completed ? toISO(completed) : null,
		count: count ?? null,
		stdout: stdout || '',
		stderr: stderr || '',
		data: JSON.stringify(rest)
	};
}

// ---- memory row <-> document mapping ----

function memoryFromRow(row) {
	if (!row) return null;
	let doc = {...row};
	doc._id = doc.id; delete doc.id;
	doc.data = JSON.parse(doc.data || '[]');
	return doc;
}

//
// Database class — drop-in replacement using SQLite
//
class Database extends EventEmitter {

	constructor(dbPath) {
		super();

		let db = new BetterSqlite3(dbPath);
		this.handle = db;

		// Enable WAL mode for better read concurrency
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');

		// Create tables
		db.exec(`
			CREATE TABLE IF NOT EXISTS config (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				type TEXT NOT NULL,
				branch TEXT DEFAULT '',
				archived INTEGER DEFAULT 0,
				created TEXT NOT NULL,
				updated TEXT NOT NULL,
				queue_enabled INTEGER DEFAULT 0,
				queue_repeat INTEGER DEFAULT 0,
				queue_priority INTEGER DEFAULT 0,
				queue_running INTEGER DEFAULT 0,
				queue_state TEXT DEFAULT '',
				queue_started TEXT,
				queue_completed TEXT,
				data TEXT NOT NULL DEFAULT '{}'
			);

			CREATE TABLE IF NOT EXISTS run (
				id TEXT PRIMARY KEY,
				config_id TEXT NOT NULL REFERENCES config(id),
				created TEXT NOT NULL,
				updated TEXT NOT NULL,
				completed TEXT,
				tests_per_run INTEGER,
				commit_ TEXT,
				stats_count INTEGER,
				stats_min REAL,
				stats_max REAL,
				stats_average REAL,
				stats_stddev REAL,
				stdout TEXT DEFAULT '',
				stderr TEXT DEFAULT '',
				data TEXT DEFAULT '{}'
			);

			CREATE TABLE IF NOT EXISTS test (
				id TEXT PRIMARY KEY,
				config_id TEXT NOT NULL,
				run_id TEXT NOT NULL REFERENCES run(id),
				created TEXT NOT NULL,
				updated TEXT NOT NULL,
				completed TEXT,
				count REAL,
				stdout TEXT DEFAULT '',
				stderr TEXT DEFAULT '',
				data TEXT DEFAULT '{}'
			);

			CREATE TABLE IF NOT EXISTS memory (
				id TEXT PRIMARY KEY,
				config_id TEXT NOT NULL,
				run_id TEXT NOT NULL REFERENCES run(id),
				ts TEXT NOT NULL,
				data TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS control (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				paused INTEGER DEFAULT 0
			);

			CREATE TABLE IF NOT EXISTS log (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				channel TEXT NOT NULL,
				text TEXT,
				host TEXT,
				time TEXT NOT NULL
			);

			CREATE INDEX IF NOT EXISTS idx_run_config_created ON run(config_id, created DESC);
			CREATE INDEX IF NOT EXISTS idx_test_run ON test(run_id, created);
			CREATE INDEX IF NOT EXISTS idx_test_config ON test(config_id);
			CREATE INDEX IF NOT EXISTS idx_memory_run ON memory(run_id, ts);
			CREATE INDEX IF NOT EXISTS idx_memory_config ON memory(config_id);
		`);

		// Ensure control singleton exists
		db.prepare('INSERT OR IGNORE INTO control (id, paused) VALUES (1, 0)').run();

		let notify = (op, ns, doc) => {
			this.emit('change', {op, ns, doc});
		};

		// Log TTL cleanup every 60 seconds
		this._cleanupInterval = setInterval(() => {
			try {
				db.prepare("DELETE FROM log WHERE time < datetime('now', '-24 hours')").run();
			} catch (e) {
				// ignore errors during cleanup
			}
		}, 60000);

		// ---- close ----

		this.close = async () => {
			clearInterval(this._cleanupInterval);
			db.close();
		};

		// ---- createIndexes (no-op, indexes created above) ----

		this.createIndexes = async () => {};

		// ---- Queue operations ----

		this.setQueueEntryEnabled = async (id, {enabled}) => {
			let set = { queue_enabled: enabled ? 1 : 0 };
			if (!enabled) set.queue_repeat = 0;
			let cols = Object.keys(set).map(k => `${k} = @${k}`).join(', ');
			let r = db.prepare(`UPDATE config SET ${cols} WHERE id = @id`).run({...set, id});
			let notifySet = {'queue.enabled': !!enabled};
			if (!enabled) notifySet['queue.repeat'] = false;
			notify('u', 'config', {_id: id, $set: notifySet});
			return r;
		};

		this.getQueueEntryEnabled = async (id) => {
			let r = db.prepare('SELECT queue_enabled FROM config WHERE id = ?').get(id);
			return r ? {enabled: !!r.queue_enabled} : {enabled: false};
		};

		this.setQueueEntryRepeat = async (id, {repeat}) => {
			let r = db.prepare('UPDATE config SET queue_repeat = ?, queue_enabled = 1 WHERE id = ?')
				.run(repeat ? 1 : 0, id);
			notify('u', 'config', {_id: id, $set: {'queue.repeat': !!repeat, 'queue.enabled': true}});
			return r;
		};

		this.getQueueEntryRepeat = async (id) => {
			let r = db.prepare('SELECT queue_repeat FROM config WHERE id = ?').get(id);
			return r ? {repeat: !!r.queue_repeat} : {repeat: false};
		};

		this.setQueueEntryPriority = async (id, {priority}) => {
			let r = db.prepare('UPDATE config SET queue_priority = ? WHERE id = ?').run(priority, id);
			notify('u', 'config', {_id: id, $set: {'queue.priority': priority}});
			return r;
		};

		this.setQueueState = async (id, label) => {
			let r = db.prepare('UPDATE config SET queue_state = ? WHERE id = ?').run(label, id);
			notify('u', 'config', {_id: id, $set: {'queue.state': label}});
			return r;
		};

		this.takeNextFromQueue = async (filter) => {
			let types = filter?.type?.$in || [];
			if (types.length === 0) return null;
			let placeholders = types.map(() => '?').join(',');
			let now = new Date().toISOString();
			let sql = `UPDATE config SET queue_running = 1, queue_started = ?
				WHERE id = (
					SELECT id FROM config
					WHERE type IN (${placeholders})
					AND queue_running = 0 AND queue_enabled = 1 AND archived = 0
					ORDER BY queue_priority DESC, queue_completed ASC
					LIMIT 1
				) RETURNING *`;
			let row = db.prepare(sql).get(now, ...types);
			if (row) {
				let doc = configFromRow(row);
				notify('u', 'config', {_id: doc._id});
				return doc;
			}
			return null;
		};

		this.clearQueue = async (filter) => {
			let types = filter?.type?.$in || [];
			let r;
			if (types.length === 0) {
				r = db.prepare('UPDATE config SET queue_running = 0 WHERE queue_running = 1').run();
			} else {
				let placeholders = types.map(() => '?').join(',');
				r = db.prepare(`UPDATE config SET queue_running = 0 WHERE queue_running = 1 AND type IN (${placeholders})`)
					.run(...types);
			}
			notify('u', 'config', {$set: {'queue.running': false}});
			return r;
		};

		this.markQueueEntryDone = async (id) => {
			let now = new Date().toISOString();
			db.prepare('UPDATE config SET queue_running = 0, queue_priority = 0, queue_completed = ? WHERE id = ?')
				.run(now, id);
			let set = {'queue.running': false, 'queue.priority': 0, 'queue.completed': now};
			notify('u', 'config', {_id: id, $set: set});
		};

		this.disableOneshotQueue = async (id) => {
			let row = db.prepare('SELECT * FROM config WHERE id = ? AND queue_repeat = 0').get(id);
			if (row) {
				db.prepare('UPDATE config SET queue_enabled = 0 WHERE id = ?').run(id);
				notify('u', 'config', {_id: id, $set: {'queue.enabled': false}});
				return configFromRow(row);
			}
			return null;
		};

		// ---- Config CRUD ----

		this.getConfig = async (id) => {
			let row = db.prepare('SELECT * FROM config WHERE id = ?').get(id);
			return configFromRow(row);
		};

		this.deleteConfigs = async (config_ids, _, {really} = {}) => {
			really = really || false;
			try { really = JSON.parse(really); } catch(e) { /* no-op */ }
			if (!really) throw 'config DELETE operation didn\'t really happen';

			let placeholders = config_ids.map(() => '?').join(',');
			let deleteRuns = db.prepare(`DELETE FROM run WHERE config_id IN (${placeholders})`);
			let deleteTests = db.prepare(`DELETE FROM test WHERE config_id IN (${placeholders})`);
			let deleteMemory = db.prepare(`DELETE FROM memory WHERE config_id IN (${placeholders})`);
			let deleteConfigs = db.prepare(`DELETE FROM config WHERE id IN (${placeholders})`);

			let transaction = db.transaction(() => {
				deleteTests.run(...config_ids);
				deleteMemory.run(...config_ids);
				deleteRuns.run(...config_ids);
				deleteConfigs.run(...config_ids);
			});
			transaction();

			config_ids.forEach(id => notify('d', 'config', {_id: id}));
			return {deletedCount: config_ids.length};
		};

		this.updateConfig = async (id, config) => {
			config._id = id;
			config.updated = new Date().toISOString();
			delete config.created;
			delete config.queue;

			// Read existing to merge
			let existing = db.prepare('SELECT * FROM config WHERE id = ?').get(id);
			if (!existing) return null;
			let existingDoc = configFromRow(existing);

			// Merge new fields into existing
			let merged = {...existingDoc, ...config};
			let row = configToRow(merged);

			db.prepare(`UPDATE config SET name=@name, type=@type, branch=@branch,
				archived=@archived, updated=@updated, data=@data WHERE id=@id`).run(row);

			notify('u', 'config', {_id: id, $set: config});
			let updatedRow = db.prepare('SELECT * FROM config WHERE id = ?').get(id);
			return configFromRow(updatedRow);
		};

		this.archiveConfigs = async (ids) => {
			let now = new Date().toISOString();
			let placeholders = ids.map(() => '?').join(',');
			let r = db.prepare(`UPDATE config SET archived = 1, updated = ? WHERE id IN (${placeholders})`)
				.run(now, ...ids);
			ids.forEach(id => notify('u', 'config', {_id: id, $set: {archived: true}}));
			return r;
		};

		this.batchCloneConfigs = async (ids, { overrides = {} } = {}) => {
			let placeholders = ids.map(() => '?').join(',');
			let rows = db.prepare(`SELECT * FROM config WHERE id IN (${placeholders})`).all(...ids);
			let configs = rows.map(configFromRow);

			let results = [];
			for (let config of configs) {
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
				let saved = await this.insertConfig(clone);
				results.push(saved._id);
			}
			return results;
		};

		this.insertConfig = async (config) => {
			config.created = new Date();
			config.updated = new Date();
			config.queue = config.queue || {
				enabled: true, repeat: true, priority: 0
			};
			let row = configToRow(config);
			db.prepare(`INSERT INTO config (id, name, type, branch, archived, created, updated,
				queue_enabled, queue_repeat, queue_priority, queue_running, queue_state,
				queue_started, queue_completed, data)
				VALUES (@id, @name, @type, @branch, @archived, @created, @updated,
				@queue_enabled, @queue_repeat, @queue_priority, @queue_running, @queue_state,
				@queue_started, @queue_completed, @data)`).run(row);
			config._id = row.id;
			notify('i', 'config', config);
			return config;
		};

		const listViewCols = 'id, name, type, archived, queue_enabled, queue_repeat, queue_priority, queue_running, queue_state, queue_started, queue_completed';

		function configListFromRow(row) {
			if (!row) return null;
			let config = {
				_id: row.id,
				name: row.name,
				type: row.type,
				archived: !!row.archived,
				queue: {
					enabled: !!row.queue_enabled,
					repeat: !!row.queue_repeat,
					priority: row.queue_priority || 0,
					running: !!row.queue_running,
					state: row.queue_state || '',
					started: row.queue_started || null,
					completed: row.queue_completed || null
				}
			};
			return config;
		}

		this.getConfigListAll = async () => {
			let rows = db.prepare(`SELECT ${listViewCols} FROM config`).all();
			return rows.map(configListFromRow);
		};

		this.getConfigListOne = async (id) => {
			let row = db.prepare(`SELECT ${listViewCols} FROM config WHERE id = ?`).get(id);
			return configListFromRow(row);
		};

		// ---- Run operations ----

		this.insertRun = async (run) => {
			run.created = new Date();
			run.updated = new Date();
			let row = runToRow(run);
			db.prepare(`INSERT INTO run (id, config_id, created, updated, completed, tests_per_run,
				commit_, stats_count, stats_min, stats_max, stats_average, stats_stddev,
				stdout, stderr, data)
				VALUES (@id, @config_id, @created, @updated, @completed, @tests_per_run,
				@commit_, @stats_count, @stats_min, @stats_max, @stats_average, @stats_stddev,
				@stdout, @stderr, @data)`).run({...row, commit_: row.commit});
			run._id = row.id;
			notify('i', 'run', run);
			return run;
		};

		this.getRunById = async (id) => {
			let row = db.prepare('SELECT * FROM run WHERE id = ?').get(id);
			if (!row) return null;
			// Map commit_ back to commit
			row.commit = row.commit_;
			delete row.commit_;
			return runFromRow(row);
		};

		this.updateRunById = async (id, data) => {
			data.updated = new Date().toISOString();

			let existing = db.prepare('SELECT * FROM run WHERE id = ?').get(id);
			if (!existing) return null;
			existing.commit = existing.commit_;
			delete existing.commit_;
			let existingDoc = runFromRow(existing);

			let merged = {...existingDoc, ...data};
			let row = runToRow(merged);

			db.prepare(`UPDATE run SET config_id=@config_id, updated=@updated, completed=@completed,
				tests_per_run=@tests_per_run, commit_=@commit_, stats_count=@stats_count,
				stats_min=@stats_min, stats_max=@stats_max, stats_average=@stats_average,
				stats_stddev=@stats_stddev, stdout=@stdout, stderr=@stderr, data=@data
				WHERE id=@id`).run({...row, commit_: row.commit});

			notify('u', 'run', {_id: id, ...data});
		};

		this.updateRunStats = async (run) => {
			let runId = run._id;
			let testsPerRun = run.testsPerRun || 1;

			let rows = db.prepare('SELECT count FROM test WHERE run_id = ? ORDER BY created')
				.all(runId);

			if (rows.length === 0) {
				let stats = {count: 1};
				db.prepare('UPDATE run SET stats_count=?, stats_min=NULL, stats_max=NULL, stats_average=NULL, stats_stddev=NULL WHERE id=?')
					.run(stats.count, runId);
				notify('u', 'run', {_id: runId, stats});
				return;
			}

			// Skip first result (warm-up) unless it's the only one
			let values = rows.map(r => r.count).filter(c => c != null);
			let skipped = 0;
			if (values.length > 1 && testsPerRun > 1) {
				values = values.slice(1);
				skipped = 1;
			}

			if (values.length === 0) {
				let stats = {count: rows.length};
				db.prepare('UPDATE run SET stats_count=? WHERE id=?').run(stats.count, runId);
				notify('u', 'run', {_id: runId, stats});
				return;
			}

			let n = values.length;
			let sum = values.reduce((a, b) => a + b, 0);
			let min = Math.min(...values);
			let max = Math.max(...values);
			let average = sum / n;
			let stddev = null;
			if (n > 1) {
				let variance = values.reduce((acc, v) => acc + (v - average) * (v - average), 0) / (n - 1);
				stddev = Math.sqrt(variance);
			}

			let stats = {
				count: n + skipped,
				min, max, average, stddev
			};

			db.prepare(`UPDATE run SET stats_count=?, stats_min=?, stats_max=?,
				stats_average=?, stats_stddev=? WHERE id=?`)
				.run(stats.count, stats.min, stats.max, stats.average, stats.stddev, runId);

			notify('u', 'run', {_id: runId, stats});
		};

		// ---- Memory operations ----

		this.insertMemoryStats = async (memory) => {
			let id = genId();
			let ts = new Date().toISOString();
			db.prepare('INSERT INTO memory (id, config_id, run_id, ts, data) VALUES (?, ?, ?, ?, ?)')
				.run(id, memory.config_id, memory.run_id, ts, JSON.stringify(memory.data));
		};

		this.getMemoryStatsByRunId = async (run_id) => {
			let rows = db.prepare('SELECT ts, data FROM memory WHERE run_id = ? ORDER BY ts')
				.all(run_id);
			return rows.map(r => ({ts: r.ts, data: JSON.parse(r.data)}));
		};

		// ---- Test operations ----

		this.insertTest = async (test) => {
			test.created = new Date();
			test.updated = new Date();
			let row = testToRow(test);
			db.prepare(`INSERT INTO test (id, config_id, run_id, created, updated, completed,
				count, stdout, stderr, data)
				VALUES (@id, @config_id, @run_id, @created, @updated, @completed,
				@count, @stdout, @stderr, @data)`).run(row);
			test._id = row.id;
			notify('i', 'test', test);
			return test;
		};

		this.updateTestById = async (id, data) => {
			data.updated = new Date().toISOString();
			delete data.created;

			let existing = db.prepare('SELECT * FROM test WHERE id = ?').get(id);
			if (!existing) return null;
			let existingDoc = testFromRow(existing);

			let merged = {...existingDoc, ...data};
			merged._id = id;
			let row = testToRow(merged);

			db.prepare(`UPDATE test SET config_id=@config_id, run_id=@run_id, updated=@updated,
				completed=@completed, count=@count, stdout=@stdout, stderr=@stderr, data=@data
				WHERE id=@id`).run(row);

			notify('u', 'test', {_id: id, ...data});
		};

		this.getTestsByRunId = async (run_id) => {
			let rows = db.prepare('SELECT id, config_id, run_id, created, updated, completed, count, data FROM test WHERE run_id = ? ORDER BY created')
				.all(run_id);
			return rows.map(testFromRow);
		};

		this.getTestById = async (id) => {
			let row = db.prepare('SELECT * FROM test WHERE id = ?').get(id);
			return testFromRow(row);
		};

		// ---- Runs by config IDs (with peak memory and config join) ----

		this.getRunsByConfigIds = async (config_ids, _, {skip, limit, from_datetime, with_commit} = {}) => {
			skip = +skip || 0;
			limit = +limit || 0;
			skip = Math.max(skip, 0);
			limit = Math.max(limit, 0);

			let dateFilter = from_datetime ? new Date(from_datetime).toISOString() : '1970-01-02T00:00:00.000Z';
			let placeholders = config_ids.map(() => '?').join(',');

			// Build column list - skip large fields when possible
			let runCols = 'r.id, r.created, r.config_id, r.stats_count, r.stats_min, r.stats_max, r.stats_average, r.stats_stddev';
			if (with_commit) runCols += ', r.commit_';

			let sql = `SELECT ${runCols}, c.name AS config_name, c.branch AS config_branch,
				COALESCE(MAX(json_extract(m.data, '$[1]')) * 4096.0 / 1048576, 0) AS peak_mem
				FROM run r
				LEFT JOIN config c ON r.config_id = c.id
				LEFT JOIN memory m ON m.run_id = r.id
				WHERE r.config_id IN (${placeholders}) AND r.created >= ?
				GROUP BY r.id
				ORDER BY r.created DESC`;

			if (limit > 0) sql += ` LIMIT ${limit}`;
			if (skip > 0) sql += ` OFFSET ${skip}`;

			let rows = db.prepare(sql).all(...config_ids, dateFilter);

			return rows.map(row => {
				let result = {
					_id: row.id,
					created: row.created,
					config_id: row.config_id,
					stats: {
						count: row.stats_count,
						min: row.stats_min,
						max: row.stats_max,
						average: row.stats_average,
						stddev: row.stats_stddev
					},
					peak_mem: row.peak_mem || 0,
					config: row.config_name ? [{
						name: row.config_name,
						branch: row.config_branch || ''
					}] : []
				};
				if (with_commit) result.commit = row.commit_ || null;
				return result;
			});
		};

		// ---- Control operations ----

		this.getControl = async () => {
			let row = db.prepare('SELECT * FROM control WHERE id = 1').get();
			if (!row) return {paused: false};
			return {paused: !!row.paused};
		};

		this.setPaused = async ({paused}) => {
			let r = db.prepare('UPDATE control SET paused = ? WHERE id = 1').run(paused ? 1 : 0);
			notify('u', 'control', {paused: !!paused});
			return r;
		};

		this.getPaused = async () => {
			let row = db.prepare('SELECT paused FROM control WHERE id = 1').get();
			return row ? {paused: !!row.paused} : {paused: false};
		};

		// ---- Log operations ----

		this.insertLog = async (log) => {
			log.time = log.time ? toISO(log.time) : new Date().toISOString();
			db.prepare('INSERT INTO log (channel, text, host, time) VALUES (@channel, @text, @host, @time)')
				.run(log);
			notify('i', 'log', log);
		};

		this.insertErrorLog = async (e) => {
			let host = os.hostname().split('.')[0];
			let text, channel;
			if (e.stdout) {
				channel = 'stdout';
				text = e.stdout;
			} else if (e.stderr) {
				channel = 'stderr';
				text = e.stderr;
			} else {
				channel = 'perflab';
				if (e.stack) {
					text = e.stack;
				} else {
					text = e;
				}
			}
			if (!e) return;
			let log = {channel, text, host, time: new Date().toISOString()};
			this.insertLog(log);
		};

		this.getLog = async () => {
			return db.prepare("SELECT * FROM log WHERE time >= datetime('now', '-24 hours') ORDER BY time DESC").all();
		};
	}
}

module.exports = Database;
