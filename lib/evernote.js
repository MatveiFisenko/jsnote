var E = {

	data: {
		activeNote: {},
		pendingActions: [],
		activeActions: 0
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
		},

		inProgress: false
	},

	getPhpData: function(callback, action, params) {
		var authData = E._getAuthData();

		if (!authData) {
			E.data.pendingActions.push(arguments);
			return false;
		}

		$.post('/evernote/edam/php', $.extend({
			oauth_token : authData.token,
			edam_shard : authData.shard,
			module : 'note',
			action: action
		}, params || {}), function(data) {
			E._inProgress(false);

			data = $.parseJSON(data);

			if (typeof data.exception !== 'undefined') {
//				console.log('exception: ' + data.exception);
				$.notify.show('exception: ' + data.exception, true, null, true);

				if (data.exception === 'authenticationToken') {//reauth
					E.data.pendingActions.push([callback, action, params]);
					E._getAuthData(true);//force reauth
				}

				return null;
			}

			callback(null, data);

//			console.log(data);
			$.notify.show(action + ': completed');
		});

		E._inProgress(true);
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
			contents += (element.defaultNotebook ? '* ' : '' ) + '<span id="' + element.guid + '">' + element.name + '</span><br />';
		});

		$('#notebooks').html(contents);
	},

	findNotes: function(e, data) {
		if (e) {
			var filter = { filter: {} }, parent = $(e.target.parentNode);

			if (parent.is('#notebooks')) {
				filter.filter.notebookGuid = e.target.id;
				$('#searchNotes').val('notebook:"' + $(e.target).html() + '"');
			}
			else if (parent.is('#tags')) {
				filter.filter.tagGuids = [e.target.id];
				$('#searchNotes').val('tag:"' + $(e.target).html() + '"');
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
			//check if we clicked on element with guid. Introduced to handle 'No notes found'.
			//now we use it to handle events from history tab
			var noteId = e.target.id.match(/^h?(\w{8}-\w{4}-\w{4}-\w{4}-\w{12})$/);
			//if no note id is provided OR active note is already opened - do nothing
			if (!noteId || (E.data.activeNote.guid === noteId[1])) return;

			E.data.activeNote.guid = noteId[1];

			//if we clicked on note which present on history tab - get it's content
			if ($('#h' + E.data.activeNote.guid).length) {
				$('#noteContents').html($.jStorage.get('E.note.' + E.data.activeNote.guid));

				E.data.activeNote.sha1 = hex_sha1($('#noteContents').html());//calculate contents hash for future updates

				E._historyTabs(E.data.activeNote.guid);

				$.notify.show('Loaded from cache');

				return true;
			}

			return E.getPhpData(E.getNoteContent, 'getNoteContent', { guid: E.data.activeNote.guid });
		}

		if (data.guid !== E.data.activeNote.guid) {//if note contents belong to other note
			E._historyTabs(data.guid, $('#' + data.guid).html(), true);//be sure that this note is on history tab
			return;
		}

		var tags = '', title = data.title || $('#' + E.data.activeNote.guid).html() || $('#h' + E.data.activeNote.guid).html();
		$.each(data.tags, function(i, element) { tags += element + ', '; });

		//create <a href> tags from urls in text
		$('#noteContents').html(data.content.replace(/(<p>|\s)(https?:\/\/\S+?)(<\/p>|\s)/gm, '$1<a href="$2">$2</a>$3')
				+ '<p>noteTitle: ' + title + '</p><p>noteTags: ' + tags.slice(0, -2) + '</p>');

		var contents = $('#noteContents').html();

		E.data.activeNote.sha1 = hex_sha1(contents);//calculate contents hash for future updates

		//save note contents in browser storage
		$.jStorage.set('E.note.' + E.data.activeNote.guid, contents);

		E._historyTabs(E.data.activeNote.guid, title);
	},

	updateNote: function(e, data) {
		if (e) {
			if (!E.data.activeNote.guid) return;

			var contents = $('#noteContents').html();

			E.data.activeNote.sha1Pending = hex_sha1(contents);

			if (E.data.activeNote.sha1Pending === E.data.activeNote.sha1) {//no update needed
				return;
			}

			//save note contents in browser storage
			$.jStorage.set('E.note.' + E.data.activeNote.guid, contents);

			//TODO make dynamic creation of title insertion/detection
			var titleRegex = /<p>noteTitle:(.*?)<\/p>/m, trim = /(^\s*(&nbsp;)*\s*)|(\s*(&nbsp;)*\s*$)/g,//remove whitespace and &nbsp;
				tagsRegex = /<p>noteTags:(.*?)<\/p>/m,
				tags = contents.match(tagsRegex)[1].replace(trim, '');

			return E.getPhpData(E.updateNote, 'updateNote',
				{ guid: E.data.activeNote.guid,
					content: contents.replace(titleRegex, '').replace(tagsRegex, ''),
					title: contents.match(titleRegex)[1].replace(trim, ''),
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
			$('#hcreateNote').attr('id', 'h' + data.guid);//set new id
		}
		//if we save new note and then fast create new one - previous new note will not be on history tab
		//if ok - set new title on history tab
		if (!$('#h' + data.guid).html(data.title).length) {
			E._historyTabs(data.guid, data.title, true);
		}

		E._updateTags(data.tagGuids);
		E._updateSearch();
	},

	createNote: function(e, data) {
		if (e) {
			E.data.activeNote.guid = 'createNote';//hack used in backend to create new note

			E.getNoteContent(null, { guid: E.data.activeNote.guid, title: 'Title', content: '<p> </p>', tags: [] });
		}
	},

	_historyTabs: function(guid, title, secondary) {
		//get history ul
		var oHistory = $('ul.noteHistoryTabs');

		if (!oHistory.length) {
			oHistory = $('<ul class="tabs noteHistoryTabs"></ul>').insertBefore('#noteContents')
				.click(function(e) {
					if ($(e.target).is('a')) {
						e.target.id === 'hcreateNote' ? E.createNote(e) : E.getNoteContent(e);
					}
				});
		}

		if (!secondary) {
			oHistory.find('a.current').removeClass('current');//remove active class from previous active
		}

		if ($('#h' + guid).length) {//check if we clicked opened note from history tab OR opening note that was previously opened
			$('#h' + guid).addClass('current');
		}
		else {
    		if (oHistory.children().length > 6) {//no more than 7 tabs
    			oHistory.children(':first').remove();
    		}

    		if (secondary) {
    			oHistory.children(':last').before('<li><a id="h' + guid + '">' + title + '</a></li>');
    		}
    		else {
    			oHistory.append('<li><a id="h' + guid + '" class="current">' + title + '</a></li>');
    		}
		}
	},

	_updateTags: function(tags) {
		//check if we have all tags mentioned in note, if not - reload tags
		if (tags && $('#' + tags.join(', #')).length !== tags.length) {
			E.listTags({ type: 'click' });
		}
	},

	_updateSearch: function() {
		//run update if we have search string
		if ($('#searchNotes').val()) {
			$('#searchNotes').trigger({ type: 'keydown', which: 13 });
		}
	},

	_inProgress: function(show) {
		E.data.activeActions += +show || -1;//boolean show converts to 1 or 0.
		$('div.inProgress > img').toggle(!!E.data.activeActions);//hide only when we have zero active actions
	},

	_createAuthEvent: function() {
		if (!($(document).data('events') && $(document).data('events').evernoteAuthSuccess)) {
			$(document).bind('evernoteAuthSuccess', function() {
				//if we have pending actions - do them one by one
				if (E.data.pendingActions.length) {
					$.notify.show('Running pending actions');
					while (E.data.pendingActions.length) {
						E.getPhpData.apply(this, E.data.pendingActions.shift());
					}
				}
    		});
		}
	},

	_getAuthData: function(force) {
		if (force === true) {
			$.notify.show('Reauth needed');
		}
		else if ($.jStorage.get('E.authData')) {
			return $.jStorage.get('E.authData');
		}
		else {
			$.notify.show('No auth data');
		}

		E._createAuthEvent();

		Auth.getRequestToken();//initiate auth process

		return false;
	}

};

var Auth = {

	getRequestToken: function() {
		if (E.oAuth.inProgress) {//check if we already started
			return false;
		}

		//TODO possible make setTimeout to handle situations when we get no answer
		E.oAuth.inProgress = true;

		$.get(E.oAuth.links.requestTokenURL, E.oAuth.data, function(data) {
			//cut oAuth token from response string
			E.oAuth.data.oauth_token = data.match(/oauth_token=([^&]+)/)[1];

			$.notify.show('Auth token: completed');

			Auth.makeUserAuth();
		});
	},

	makeUserAuth: function() {
		$('body').prepend('<iframe src="' + E.oAuth.links.userAuthorizationURL + '?'
			+ $.param({ format: 'microclip', oauth_token: E.oAuth.data.oauth_token, oauth_callback: E.oAuth.links.oAuthCallback })
			+ '" class="auth"></iframe>');

		$.notify.show('Auth permission dialog: completed');
	},

	userAuthSuccess: function() {
		$.notify.show('Auth ask permission: completed');

		$('body > iframe.auth').remove();

		$.get(E.oAuth.links.accessTokenURL, E.oAuth.data, function(data) {
			//we do not need oauth token any more, delete it from data array to allow new auth processes
			//evernote detects oauth_token and getRequestToken will fail.
			delete E.oAuth.data.oauth_token;
			//cut new oAuth token and shard id from response string & save it for future use
			$.jStorage.set('E.authData', {token: data.match(/oauth_token=([^&]+)/)[1], shard: data.match(/edam_shard=([^&]+)/)[1] });

			$.notify.show('Auth access token: completed');

			E.oAuth.inProgress = false;//auth completed

			$(document).trigger('evernoteAuthSuccess');
		});
	}

};