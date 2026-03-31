const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db');
const { authenticateToken, signToken } = require('../middleware/auth');

const router = express.Router();

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await db.query(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(
      { userId: user.id, role: user.role },
      { expiresIn: '8h' }
    );

    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
}

async function createApiKey(req, res) {
  const { name, permissions } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'API key name required' });
  }

  const validPermissions = ['read', 'write'];
  const sanitizedPermissions = Array.isArray(permissions)
    ? permissions.filter(p => validPermissions.includes(p))
    : ['read'];
  const finalPermissions = sanitizedPermissions.length > 0 ? sanitizedPermissions : ['read'];

  const rawKey = `inv_${generateApiKey()}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  try {
    await db.query(
      'INSERT INTO api_keys (user_id, name, key_hash, permissions) VALUES ($1, $2, $3, $4)',
      [req.user.id, name, keyHash, finalPermissions]
    );

    res.status(201).json({
      key: rawKey,
      name,
      message: 'Store this key securely. It cannot be retrieved again.',
    });
  } catch (err) {
    console.error('API key creation error:', err);
    res.status(500).json({ error: 'Failed to create API key' });
  }
}

async function requestPasswordReset(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const resetToken = generateResetToken();
  const expiry = new Date(Date.now() + 3600000);

  try {
    await db.query(
      'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE email = $3',
      [resetToken, expiry, email]
    );

    res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
}

async function verifyApiKey(req, res) {
  const { apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'API key required' });
  }

  try {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const result = await db.query(
      'SELECT id FROM api_keys WHERE key_hash = $1 AND user_id = $2 AND revoked = false',
      [keyHash, req.user.id]
    );

    if (result.rows.length > 0) {
      res.json({ valid: true });
    } else {
      res.status(401).json({ valid: false });
    }
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
}

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

function generateResetToken() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

router.post('/login', login);
router.post('/api-keys', authenticateToken, createApiKey);
router.post('/password-reset', requestPasswordReset);
router.post('/verify-key', authenticateToken, verifyApiKey);

module.exports = router;
