<?php
// Employees, groups and access control for the Interior workspace.
// Not an endpoint — require_once'd by interior_state.php, interior_team.php,
// auth_login.php, auth_me.php, auth_logout.php and the share/upload endpoints.
//
// PHP twin of server/access.js (the local-dev Express backend). Keep the two
// in step. See that file for the full description of the rules.
//
// The owner (a row in `users`) has full access. Employees sign in with a
// username + password the owner set and work inside the OWNER's workspace under
// their group's per-screen View / Edit / Delete rules and optional project list.

require_once __DIR__ . '/auth_common.php';

const IA_MODULES = ['leads', 'projects', 'itemsPricing', 'materialModels', 'templates', 'designGallery'];

const IA_KEY_MODULE = [
    'projects' => 'projects', 'subProjects' => 'projects', 'dimensions' => 'projects',
    'prices' => 'itemsPricing',
    'materialModelRates' => 'materialModels', 'materialModelProfitPercent' => 'materialModels',
    'templates' => 'templates', 'templateFolders' => 'templates', 'selectedTemplateId' => 'templates',
    'designGallery' => 'designGallery',
    'leads' => 'leads', 'leadViews' => 'leads', 'leadStatuses' => 'leads', 'leadTagColors' => 'leads',
];

// The old contact list; people now live in the Team list (owner-only), so this
// key is only ever kept empty and employees never see or change it.
const IA_OWNER_ONLY_KEYS = ['teamMembers'];

// Readable by any employee; writable by anyone who can edit at least one screen.
const IA_SHARED_KEYS = ['companyProfile', 'materialStockSettings', 'kerfWidth'];

// A quotation can't be computed without these, so seeing Projects lets an
// employee read them too (changing them still needs that screen's Edit).
const IA_PROJECT_READ_DEPS = [
    'prices', 'templates', 'templateFolders', 'selectedTemplateId',
    'materialModelRates', 'materialModelProfitPercent', 'designGallery',
];

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Create the tables on first use so a missed migration can't break login. */
function ia_ensure_team_tables(): void {
    static $done = false;
    if ($done) return;
    $sql = [
        'CREATE TABLE IF NOT EXISTS interior_groups (
           id         VARCHAR(36)  NOT NULL,
           owner_id   VARCHAR(36)  NOT NULL,
           name       VARCHAR(100) NOT NULL,
           perms_json TEXT         NOT NULL,
           scope_json TEXT         NULL,
           created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
           PRIMARY KEY (id),
           KEY idx_group_owner (owner_id),
           CONSTRAINT fk_group_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        'CREATE TABLE IF NOT EXISTS interior_employees (
           id            VARCHAR(36)  NOT NULL,
           owner_id      VARCHAR(36)  NOT NULL,
           username      VARCHAR(60)  NULL,
           password_hash VARCHAR(255) NULL,
           name          VARCHAR(100) NOT NULL,
           role          VARCHAR(100) NULL,
           phone         VARCHAR(20)  NULL,
           email         VARCHAR(190) NULL,
           group_id      VARCHAR(36)  NULL,
           active        TINYINT(1)   NOT NULL DEFAULT 1,
           created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
           last_login_at DATETIME     NULL,
           PRIMARY KEY (id),
           UNIQUE KEY uq_employee_username (username),
           KEY idx_employee_owner (owner_id),
           CONSTRAINT fk_employee_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
           CONSTRAINT fk_employee_group FOREIGN KEY (group_id) REFERENCES interior_groups (id) ON DELETE SET NULL
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        'CREATE TABLE IF NOT EXISTS interior_employee_sessions (
           token_hash  CHAR(64)    NOT NULL,
           employee_id VARCHAR(36) NOT NULL,
           expires_at  DATETIME    NOT NULL,
           PRIMARY KEY (token_hash),
           KEY idx_emp_session_employee (employee_id),
           CONSTRAINT fk_emp_session FOREIGN KEY (employee_id) REFERENCES interior_employees (id) ON DELETE CASCADE
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    ];
    foreach ($sql as $q) {
        if (!db()->query($q)) json_fail(500, 'Could not prepare employee access.');
    }
    // Tables made before a person could be contact-only required a login.
    $col = db()->query("SHOW COLUMNS FROM interior_employees LIKE 'username'");
    $info = $col ? $col->fetch_assoc() : null;
    if ($info && $info['Null'] === 'NO') {
        db()->query('ALTER TABLE interior_employees MODIFY username VARCHAR(60) NULL, MODIFY password_hash VARCHAR(255) NULL');
    }
    $done = true;
}

