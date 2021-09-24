'use strict';

let Agents = require('./_base');

class StartTimeAgent extends Agents.Executor {

	constructor(settings, config) {

		super('starttime');

		// compute time difference between start time
		// and time when sentinel log line was detected
		this.run = async (config, run) => {
			return {count: (run.logMatched - run.started) / 1000};  // ms -> s
		};
	}
}

StartTimeAgent.configuration = {
	name: 'starttime',
	protocol: 'dns'
};

module.exports = StartTimeAgent;
