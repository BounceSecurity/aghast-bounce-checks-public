const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/cart/items', async (req, res, next) => {
  try {
    const { product_id, quantity } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    const product = await db.query(
      'SELECT id, name, price, stock_count FROM products WHERE id = $1 AND active = true',
      [product_id]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.rows[0].stock_count < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    const existing = await db.query(
      'SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2',
      [req.user.id, product_id]
    );

    let item;
    if (existing.rows.length > 0) {
      const newQty = existing.rows[0].quantity + quantity;
      const result = await db.query(
        'UPDATE cart_items SET quantity = $1 WHERE id = $2 RETURNING *',
        [newQty, existing.rows[0].id]
      );
      item = result.rows[0];
    } else {
      const result = await db.query(
        'INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING *',
        [req.user.id, product_id, quantity]
      );
      item = result.rows[0];
    }

    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

router.post('/checkout', async (req, res, next) => {
  try {
    const { payment_method_id } = req.body;

    if (!payment_method_id) {
      return res.status(400).json({ error: 'Payment method is required' });
    }

    const cartItems = await db.query(
      `SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price, p.stock_count
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );

    if (cartItems.rows.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    for (const item of cartItems.rows) {
      if (item.stock_count < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${item.name}` });
      }
    }

    const totalResult = await db.query(
      `SELECT COALESCE(SUM(ci.quantity * p.price), 0) as total
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );
    let totalAmount = parseFloat(totalResult.rows[0].total);

    const appliedCoupons = await db.query(
      `SELECT ac.coupon_id, c.discount_percent, c.discount_amount
       FROM applied_coupons ac JOIN coupons c ON c.id = ac.coupon_id
       WHERE ac.user_id = $1 AND ac.redeemed = false`,
      [req.user.id]
    );

    for (const coupon of appliedCoupons.rows) {
      if (coupon.discount_percent) {
        totalAmount = totalAmount * (1 - coupon.discount_percent / 100);
      } else if (coupon.discount_amount) {
        totalAmount = totalAmount - coupon.discount_amount;
      }
    }

    if (totalAmount < 0) totalAmount = 0;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const order = await client.query(
        `INSERT INTO orders (user_id, total_amount, payment_id, status, created_at)
         VALUES ($1, $2, $3, 'confirmed', NOW()) RETURNING *`,
        [req.user.id, totalAmount, payment_method_id]
      );

      for (const item of cartItems.rows) {
        await client.query(
          'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
          [order.rows[0].id, item.product_id, item.quantity, item.price]
        );
        await client.query(
          'UPDATE products SET stock_count = stock_count - $1 WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }

      await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
      await client.query('COMMIT');

      res.status(201).json({ order: order.rows[0], total_charged: totalAmount });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/checkout/express', async (req, res, next) => {
  try {
    const { product_id, quantity, unit_price, payment_method_id } = req.body;

    if (!product_id || !quantity || !payment_method_id) {
      return res.status(400).json({ error: 'Product, quantity, and payment method are required' });
    }

    const product = await db.query(
      'SELECT id, name, price, stock_count FROM products WHERE id = $1 AND active = true',
      [product_id]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.rows[0].stock_count < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    const totalAmount = quantity * unit_price;

    const order = await db.query(
      `INSERT INTO orders (user_id, total_amount, payment_id, status, created_at)
       VALUES ($1, $2, $3, 'confirmed', NOW()) RETURNING *`,
      [req.user.id, totalAmount, payment_method_id]
    );

    await db.query(
      'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
      [order.rows[0].id, product_id, quantity, unit_price]
    );

    await db.query(
      'UPDATE products SET stock_count = stock_count - $1 WHERE id = $2',
      [quantity, product_id]
    );

    res.status(201).json({ order: order.rows[0], total_charged: totalAmount });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const orderResult = await db.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (order.status !== 'confirmed') {
      return res.status(400).json({ error: 'Only confirmed orders can be cancelled' });
    }

    const hoursAgo = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursAgo > 24) {
      return res.status(400).json({ error: 'Orders can only be cancelled within 24 hours' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        "UPDATE orders SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1",
        [req.params.id]
      );

      const items = await client.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
        [req.params.id]
      );

      for (const item of items.rows) {
        await client.query(
          'UPDATE products SET stock_count = stock_count + $1 WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }

      await client.query('COMMIT');
      res.json({ message: 'Order cancelled successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
