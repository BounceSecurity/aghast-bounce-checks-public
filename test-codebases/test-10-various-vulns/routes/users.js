const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

async function getMyProfile(req, res) {
  try {
    const result = await db.query(
      'SELECT id, email, name, role, department, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('User fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}

async function updateUser(req, res) {
  const targetUserId = parseInt(req.params.id, 10);

  if (req.user.id !== targetUserId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Cannot modify other users' });
  }

  const updates = req.body;
  const allowedFields = ['name', 'email', 'department', 'role', 'notification_preferences'];

  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = $${paramIndex++}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  values.push(targetUserId);

  try {
    const result = await db.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING id, email, name, role, department`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('User update error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
}

async function createUser(req, res) {
  const { email, password, name, role, department } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name required' });
  }

  const validRoles = ['viewer', 'operator', 'manager', 'admin'];
  const userRole = validRoles.includes(role) ? role : 'viewer';

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await db.query(
      'INSERT INTO users (email, password_hash, name, role, department) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role, department',
      [email, passwordHash, name, userRole, department]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error('User creation error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
}

async function changePassword(req, res) {
  const targetUserId = parseInt(req.params.id, 10);
  const { currentPassword, newPassword } = req.body;

  if (req.user.id !== targetUserId) {
    return res.status(403).json({ error: 'Cannot change other users\' passwords' });
  }

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const result = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [targetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, targetUserId]);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
}

router.get('/me', authenticateToken, getMyProfile);
router.put('/:id', authenticateToken, updateUser);
router.post('/', authenticateToken, requireRole('admin'), createUser);
router.put('/:id/password', authenticateToken, changePassword);

module.exports = router;
