const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_WEBHOOK_DOMAINS = [
  'hooks.slack.com',
  'api.pagerduty.com',
  'events.hookdeck.com',
];

async function registerWebhook(req, res) {
  const { name, url, events } = req.body;

  if (!name || !url || !events) {
    return res.status(400).json({ error: 'Name, URL, and events required' });
  }

  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'At least one event type required' });
  }

  const webhookSecret = crypto.randomBytes(32).toString('hex');

  try {
    const result = await db.query(
      'INSERT INTO webhooks (user_id, name, url, events, secret) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, url, events',
      [req.user.id, name, url, JSON.stringify(events), webhookSecret]
    );

    res.status(201).json({
      ...result.rows[0],
      secret: webhookSecret,
      message: 'Store the secret securely for signature verification.',
    });
  } catch (err) {
    console.error('Webhook creation error:', err);
    res.status(500).json({ error: 'Failed to create webhook' });
  }
}

async function testWebhook(req, res) {
  try {
    const result = await db.query(
      'SELECT id, url, secret FROM webhooks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const webhook = result.rows[0];
    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook delivery' },
    };

    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(JSON.stringify(testPayload))
      .digest('hex');

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
      },
      body: JSON.stringify(testPayload),
      timeout: 10000,
    });

    res.json({
      delivered: true,
      statusCode: response.status,
      message: 'Test webhook sent successfully',
    });
  } catch (err) {
    console.error('Webhook test error:', err);
    res.json({
      delivered: false,
      error: err.message,
      message: 'Failed to deliver test webhook',
    });
  }
}

async function sendNotification(req, res) {
  const { url, payload } = req.body;

  if (!url || !payload) {
    return res.status(400).json({ error: 'URL and payload required' });
  }

  try {
    const parsedUrl = new URL(url);
    const isDomainAllowed = ALLOWED_WEBHOOK_DOMAINS.some(
      domain => parsedUrl.hostname === domain
    );

    if (!isDomainAllowed) {
      return res.status(403).json({ error: 'Domain not in allowlist' });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 5000,
    });

    res.json({
      delivered: response.ok,
      statusCode: response.status,
    });
  } catch (err) {
    console.error('Notification error:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
}

router.post('/', authenticateToken, requireRole('admin', 'manager'), registerWebhook);
router.post('/:id/test', authenticateToken, testWebhook);
router.post('/notifications/send', authenticateToken, requireRole('admin'), sendNotification);

module.exports = router;
