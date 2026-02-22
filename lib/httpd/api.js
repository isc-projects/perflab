'use strict';

let parseUrl = require('parseurl'),
	querystring = require('querystring'),
	crypto = require('crypto');

//
// calls the given function, converting the result into
// JSON, or returning an HTTP error response if there's
// no data
//
// the function is passed (in order):
// -  any formal named parameters from the dispatcher
// -  the request body
// -  any HTTP query string parameters
//
function handler(f) {
	return function(req, res, /* next */) {
		let url = parseUrl(req);
		let query = querystring.parse(url.query);
		let ok = (data) => data ? res.json(data) : res.error();
		let err = (e) => {
			if (e instanceof Error) {
				console.trace(e);
				res.error(e.message);
			} else {
				res.forbidden(e);
			}
		}

		let args = [].slice.call(arguments, 3);
		args.push(req.body, query);
		return f.apply(this, args).then(ok).catch(err);
	};
}

function csvHandler(f, x) {
	let csv = (data) => {
		if (typeof x === 'function') {
			data = x(data);
		}
		return data.map(cols => cols.join(',')).join('\r\n');
	};
	let generateFilename = (query) => {
		let ids = parseIds(query).sort();
		let hash = ids.reduce((h, id) => h.update(id), crypto.createHash('sha256')).digest('hex').substring(0, 8);
		let timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
		return `${hash}-${timestamp}.csv`;
	};
	let send = (res, data, filename) => {
		res.headers({
			'Content-Type': 'text/csv',
			'Content-Disposition': `attachment; filename=${filename}`
		});
		res.write(csv(data));
		res.end();
	};
	return function(req, res, /* next */) {
		let url = parseUrl(req);
		let query = querystring.parse(url.query);
		let filename = generateFilename(query);
		let ok = (data) => data ? send(res, data, filename) : res.error();
		let err = (e) => res.error(e.message);
		let args = [].slice.call(arguments, 3);
		args.push(req.body, query);
		return f.apply(this, args).then(ok).catch(err);
	};
}


function statsExtract(data) {
	let fmt = x => x === undefined ? '' : x.toFixed(1);
	let extractCommitHash = (commitField) => {
		if (!commitField) return '';
		// Extract commit hash from "commit <hash>" format
		let match = commitField.match(/^commit\s+([a-f0-9]+)/);
		return match ? match[1] : '';
	};

	data = data.filter(row => row.stats && row.stats.count).reverse();
	data = data.map(row => [
		row.created.toISOString().replace(/[TZ]/g, ' '), row.stats.count,
		fmt(row.stats.min), fmt(row.stats.max),
		fmt(row.stats.average), fmt(row.stats.stddev), fmt(row.peak_mem),
		row.config && row.config.length > 0 ? row.config[0].name : '',
		row.config && row.config.length > 0 ? row.config[0].branch || '' : '',
		extractCommitHash(row.commit)
	]);

	return [['date', 'runs', 'min', 'max', 'mean', 'stddev', 'memory_mb', 'config_name', 'branch', 'commit']].concat(data);
}

async function getAgent(agents, field) {
	if (field in agents) {
		return agents[field].configuration;
	} else {
		throw Error('invalid agent ID');
	}
}

async function getAgents(agents)
{
	let results = {};
	for (let [key, agent] of Object.entries(agents)) {
		results[key] = agent.configuration;
	}
	return results;
}

function debugInfo(req, res) {
	res.json({ env: process.env, headers: req.headers });
}

function parseIds(query) {
	if (!query.ids) {
		throw new Error('Missing required parameter: ids');
	}
	let ids = query.ids.split(',').filter(id => id.trim());
	if (ids.length === 0) {
		throw new Error('No valid config IDs provided');
	}
	return ids;
}



module.exports = (settings, agents, db) => ({
	'/config_list': {
		'GET /':						handler(db.getConfigListAll),
		'GET /:id':						handler(db.getConfigListOne),
	},
	'/config': {
		'GET /:id':						handler(db.getConfig),
		'POST /':						handler(db.insertConfig),
		'PUT /:id':						handler(db.updateConfig),
		'DELETE /:id':					handler(async (id, body, query) => db.deleteConfigs([id], body, query)),
		'GET /:id/queue/enabled':		handler(db.getQueueEntryEnabled),
		'PUT /:id/queue/enabled/':		handler(db.setQueueEntryEnabled),
		'PUT /:id/queue/enabled':		handler(db.setQueueEntryEnabled),
		'GET /:id/queue/repeat':		handler(db.getQueueEntryRepeat),
		'PUT /:id/queue/repeat/':		handler(db.setQueueEntryRepeat),
		'PUT /:id/queue/repeat':		handler(db.setQueueEntryRepeat),
		'PUT /:id/queue/priority/':		handler(db.setQueueEntryPriority),
		'PUT /:id/queue/priority':		handler(db.setQueueEntryPriority),
		'GET /run/:id/':				handler((id, body, query) => db.getRunsByConfigIds([id], body, {...query, with_commit: false})),
		'GET /run/:id/stats':			csvHandler((id, body, query) => db.getRunsByConfigIds([id], body, query), statsExtract)
	},
	'/batch': {
		'GET /stats':					csvHandler(async (body, query) => db.getRunsByConfigIds(parseIds(query), body, query), statsExtract),
		'PUT /archive':					handler(async (body, query) => db.archiveConfigs(parseIds(query))),
		'DELETE /':						handler(async (body, query) => db.deleteConfigs(parseIds(query), body, query)),
		'POST /clone':					handler(async (body, query) => db.batchCloneConfigs(parseIds(query), body))
	},
	'/run': {
		'GET /:id':						handler(db.getRunById),
		'GET /test/:id/':				handler(db.getTestsByRunId),
		'GET /memory/:id/':				handler(db.getMemoryStatsByRunId)
	},
	'/test': {
		'GET /:id':						handler(db.getTestById)
	},
	'/queue': {
	},
	'/control': {
		'GET /':						handler(db.getControl),
		'GET /paused':					handler(db.getPaused),
		'PUT /paused/':					handler(db.setPaused),
		'PUT /paused':					handler(db.setPaused)
	},
	'/log': {
		'GET /':						handler(db.getLog)
	},
	'/settings': {
		'GET /':						handler(async () => settings)
	},
	'/agent/server': {
		'GET /':						handler(getAgents.bind(this, agents.servers)),
		'GET /:name':					handler(getAgent.bind(this, agents.servers))
	},
	'/agent/client': {
		'GET /':						handler(getAgents.bind(this, agents.clients)),
		'GET /:name':					handler(getAgent.bind(this, agents.clients))
	},
	'/debug': {
		'GET /':						debugInfo
	}
});
