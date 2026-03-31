const express = require('express');
const fetch = require('node-fetch');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const REPORT_SERVICE_BASE = process.env.REPORT_SERVICE_URL || 'https://reports.internal.example.com';

async function exportReport(req, res) {
  const { reportType, dateRange, format } = req.body;

  if (!reportType || !dateRange) {
    return res.status(400).json({ error: 'Report type and date range required' });
  }

  const validTypes = ['inventory', 'orders', 'revenue'];
  if (!validTypes.includes(reportType)) {
    return res.status(400).json({ error: 'Invalid report type' });
  }

  try {
    let data;

    if (reportType === 'inventory') {
      const result = await db.query(
        'SELECT name, stock_count, price, category FROM products ORDER BY category, name'
      );
      data = result.rows;
    } else if (reportType === 'orders') {
      const result = await db.query(
        'SELECT o.id, o.quantity, o.total_price, o.status, o.created_at, p.name as product FROM orders o JOIN products p ON o.product_id = p.id WHERE o.created_at BETWEEN $1 AND $2 ORDER BY o.created_at DESC',
        [dateRange.start, dateRange.end]
      );
      data = result.rows;
    } else {
      const result = await db.query(
        'SELECT DATE(created_at) as date, SUM(total_price) as revenue, COUNT(*) as order_count FROM orders WHERE created_at BETWEEN $1 AND $2 GROUP BY DATE(created_at) ORDER BY date',
        [dateRange.start, dateRange.end]
      );
      data = result.rows;
    }

    const exportUrl = `${REPORT_SERVICE_BASE}/api/render`;
    const response = await fetch(exportUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Auth': process.env.REPORT_SERVICE_KEY,
      },
      body: JSON.stringify({ data, format: format || 'pdf', reportType }),
    });

    if (!response.ok) {
      throw new Error(`Report service returned ${response.status}`);
    }

    const result = await response.json();
    res.json({ downloadUrl: result.url, expiresAt: result.expiresAt });
  } catch (err) {
    console.error('Report export error:', err);
    res.status(500).json({ error: 'Failed to export report' });
  }
}

async function exportCustomReport(req, res) {
  const { query, exportEndpoint } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query required' });
  }

  try {
    const result = await db.query(query);

    const targetUrl = exportEndpoint || `${REPORT_SERVICE_BASE}/api/render`;
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Auth': process.env.REPORT_SERVICE_KEY,
      },
      body: JSON.stringify({ data: result.rows, format: 'csv' }),
    });

    if (!response.ok) {
      throw new Error(`Export endpoint returned ${response.status}`);
    }

    const exportResult = await response.json();
    res.json({ downloadUrl: exportResult.url });
  } catch (err) {
    console.error('Custom export error:', err);
    res.status(500).json({ error: 'Failed to run custom export' });
  }
}

async function getDashboard(req, res) {
  try {
    const [products, orders, lowStock] = await Promise.all([
      db.query('SELECT COUNT(*) as total FROM products'),
      db.query('SELECT COUNT(*) as total, SUM(total_price) as revenue FROM orders WHERE status = $1', ['confirmed']),
      db.query('SELECT id, name, stock_count FROM products WHERE stock_count < $1 ORDER BY stock_count ASC LIMIT 10', [10]),
    ]);

    res.json({
      totalProducts: parseInt(products.rows[0].total),
      totalOrders: parseInt(orders.rows[0].total),
      totalRevenue: parseFloat(orders.rows[0].revenue) || 0,
      lowStockItems: lowStock.rows,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
}

router.post('/export', authenticateToken, requireRole('manager', 'admin'), exportReport);
router.post('/export/custom', authenticateToken, requireRole('admin'), exportCustomReport);
router.get('/dashboard', authenticateToken, getDashboard);

module.exports = router;
