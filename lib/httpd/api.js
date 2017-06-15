"use strict";

let parseUrl = require('parseurl'),
	querystring = require('querystring');

// calls the given function, converting the result into
// JSON, or returning an HTTP error response if there's
// no data
function handler(f) {
	return function(req, res, next) {
		let ok = (data) => data ? res.json(data) : res.error();
		let err = (e) => res.error(e.message);
		let args = [].slice.call(arguments, 3);
		return f.apply(this, args).then(ok).catch(err);
	}
}

// as above, but looks at the 'skip' and 'limit' parameters
// and passes those to the callback (after any bound parameters)
function pageHandler(f) {
	return function(req, res, next) {
		let url = parseUrl(req);
		let query = querystring.parse(url.query);
		let ok = (data) => data ? res.json(data) : res.error();
		let err = (e) => res.error(e.message);
		let args = [].slice.call(arguments, 3);

		let skip = +query.skip || 0;
		let limit = +query.limit || 0;
		if (limit < 0) { limit = 0; }
		args.push(skip, limit);

		return f.apply(this, args).then(ok).catch(err);
	}
}

// as 'handler' above, but takes any JSON that was passed
// in the request body and adds it as a parameter to those
// passed to the callback
function bodyHandler(f) {
	return function(req, res, next) {
		let args = [].slice.call(arguments, 3);
		args.push(req.body);
		let ok = (data) => data ? res.json(data) : res.error();
		let err = (e) => res.error(e.message);
		return f.apply(this, args).then(ok).catch(err);
	}
}

function csvHandler(f, x) {
	let csv = (data) => {
		if (typeof x === 'function') {
			data = x(data);
		}
		return data.map(cols => cols.join(',')).join('\r\n');
	}
	let send = (res, data, filename) => {
		res.headers({
			'Content-Type': 'text/csv',
			'Content-Disposition': `attachment; filename=${filename}.csv`
		});
		res.write(csv(data));
		res.end();
	}
	return function(req, res, next) {
		let ok = (data) => data ? send(res, data, arguments[3]) : res.error();
		let err = (e) => res.error(e.message);
		let args = [].slice.call(arguments, 3);
		return f.apply(this, args).then(ok).catch(err);
	}
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

function getSettings(settings) {
	return Promise.resolve(settings);
}

function getAgent(agents, field) {
	if (field in agents) {
		let copy = Object.assign({}, agents[field].configuration);
		copy.client = Object.assign({}, copy.client.configuration);
		return Promise.resolve(copy);
	}
}

function getAgents(agents) {
	let results = [];
	for (let agent in agents) {
		let config = agents[agent].configuration;
		let copy = {
			key: agent, name: config.name, type: config.type
		};
		results.push(copy);
	}
	return Promise.resolve(results);
}

module.exports = (settings, agents, db) => ({
	'/config': {
		'GET /':						handler(db.getConfigs),
		'GET /:id':						handler(db.getConfigById),
		'DELETE /:id':					handler(db.deleteConfigById),
		'PUT /:id':						bodyHandler(db.updateConfig),
		'POST /':						bodyHandler(db.insertConfig),
		'GET /:id/queue/enabled':		handler(db.getQueueEntryEnabled),
		'PUT /:id/queue/enabled/':		bodyHandler(db.setQueueEntryEnabled),
		'GET /:id/queue/repeat':		handler(db.getQueueEntryRepeat),
		'PUT /:id/queue/repeat/':		bodyHandler(db.setQueueEntryRepeat),
		'PUT /:id/queue/priority/':		bodyHandler(db.setQueueEntryPriority),
		'GET /run/:id/':				pageHandler(db.getRunsByConfigId),
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
		'PUT /paused/':					bodyHandler(db.setPaused)
	},
	'/log': {
		'GET /':						handler(db.getLog)
	},
	'/settings': {
		'GET /':						handler(getSettings.bind(this, settings))
	},
	'/agent': {
		'GET /':						handler(getAgents.bind(this, agents)),
		'GET /:name':					handler(getAgent.bind(this, agents))
	}
});
