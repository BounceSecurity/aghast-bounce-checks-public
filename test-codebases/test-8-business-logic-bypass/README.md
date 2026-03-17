# ShopEasy - E-Commerce Platform

Internal e-commerce platform API. Handles shopping cart, checkout, coupons, refunds, wallet transfers, and gift cards.

## API Endpoints

### Orders (`/api/orders`)
- `POST /cart/items` - Add item to cart
- `POST /checkout` - Standard checkout with cart items
- `POST /checkout/express` - Express single-item checkout
- `POST /:id/cancel` - Cancel an order

### Payments (`/api/payments`)
- `POST /coupons/apply` - Apply coupon to cart
- `POST /refunds` - Request a refund

## Setup

```bash
npm install
npm start
```

Requires PostgreSQL via `DATABASE_URL` environment variable.
