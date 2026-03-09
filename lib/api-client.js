'use strict';

let http = require('http'),
	url = require('url');

class ApiClient {

	constructor(baseUrl) {
		this._base = baseUrl.replace(/\/+$/, '');
	}

	_request(method, path, body) {
		return new Promise((resolve, reject) => {
			let target = url.parse(this._base + path);
			let payload = body !== undefined ? JSON.stringify(body) : undefined;

			let opts = {
				hostname: target.hostname,
				port: target.port,
				path: target.path,
				method: method,
				headers: {
					'Accept': 'application/json'
				}
			};

			if (payload !== undefined) {
				opts.headers['Content-Type'] = 'application/json';
				opts.headers['Content-Length'] = Buffer.byteLength(payload);
			}

			let req = http.request(opts, (res) => {
				let chunks = [];
				res.on('data', (chunk) => chunks.push(chunk));
				res.on('end', () => {
					let data = Buffer.concat(chunks).toString();
					if (res.statusCode >= 400) {
						return reject(new Error(`API ${method} ${path} returned ${res.statusCode}: ${data}`));
					}
					try {
						resolve(data ? JSON.parse(data) : null);
					} catch (e) {
						resolve(data);
					}
				});
			});

			req.on('error', reject);
			if (payload !== undefined) {
				req.write(payload);
			}
			req.end();
		});
	}

	// queue operations
	async takeNextFromQueue(filter) {
		return this._request('POST', '/queue/take', filter);
	}

	async clearQueue(filter) {
		return this._request('POST', '/queue/clear', filter);
	}

	async markQueueEntryDone(id) {
		return this._request('PUT', `/queue/${id}/done`, {});
	}

	async disableOneshotQueue(id) {
		return this._request('PUT', `/queue/${id}/disable-oneshot`, {});
	}

	async setQueueState(id, label) {
		return this._request('PUT', `/queue/${id}/state`, {label});
	}

	// config operations (read-only)
	async getConfig(id) {
		return this._request('GET', `/config/${id}`);
	}

	// control operations (read-only)
	async getPaused() {
		return this._request('GET', '/control/paused');
	}

	// run operations
	async insertRun(run) {
		return this._request('POST', '/run/', run);
	}

	async updateRunById(id, data) {
		return this._request('PUT', `/run/${id}`, data);
	}

	async updateRunStats(run) {
		let {_id, ...body} = run;
		return this._request('PUT', `/run/${_id}/stats`, body);
	}

	// test operations
	async insertTest(test) {
		return this._request('POST', '/test/', test);
	}

	async updateTestById(id, data) {
		return this._request('PUT', `/test/${id}`, data);
	}

	// memory operations
	async insertMemoryStats(mem) {
		return this._request('POST', '/memory/', mem);
	}

	// log operations
	async insertLog(log) {
		return this._request('POST', '/log/', log);
	}

	async insertErrorLog(e) {
		// Error objects don't JSON.stringify, so extract the relevant fields
		let body = {};
		if (e && e.stdout) body.stdout = e.stdout;
		else if (e && e.stderr) body.stderr = e.stderr;
		else if (e instanceof Error) body.stack = e.stack;
		else body.text = e;
		return this._request('POST', '/log/error', body);
	}
}

module.exports = ApiClient;