// ---------------------------------------------------------------------------
// Who is signed in
// ---------------------------------------------------------------------------

const IA_EMPLOYEE_SELECT =
    'SELECT e.id, e.owner_id, e.name, e.username, e.email, e.phone, e.group_id, e.active,
            g.name AS group_name, g.perms_json, g.scope_json,
            u.name AS owner_name, u.email AS owner_email, u.mobile AS owner_mobile
       FROM interior_employees e
       JOIN users u ON u.id = e.owner_id
       LEFT JOIN interior_groups g ON g.id = e.group_id';

function ia_build_principal(array $row): array {
    $perms = $row['perms_json'] ? json_decode($row['perms_json'], true) : [];
    $scope = $row['scope_json'] ? json_decode($row['scope_json'], true) : null;
    return [
        'id'     => $row['owner_id'],           // always the OWNER's id — keys the workspace rows
        'name'   => $row['owner_name'],
        'email'  => $row['owner_email'],
        'mobile' => $row['owner_mobile'],
        'employee' => [
            'id' => $row['id'], 'name' => $row['name'], 'username' => $row['username'],
            'email' => $row['email'] ?? '', 'phone' => $row['phone'] ?? '',
            'groupId' => $row['group_id'], 'groupName' => $row['group_name'] ?? '',
        ],
        // No group (or a deleted one) means no access to anything.
        'access' => [
            'owner' => false,
            'perms' => ia_normalize_perms(is_array($perms) ? $perms : []),
            'scope' => ia_normalize_scope($scope),
            'groupName' => $row['group_name'] ?? '',
            'customer' => is_array($perms) && !empty($perms['customer']),
        ],
    ];
}

/** The owner (full access) or an employee, for the current token; null if neither. */
function current_principal(): ?array {
    $owner = current_user();
    if ($owner) return $owner + ['employee' => null, 'access' => ['owner' => true]];

    $token = bearer_token();
    if ($token === '') return null;
    ia_ensure_team_tables();

    $stmt = db()->prepare(
        IA_EMPLOYEE_SELECT . '
         JOIN interior_employee_sessions s ON s.employee_id = e.id
        WHERE s.token_hash = ? AND s.expires_at > NOW() AND e.active = 1
        LIMIT 1'
    );
    $hash = hash('sha256', $token);
    $stmt->bind_param('s', $hash);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? ia_build_principal($row) : null;
}

function require_principal(): array {
    $p = current_principal();
    if ($p === null) json_fail(401, 'Not authenticated');
    return $p;
}

/** What the browser is told about who is signed in. */
function ia_public_user(array $p): array {
    if ($p['employee']) {
        return [
            'id' => $p['employee']['id'], 'name' => $p['employee']['name'],
            'email' => $p['employee']['email'], 'mobile' => $p['employee']['phone'],
            'username' => $p['employee']['username'], 'isEmployee' => true, 'access' => $p['access'],
        ];
    }
    return ['id' => $p['id'], 'name' => $p['name'], 'email' => $p['email'], 'mobile' => $p['mobile'],
            'isEmployee' => false, 'access' => $p['access']];
}

/** True for the owner, or when the employee's group grants $action on $mod. */
function ia_allowed(array $p, string $mod, string $action): bool {
    return !empty($p['access']['owner']) || !empty($p['access']['perms'][$mod][$action]);
}

function ia_issue_employee_session(string $employeeId): string {
    $token = bin2hex(random_bytes(32));
    $stmt  = db()->prepare(
        'INSERT INTO interior_employee_sessions (token_hash, employee_id, expires_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))'
    );
    $hash = hash('sha256', $token);
    $ttl  = SESSION_TTL_DAYS;
    $stmt->bind_param('ssi', $hash, $employeeId, $ttl);
    $stmt->execute();
    $stmt->close();
    return $token;
}

