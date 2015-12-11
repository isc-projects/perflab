(function () {
	angular.module('isc.modules', [])
		.factory('linkHeaderParser', linkHeaderParser)
		.factory('Notify', Notify);

	function linkHeaderParser() {
		return {
			parse: function(header) {
				if (header.length === 0) {
					return {};
				}

				// Split parts by comma
				var parts = header.split(',');

				// Parse each part into a named link
				var links = {};
				for (var i = 0, n = parts.length; i < n; ++i) {
					var section = parts[i].split(';');
					if (section.length !== 2) {
						throw new Error("section could not be split on ';'");
					}
					var url = section[0].replace(/<(.*)>/, '$1').trim();
					var name = section[1].replace(/rel="(.*)"/, '$1').trim();
					links[name] = url;
				}
				return links;
			}
		}
	}

	function Notify() {
		$.notifyDefaults({
		placement: { from: 'bottom', align: 'right' },
			newest_on_top: true,
			allow_dismiss: false,
			animate: {
				enter: 'animated fadeInUp',
				exit: 'animated fadeOutRight'
			},
		});

		function notify(message, level) {
			if (message instanceof Error) {
				message = message.message;
			} else if (typeof message === 'object' && message.data) {
				message = message.data;
			} else if (typeof message === 'object' && message.status) {
				if (message.status === -1 && message.statusText === '') {
					message = 'could not connect to server';
				}
			}
			$.notify({message}, {type: level});
		}
	
		return {
			danger: function(e)	{ notify(e, 'danger'); },
			info: function(e)	{ notify(e, 'info'); }
		}
	}

})();
