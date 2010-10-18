<?php

require_once("autoload.php");

require_once("Thrift.php");
require_once("transport/TTransport.php");
require_once("transport/THttpClient.php");
require_once("protocol/TProtocol.php");
require_once("protocol/TBinaryProtocol.php");

require_once("packages/Errors/Errors_types.php");
require_once("packages/Types/Types_types.php");
require_once("packages/NoteStore/NoteStore.php");

$evernoteHost = "sandbox.evernote.com";
$evernotePort = "80";
$evernoteScheme = "http";

$inputData = $_POST ? $_POST : $_GET;

$authToken = $inputData['oauth_token'];
$edamShard = $inputData['edam_shard'];
$module = $inputData['module'];
$action = $inputData['action'];

try {
	$noteStoreHttpClient =
	new THttpClient($evernoteHost, $evernotePort,
		  "/edam/$module/$edamShard", $evernoteScheme);
	$noteStoreProtocol = new TBinaryProtocol($noteStoreHttpClient);
	$noteStore = new NoteStoreClient($noteStoreProtocol, $noteStoreProtocol);

	if ($action === 'findNotes') {
		$filterData = $_POST['filter'];
		$filter = new edam_notestore_NoteFilter($filterData);

		$data = $noteStore->{$action}($authToken, $filter, 0, 100);
	}
	else if ($action === 'getNoteContent') {
		$data['content'] = $noteStore->{$action}($authToken, $_POST['guid']);
		$data['guid'] = $_POST['guid'];//tell javascript which note contents arrived
	}
	else if ($action === 'updateNote') {
		$note = new edam_type_Note();

		if (substr($_POST['guid'], 0, 8) === 'createNo') {
			$action = 'createNote';
		}
		else {
			$note->guid = $_POST['guid'];
		}

		$note->title = $_POST['title'];
		$note->tagNames = $_POST['tags'] ? $_POST['tags'] : array();//because we can not send empty array from js
		$note->content = $_POST['content'];

		$data = $noteStore->{$action}($authToken, $note);

		$data->contentHash = bin2hex($data->contentHash);

		if ($action === 'createNote') {
			$data->oldGuid = $_POST['guid'];
		}
	}
	else if ($action === 'getResourceByHash') {
		$data = $noteStore->{$action}($authToken, $_GET['guid'], pack('H*', $_GET['hash']), true, false, false);
//		$data->data->body = base64_encode($data->data->body);//convert binary to string
		echo $data->data->body;
		die;
	}
	else {
		$data = $noteStore->{$action}($authToken);
	}

	echo json_encode($data);
} catch (TException $e) {
	//message can be empty
	$message = $e->getMessage() ? $e->getMessage() : ($e->parameter ? $e->parameter : get_class($e));

	echo json_encode(array('exception' => $message));
}