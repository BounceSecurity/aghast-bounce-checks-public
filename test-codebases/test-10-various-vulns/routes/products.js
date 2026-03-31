const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

async function listProducts(req, res) {
  const { category, minPrice, maxPrice, sort } = req.query;

  try {
    let query = 'SELECT id, name, description, price, stock_count, category FROM products WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(category);
    }

    if (minPrice) {
      query += ` AND price >= $${paramIndex++}`;
      params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
      query += ` AND price <= $${paramIndex++}`;
      params.push(parseFloat(maxPrice));
    }

    const allowedSorts = ['name', 'price', 'stock_count', 'created_at'];
    if (sort && allowedSorts.includes(sort)) {
      query += ` ORDER BY ${sort}`;
    } else {
      query += ' ORDER BY name';
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Product listing error:', err);
    res.status(500).json({ error: 'Failed to list products' });
  }
}

async function createProduct(req, res) {
  const { name, description, price, stockCount, category } = req.body;

  if (!name || price === undefined || stockCount === undefined) {
    return res.status(400).json({ error: 'Name, price, and stock count required' });
  }

  try {
    const result = await db.query(
      'INSERT INTO products (name, description, price, stock_count, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, description, price, stockCount, category]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Product creation error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
}

async function updateProduct(req, res) {
  const { name, description, price, stockCount, category } = req.body;

  try {
    const result = await db.query(
      'UPDATE products SET name = COALESCE($1, name), description = COALESCE($2, description), price = COALESCE($3, price), stock_count = COALESCE($4, stock_count), category = COALESCE($5, category) WHERE id = $6 RETURNING *',
      [name, description, price, stockCount, category, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Product update error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
}

router.get('/', authenticateToken, listProducts);
router.post('/', authenticateToken, requireRole('admin', 'manager'), createProduct);
router.put('/:id', authenticateToken, requireRole('admin', 'manager'), updateProduct);

module.exports = router;
