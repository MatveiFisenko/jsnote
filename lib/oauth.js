var E = {

	data: {
		activeNote: ''
	},

	oAuth: {
		data: {
			oauth_consumer_key   : "mot",
			oauth_signature: "c1af8ab2efa6b6e6",
			oauth_signature_method: "plaintext"
		},

		links: {
			requestTokenURL : "/evernote/oauth",
			userAuthorizationURL : "https://sandbox.evernote.com/OAuth.action",
			accessTokenURL : "/evernote/oauth",
			oAuthCallback: 'http://jsnote.ru:8080/userAuthSuccess.html'
		}
	},

	getPhpData : function(callback, action, params) {
		$.post('/evernote/edam/php', $.extend({
			oauth_token : unescape(document.cookie.match(/oauth_token=([^;]+)/)[1]),
			edam_shard : unescape(document.cookie.match(/edam_shard=([^;]+)/)[1]),
			module : 'note',
			action: action
		}, params || {}), function(data) {
			data = $.parseJSON(data);

			if (typeof data.exception !== 'undefined') {
				console.log('exception: ' + data.exception);
				return null;
			}

			callback(null, data);

			console.log(data);
		});
	},

	listTags: function(e, data) {
		if (e) {
			return E.getPhpData(E.listTags, 'listTags');
		}

		var contents = '';
		$.each(data, function(i, element) {
			//TODO handle parentness
			contents += '<span id="' + element.guid + '">' + (element.parentGuid ? '' : '* ') + element.name + '</span><br />';
		});

		$('#tags').html(contents);
	},

	listNotebooks: function(e, data) {
		if (e) {
			return E.getPhpData(E.listNotebooks, 'listNotebooks');
		}

		var contents = '';
		$.each(data, function(i, element) {
			contents += '<span id="' + element.guid + '">' + (element.defaultNotebook ? '* ' : '' ) + element.name + '</span><br />';
		});

		$('#notebooks').html(contents);
	},

	findNotes: function(e, data) {
		if (e) {
			if (!($('#noteContents_ifr').data('events') || {} ).mouseleave) {
				//TODO possible check md5 hash of contents before update
				$('#noteContents_ifr').mouseleave(E.updateNote);
			}

			var filter = { filter: {} }, parent = $(e.target.parentNode);

			if (parent.is('#notebooks')) {
				filter.filter.notebookGuid = e.target.id;
			}
			else if (parent.is('#tags')) {
				filter.filter.tagGuids = [e.target.id];
			}
			else if ($(e.target).is('#searchNotes') && e.which == 13) {
				filter.filter.words = e.target.value;
			}
			else {
				return;
			}

			return E.getPhpData(E.findNotes, 'findNotes', filter);
		}

		var contents = '';
		$.each(data.notes, function(i, element) {
			contents += '<span id="' + element.guid + '">' + element.title + '</span><br />';
		});

		$('#notes').html(contents);
	},

	getNoteContent: function(e, data) {
		if (e) {
			E.data.activeNote = e.target.id;
			return E.getPhpData(E.getNoteContent, 'getNoteContent', { guid: e.target.id });
		}

		$('#noteContents').html(data + '<p>noteTitle: ' + $('#' + E.data.activeNote).html() + '</p>');
	},

	updateNote: function(e, data) {
		if (e) {
			if (!E.data.activeNote) return;

			//TODO make dynamic creation of title insertion/detection
			var titleRegex = /noteTitle:(.*?)(?=<\/)/m, titleCleanup = /(^\s*(&nbsp;)*\s*)|(\s*(&nbsp;)*\s*$)/g,//trim
			noteCleanup = /<p>(\s*|&nbsp;)<\/p>\s*$/gm;//and remove annoyind end <p></p>

			return E.getPhpData(E.updateNote, 'updateNote',
				{ guid: E.data.activeNote, content: $('#noteContents').html().replace(titleRegex, '').replace(noteCleanup, ''),
					title: $('#noteContents').html().match(titleRegex)[1].replace(titleCleanup, '') });
		}
	},

	createNote: function(e, data) {
		if (e) {
			E.data.activeNote = 'createNote';
			$('#noteContents').html('<p> </p><p>noteTitle: Заголовок</p>');
		}
	}

};

var Auth = {

	getRequestToken: function() {
		$.get(E.oAuth.links.requestTokenURL, E.oAuth.data, function(data){
			//cut oAuth token from response string
			E.oAuth.data.oauth_token = data.match(/oauth_token=([^&]+)/)[1];

			$('#works').append('<br />done token');
		});
	},

	makeUserAuth: function() {
		$('#works').append('<iframe src="' + E.oAuth.links.userAuthorizationURL + '?'
			+ $.param({ format: 'microclip', oauth_token: E.oAuth.data.oauth_token, oauth_callback: E.oAuth.links.oAuthCallback })
			+ '" width="400" height="210" frameborder="1" scrolling="no" align="left"></iframe>');
	},

	userAuthSuccess: function() {
		$('#works').append('<br />done auth').children('iframe').remove();

		$.get(E.oAuth.links.accessTokenURL, E.oAuth.data, function(data) {
			//cut new oAuth token and shard id from response string
			E.oAuth.data.oauth_token = data.match(/oauth_token=([^&]+)/)[1];
			E.data.edamShard = data.match(/edam_shard=([^&]+)/)[1];
			//save cookie for future use
			document.cookie = 'oauth_token=' + escape(E.oAuth.data.oauth_token);
			document.cookie = 'edam_shard=' + escape(E.data.edamShard);

			$('#works').append('<br />done access token');
		});
	}

}