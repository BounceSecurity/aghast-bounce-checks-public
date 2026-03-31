const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

async function createOrder(req, res) {
  const { productId, quantity } = req.body;

  if (!productId || !quantity || quantity < 1) {
    return res.status(400).json({ error: 'Valid product ID and quantity required' });
  }

  try {
    const product = await db.query(
      'SELECT id, name, price, stock_count FROM products WHERE id = $1',
      [productId]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const item = product.rows[0];

    if (item.stock_count < quantity) {
      return res.status(409).json({ error: 'Insufficient stock' });
    }

    const totalPrice = item.price * quantity;

    await db.query(
      'UPDATE products SET stock_count = stock_count - $1 WHERE id = $2',
      [quantity, productId]
    );

    const order = await db.query(
      'INSERT INTO orders (user_id, product_id, quantity, total_price, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, status',
      [req.user.id, productId, quantity, totalPrice, 'confirmed']
    );

    res.status(201).json({
      orderId: order.rows[0].id,
      product: item.name,
      quantity,
      totalPrice,
      status: 'confirmed',
    });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
}

async function createBulkOrder(req, res) {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array required' });
  }

  for (const item of items) {
    if (!item.productId || !item.quantity || item.quantity < 1) {
      return res.status(400).json({ error: 'Each item requires a valid productId and quantity' });
    }
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const orderResults = [];

    for (const item of items) {
      const product = await client.query(
        'SELECT id, name, price, stock_count FROM products WHERE id = $1 FOR UPDATE',
        [item.productId]
      );

      if (product.rows.length === 0) {
        throw new Error(`Product ${item.productId} not found`);
      }

      const prod = product.rows[0];

      if (prod.stock_count < item.quantity) {
        throw new Error(`Insufficient stock for ${prod.name}`);
      }

      await client.query(
        'UPDATE products SET stock_count = stock_count - $1 WHERE id = $2',
        [item.quantity, item.productId]
      );

      const order = await client.query(
        'INSERT INTO orders (user_id, product_id, quantity, total_price, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [req.user.id, item.productId, item.quantity, prod.price * item.quantity, 'confirmed']
      );

      orderResults.push({
        orderId: order.rows[0].id,
        product: prod.name,
        quantity: item.quantity,
        totalPrice: prod.price * item.quantity,
      });
    }

    await client.query('COMMIT');
    res.status(201).json({ orders: orderResults });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk order error:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
}

async function getOrder(req, res) {
  try {
    const result = await db.query(
      'SELECT o.*, p.name as product_name FROM orders o JOIN products p ON o.product_id = p.id WHERE o.id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Order fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
}

router.post('/', authenticateToken, createOrder);
router.post('/bulk', authenticateToken, createBulkOrder);
router.get('/:id', authenticateToken, getOrder);

module.exports = router;
