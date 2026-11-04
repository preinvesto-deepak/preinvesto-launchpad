<?php
// Employees and groups — managed by the account owner only.
//   GET  /api/interior_team.php  -> { employees, groups }
//   POST /api/interior_team.php  -> { action, ... }, then the same snapshot back
//        saveGroup     { id?, name, perms, scope }       (scope: null = all projects, else list of ids)
//        deleteGroup   { id }
//        saveEmployee  { id?, name, role, phone, email, active, canSignIn, username?, password?, groupId? }
//        importContacts{ contacts: [{ name, role, phone, email }] }   (one-time move of the old contact list)
//        deleteEmployee{ id }
// Header: Authorization: Bearer <token>

require_once __DIR__ . '/auth_common.php';
require_once __DIR__ . '/interior_access.php';

auth_headers('GET, POST, OPTIONS');
require_method(['GET', 'POST']);

$user = require_principal();
if (empty($user['access']['owner'])) json_fail(403, 'Only the account owner can manage employees.');
$ownerId = $user['id'];
ia_ensure_team_tables();

/** Employees + groups as the app expects them. */
function team_snapshot(string $ownerId): array {
    $stmt = db()->prepare(
        'SELECT id, name, username, role, phone, email, group_id, active, created_at, last_login_at
           FROM interior_employees WHERE owner_id = ? ORDER BY name'
    );
    $stmt->bind_param('s', $ownerId);
    $stmt->execute();
    $emps = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $stmt = db()->prepare('SELECT id, name, perms_json, scope_json FROM interior_groups WHERE owner_id = ? ORDER BY name');
    $stmt->bind_param('s', $ownerId);
    $stmt->execute();
    $groups = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $counts = [];
    foreach ($emps as $e) if ($e['group_id']) $counts[$e['group_id']] = ($counts[$e['group_id']] ?? 0) + 1;

    return [
        'employees' => array_map(fn($e) => [
            'id' => $e['id'], 'name' => $e['name'], 'username' => $e['username'] ?? '', 'hasLogin' => !empty($e['username']),
            'role' => $e['role'] ?? '', 'phone' => $e['phone'] ?? '', 'email' => $e['email'] ?? '',
            'groupId' => $e['group_id'], 'active' => (bool) $e['active'],
            'createdAt' => $e['created_at'], 'lastLoginAt' => $e['last_login_at'],
        ], $emps),
        'groups' => array_map(fn($g) => [
            'id' => $g['id'], 'name' => $g['name'],
            'perms' => ia_normalize_perms(json_decode($g['perms_json'] ?: '{}', true) ?: []),
            'scope' => $g['scope_json'] ? ia_normalize_scope(json_decode($g['scope_json'], true)) : null,
            'employeeCount' => $counts[$g['id']] ?? 0,
        ], $groups),
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    json_ok(team_snapshot($ownerId));
}

// ---- POST ----
$b = json_body();
$action = $b['action'] ?? '';

if ($action === 'saveGroup') {
    $name = trim((string) ($b['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 100) json_fail(400, 'Enter a group name.');
    $perms = json_encode(ia_normalize_perms(is_array($b['perms'] ?? null) ? $b['perms'] : []));
    $scope = is_array($b['scope'] ?? null) ? json_encode(ia_normalize_scope($b['scope'])) : null;
    if (!empty($b['id'])) {
        $stmt = db()->prepare('UPDATE interior_groups SET name = ?, perms_json = ?, scope_json = ? WHERE id = ? AND owner_id = ?');
        $stmt->bind_param('sssss', $name, $perms, $scope, $b['id'], $ownerId);
        $stmt->execute();
        $found = $stmt->affected_rows >= 0;
        $stmt->close();
        // affected_rows is 0 for "no change", so confirm the group exists separately.
        $stmt = db()->prepare('SELECT id FROM interior_groups WHERE id = ? AND owner_id = ?');
        $stmt->bind_param('ss', $b['id'], $ownerId);
        $stmt->execute();
        $found = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$found) json_fail(404, 'Group not found.');
    } else {
        $id = new_uuid();
        $stmt = db()->prepare('INSERT INTO interior_groups (id, owner_id, name, perms_json, scope_json) VALUES (?, ?, ?, ?, ?)');
        $stmt->bind_param('sssss', $id, $ownerId, $name, $perms, $scope);
        if (!$stmt->execute()) json_fail(500, 'Could not save the group.');
        $stmt->close();
    }
} elseif ($action === 'deleteGroup') {
    $id = (string) ($b['id'] ?? '');
    $stmt = db()->prepare('DELETE FROM interior_groups WHERE id = ? AND owner_id = ?');
    $stmt->bind_param('ss', $id, $ownerId);
    $stmt->execute();
    $stmt->close();
} elseif ($action === 'saveEmployee') {
    $name      = trim((string) ($b['name'] ?? ''));
    $canSignIn = !empty($b['canSignIn']);
    $username  = $canSignIn ? strtolower(trim((string) ($b['username'] ?? ''))) : '';
    $password  = $canSignIn ? (string) ($b['password'] ?? '') : '';
    $phone     = preg_replace('/[^0-9]/', '', (string) ($b['phone'] ?? ''));
    $email     = trim((string) ($b['email'] ?? ''));
    $role      = mb_substr(trim((string) ($b['role'] ?? '')), 0, 100);
    $active    = (array_key_exists('active', $b) && $b['active'] === false) ? 0 : 1;
    $editId    = (string) ($b['id'] ?? '');

    if ($name === '' || mb_strlen($name) > 100) json_fail(400, "Enter the person's name.");
    if ($phone !== '' && !preg_match('/^[0-9]{10}$/', $phone)) json_fail(400, 'Phone must be exactly 10 digits.');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) json_fail(400, 'Enter a valid email address.');
    if ($canSignIn && !preg_match('/^[a-z0-9._-]{3,40}$/', $username)) json_fail(400, 'Username must be 3-40 characters: letters, numbers, dot, dash or underscore.');
    if ($password !== '' && strlen($password) < 6) json_fail(400, 'Password must be at least 6 characters.');

    $hasHash = false;
    if ($editId !== '') {
        $stmt = db()->prepare('SELECT id, password_hash FROM interior_employees WHERE id = ? AND owner_id = ?');
        $stmt->bind_param('ss', $editId, $ownerId);
        $stmt->execute();
        $own = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$own) json_fail(404, 'Person not found.');
        $hasHash = !empty($own['password_hash']);
    }
    if ($canSignIn && $password === '' && !$hasHash) json_fail(400, 'Set a password of at least 6 characters.');

    // Only someone who can sign in has a group - it is what decides their access.
    $groupId = ($canSignIn && !empty($b['groupId'])) ? (string) $b['groupId'] : null;
    if ($groupId !== null) {
        $stmt = db()->prepare('SELECT id FROM interior_groups WHERE id = ? AND owner_id = ?');
        $stmt->bind_param('ss', $groupId, $ownerId);
        $stmt->execute();
        if (!$stmt->get_result()->fetch_assoc()) $groupId = null;
        $stmt->close();
    }
    if ($canSignIn) {
        $stmt = db()->prepare('SELECT id FROM interior_employees WHERE username = ? AND id != ? LIMIT 1');
        $stmt->bind_param('ss', $username, $editId);
        $stmt->execute();
        $taken = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($taken) json_fail(409, 'That username is already taken.');
    }

    $userV  = $canSignIn ? $username : null;
    $roleV  = $role !== '' ? $role : null;
    $phoneV = $phone !== '' ? $phone : null;
    $emailV = $email !== '' ? $email : null;

    if ($editId !== '') {
        if ($password !== '') {
            $hash = password_hash($password, PASSWORD_BCRYPT);
            $stmt = db()->prepare('UPDATE interior_employees SET name=?, username=?, role=?, phone=?, email=?, group_id=?, active=?, password_hash=? WHERE id=?');
            $stmt->bind_param('ssssssiss', $name, $userV, $roleV, $phoneV, $emailV, $groupId, $active, $hash, $editId);
        } elseif (!$canSignIn) {
            $stmt = db()->prepare('UPDATE interior_employees SET name=?, username=?, role=?, phone=?, email=?, group_id=?, active=?, password_hash=NULL WHERE id=?');
            $stmt->bind_param('ssssssis', $name, $userV, $roleV, $phoneV, $emailV, $groupId, $active, $editId);
        } else {
            $stmt = db()->prepare('UPDATE interior_employees SET name=?, username=?, role=?, phone=?, email=?, group_id=?, active=? WHERE id=?');
            $stmt->bind_param('ssssssis', $name, $userV, $roleV, $phoneV, $emailV, $groupId, $active, $editId);
        }
        if (!$stmt->execute()) json_fail(500, 'Could not save the person.');
        $stmt->close();

        // A new password, a switched-off account or removed sign-in ends their sessions.
        if ($password !== '' || !$active || !$canSignIn) {
            $stmt = db()->prepare('DELETE FROM interior_employee_sessions WHERE employee_id = ?');
            $stmt->bind_param('s', $editId);
            $stmt->execute();
            $stmt->close();
        }
    } else {
        $id   = new_uuid();
        $hash = $canSignIn ? password_hash($password, PASSWORD_BCRYPT) : null;
        $stmt = db()->prepare(
            'INSERT INTO interior_employees (id, owner_id, username, password_hash, name, role, phone, email, group_id, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('sssssssssi', $id, $ownerId, $userV, $hash, $name, $roleV, $phoneV, $emailV, $groupId, $active);
        if (!$stmt->execute()) json_fail(500, 'Could not save the person.');
        $stmt->close();
    }
} elseif ($action === 'importContacts') {
    // One-time move of the old Team Members contact list into the Team list.
    $list = is_array($b['contacts'] ?? null) ? array_slice($b['contacts'], 0, 500) : [];
    $stmt = db()->prepare('SELECT name, phone FROM interior_employees WHERE owner_id = ?');
    $stmt->bind_param('s', $ownerId);
    $stmt->execute();
    $seen = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $r) {
        $seen[mb_strtolower((string) $r['name']) . '|' . ($r['phone'] ?? '')] = true;
    }
    $stmt->close();

    $ins = db()->prepare(
        'INSERT INTO interior_employees (id, owner_id, username, password_hash, name, role, phone, email, group_id, active)
         VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, NULL, 1)'
    );
    foreach ($list as $c) {
        if (!is_array($c)) continue;
        $name = mb_substr(trim((string) ($c['name'] ?? '')), 0, 100);
        if ($name === '') continue;
        $phone = preg_replace('/[^0-9]/', '', (string) ($c['phone'] ?? ''));
        $phoneV = preg_match('/^[0-9]{10}$/', $phone) ? $phone : null;
        $key = mb_strtolower($name) . '|' . ($phoneV ?? '');
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $email = trim((string) ($c['email'] ?? ''));
        $emailV = filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
        $roleV = mb_substr(trim((string) ($c['role'] ?? '')), 0, 100);
        $roleV = $roleV !== '' ? $roleV : null;
        $id = new_uuid();
        $ins->bind_param('ssssss', $id, $ownerId, $name, $roleV, $phoneV, $emailV);
        $ins->execute();
    }
    $ins->close();
} elseif ($action === 'deleteEmployee') {
    $id = (string) ($b['id'] ?? '');
    $stmt = db()->prepare('DELETE FROM interior_employees WHERE id = ? AND owner_id = ?');
    $stmt->bind_param('ss', $id, $ownerId);
    $stmt->execute();
    $stmt->close();
} else {
    json_fail(400, 'Unknown action.');
}

json_ok(team_snapshot($ownerId));
