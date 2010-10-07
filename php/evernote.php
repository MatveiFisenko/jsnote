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

$authToken = $_POST['oauth_token'];
$edamShard = $_POST['edam_shard'];
$module = $_POST['module'];
$action = $_POST['action'];

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
		$data['tags'] = $noteStore->getNoteTagNames($authToken, $_POST['guid']);
	}
	else if ($action === 'updateNote') {
		$note = new edam_type_Note();

		if ($_POST['guid'] === 'createNote') {
			$action = 'createNote';
		}
		else {
			$note->guid = $_POST['guid'];
		}

		$note->title = $_POST['title'];
		$note->tagNames = $_POST['tags'] ? $_POST['tags'] : array();//because we can not send empty array from js
		$note->content = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml.dtd">' .
  			'<en-note>' . $_POST['content'] . '</en-note>';

		$data = $noteStore->{$action}($authToken, $note);
	}
	else {
		$data = $noteStore->{$action}($authToken);
	}

	echo json_encode($data);
} catch (TException $e) {
	$message = $e->getMessage();
	//message can be empty
	if (!$message) $message = $e->parameter;

	echo json_encode(array('exception' => $message));
}