// ---------------------------------------------------------------------------
// Permission model
// ---------------------------------------------------------------------------

// The tabs inside one project, each with the actions a group can grant on it.
// The server only enforces the "projects" module as a whole (every tab edits the
// same stored data), so that module's View/Edit/Delete is simply "any tab has
// it"; the tab-by-tab limits themselves are applied by the app.
const IA_PROJECT_TABS = [
    'req-form'        => ['view', 'edit', 'delete'],
    'req'             => ['view', 'edit', 'delete'],
    'design'          => ['view', 'edit', 'delete'],
    'rooms'           => ['view', 'edit', 'delete'],
    'material-models' => ['view', 'edit'],
    'summary-rates'   => ['view'],
    'summary-norates' => ['view'],
    'quotation'       => ['view', 'edit'],
    'customer-view'   => ['view', 'edit'],
];

/**
 * Cleans a permissions array into [module => [view, edit, delete], 'tabs' => ...].
 * Groups saved before per-tab access (no 'tabs') get their old "projects" rule
 * copied onto every tab.
 */
function ia_normalize_perms(array $raw): array {
    // A customer's group (made by Teams > Add customer) opens no screen: the
    // customer only sees the Requirements form of their own project.
    if (!empty($raw['customer'])) {
        $none = ['view' => false, 'edit' => false, 'delete' => false];
        $out = [];
        foreach (IA_MODULES as $m) $out[$m] = $none;
        $out['tabs'] = array_map(fn($_) => $none, IA_PROJECT_TABS);
        $out['customer'] = true;
        return $out;
    }
    $given    = isset($raw['tabs']) && is_array($raw['tabs']) ? $raw['tabs'] : null;
    $fallback = isset($raw['projects']) && is_array($raw['projects']) ? $raw['projects'] : [];
    $tabs = [];
    foreach (IA_PROJECT_TABS as $key => $actions) {
        // "Req Form" came after the other tabs: a group saved before it follows its Req rule.
        $src  = $given !== null
            ? (isset($given[$key]) && is_array($given[$key]) ? $given[$key]
                : ($key === 'req-form' && isset($given['req']) && is_array($given['req']) ? $given['req'] : []))
            : $fallback;
        $edit = in_array('edit', $actions, true) && !empty($src['edit']);
        $del  = in_array('delete', $actions, true) && !empty($src['delete']);
        $tabs[$key] = ['view' => !empty($src['view']) || $edit || $del, 'edit' => $edit, 'delete' => $del];
    }

    $out = [];
    foreach (IA_MODULES as $m) {
        if ($m === 'projects') {
            $out[$m] = [
                'view'   => (bool) array_filter($tabs, fn($t) => $t['view']),
                'edit'   => (bool) array_filter($tabs, fn($t) => $t['edit']),
                'delete' => (bool) array_filter($tabs, fn($t) => $t['delete']),
            ];
            continue;
        }
        $p    = isset($raw[$m]) && is_array($raw[$m]) ? $raw[$m] : [];
        $edit = !empty($p['edit']);
        $del  = !empty($p['delete']);
        $out[$m] = ['view' => !empty($p['view']) || $edit || $del, 'edit' => $edit, 'delete' => $del];
    }
    $out['tabs'] = $tabs;
    return $out;
}

/** null = every project, otherwise a list of project ids as strings. */
function ia_normalize_scope($raw): ?array {
    if (!is_array($raw)) return null;
    return array_values(array_unique(array_map('strval', $raw)));
}

function ia_perm(array $access, string $mod): array {
    return $access['perms'][$mod] ?? ['view' => false, 'edit' => false, 'delete' => false];
}

function ia_can_view_screen(array $access, string $mod): bool {
    return !empty($access['owner']) || ia_perm($access, $mod)['view'];
}

function ia_any_edit(array $access): bool {
    if (!empty($access['owner'])) return true;
    foreach (IA_MODULES as $m) if (ia_perm($access, $m)['edit']) return true;
    return false;
}

