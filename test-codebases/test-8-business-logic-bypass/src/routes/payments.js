const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/coupons/apply', async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Coupon code is required' });
    }

    const couponResult = await db.query(
      `SELECT id, code, discount_percent, discount_amount, min_order_total,
              max_uses, current_uses, expires_at, active
       FROM coupons WHERE code = $1`,
      [code.toUpperCase()]
    );

    if (couponResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid coupon code' });
    }

    const coupon = couponResult.rows[0];

    if (!coupon.active) {
      return res.status(400).json({ error: 'Coupon is no longer active' });
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Coupon has expired' });
    }

    if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
      return res.status(400).json({ error: 'Coupon usage limit reached' });
    }

    if (coupon.min_order_total) {
      const cartTotal = await db.query(
        `SELECT COALESCE(SUM(ci.quantity * p.price), 0) as total
         FROM cart_items ci JOIN products p ON p.id = ci.product_id
         WHERE ci.user_id = $1`,
        [req.user.id]
      );
      if (parseFloat(cartTotal.rows[0].total) < coupon.min_order_total) {
        return res.status(400).json({
          error: `Minimum order total of $${coupon.min_order_total} required`
        });
      }
    }

    await db.query(
      'INSERT INTO applied_coupons (user_id, coupon_id, applied_at) VALUES ($1, $2, NOW())',
      [req.user.id, coupon.id]
    );

    res.json({ message: 'Coupon applied', discount_percent: coupon.discount_percent, discount_amount: coupon.discount_amount });
  } catch (err) {
    next(err);
  }
});

router.post('/refunds', async (req, res, next) => {
  try {
    const { order_id, amount, reason } = req.body;

    if (!order_id || !amount || !reason) {
      return res.status(400).json({ error: 'Order ID, amount, and reason are required' });
    }

    const order = await db.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [order_id, req.user.id]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.rows[0].status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot refund a cancelled order' });
    }

    const refund = await db.query(
      `INSERT INTO refunds (order_id, user_id, amount, reason, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW()) RETURNING *`,
      [order_id, req.user.id, amount, reason]
    );

    res.status(201).json({ refund: refund.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
