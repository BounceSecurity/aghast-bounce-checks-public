### Important Validations before performing an AI query

#### Overview
This check will verify that the target it has been provided (which sends queries to an AI backend) performs all required validations before forwarding the query.

#### What to Check
1. For the endpoint provided, verify that ALL of the following validations are performed before the query is sent to the AI backend:
   - **Role check**: The JWT token is inspected to confirm it contains a `"role": "manager"` entry. Requests without the manager role must be rejected.
   - **Query length check**: The length of the query text is validated to be less than 1000 characters. Queries exceeding this limit must be rejected.
   - **Business hours check**: The current time is checked to confirm it falls within business hours (9:00-17:00, Monday to Friday). Requests outside business hours must be rejected.
   - **Malicious prompt check**: The query is passed to the `checkForMaliciousPrompt` function and the result is checked. Queries flagged as malicious must be rejected.
3. It is critical to trace the full execution path for each endpoint. Follow the call chain from the route handler through any helper functions to verify that all four validations are actually invoked before the AI query is dispatched.
4. An endpoint that performs only some of the validations is still a failure. All four checks must be present for the endpoint to pass.
5. The reported location for the finding must be the API endpoint route handler where the missing validation should have been applied. The description should list which specific validations are missing.

#### Result
- **PASS**: The endpoint performs all four required validations (role check, query length check, business hours check, malicious prompt check) before dispatching the query
- **FAIL**: The endpoint sends a query to the AI backend without performing one or more of the required validations
