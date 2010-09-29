var Evernote = {
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
	}
};

var Auth = {
		
	getRequestToken: function() {
		$.get(evernote.oAuth.links.requestTokenURL, evernote.oAuth.data, function(data){
			//cut oAuth token from response string
			evernote.oAuth.data.oauth_token = data.match(/oauth_token=([^&]+)/)[1];
			
			$('#works').append('<br />done token');
		});
	},
	
	makeUserAuth: function() {
		$('#works').append('<iframe src="' + evernote.oAuth.links.userAuthorizationURL + '?'
			+ $.param({ format: 'microclip', oauth_token: evernote.oAuth.data.oauth_token, oauth_callback: evernote.oAuth.links.oAuthCallback })
			+ '" width="400" height="210" frameborder="1" scrolling="no" align="left"></iframe>');
	},
	
	userAuthSuccess: function() {
		$('#works').append('<br />done auth').children('iframe').remove();
		
		$.get(evernote.oAuth.links.accessTokenURL, evernote.oAuth.data, function(data) {
				//cut new oAuth token and shard id from response string 
				evernote.oAuth.data.oauth_token = data.match(/oauth_token=([^&]+)/)[1];
				evernote.data.edamShard = data.match(/edam_shard=([^&]+)/)[1];
				
				$('#works').append('<br />done access token');
		});
	}
}