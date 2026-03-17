const express = require('express');
const helmet = require('helmet');
const db = require('./db');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');

const app = express();

app.use(helmet());
app.use(express.json());

app.use(async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const result = await db.query(
      'SELECT id, email, role, wallet_balance FROM users WHERE session_token = $1',
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ShopEasy API running on port ${PORT}`);
});

module.exports = app;