function ia_can_read_key(array $access, string $key): bool {
    if (!empty($access['owner'])) return true;
    if (in_array($key, IA_OWNER_ONLY_KEYS, true)) return false;
    if (in_array($key, IA_SHARED_KEYS, true)) return true;
    $mod = IA_KEY_MODULE[$key] ?? null;
    if ($mod && ia_perm($access, $mod)['view']) return true;
    return ia_perm($access, 'projects')['view'] && in_array($key, IA_PROJECT_READ_DEPS, true);
}

/** Projects an employee may touch: ['ids' => set, 'names' => set], or null for all. */
function ia_scope_of(array $access, $projects): ?array {
    if (!empty($access['owner']) || $access['scope'] === null) return null;
    $ids = array_fill_keys($access['scope'], true);
    $names = [];
    foreach (is_array($projects) ? $projects : [] as $p) {
        if (is_array($p) && isset($p['id']) && isset($ids[(string)$p['id']])) $names[(string)($p['name'] ?? '')] = true;
    }
    return ['ids' => $ids, 'names' => $names];
}

function ia_is_scoped_key(string $key): bool {
    return $key === 'projects' || $key === 'subProjects' || $key === 'dimensions';
}

function ia_row_visible(string $key, $row, array $scope): bool {
    if (!is_array($row)) return false;
    if ($key === 'projects')    return isset($row['id']) && isset($scope['ids'][(string)$row['id']]);
    if ($key === 'subProjects') return isset($row['project']) && isset($scope['names'][(string)$row['project']]);
    return isset($row['projectName']) && isset($scope['names'][(string)$row['projectName']]); // dimensions
}

