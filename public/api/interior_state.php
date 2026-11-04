<?php
// Interior tool data — scoped to the signed-in user.
//   GET  /api/interior_state.php  -> the whole workspace as one JSON object
//   POST /api/interior_state.php  -> body is that same object; each key upserted
// Header (both): Authorization: Bearer <token>
//
// Every row is keyed by user_id, so accounts can never see each other's data.

require_once __DIR__ . '/auth_common.php';
require_once __DIR__ . '/interior_access.php';

auth_headers('GET, POST, OPTIONS');
require_method(['GET', 'POST']);

// The owner, or an employee working in the owner's workspace — $userId is
// always the OWNER's id, which is what keys the rows.
$user   = require_principal();
$userId = $user['id'];
$isOwner = !empty($user['access']['owner']);

// Every key the Interior app persists, with the value used when a row is
// missing. Keep in sync with defaultData in the app's AppDataContext.
$DEFAULTS = [
    'projects'                   => [],
    'subProjects'                => [],
    'dimensions'                 => [],
    'prices'                     => [],
    'materialModelRates'         => new stdClass(),
    'materialModelProfitPercent' => ['economy' => 0, 'standard' => 0, 'premium' => 0],
    'templates'                  => [],
    'selectedTemplateId'         => '',
    'materialStockSettings'      => new stdClass(),
    'kerfWidth'                  => 0,
    'companyProfile'             => new stdClass(),
    'designGallery'              => [],
    'leads'                      => [],
    'leadViews'                  => null,
    'leadStatuses'                => null,
    'leadTagColors'               => null,
    'teamMembers'                 => [],
    'templateFolders'             => [],
];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = db()->prepare('SELECT data_key, data_json FROM interior_app_state WHERE user_id = ?');
    $stmt->bind_param('s', $userId);
    $stmt->execute();
    $res = $stmt->get_result();

    $stored = [];
    $storedAssoc = [];
    while ($row = $res->fetch_assoc()) {
        $stored[$row['data_key']] = json_decode($row['data_json']);
        if (!$isOwner) $storedAssoc[$row['data_key']] = json_decode($row['data_json'], true);
    }
    $stmt->close();

    // Employees only get what their group lets them see, and never trigger the
    // "brand-new account" seeding.
    if (!$isOwner) {
        echo json_encode([
            'success' => true, 'isNew' => false,
            'data' => ia_view_workspace($user['access'], $stored, $storedAssoc, $DEFAULTS),
        ]);
        exit;
    }

    $out = [];
    foreach ($DEFAULTS as $key => $default) {
        $out[$key] = array_key_exists($key, $stored) ? $stored[$key] : $default;
    }

    // isNew tells the client this account has never saved anything, so it can
    // seed a starter workspace instead of showing an empty app.
    echo json_encode(['success' => true, 'isNew' => empty($stored), 'data' => $out]);
    exit;
}

// ---- POST ----
$body = json_body();
if (!$body) {
    json_fail(400, 'Request body must be a JSON object');
}

$unknown = array_diff(array_keys($body), array_keys($DEFAULTS));
if (!empty($unknown)) {
    json_fail(400, 'Unknown key(s): ' . implode(', ', $unknown));
}

// An employee's changes are merged against what is stored: only what their
// group may change is written, the rest is reported back in "denied".
$denied = [];
if (!$isOwner) {
    $stmt = db()->prepare('SELECT data_key, data_json FROM interior_app_state WHERE user_id = ?');
    $stmt->bind_param('s', $userId);
    $stmt->execute();
    $res = $stmt->get_result();
    $storedAssoc = [];
    while ($row = $res->fetch_assoc()) $storedAssoc[$row['data_key']] = json_decode($row['data_json'], true);
    $stmt->close();
    $defaultsAssoc = json_decode(json_encode($DEFAULTS), true);
    [$body, $denied] = ia_merge_workspace($user['access'], $storedAssoc, $body, $defaultsAssoc);
}

$stmt = db()->prepare(
    'INSERT INTO interior_app_state (user_id, data_key, data_json)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE data_json = VALUES(data_json)'
);

foreach ($body as $key => $value) {
    $json = json_encode($value);
    $stmt->bind_param('sss', $userId, $key, $json);
    if (!$stmt->execute()) {
        $stmt->close();
        json_fail(500, 'Could not save changes.');
    }
}
$stmt->close();

json_ok(['denied' => $denied]);
