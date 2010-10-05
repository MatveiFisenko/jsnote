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

		var _data = {}, tags = {}, level = 0, contents = '';

		//convert numeric key array into assoc. array
		$.each(data, function(i, element) {
			_data[element.guid] = element;
		});
		data = _data;

		//make tag tree (it's in tags var) and populate contents.
		function makeTagsTree(guid, element) {
			var parent;

			if (element.parentGuid) {
				parent = makeTagsTree(element.parentGuid, data[element.parentGuid]);
				level++;
			}
			else {
				parent = tags;
				level = 0;
			}

			if (!parent[guid]) {
				parent[guid] = {};//if no elements with tag's key - create new empty object

				while (level-- > 0) contents += '*'; //level decreases only if expression is true

				contents += '<span id="' + element.guid + '">' + element.name + '</span><br />';
			}

			parent[guid].name = element.name;//set tag's name

			return parent[guid];//return tag object
		}

		$.each(data, makeTagsTree);

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

		var tags = '';
		$.each(data.tags, function(i, element) { tags += element + ', '; });

		$('#noteContents').html(data.content + '<p>noteTitle: ' + $('#' + E.data.activeNote).html() + '</p><p>noteTags: '
			+ tags.slice(0, -2) + '</p>');
	},

	updateNote: function(e, data) {
		if (e) {
			if (!E.data.activeNote) return;

			//TODO make dynamic creation of title insertion/detection
			var titleRegex = /noteTitle:(.*?)(?=<\/)/m, trim = /(^\s*(&nbsp;)*\s*)|(\s*(&nbsp;)*\s*$)/g,//remove whitespace and &nbsp;
				tagsRegex = /noteTags:(.*?)(?=<\/)/m,
				noteCleanup = /<p>(\s*|&nbsp;)<\/p>\s*$/gm,//and remove annoyind end <p></p>
				tags = $('#noteContents').html().match(tagsRegex)[1].replace(trim, '');

			return E.getPhpData(E.updateNote, 'updateNote',
				{ guid: E.data.activeNote,
					content: $('#noteContents').html().replace(titleRegex, '').replace(tagsRegex, '').replace(noteCleanup, ''),
					title: $('#noteContents').html().match(titleRegex)[1].replace(trim, ''),
					//because spliting empty string results in [''] - array with one member. Also we can not send empty array from js.
					tags: tags ? tags.split(', ') : ''
				});
		}
	},

	createNote: function(e, data) {
		if (e) {
			E.data.activeNote = 'createNote';
			$('#noteContents').html('<p> </p><p>noteTitle: Заголовок</p><p>noteTags: </p>');
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