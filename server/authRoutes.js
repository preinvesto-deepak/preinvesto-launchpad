// Local-dev mirror of the auth + Interior-tool PHP endpoints in public/api/.
// Same tables, same request/response shapes, so the React app is identical
// against either backend. Production serves the .php files; `npm run dev`
// proxies /api to this Express server instead.
//
// Passwords use bcrypt so hashes are interchangeable with PHP's
// password_hash()/password_verify().

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SESSION_TTL_DAYS = 30;
const RESET_TTL_MINUTES = 60;

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
  generatedParts: [],
  configuredWardrobe: null,
  wardrobeRecords: [],
  editingWardrobeRecordId: null,
  materialStockSettings: {},
  kerfWidth: 0,
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
      `SELECT u.id, u.name, u.email
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) {
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

      res.json({ success: true, token: await issueSession(id), user: { id, name, email } });
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
        'SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1',
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
        user: { id: user.id, name: user.name, email: user.email },
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
}
