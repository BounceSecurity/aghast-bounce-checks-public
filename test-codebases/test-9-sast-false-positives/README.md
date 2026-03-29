# Test Codebase: SAST Finding Verification

A minimal Flask application designed to test sarif-verify checks. Contains routes that handle user input in various ways across common vulnerability categories.

## Routes

### Search (`app/routes/search.py`)
- `/search` — Renders search results using Jinja2 templates
- `/help` — Displays a static help page with a Markup banner
- `/echo` — Echoes user input back as an HTML response

### Redirects (`app/routes/redirect_handler.py`)
- `/goto` — Redirects to a URL after validating against an allowlist
- `/out` — Redirects to a user-supplied URL

### Proxy (`app/routes/proxy.py`)
- `/api/user/<id>` — Proxies requests to an internal API service
- `/fetch` — Fetches content from a user-supplied URL