function ia_same($a, $b): bool {
    return json_encode($a) === json_encode($b);
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
// A customer signs in to fill the room requirements of ONE project. They see only
// that project's name and rooms (no boxes, rates or prices), the question sets
// those rooms use, and may change only the answers - and "submit", once.

function ia_requirement_sets(array $stored): array {
    $p = $stored['companyProfile'] ?? null;
    return is_array($p) && isset($p['requirementSets']) && is_array($p['requirementSets']) ? $p['requirementSets'] : [];
}

function ia_customer_scope(array $access, array $stored): array {
    $ids = array_fill_keys($access['scope'] ?? [], true);
    $projects = [];
    $names = [];
    foreach (is_array($stored['projects'] ?? null) ? $stored['projects'] : [] as $p) {
        if (is_array($p) && isset($p['id']) && isset($ids[(string) $p['id']])) {
            $projects[] = $p;
            $names[(string) ($p['name'] ?? '')] = true;
        }
    }
    return ['ids' => $ids, 'projects' => $projects, 'names' => $names];
}

function ia_view_customer(array $access, array $storedAssoc, array $defaults): array {
    $out = $defaults;
    $sc = ia_customer_scope($access, $storedAssoc);
    $rooms = array_values(array_filter(
        is_array($storedAssoc['subProjects'] ?? null) ? $storedAssoc['subProjects'] : [],
        fn($r) => is_array($r) && isset($sc['names'][(string) ($r['project'] ?? '')])
    ));
    $used = [];
    foreach ($rooms as $r) if (!empty($r['requirementSetId'])) $used[(string) $r['requirementSetId']] = true;

    $out['projects'] = array_map(fn($p) => [
        'id' => $p['id'], 'name' => $p['name'] ?? '',
        'requirementsSubmittedAt' => $p['requirementsSubmittedAt'] ?? null,
        'requirementsSubmittedBy' => $p['requirementsSubmittedBy'] ?? null,
    ], $sc['projects']);
    $out['subProjects'] = array_map(function ($r) {
        $req = is_array($r['requirements'] ?? null) ? $r['requirements'] : [];
        return [
            'id' => $r['id'] ?? null, 'project' => $r['project'] ?? '', 'subProject' => $r['subProject'] ?? '',
            'requirementSetId' => $r['requirementSetId'] ?? null,
            'requirements' => $req ?: new stdClass(),
            'remarks' => (is_array($r['remarks'] ?? null) && $r['remarks']) ? $r['remarks'] : new stdClass(),
        ];
    }, $rooms);
    $out['companyProfile'] = ['requirementSets' => array_values(array_filter(
        ia_requirement_sets($storedAssoc),
        fn($s) => is_array($s) && isset($s['id']) && isset($used[(string) $s['id']])
    ))];
    return $out;
}

/** Keeps only answers to real questions of the set, in the shape each question expects. */
function ia_clean_answers($set, $raw): array {
    $out = [];
    if (!is_array($set) || !is_array($raw)) return $out;
    foreach (is_array($set['questions'] ?? null) ? $set['questions'] : [] as $q) {
        if (!is_array($q) || !isset($q['id'])) continue;
        $id = (string) $q['id'];
        if (!array_key_exists($id, $raw)) continue;
        $v = $raw[$id];
        if ($v === null || $v === '') continue;
        $type = $q['type'] ?? '';
        if ($type === 'yesno') {
            if ($v === 'yes' || $v === 'no') $out[$id] = $v;
        } elseif ($type === 'choice') {
            $labels = array_map(fn($o) => is_array($o) ? (string) ($o['label'] ?? '') : (string) $o, is_array($q['options'] ?? null) ? $q['options'] : []);
            if (is_string($v) && in_array($v, $labels, true)) $out[$id] = $v;
        } elseif ($type === 'multi') {
            $labels = array_map(fn($o) => is_array($o) ? (string) ($o['label'] ?? '') : (string) $o, is_array($q['options'] ?? null) ? $q['options'] : []);
            $picked = [];
            if (is_array($v)) {
                foreach ($v as $x) if (is_string($x) && in_array($x, $labels, true) && !in_array($x, $picked, true)) $picked[] = $x;
            }
            if ($picked) $out[$id] = $picked;
        } elseif ($type === 'number') {
            if (is_numeric($v) && is_finite((float) $v) && $v >= 0 && $v < 1e6) $out[$id] = $v + 0;
        } elseif ($type === 'text') {
            if (is_scalar($v)) $out[$id] = mb_substr((string) $v, 0, 500);
        }
    }
    return $out;
}

/** Remarks: free text per question of the set, trimmed to a sensible length. */
function ia_clean_remarks($set, $raw): array {
    $out = [];
    if (!is_array($set) || !is_array($raw)) return $out;
    foreach (is_array($set['questions'] ?? null) ? $set['questions'] : [] as $q) {
        if (!is_array($q) || !isset($q['id'])) continue;
        $v = $raw[(string) $q['id']] ?? null;
        if (is_string($v) && trim($v) !== '') $out[(string) $q['id']] = mb_substr($v, 0, 500);
    }
    return $out;
}

/** @return array{0: array, 1: array} [key => value to write, keys refused] */
function ia_merge_customer(array $access, array $stored, array $incoming): array {
    $writes = [];
    $denied = [];
    $sc = ia_customer_scope($access, $stored);
    if (!$sc['projects']) return [$writes, []];
    $sets = ia_requirement_sets($stored);
    $submitted = function (string $name) use ($sc): bool {
        foreach ($sc['projects'] as $p) {
            if ((string) ($p['name'] ?? '') === $name && !empty($p['requirementsSubmittedAt'])) return true;
        }
        return false;
    };

    // Answers, room by room - only for rooms of their project that are not yet submitted.
    if (is_array($incoming['subProjects'] ?? null) && is_array($stored['subProjects'] ?? null)) {
        $inById = [];
        foreach ($incoming['subProjects'] as $r) if (is_array($r) && isset($r['id'])) $inById[(string) $r['id']] = $r;
        $changed = false;
        $next = [];
        foreach ($stored['subProjects'] as $room) {
            $name = is_array($room) ? (string) ($room['project'] ?? '') : '';
            if (!is_array($room) || !isset($sc['names'][$name]) || $submitted($name)) { $next[] = $room; continue; }
            $inc = $inById[(string) ($room['id'] ?? '')] ?? null;
            $set = null;
            foreach ($sets as $s) {
                if (is_array($s) && (string) ($s['id'] ?? '') === (string) ($room['requirementSetId'] ?? '')) { $set = $s; break; }
            }
            if ($inc === null || $set === null) { $next[] = $room; continue; }
            $answers = ia_clean_answers($set, $inc['requirements'] ?? []);
            $current = is_array($room['requirements'] ?? null) ? $room['requirements'] : [];
            $currentRemarks = is_array($room['remarks'] ?? null) ? $room['remarks'] : [];
            $remarks = array_key_exists('remarks', $inc) ? ia_clean_remarks($set, $inc['remarks']) : $currentRemarks;
            if (ia_same($answers, $current) && ia_same($remarks, $currentRemarks)) { $next[] = $room; continue; }
            $changed = true;
            $room['requirements'] = $answers ?: new stdClass();
            $room['remarks'] = $remarks ?: new stdClass();
            $next[] = $room;
        }
        if ($changed) $writes['subProjects'] = $next;
    }

    // Submit: stamped by the server, once.
    if (is_array($incoming['projects'] ?? null) && is_array($stored['projects'] ?? null)) {
        $inById = [];
        foreach ($incoming['projects'] as $p) if (is_array($p) && isset($p['id'])) $inById[(string) $p['id']] = $p;
        $changed = false;
        $next = [];
        foreach ($stored['projects'] as $p) {
            if (!is_array($p) || !isset($sc['ids'][(string) ($p['id'] ?? '')]) || !empty($p['requirementsSubmittedAt'])) { $next[] = $p; continue; }
            $inc = $inById[(string) $p['id']] ?? null;
            if (!$inc || empty($inc['requirementsSubmittedAt'])) { $next[] = $p; continue; }
            // Every required question of the project's rooms must be answered first.
            $incomplete = false;
            foreach ($writes['subProjects'] ?? ($stored['subProjects'] ?? []) as $r) {
                if (!is_array($r) || (string) ($r['project'] ?? '') !== (string) ($p['name'] ?? '')) continue;
                foreach ($sets as $s) {
                    if (!is_array($s) || (string) ($s['id'] ?? '') !== (string) ($r['requirementSetId'] ?? '')) continue;
                    foreach (is_array($s['questions'] ?? null) ? $s['questions'] : [] as $q) {
                        if (empty($q['required'])) continue;
                        $a = is_array($r['requirements'] ?? null) ? ($r['requirements'][(string) ($q['id'] ?? '')] ?? null) : null;
                        if ($a === null || $a === '' || $a === []) $incomplete = true;
                    }
                }
            }
            if ($incomplete) { $denied[] = 'requirements'; $next[] = $p; continue; }
            $p['requirementsSubmittedAt'] = gmdate('Y-m-d\TH:i:s') . '.000Z';
            $p['requirementsSubmittedBy'] = 'customer';
            $changed = true;
            $next[] = $p;
        }
        if ($changed) $writes['projects'] = $next;
    }
    return [$writes, $denied];
}

/**
 * What an employee sees of the stored workspace. $storedObj / $storedAssoc are
 * the same rows decoded as objects / arrays (objects keep `{}` intact for keys
 * that pass through unchanged); $defaults is the key => empty-value map.
 */
function ia_view_workspace(array $access, array $storedObj, array $storedAssoc, array $defaults): array {
    if (!empty($access['customer'])) return ia_view_customer($access, $storedAssoc, $defaults);
    $out = [];
    $scope = ia_scope_of($access, $storedAssoc['projects'] ?? []);
    foreach ($defaults as $key => $def) {
        if (!ia_can_read_key($access, $key)) { $out[$key] = $def; continue; }
        $val = array_key_exists($key, $storedObj) ? $storedObj[$key] : $def;
        if ($scope && ia_is_scoped_key($key) && isset($storedAssoc[$key]) && is_array($storedAssoc[$key])) {
            $val = array_values(array_filter($storedAssoc[$key], fn($r) => ia_row_visible($key, $r, $scope)));
        }
        $out[$key] = $val;
    }
    return $out;
}

/** Every id inside a row, including nested children (Design Gallery tree). */
function ia_nested_ids($row, array &$acc): void {
    if (is_array($row) && isset($row['id'])) $acc[(string)$row['id']] = true;
    if (is_array($row) && isset($row['children']) && is_array($row['children'])) {
        foreach ($row['children'] as $c) ia_nested_ids($c, $acc);
    }
}

function ia_lost_nested($before, $after): bool {
    $was = []; $now = [];
    ia_nested_ids($before, $was);
    ia_nested_ids($after, $now);
    foreach ($was as $id => $_) if (!isset($now[$id])) return true;
    return false;
}

/** @return array{0: array, 1: bool} merged rows, and whether anything was refused */
function ia_merge_array(array $stored, array $incoming, string $key, ?array $scope, bool $canEdit, bool $canDelete, bool $canAdd): array {
    $visible = fn($r) => $scope === null ? true : ia_row_visible($key, $r, $scope);
    $inById = [];
    foreach ($incoming as $r) if (is_array($r) && isset($r['id'])) $inById[(string)$r['id']] = $r;
    $storedIds = [];
    foreach ($stored as $r) if (is_array($r) && isset($r['id'])) $storedIds[(string)$r['id']] = true;

    $denied = false;
    $out = [];
    foreach ($stored as $row) {
        if (!$visible($row)) { $out[] = $row; continue; }
        $id = is_array($row) && isset($row['id']) ? (string)$row['id'] : null;
        $inc = $id !== null && isset($inById[$id]) ? $inById[$id] : null;
        if ($inc === null) {
            if (!$canDelete) { $out[] = $row; $denied = true; }
            continue;
        }
        if (ia_same($row, $inc)) { $out[] = $row; continue; }
        if (!$canEdit || !$visible($inc) || (!$canDelete && ia_lost_nested($row, $inc))) { $out[] = $row; $denied = true; continue; }
        $out[] = $inc;
    }
    foreach ($incoming as $inc) {
        if (!is_array($inc) || !isset($inc['id']) || isset($storedIds[(string)$inc['id']])) continue;
        if ($canAdd && $visible($inc)) $out[] = $inc; else $denied = true;
    }
    return [$out, $denied];
}

/**
 * Applies an employee's POSTed workspace to what is stored.
 * @return array{0: array, 1: array} [key => value to write (only real changes), keys refused]
 */
function ia_merge_workspace(array $access, array $stored, array $incoming, array $defaults): array {
    if (!empty($access['customer'])) return ia_merge_customer($access, $stored, $incoming);
    $writes = [];
    $denied = [];
    $editAny = ia_any_edit($access);
    // `projects` first: the rooms/dimensions rules depend on which projects an
    // employee may touch, including one they just renamed.
    $keys = array_keys($incoming);
    usort($keys, fn($a, $b) => ($a === 'projects' ? -1 : 0) - ($b === 'projects' ? -1 : 0));
    $storedProjects = $stored['projects'] ?? [];
    $mergedProjects = $storedProjects;

    foreach ($keys as $key) {
        if (!ia_can_read_key($access, $key)) continue; // came back as an empty default — nothing to merge
        $base = array_key_exists($key, $stored) ? $stored[$key] : $defaults[$key];
        $inc  = $incoming[$key];
        $mod  = IA_KEY_MODULE[$key] ?? null;
        $canEdit   = $mod ? ia_perm($access, $mod)['edit'] : $editAny;
        $canDelete = $mod ? ia_perm($access, $mod)['delete'] : false;

        $scope = null;
        if (ia_is_scoped_key($key) && empty($access['owner']) && $access['scope'] !== null) {
            $a = ia_scope_of($access, $storedProjects);
            $b = ia_scope_of($access, $mergedProjects);
            $scope = ['ids' => $a['ids'], 'names' => $a['names'] + $b['names']];
        }

        $baseList = is_array($base) && array_is_list($base);
        $incList  = is_array($inc) && array_is_list($inc);
        if ($baseList && $incList) {
            [$val, $den] = ia_merge_array($base, $inc, $key, $scope, $canEdit, $canDelete, $canEdit && $scope === null);
            if ($den) $denied[] = $key;
            if (!ia_same($val, $base)) $writes[$key] = $val;
            if ($key === 'projects') $mergedProjects = $val;
        } elseif (!ia_same($inc, $base)) {
            if ($canEdit) $writes[$key] = $inc; else $denied[] = $key;
        }
    }
    return [$writes, $denied];
}
