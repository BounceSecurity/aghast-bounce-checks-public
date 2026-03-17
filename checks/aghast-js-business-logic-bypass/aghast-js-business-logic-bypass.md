### Business Logic Bypass

#### Overview
This check detects endpoints that process financial operations (orders, payments, refunds, coupons) without properly validating the values provided by the client.

#### What to Check
1. For each endpoint that accepts a **quantity** (e.g., adding items to a cart), check whether the code validates that the quantity is a positive integer before using it. If negative or zero quantities are accepted, this is a finding.
2. For each endpoint that creates an **order or charges a price**, check whether the price/amount used in the calculation comes from the database or from the client request body. If the endpoint uses a client-supplied price instead of looking up the product's actual price from the database, this is a finding.
3. For each endpoint that **applies a coupon or discount**, check whether the code verifies that the same coupon has not already been applied to the user's cart. If the endpoint allows the same coupon to be applied repeatedly without checking for duplicates, this is a finding.
4. For each endpoint that creates a **refund**, check whether the code validates that the refund amount does not exceed the original order total. If the endpoint accepts any amount without comparing it to the order total, this is a finding.
5. An endpoint is NOT vulnerable if it fetches prices from the database, validates that amounts are positive, checks for duplicate coupons, or enforces refund limits. Trace the full execution path before concluding.

#### Result
- **PASS**: All financial endpoints validate their inputs against business constraints
- **FAIL**: One or more endpoints accept unvalidated client values in financial operations
