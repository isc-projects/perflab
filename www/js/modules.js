(function () {

	"use strict";

	angular.module('isc.modules', [])
		.factory('Notify', Notify)
		.factory('Beeper', ['$rootScope', Beeper]);

	//
	// popups an on-screen notification, that can either be a string
	// or an error message automatically extracte from an Error object
	// or $http response.
	//
	// with the latter, it's particularly well-suited for catching errors
	// from Promises, e.g.:
	//
	//   $http.get(...).catch(Notify.danger)
	//
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

		function notify(message, opts) {

			if (message instanceof Error) {
				console.trace(message);
				message = message.message;
			} else if (typeof message === 'object' && message.data) {
				message = message.data;
			} else if (typeof message === 'object' && message.status) {
				if (message.status === -1 && message.statusText === '') {
					message = 'could not connect to server';
				}
			}

			$.notify(message, opts);
		}

		return {
			notify: notify,
			danger: function(e, opts) {
				var o = $.extend({}, opts, {type: 'danger'});
				notify(e, o);
			},
			info: function(e, opts)	{
				var o = $.extend({}, opts, {type: 'info'});
				notify(e, o);
			}
		}
	}

	function Beeper($rootScope) {
		var audio;
		var muteState;

		if (window.Audio) {
			audio = new Audio('/sounds/Robot_blip-Marianne_Gagnon-120342607.mp3');
			audio.addEventListener('volumechange', function() {
				localStorage.muted = muteState = audio.muted;
				$rootScope.$applyAsync();
			});
			try {
				if ('muted' in localStorage) {
					audio.muted = JSON.parse(localStorage.muted);
				} else {
					audio.muted = true;
				}
			} catch (e) {
				audio.muted = false;
			}
		}

		function play() {
			if (audio) {
				try {
					audio.play();
				} catch (e) {
					console.trace(e);
				}
			}
		}

		function muted() {
			return muteState;
		}

		function toggleMute() {
			if (audio) {
				audio.muted = !audio.muted;
				localStorage.muted = audio.muted;
			}
		}

		return {
			play: play,
			muted: muted,
			toggleMute: toggleMute
		}
	}
})();
