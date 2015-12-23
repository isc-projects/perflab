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
			notify: notify,
			danger: function(e)	{ notify(e, 'danger'); },
			info: function(e)	{ notify(e, 'info'); }
		}
	}

	function Beeper($rootScope) {
		var audio;
		var muteState;

		if (window.Audio) {
			audio = new Audio('/sounds/Robot_blip-Marianne_Gagnon-120342607.mp3');
			audio.addEventListener('volumechange', function() {
				muteState = audio.muted;
				$rootScope.$apply();
			});
			try {
				audio.muted = JSON.parse(localStorage.muted);
			} catch (e) {
				audio.muted = false;
			}
		}

		function play() {
			if (audio) {
				audio.play();
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
