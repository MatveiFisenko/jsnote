/*
 * jsnote - Evernote javascript frontend.
 *
 * Copyright (c) 2010 mot <2matvei@gmail.com>
 *
 * Licensed under the AGPLv3 license:
 *   http://www.opensource.org/licenses/agpl-v3.html
 *
 * Project home:
 *   http://www.matvei.ru
 */

var E = {

	data: {
		notes: {},
		pendingActions: [],
		activeActions: 0,
		uniqueID: 0
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
			oAuthCallback: 'http://jsnote.ru/userAuthSuccess.html'
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

		var _data = {}, tags = {}, level = 0, content = '';

		//convert numeric key array into assoc. array
		$.each(data, function(i, element) {
			_data[element.guid] = element;
		});
		data = _data;

		//make tag tree (it's in tags var) and populate content.
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

				while (level-- > 0) content += '*'; //level decreases only if expression is true

				content += '<span id="' + element.guid + '">' + element.name + '</span><br />';
			}

			parent[guid].name = element.name;//set tag's name

			return parent[guid];//return tag object
		}

		$.each(data, makeTagsTree);

		$('#tags').html(content);
	},

	listNotebooks: function(e, data) {
		if (e) {
			return E.getPhpData(E.listNotebooks, 'listNotebooks');
		}

		var content = '';
		$.each(data, function(i, element) {
			content += (element.defaultNotebook ? '* ' : '' ) + '<span id="' + element.guid + '">' + element.name + '</span><br />';
		});

		$('#notebooks').html(content);
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

		var content = '';
		$.each(data.notes, function(i, element) {
			content += '<span id="' + element.guid + '">' + element.title + '</span><br />';

			//save note data for future use - opening note for example
			if (!E.data.notes[element.guid]) {
				E.data.notes[element.guid] = { title: element.title, tagGuids: element.tagGuids };
			}
			else {
				E.data.notes[element.guid].title = element.title;
				E.data.notes[element.guid].tagGuids = element.tagGuids;
			}
		});

		if (!content) content = '<span style="cursor: default;">No notes found.</span>';

		$('#notes').html(content);
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
			if (!noteId || (E.data.notes.active === noteId[1])) return;

			E.data.notes.pending = noteId[1];
			//new note
			if (!E.data.notes[E.data.notes.pending]) {
				E.data.notes[E.data.notes.pending] = {};
			}

			//if we clicked on note which present on history tab - get it's content
			if ($('#h' + E.data.notes.pending).length) {
				E._setPendingNoteContent($.jStorage.get('E.note.' + E.data.notes.pending));

				$.notify.show('Loaded from cache');

				return true;
			}

			return E.getPhpData(E.getNoteContent, 'getNoteContent', { guid: E.data.notes.pending });
		}

		//note content arrived
		var tags = '', title = E.data.notes[data.guid].title;
		$.each(E.data.notes[data.guid].tagGuids, function(i, element) { tags += $('#' + element).html() + ', '; });

		//convert resources to images
		data.content = data.content.replace(/<en-media.*?hash="(\w+)".*?\/>/gm, function (str, p1) {
			if (str.match(/type="(\w+)/)[1] === 'image') {
				return '<img src="' + E._getResourceByHashURL(data.guid, p1) + '" id="' + p1 + '" class="noteImageType'
					+ str.match(/type="\w+\/(\w+)/)[1] + '" width="' + str.match(/width="(\w+)/)[1] + '" height="'
					+ str.match(/height="(\w+)/)[1] + '" />';
			}
			else {
				$.notify.show('AUDIO/PDF is NOT supported, do not edit this note or you will lose your data', true, null, true);
				return 'AUDIO/PDF is NOT supported, do not edit this note or you will lose your data.';
			}
			})
			//create <a href> tags from urls in text
			.replace(/(<p>|\s)(https?:\/\/\S+?)(<\/p>|\s)/gm, '$1<a href="$2">$2</a>$3')
			//add title & tags
			+ '<p>noteTitle: ' + title + '</p><p>noteTags: ' + tags.slice(0, -2) + '</p>';

		if (data.guid === E.data.notes.pending) {//check if no other note was asked before this content arrived
			var content = E._setPendingNoteContent(data.content, title);
		}
		else {
			var content = data.content;
			E._historyTabs(data.guid, title, true);//be sure that this note is on history tab
		}

		//save note content in browser storage
		$.jStorage.set('E.note.' + data.guid, content);
	},

	updateNote: function(e, data) {
		if (e) {
			if (!E.data.notes.active) return;

			//if we have new note and initial save is in progress try not to send new request
			if (E.data.notes.active.substr(0, 8) === 'createNo'
				&& (E.data.notes[E.data.notes.active].md5Pending !== E.data.notes[E.data.notes.active].md5)
				&& E.data.notes[E.data.notes.active].counter++ < 2) {
				$.notify.show('New note: save is in progress');
				return;
			}

			var content = $('#noteContents').html();

			//this md5 is what we see in UI
			E.data.notes[E.data.notes.active].md5Pending = hex_md5(content);

			if (E.data.notes[E.data.notes.active].md5Pending === E.data.notes[E.data.notes.active].md5) {//no update needed
				return;
			}

			//save note content in browser storage
			$.jStorage.set('E.note.' + E.data.notes.active, content);

			//convert images back to resources
			content = content.replace(/<img.*?id="(\w+)".*?\/>/gm, function (str, p1) {
				return '<en-media width="' + str.match(/width="(\w+)/)[1] + '" height="' + str.match(/height="(\w+)/)[1]
					+ '" hash="' + p1 + '" type="image/' + str.match(/noteImageType(\w+)/)[1] + '" />';
			});

			//TODO make dynamic creation of title insertion/detection
			var titleRegex = /<p>noteTitle:(.*?)<\/p>/m, trim = /(^\s*(&nbsp;)*\s*)|(\s*(&nbsp;)*\s*$)/g,//remove whitespace and &nbsp;
				tagsRegex = /<p>noteTags:(.*?)<\/p>/m,
				title = content.match(titleRegex)[1].replace(trim, ''),
				tags = content.match(tagsRegex)[1].replace(trim, '');

			//clean content from title & tags & add DTD
			content = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml.dtd"><en-note>'
				+ content.replace(titleRegex, '').replace(tagsRegex, '') + '</en-note>';

			//this md5 is what we send to server
			//we need to know last pending md5 to ensure that it is fully updated
			E.data.notes[E.data.notes.active].contentHash = hex_md5(content);

			return E.getPhpData(E.updateNote, 'updateNote',
				{ guid: E.data.notes.active,
					content: content,
					title: title,
					//because spliting empty string results in [''] - array with one member. Also we can not send empty array from js.
					tags: tags ? tags.split(', ') : ''
				});
		}

		//handle adding new notes
		if (data.oldGuid) {
			if (E.data.notes.active === data.oldGuid) {
				E.data.notes.active = data.guid;
			}

			E.data.notes[data.guid] = E.data.notes[data.oldGuid];
			delete E.data.notes[data.oldGuid];
			$('#h' + data.oldGuid).attr('id', 'h' + data.guid);//set new id

			$.jStorage.set('E.note.' + data.guid, $.jStorage.get('E.note.' + data.oldGuid));//update cache key
			$.jStorage.deleteKey('E.note.' + data.oldGuid);

			$.notify.show('Note added: ' + data.title);
		}

		//ensure that note is fully updated
		if (E.data.notes[data.guid].contentHash === data.contentHash) {
			E.data.notes[data.guid].md5 = E.data.notes[data.guid].md5Pending;
			$.notify.show('Note fully updated: ' + data.title);
		}

		//update note title
		$('#h' + data.guid).html(data.title);

		E._updateTags(data.tagGuids);
		E._updateSearch();
	},

	createNote: function(e, data) {
		if (e) {
			E.data.notes.pending = 'createNo-te00-0000-0000-' + E.data.uniqueID++;//hack used in backend to create new note

			while (E.data.notes.pending.length < 36) {
				E.data.notes.pending += '0';
			}

			E.data.notes[E.data.notes.pending] = { title: 'Title', tagGuids: [], counter: 0 };

			E.getNoteContent(null, { guid: E.data.notes.pending, content: '<p> </p>' });
		}
	},

	_getResourceByHashURL: function(guid, hash) {
		var authData = E._getAuthData();

		if (!authData) return;

		return '/evernote/edam/php?' + $.param({
			oauth_token : authData.token,
			edam_shard : authData.shard,
			module : 'note',
			action: 'getResourceByHash',
			guid: guid,
			hash: hash
		});
	},

	_setPendingNoteContent: function(content, title) {
		$('#noteContents').html(content);
		//TODO possible we do not need this content 'set/get' before md5 check
		content = $('#noteContents').html();

		E.data.notes[E.data.notes.pending].md5Pending = E.data.notes[E.data.notes.pending].md5 = hex_md5(content);//calculate content hash for future updates

		E._historyTabs(E.data.notes.pending, title);

		//it is active now
		E.data.notes.active = E.data.notes.pending;

		E.data.notes.pending = null;

		return content;
	},

	_historyTabs: function(guid, title, secondary) {
		//get history ul
		var oHistory = $('ul.noteHistoryTabs');

		if (!oHistory.length) {
			oHistory = $('<ul class="tabs noteHistoryTabs"></ul>').insertBefore('#noteContents')
				.click(function(e) {
					if ($(e.target).is('a')) {
						E.getNoteContent(e);
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

   			oHistory.append('<li><a id="h' + guid + '" class="'+ (secondary ? '' : 'current') + '">' + title + '</a></li>');
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