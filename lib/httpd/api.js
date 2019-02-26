'use strict';

let parseUrl = require('parseurl'),
	querystring = require('querystring');

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
		let err = (e) => res.error(e.message);

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
	let send = (res, data, filename) => {
		res.headers({
			'Content-Type': 'text/csv',
			'Content-Disposition': `attachment; filename=${filename}.csv`
		});
		res.write(csv(data));
		res.end();
	};
	return function(req, res, /* next */) {
		let ok = (data) => data ? send(res, data, arguments[3]) : res.error();
		let err = (e) => res.error(e.message);
		let args = [].slice.call(arguments, 3);
		return f.apply(this, args).then(ok).catch(err);
	};
}

function statsExtract(data) {
	let fmt = x => x === undefined ? '' : x.toFixed(1);
	data = data.filter(row => row.stats && row.stats.count).reverse();
	data = data.map(row => [
		row.created.toISOString().replace(/[TZ]/g, ' '), row.stats.count,
		fmt(row.stats.min), fmt(row.stats.max),
		fmt(row.stats.average), fmt(row.stats.stddev)
	]);

	return [['date', 'runs', 'min', 'max', 'mean', 'stddev']].concat(data);
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
	let results = [];
	for (let agent in agents) {
		let config = agents[agent].configuration;
		let copy = {
			key: agent, name: config.name, protocol: config.protocol.toLowerCase()
		};
		results.push(copy);
	}
	return results;
}

async function getAgentsByProtocol(agents, protocol) {
	let results = await getAgents(agents);
	return results.filter(c => c.protocol === protocol);
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
		'DELETE /:id':					handler(db.deleteConfig),
		'GET /:id/queue/enabled':		handler(db.getQueueEntryEnabled),
		'PUT /:id/queue/enabled/':		handler(db.setQueueEntryEnabled),
		'GET /:id/queue/repeat':		handler(db.getQueueEntryRepeat),
		'PUT /:id/queue/repeat/':		handler(db.setQueueEntryRepeat),
		'PUT /:id/queue/priority/':		handler(db.setQueueEntryPriority),
		'GET /run/:id/':				handler(db.getRunsByConfigId),
		'GET /run/:id/stats':			csvHandler(db.getRunsByConfigId, statsExtract)
	},
	'/run': {
		'GET /:id':						handler(db.getRunById),
		'GET /:id/recalc':				handler(db.updateStatsByRunId),
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
		'PUT /paused/':					handler(db.setPaused)
	},
	'/log': {
		'GET /':						handler(db.getLog)
	},
	'/settings': {
		'GET /':						handler(async () => settings)
	},
	'/agent/server': {
		'GET /':						handler(getAgents.bind(this, agents.servers)),
		'GET /_protocol/:proto':		handler(getAgentsByProtocol.bind(this, agents.servers)),
		'GET /:name':					handler(getAgent.bind(this, agents.servers))
	},
	'/agent/client': {
		'GET /':						handler(getAgents.bind(this, agents.clients)),
		'GET /_protocol/:proto':		handler(getAgentsByProtocol.bind(this, agents.clients)),
		'GET /:name':					handler(getAgent.bind(this, agents.clients))
	}
});
