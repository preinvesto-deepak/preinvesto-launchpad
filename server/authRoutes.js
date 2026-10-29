// Local-dev mirror of the auth + Interior-tool PHP endpoints in public/api/.
// Same tables, same request/response shapes, so the React app is identical
// against either backend. Production serves the .php files; `npm run dev`
// proxies /api to this Express server instead.
//
// Passwords use bcrypt so hashes are interchangeable with PHP's
// password_hash()/password_verify().

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

const SESSION_TTL_DAYS = 30;
const RESET_TTL_MINUTES = 60;

// Shared so every handler validates addresses the same way.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Only the hash of a token is ever stored, so a DB leak can't be replayed.
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Every key the Interior app persists, and its empty-state default.
const INTERIOR_DEFAULTS = {
  projects: [],
  subProjects: [],
  dimensions: [],
  prices: [],
  materialModelRates: {},
  materialModelProfitPercent: { economy: 0, standard: 0, premium: 0 },
  templates: [],
  selectedTemplateId: '',
  materialStockSettings: {},
  kerfWidth: 0,
  // Account-wide business identity (name, logo, contact) shown on printed
  // quotations — separate from the per-project Company fields already in
  // Project Quotation Settings, which can still override it per quotation.
  companyProfile: {},
  // Configure > Design Gallery tree — see AppDataContext.jsx's defaultData
  // comment for the shape. moodBoard lives inside subProjects, not here.
  designGallery: [],
  // Leads — enquiries received before they're confirmed as real work.
  // Deliberately separate from `projects`: a lead only becomes a project via
  // "Convert to Project" (see Leads.jsx), never automatically.
  leads: [],
  // Saved Leads views (List/Board tabs + filters) — null means "use the
  // built-in default view", same convention as AppDataContext.jsx.
  leadViews: null,
  leadStatuses: null,
  leadTagColors: null,
  teamMembers: [],
  templateFolders: [],
};

