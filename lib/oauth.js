var E = {

	data: {},

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
		$.getJSON('/evernote/edam/php', $.extend({
			oauth_token : unescape(document.cookie.match(/oauth_token=([^;]+)/)[1]),
			edam_shard : unescape(document.cookie.match(/edam_shard=([^;]+)/)[1]),
			module : 'note',
			action: action
		}, params || {}), function(data) {
			if (data.exception) {
				console.log('exception: ' + data.exception);
				return null;
			}

			callback(null, data);

			console.log(data);
		});
	},

	listNotebooks: function(e, data) {
		if (e) {
			return E.getPhpData(E.listNotebooks, 'listNotebooks');
		}

		var contents = '';
		$.each(data, function(i, element) {
			contents += '<span id="' + element.guid + '">' + (element.defaultNotebook ? '* ' : '' ) + element.name + '</span>';
		});

		$('#notebooks').html(contents);
	},

	findNotes: function(e, data) {
		if (e) {
			var filter = { filter: {} };
			if ($(e.target.parentNode).is('#notebooks')) {
				filter.filter.notebookGuid = e.target.id;
				return E.getPhpData(E.findNotes, 'findNotes', filter);
			}
		}

		var contents = '';
		$.each(data.notes, function(i, element) {
			contents += '<span id="' + element.guid + '">' + element.title + '</span>';
		});

		$('#notes').html(contents);
	},

	getNoteContent: function(e, data) {
		if (e) {
			return E.getPhpData(E.getNoteContent, 'getNoteContent', { guid: e.target.id });
		}

		//TODO do not make new iframe every time
		$('#noteContents').html('<iframe width="800" height="200"></iframe>');

		var doc = $('#noteContents iframe')[0].contentDocument || $('#noteContents iframe')[0].contentWindow.document;

		doc.open();
		doc.write(data);
		doc.close();
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

				document.cookie = 'oauth_token=' + escape(E.oAuth.data.oauth_token);
				document.cookie = 'edam_shard=' + escape(E.data.edamShard);


				$('#works').append('<br />done access token');
		});
	}


}