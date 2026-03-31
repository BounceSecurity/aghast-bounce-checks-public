# Inventory Management API

Internal REST API for managing product inventory, orders, and supplier integrations. Built with Express.js and PostgreSQL.

## Features

- Product and inventory management
- Order processing with stock reservation
- Supplier webhook integrations
- User management with role-based access
- API key authentication for service-to-service calls

## Setup

```bash
npm install
export DATABASE_URL=postgres://user:pass@localhost:5432/inventory
export JWT_SECRET=your-secret-key
npm start
```

## API Endpoints

- `POST /auth/login` — Authenticate and receive JWT
- `POST /auth/api-keys` — Generate API key for integrations
- `GET /products` — List products
- `POST /orders` — Place an order
- `PUT /users/:id` — Update user profile
- `POST /webhooks` — Register supplier webhook
- `POST /webhooks/:id/test` — Test a webhook endpoint
- `POST /reports/export` — Export report to external service
