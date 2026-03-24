'use strict';

let { describe, it, before, after } = require('node:test');
let assert = require('node:assert/strict');
let http = require('http');
let connect = require('connect');
let quip = require('quip');
let dispatch = require('dispatch');
let bodyParser = require('body-parser');
let Database = require('../lib/database');

let db, server, baseUrl;

// Minimal agent stubs for API routes
let agents = {
	servers: {},
	clients: {}
};
let settings = { test: true };

function request(method, path, body) {
	return new Promise((resolve, reject) => {
		let url = new URL(path, baseUrl);
		let opts = {
			method,
			hostname: url.hostname,
			port: url.port,
			path: url.pathname + url.search,
			headers: { 'Content-Type': 'application/json' }
		};
		let req = http.request(opts, (res) => {
			let chunks = [];
			res.on('data', c => chunks.push(c));
			res.on('end', () => {
				let raw = Buffer.concat(chunks).toString();
				let data;
				let ct = res.headers['content-type'] || '';
				if (ct.includes('application/json')) {
					try { data = JSON.parse(raw); } catch(e) { data = raw; }
				} else {
					data = raw;
				}
				resolve({ status: res.statusCode, data, headers: res.headers, raw });
			});
		});
		req.on('error', reject);
		if (body !== undefined) {
			req.write(JSON.stringify(body));
		}
		req.end();
	});
}

before(async () => {
	db = new Database(':memory:');
	let app = connect();
	server = http.createServer(app);
	app.use(quip);
	app.use(bodyParser.json({ strict: false, limit: '5mb' }));
	let api = require('../lib/httpd/api');
	app.use(dispatch({
		'/api': api(settings, agents, db)
	}));

	await new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			let addr = server.address();
			baseUrl = `http://127.0.0.1:${addr.port}`;
			resolve();
		});
	});
});

after(async () => {
	await new Promise(resolve => server.close(resolve));
	await db.close();
});

