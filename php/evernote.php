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

$authToken = $_GET['oauth_token'];
$edamShard = $_GET['edam_shard'];
$module = $_GET['module'];
$action = $_GET['action'];

try {
	$noteStoreHttpClient =
	new THttpClient($evernoteHost, $evernotePort,
		  "/edam/$module/$edamShard", $evernoteScheme);
	$noteStoreProtocol = new TBinaryProtocol($noteStoreHttpClient);
	$noteStore = new NoteStoreClient($noteStoreProtocol, $noteStoreProtocol);

	if ($action === 'findNotes') {
		$filterData = $_GET['filter'];
		$filter = new edam_notestore_NoteFilter($filterData);

		$data = $noteStore->{$action}($authToken, $filter, 0, 100);
	}
	else if ($action === 'getNoteContent') {
		$data = $noteStore->{$action}($authToken, $_GET['guid']);
	}
	else {
		$data = $noteStore->{$action}($authToken);
	}

	echo json_encode($data);
} catch (TException $e) {
	echo json_encode(array('exception' => $e->getMessage()));
}
