var E = {

	data: {
		activeNote: {},
		pendingActions: []
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

	getPhpData: function(callback, action, params) {
		var authData = E._getAuthData();

		if (!authData) {
			E.data.pendingActions.push(arguments);
			return false;
		}

		$.post('/evernote/edam/php', $.extend({
			oauth_token : authData[0],
			edam_shard : authData[1],
			module : 'note',
			action: action
		}, params || {}), function(data) {
			data = $.parseJSON(data);

			if (typeof data.exception !== 'undefined') {
				console.log('exception: ' + data.exception);

				//TODO more options should cause reauth
				if (data.exception === 'authenticationToken') {//reauth
					E.data.pendingActions.push([callback, action, params]);
					E._getAuthData(true);//force reauth
				}

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

		if (!contents) contents = '<span style="cursor: default;">No notes found.</span>';

		$('#notes').html(contents);
	},

	getNoteContent: function(e, data) {
		if (!($('#noteContents_ifr').data('events') || {}).mouseleave) {//create event only once, should be created after tiny_mce does it's init
			$('#noteContents_ifr').mouseleave(E.updateNote);
		}

		if (e) {
			//check if we clicked on element with guid. Introduced to handle 'No notes found', but can be useful in future.
			if (!e.target.id.match(/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/)) return;

			E.data.activeNote.guid = e.target.id;
			return E.getPhpData(E.getNoteContent, 'getNoteContent', { guid: e.target.id });
		}

		var tags = '';
		$.each(data.tags, function(i, element) { tags += element + ', '; });

		$('#noteContents').html(data.content + '<p>noteTitle: ' + (data.title || $('#' + E.data.activeNote.guid).html()) + '</p><p>noteTags: '
			+ tags.slice(0, -2) + '</p>');

		E.data.activeNote.sha1 = hex_sha1($('#noteContents').html());//calculate contents hash for future updates
	},

	updateNote: function(e, data) {
		if (e) {
			if (!E.data.activeNote.guid) return;

			E.data.activeNote.sha1Pending = hex_sha1($('#noteContents').html());

			if (E.data.activeNote.sha1Pending === E.data.activeNote.sha1) {//no update needed
				return;
			}

			//TODO make dynamic creation of title insertion/detection
			var titleRegex = /noteTitle:(.*?)(?=<\/)/m, trim = /(^\s*(&nbsp;)*\s*)|(\s*(&nbsp;)*\s*$)/g,//remove whitespace and &nbsp;
				tagsRegex = /noteTags:(.*?)(?=<\/)/m,
				noteCleanup = /<p>(\s*|&nbsp;)<\/p>\s*$/gm,//and remove annoyind end <p></p>
				tags = $('#noteContents').html().match(tagsRegex)[1].replace(trim, '');

			return E.getPhpData(E.updateNote, 'updateNote',
				{ guid: E.data.activeNote.guid,
					content: $('#noteContents').html().replace(titleRegex, '').replace(tagsRegex, '').replace(noteCleanup, ''),
					title: $('#noteContents').html().match(titleRegex)[1].replace(trim, ''),
					//because spliting empty string results in [''] - array with one member. Also we can not send empty array from js.
					tags: tags ? tags.split(', ') : ''
				});
		}

		//update sha1 after successfull save, but not earler. Check needed because active note can be another one.
		if (data.guid === E.data.activeNote.guid) {
			E.data.activeNote.sha1 = E.data.activeNote.sha1Pending;
		}
		//if we created new note - save it's guid as active. Prevents creating a lot of new notes.
		//Check needed because we can start new note before old was saved.
		else if (E.data.activeNote.guid === 'createNote' && E.data.activeNote.sha1Pending === hex_sha1($('#noteContents').html())) {
			E.data.activeNote.sha1 = E.data.activeNote.sha1Pending;
			E.data.activeNote.guid = data.guid;
		}
	},

	createNote: function(e, data) {
		if (e) {
			E.data.activeNote.guid = 'createNote';//hack used in backend to create new note

			E.getNoteContent(null, { title: 'Title', content: '<p> </p>', tags: [] });
		}
	},

	_createAuthEvent: function() {
		if (!($(document).data('events') && $(document).data('events').evernoteAuthSuccess)) {
			$(document).bind('evernoteAuthSuccess', function() {
				//if we have pending actions - do them one by one
				if (E.data.pendingActions.length) {
					console.log('making pending actions');
					while (E.data.pendingActions.length) {
						E.getPhpData.apply(this, E.data.pendingActions.shift());
					}
				}
    		});
		}
	},

	_getAuthData: function(force) {
		if (force === true) {
			console.log('reauth needed');
		}
		else if (document.cookie.match(/oauth_token=([^;]+)/)) {
			return [unescape(document.cookie.match(/oauth_token=([^;]+)/)[1]), unescape(document.cookie.match(/edam_shard=([^;]+)/)[1])];
		}
		else {
			console.log('no auth data');
		}

		E._createAuthEvent();

		Auth.getRequestToken();//initiate auth process

		return false;
	}

};

var Auth = {

	getRequestToken: function() {
		if ($('#works iframe').length) {//check if we got already auth token
			console.log('auth already in process');
			return false;
		}

		$.get(E.oAuth.links.requestTokenURL, E.oAuth.data, function(data) {
			//cut oAuth token from response string
			E.oAuth.data.oauth_token = data.match(/oauth_token=([^&]+)/)[1];

			$('#works').append('<br />done token');

			Auth.makeUserAuth();
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
			//we do not need oauth token any more, delete it from data array to allow new auth processes
			//evernote detects oauth_token and getRequestToken will fail.
			delete E.oAuth.data.oauth_token;
			//cut new oAuth token and shard id from response string & save cookie for future use
			document.cookie = 'oauth_token=' + escape(data.match(/oauth_token=([^&]+)/)[1]);
			document.cookie = 'edam_shard=' + escape(data.match(/edam_shard=([^&]+)/)[1]);

			$('#works').append('<br />done access token');

			$(document).trigger('evernoteAuthSuccess');
		});
	}

};