describe('API', () => {

	// ---- Read endpoints (handler) ----

	describe('GET /api/control/paused', () => {
		it('returns {paused: false} with status 200', async () => {
			let res = await request('GET', '/api/control/paused');
			assert.equal(res.status, 200);
			assert.deepEqual(res.data, { paused: false });
		});
	});

	describe('GET /api/config/:id (nonexistent)', () => {
		it('returns 404 for nonexistent id', async () => {
			let res = await request('GET', '/api/config/000000000000000000000000');
			assert.equal(res.status, 404);
		});
	});

	describe('GET /api/config_list/', () => {
		it('returns empty array', async () => {
			let res = await request('GET', '/api/config_list/');
			assert.equal(res.status, 200);
			assert.deepEqual(res.data, []);
		});
	});

	// ---- Write endpoints (writeHandler) ----

	describe('POST /api/run/', () => {
		it('returns object with _id', async () => {
			// Need a config first for the FK
			let configRes = await request('POST', '/api/config/', { name: 'api-test', type: 'bind' });
			let configId = configRes.data._id;

			let res = await request('POST', '/api/run/', { config_id: configId, testsPerRun: 1 });
			assert.equal(res.status, 200);
			assert.ok(res.data._id, 'should have _id');
		});
	});

	describe('PUT /api/queue/:id/disable-oneshot', () => {
		it('returns {ok: true} when nothing to disable', async () => {
			// Create a repeat config — disableOneshotQueue returns null for repeat
			let configRes = await request('POST', '/api/config/', { name: 'repeat', type: 'bind' });
			let id = configRes.data._id;

			let res = await request('PUT', `/api/queue/${id}/disable-oneshot`);
			assert.equal(res.status, 200);
			// writeHandler converts null to {ok: true}
			assert.deepEqual(res.data, { ok: true });
		});
	});

	// ---- Nullable endpoint ----

	describe('POST /api/queue/take', () => {
		it('returns null when queue empty', async () => {
			// Use a type that no config has to ensure empty result
			let res = await request('POST', '/api/queue/take', { type: { $in: ['nonexistent-type'] } });
			assert.equal(res.status, 200);
			assert.equal(res.data, null);
		});
	});

	// ---- CSV export ----

	describe('GET /api/batch/stats', () => {
		it('returns CSV with correct Content-Type', async () => {
			let configRes = await request('POST', '/api/config/', { name: 'csv-test', type: 'bind', branch: 'main' });
			let configId = configRes.data._id;
			let runRes = await request('POST', '/api/run/', { config_id: configId, testsPerRun: 1 });
			let runId = runRes.data._id;

			// Insert test and update stats
			await request('POST', '/api/test/', { config_id: configId, run_id: runId, count: 999 });
			await request('PUT', `/api/run/${runId}/stats`, { testsPerRun: 1 });

			let res = await request('GET', `/api/batch/stats?ids=${configId}&with_commit=true`);
			assert.equal(res.status, 200);
			assert.ok(res.headers['content-type'].includes('text/csv'), 'should be text/csv');
			assert.ok(res.raw.includes('date,runs,min,max,mean,stddev'), 'should have CSV header');
			assert.ok(res.raw.includes('999.0'), 'should include stat value');
		});

		it('does not crash with null stats', async () => {
			let configRes = await request('POST', '/api/config/', { name: 'csv-null', type: 'bind' });
			let configId = configRes.data._id;
			// Insert run without any tests — stats will be null
			await request('POST', '/api/run/', { config_id: configId });

			let res = await request('GET', `/api/batch/stats?ids=${configId}&with_commit=true`);
			// statsExtract filters out runs without stats.count, so just the header
			assert.equal(res.status, 200);
			assert.ok(res.raw.includes('date,runs,min,max,mean,stddev'), 'should have CSV header');
		});
	});

	// ---- Data integrity round-trip ----

	describe('config round-trip', () => {
		it('insert → get preserves fields with _id', async () => {
			let res = await request('POST', '/api/config/', {
				name: 'roundtrip', type: 'knot', branch: 'v3.4',
				args: { configure: '--enable-dnstap' }
			});
			assert.equal(res.status, 200);
			let id = res.data._id;
			assert.ok(id);

			let got = await request('GET', `/api/config/${id}`);
			assert.equal(got.status, 200);
			assert.equal(got.data._id, id);
			assert.equal(got.data.name, 'roundtrip');
			assert.equal(got.data.type, 'knot');
			assert.equal(got.data.branch, 'v3.4');
			assert.deepEqual(got.data.args, { configure: '--enable-dnstap' });
		});
	});

	describe('run round-trip', () => {
		it('insert → get has stats object and commit field', async () => {
			let configRes = await request('POST', '/api/config/', { name: 'run-rt', type: 'bind' });
			let configId = configRes.data._id;

			let runRes = await request('POST', '/api/run/', {
				config_id: configId, testsPerRun: 2, commit: 'commit deadbeef'
			});
			let runId = runRes.data._id;
			assert.ok(runId);

			let got = await request('GET', `/api/run/${runId}`);
			assert.equal(got.status, 200);
			assert.equal(typeof got.data.stats, 'object', 'stats should be an object');
			assert.equal(got.data.commit, 'commit deadbeef', 'should have commit not commit_');
			assert.equal(got.data.commit_, undefined, 'should not leak commit_');
		});
	});

	describe('test + stats round-trip', () => {
		it('insert tests → updateRunStats → stats computed correctly', async () => {
			let configRes = await request('POST', '/api/config/', { name: 'stats-rt', type: 'bind' });
			let configId = configRes.data._id;
			let runRes = await request('POST', '/api/run/', { config_id: configId, testsPerRun: 3 });
			let runId = runRes.data._id;

			await request('POST', '/api/test/', { config_id: configId, run_id: runId, count: 100 });
			await request('POST', '/api/test/', { config_id: configId, run_id: runId, count: 200 });
			await request('POST', '/api/test/', { config_id: configId, run_id: runId, count: 300 });

			await request('PUT', `/api/run/${runId}/stats`, { testsPerRun: 3 });

			let got = await request('GET', `/api/run/${runId}`);
			assert.equal(got.data.stats.count, 3);
			assert.equal(got.data.stats.min, 200, 'warmup skipped');
			assert.equal(got.data.stats.max, 300);
			assert.equal(got.data.stats.average, 250);
		});
	});

	describe('log round-trip', () => {
		it('insert → get returns entries with _id', async () => {
			await request('POST', '/api/log/', { channel: 'test', text: 'entry1', host: 'h1' });
			await request('POST', '/api/log/', { channel: 'test', text: 'entry2', host: 'h1' });

			let res = await request('GET', '/api/log/');
			assert.equal(res.status, 200);
			assert.ok(Array.isArray(res.data));
			assert.ok(res.data.length >= 2);
			for (let entry of res.data) {
				assert.ok(entry._id !== undefined, 'should have _id');
				assert.equal(entry.id, undefined, 'should not have id');
			}
		});
	});

	// ---- Body size ----

	describe('large body', () => {
		it('accepts up to 5mb body', async () => {
			let configRes = await request('POST', '/api/config/', { name: 'big', type: 'bind' });
			let configId = configRes.data._id;

			// Create a large payload (~1MB)
			let largeStdout = 'x'.repeat(1024 * 1024);
			let runRes = await request('POST', '/api/run/', {
				config_id: configId, stdout: largeStdout
			});
			assert.equal(runRes.status, 200);
			assert.ok(runRes.data._id);
		});
	});
});