export default function registerAuthRoutes(app, pool) {
  const bearer = (req) => {
    const h = req.headers.authorization || '';
    return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
  };

  // Resolves the requesting user, or null for missing/unknown/expired tokens.
  async function currentUser(req) {
    const token = bearer(req);
    if (!token) return null;
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.mobile
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > NOW()
        LIMIT 1`,
      [sha256(token)]
    );
    return rows[0] || null;
  }

  // Wraps a handler that requires a signed-in user.
  const withUser = (handler) => async (req, res) => {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    return handler(req, res, user);
  };

  async function issueSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO user_sessions (token_hash, user_id, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [sha256(token), userId, SESSION_TTL_DAYS]
    );
    return token;
  }

  async function purgeExpired() {
    await pool.query('DELETE FROM user_sessions  WHERE expires_at < NOW()');
    await pool.query('DELETE FROM password_resets WHERE expires_at < NOW()');
  }

  const paths = (name) => [`/api/${name}`, `/api/${name}.php`];

  // ---- signup ------------------------------------------------------------
  app.post(paths('auth_signup'), async (req, res) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      // Drop spaces, dashes and any +91, then require exactly ten digits.
      const mobile = String(req.body?.mobile ?? '').replace(/[^0-9]/g, '');
      const password = String(req.body?.password ?? '');

      if (!name || name.length > 100) {
        return res.status(400).json({ success: false, error: 'Please enter your name.' });
      }
      if (!/^[0-9]{10}$/.test(mobile)) {
        return res.status(400).json({ success: false, error: 'Please enter a valid 10-digit mobile number.' });
      }
      if (!EMAIL_RE.test(email) || email.length > 190) {
        return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
      }
      if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
      }

      await purgeExpired();

      const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
      if (existing.length) {
        return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
      }

      const id = crypto.randomUUID();
      const hash = bcrypt.hashSync(password, 10);
      await pool.query(
        'INSERT INTO users (id, name, email, mobile, password_hash, last_login_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [id, name, email, mobile, hash]
      );

      res.json({ success: true, token: await issueSession(id), user: { id, name, email, mobile } });
    } catch (err) {
      console.error('signup failed:', err.message);
      res.status(500).json({ success: false, error: 'Could not create the account. Please try again.' });
    }
  });

  // ---- login -------------------------------------------------------------
  app.post(paths('auth_login'), async (req, res) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required.' });
      }

      await purgeExpired();

      const [rows] = await pool.query(
        'SELECT id, name, email, mobile, password_hash FROM users WHERE email = ? LIMIT 1',
        [email]
      );
      const user = rows[0];
      // Identical message for unknown email and wrong password, so this can't
      // be used to discover which addresses have accounts.
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ success: false, error: 'Incorrect email or password.' });
      }

      await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

      res.json({
        success: true,
        token: await issueSession(user.id),
        user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile },
      });
    } catch (err) {
      console.error('login failed:', err.message);
      res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
    }
  });

  // ---- session restore / logout -----------------------------------------
  app.get(paths('auth_me'), withUser(async (_req, res, user) => {
    res.json({ success: true, user });
  }));

  app.post(paths('auth_logout'), async (req, res) => {
    const token = bearer(req);
    if (token) {
      await pool.query('DELETE FROM user_sessions WHERE token_hash = ?', [sha256(token)]);
    }
    res.json({ success: true });
  });

  // ---- forgot / reset password ------------------------------------------
  app.post(paths('auth_forgot_password'), async (req, res) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
      }

      await purgeExpired();

      const [rows] = await pool.query('SELECT id, name FROM users WHERE email = ? LIMIT 1', [email]);
      if (rows.length) {
        const user = rows[0];
        await pool.query('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', [user.id]);

        const token = crypto.randomBytes(32).toString('hex');
        await pool.query(
          `INSERT INTO password_resets (token_hash, user_id, expires_at)
           VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
          [sha256(token), user.id, RESET_TTL_MINUTES]
        );

        // Dev has no mail transport — print the link so it can be followed
        // straight from the terminal. Production PHP sends a real email.
        const base = process.env.APP_BASE_URL || 'http://localhost:5173';
        console.log(`\n[dev] Password reset link for ${email}:\n  ${base}/reset-password?token=${token}\n`);
      }

      // Same response whether or not the account exists.
      res.json({ success: true, message: 'If that email has an account, a reset link is on its way.' });
    } catch (err) {
      console.error('forgot-password failed:', err.message);
      res.status(500).json({ success: false, error: 'Could not send the reset link.' });
    }
  });

  app.post(paths('auth_reset_password'), async (req, res) => {
    try {
      const token = String(req.body?.token ?? '').trim();
      const password = String(req.body?.password ?? '');
      if (!token) {
        return res.status(400).json({ success: false, error: 'This reset link is invalid.' });
      }
      if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
      }

      const hash = sha256(token);
      const [rows] = await pool.query(
        `SELECT user_id FROM password_resets
          WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1`,
        [hash]
      );
      if (!rows.length) {
        return res.status(400).json({
          success: false,
          error: 'This reset link has expired or already been used. Please request a new one.',
        });
      }

      const userId = rows[0].user_id;
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(password, 10), userId]);
      await pool.query('UPDATE password_resets SET used_at = NOW() WHERE token_hash = ?', [hash]);
      // Changing the password signs out every existing session.
      await pool.query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);

      res.json({ success: true, message: 'Password updated. You can now sign in.' });
    } catch (err) {
      console.error('reset-password failed:', err.message);
      res.status(500).json({ success: false, error: 'Could not reset the password.' });
    }
  });

  // ---- profile -----------------------------------------------------------
  app.post(paths('auth_update_profile'), withUser(async (req, res, user) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const mobile = String(req.body?.mobile ?? '').replace(/[^0-9]/g, '');

      if (!name || name.length > 100) {
        return res.status(400).json({ success: false, error: 'Please enter your name.' });
      }
      if (!EMAIL_RE.test(email) || email.length > 190) {
        return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
      }
      if (!/^[0-9]{10}$/.test(mobile)) {
        return res.status(400).json({ success: false, error: 'Please enter a valid 10-digit mobile number.' });
      }

      // Email is the login identifier, so it must stay unique — the user's own
      // row doesn't count as a clash.
      const [taken] = await pool.query(
        'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [email, user.id]
      );
      if (taken.length) {
        return res.status(409).json({ success: false, error: 'That email is already used by another account.' });
      }

      await pool.query('UPDATE users SET name = ?, email = ?, mobile = ? WHERE id = ?',
        [name, email, mobile, user.id]);

      res.json({ success: true, user: { id: user.id, name, email, mobile } });
    } catch (err) {
      console.error('update-profile failed:', err.message);
      res.status(500).json({ success: false, error: 'Could not save your changes.' });
    }
  }));

  app.post(paths('auth_change_password'), withUser(async (req, res, user) => {
    try {
      const current = String(req.body?.currentPassword ?? '');
      const next = String(req.body?.newPassword ?? '');

      if (!current) {
        return res.status(400).json({ success: false, error: 'Please enter your current password.' });
      }
      if (next.length < 8) {
        return res.status(400).json({ success: false, error: 'New password must be at least 8 characters.' });
      }

      const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [user.id]);
      // Proving knowledge of the current password stops someone with a
      // borrowed session from locking the real owner out.
      if (!rows.length || !bcrypt.compareSync(current, rows[0].password_hash)) {
        return res.status(401).json({ success: false, error: 'Your current password is incorrect.' });
      }

      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?',
        [bcrypt.hashSync(next, 10), user.id]);

      // Sign out other devices but keep this session alive.
      await pool.query('DELETE FROM user_sessions WHERE user_id = ? AND token_hash != ?',
        [user.id, sha256(bearer(req))]);

      res.json({ success: true, message: 'Password updated. Other devices have been signed out.' });
    } catch (err) {
      console.error('change-password failed:', err.message);
      res.status(500).json({ success: false, error: 'Could not change your password.' });
    }
  }));

  // ---- Interior tool workspace (per user) --------------------------------
  app.get(paths('interior_state'), withUser(async (_req, res, user) => {
    try {
      const [rows] = await pool.query(
        'SELECT data_key, data_json FROM interior_app_state WHERE user_id = ?',
        [user.id]
      );
      const stored = {};
      for (const r of rows) stored[r.data_key] = JSON.parse(r.data_json);

      const data = {};
      for (const [k, def] of Object.entries(INTERIOR_DEFAULTS)) {
        data[k] = k in stored ? stored[k] : def;
      }
      res.json({ success: true, isNew: rows.length === 0, data });
    } catch (err) {
      console.error('interior_state GET failed:', err.message);
      res.status(500).json({ success: false, error: 'Could not load your workspace.' });
    }
  }));

  app.post(paths('interior_state'), withUser(async (req, res, user) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ success: false, error: 'Request body must be a JSON object' });
      }
      const unknown = Object.keys(body).filter((k) => !(k in INTERIOR_DEFAULTS));
      if (unknown.length) {
        return res.status(400).json({ success: false, error: `Unknown key(s): ${unknown.join(', ')}` });
      }

      for (const [key, value] of Object.entries(body)) {
        await pool.query(
          `INSERT INTO interior_app_state (user_id, data_key, data_json)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE data_json = VALUES(data_json)`,
          [user.id, key, JSON.stringify(value)]
        );
      }
      res.json({ success: true });
    } catch (err) {
      console.error('interior_state POST failed:', err.message);
      res.status(500).json({ success: false, error: 'Could not save changes.' });
    }
  }));

  // ---- Project Design files (CAD PDFs, final renders) ---------------------
  // Signed-in users only. The extension comes from the detected type, never
  // from the uploaded filename, and the name is random so URLs can't be guessed.
  const designDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/uploads/design');
  const DESIGN_TYPES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  const DESIGN_MAX_MB = 25;
  const designUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => { fs.mkdirSync(designDir, { recursive: true }); cb(null, designDir); },
      filename: (_req, file, cb) => cb(null, `${Date.now()}_${crypto.randomBytes(12).toString('hex')}${DESIGN_TYPES[file.mimetype]}`),
    }),
    limits: { fileSize: DESIGN_MAX_MB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, !!DESIGN_TYPES[file.mimetype]),
  }).single('file');

  app.post(paths('upload_design_file'), withUser((req, res) => {
    designUpload(req, res, (err) => {
      if (err) {
        const tooBig = err.code === 'LIMIT_FILE_SIZE';
        return res.status(400).json({ success: false, error: tooBig ? `File too large. Maximum ${DESIGN_MAX_MB}MB.` : 'Upload failed.' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Only PDF, JPG, PNG or WEBP files are allowed.' });
      }
      if (req.file.mimetype === 'application/pdf') {
        const head = Buffer.alloc(5);
        const fd = fs.openSync(req.file.path, 'r');
        fs.readSync(fd, head, 0, 5, 0);
        fs.closeSync(fd);
        if (head.toString('latin1') !== '%PDF-') {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ success: false, error: 'That file is not a valid PDF.' });
        }
      }
      res.json({ success: true, url: `/uploads/design/${req.file.filename}`, size: req.file.size });
    });
  }));

  // ---- Customer share links ----------------------------------------------
  // The owner publishes a customer-safe snapshot of one project (rendered
  // quotation, mood boards, ...) under an unguessable code. The public view
  // endpoint serves ONLY that snapshot — never the owner's workspace — so
  // cost rates, profit and other customers' data can't leak through a link.
  const PIN_RE = /^\d{4,8}$/;
  const CODE_RE = /^[a-f0-9]{32}$/;
  const MAX_PIN_FAILS = 5;
  const LOCK_MINUTES = 15;

  let shareTableReady = null;
  const ensureShareTable = () => {
    if (!shareTableReady) {
      shareTableReady = pool.query(
        `CREATE TABLE IF NOT EXISTS interior_shares (
           code          CHAR(32)    NOT NULL,
           user_id       VARCHAR(36) NOT NULL,
           project_id    VARCHAR(64) NOT NULL,
           pin_hash      VARCHAR(255) NULL,
           pin_plain     VARCHAR(8)  NULL,
           enabled       TINYINT(1)  NOT NULL DEFAULT 1,
           snapshot_json LONGTEXT    NOT NULL,
           fail_count    INT         NOT NULL DEFAULT 0,
           locked_until  DATETIME    NULL,
           created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           PRIMARY KEY (code),
           UNIQUE KEY uq_share_project (user_id, project_id),
           CONSTRAINT fk_share_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      ).then(async () => {
        // Tables made before the owner could view the PIN lack this column.
        const [cols] = await pool.query("SHOW COLUMNS FROM interior_shares LIKE 'pin_plain'");
        if (cols.length === 0) await pool.query('ALTER TABLE interior_shares ADD COLUMN pin_plain VARCHAR(8) NULL AFTER pin_hash');
      }).catch((err) => { shareTableReady = null; throw err; });
    }
    return shareTableReady;
  };

  const shareMeta = (row) => row && ({
    code: row.code,
    enabled: !!row.enabled,
    hasPin: !!row.pin_hash,
    // Shown to the signed-in owner only (never by the public view endpoint).
    // null for a PIN set before this was kept — resetting it fills it in.
    pin: row.pin_plain || null,
    updatedAt: row.updated_at,
  });

  const loadShare = async (userId, projectId) => {
    const [rows] = await pool.query(
      'SELECT code, enabled, pin_hash, pin_plain, updated_at FROM interior_shares WHERE user_id = ? AND project_id = ? LIMIT 1',
      [userId, String(projectId)]
    );
    return rows[0] || null;
  };

  app.get(paths('interior_share'), withUser(async (req, res, user) => {
    try {
      await ensureShareTable();
      const projectId = String(req.query.projectId || '');
      if (!projectId) return res.status(400).json({ success: false, error: 'projectId is required' });
      res.json({ success: true, share: shareMeta(await loadShare(user.id, projectId)) });
    } catch (err) {
      console.error('interior_share GET failed:', err.message);
      res.status(500).json({ success: false, error: 'Could not load the share settings.' });
    }
  }));

  app.post(paths('interior_share'), withUser(async (req, res, user) => {
    try {
      await ensureShareTable();
      const { action, snapshot, pin, enabled } = req.body || {};
      const projectId = String((req.body || {}).projectId || '');
      if (!projectId) return res.status(400).json({ success: false, error: 'projectId is required' });

      const existing = await loadShare(user.id, projectId);
      const hashPin = async (p) => (p === '' ? null : bcrypt.hash(p, 10));
      const badPin = pin !== undefined && pin !== null && pin !== '' && !PIN_RE.test(String(pin));
      if (badPin) return res.status(400).json({ success: false, error: 'PIN must be 4 to 8 digits.' });

      if (action === 'publish') {
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
          return res.status(400).json({ success: false, error: 'Nothing to publish.' });
        }
        const json = JSON.stringify(snapshot);
        if (existing) {
          const sets = ['snapshot_json = ?'];
          const args = [json];
          if (pin !== undefined && pin !== null) { sets.push('pin_hash = ?', 'pin_plain = ?', 'fail_count = 0', 'locked_until = NULL'); args.push(await hashPin(String(pin)), String(pin) || null); }
          await pool.query(`UPDATE interior_shares SET ${sets.join(', ')} WHERE code = ?`, [...args, existing.code]);
        } else {
          const code = crypto.randomBytes(16).toString('hex');
          const hash = pin ? await hashPin(String(pin)) : null;
          await pool.query(
            'INSERT INTO interior_shares (code, user_id, project_id, pin_hash, pin_plain, snapshot_json) VALUES (?, ?, ?, ?, ?, ?)',
            [code, user.id, projectId, hash, pin ? String(pin) : null, json]
          );
        }
        return res.json({ success: true, share: shareMeta(await loadShare(user.id, projectId)) });
      }

      if (!existing) return res.status(404).json({ success: false, error: 'This project has no share link yet.' });

      if (action === 'setpin') {
        // '' removes the PIN; digits set/reset it and clear any lockout.
        await pool.query(
          'UPDATE interior_shares SET pin_hash = ?, pin_plain = ?, fail_count = 0, locked_until = NULL WHERE code = ?',
          [await hashPin(String(pin ?? '')), pin ? String(pin) : null, existing.code]
        );
      } else if (action === 'toggle') {
        await pool.query('UPDATE interior_shares SET enabled = ? WHERE code = ?', [enabled ? 1 : 0, existing.code]);
      } else if (action === 'regenerate') {
        await pool.query('UPDATE interior_shares SET code = ? WHERE code = ?', [crypto.randomBytes(16).toString('hex'), existing.code]);
      } else if (action === 'delete') {
        await pool.query('DELETE FROM interior_shares WHERE code = ?', [existing.code]);
        return res.json({ success: true, share: null });
      } else {
        return res.status(400).json({ success: false, error: 'Unknown action.' });
      }
      res.json({ success: true, share: shareMeta(await loadShare(user.id, projectId)) });
    } catch (err) {
      console.error('interior_share POST failed:', err.message);
      res.status(500).json({ success: false, error: 'Could not update the share link.' });
    }
  }));

  // Public — no login. Customer opens /view/<code>; POST so the PIN never
  // lands in a URL, server log or browser history.
  app.post(paths('interior_share_view'), async (req, res) => {
    try {
      await ensureShareTable();
      const { code, pin } = req.body || {};
      if (typeof code !== 'string' || !CODE_RE.test(code)) {
        return res.status(404).json({ success: false, error: 'This link is not available.' });
      }
      const [rows] = await pool.query(
        'SELECT enabled, pin_hash, snapshot_json, fail_count, locked_until, (locked_until > NOW()) AS locked FROM interior_shares WHERE code = ? LIMIT 1',
        [code]
      );
      const row = rows[0];
      if (!row || !row.enabled) {
        return res.status(404).json({ success: false, error: 'This link is not available.' });
      }
      if (row.pin_hash) {
        if (row.locked) {
          return res.status(429).json({ success: false, error: `Too many wrong PINs. Please try again in ${LOCK_MINUTES} minutes.` });
        }
        if (pin === undefined || pin === null || pin === '') {
          return res.json({ success: true, pinRequired: true });
        }
        const ok = await bcrypt.compare(String(pin), row.pin_hash);
        if (!ok) {
          const fails = row.fail_count + 1;
          if (fails >= MAX_PIN_FAILS) {
            await pool.query('UPDATE interior_shares SET fail_count = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE code = ?', [LOCK_MINUTES, code]);
            return res.status(429).json({ success: false, error: `Too many wrong PINs. Please try again in ${LOCK_MINUTES} minutes.` });
          }
          await pool.query('UPDATE interior_shares SET fail_count = ? WHERE code = ?', [fails, code]);
          return res.status(401).json({ success: false, error: `Incorrect PIN. ${MAX_PIN_FAILS - fails} attempt(s) left.` });
        }
        if (row.fail_count) await pool.query('UPDATE interior_shares SET fail_count = 0 WHERE code = ?', [code]);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, data: JSON.parse(row.snapshot_json) });
    } catch (err) {
      console.error('interior_share_view failed:', err.message);
      res.status(500).json({ success: false, error: 'Could not open this link. Please try again.' });
    }
  });
}
