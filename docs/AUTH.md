# Dashboard login

Customer data, billing, uploads, settings and API documentation are private. Anonymous visitors are redirected to `/login`; REST APIs return 401. There is no public registration and no default password.

## Existing installation

Back up the database, deploy the new code and install dependencies. As the site's OS user, from the project directory:

```bash
npm run db:migrate:auth
npm run auth:create-user -- admin
```

Choose your password at the hidden prompts (6–256 characters). Longer, unique passwords are recommended for real customer data. Do not put passwords on the command line, in Git, or in chat. The user ID can be 3–80 lowercase letters, numbers, dots, underscores or hyphens. Then:

```bash
npm run build
pm2 restart netdesk --update-env
```

Visit `/login`. New installations include the auth migration in `db:setup`; still create a user separately. On Windows use `npm.cmd` if PowerShell blocks npm scripts.

## Users and password resets

Run `auth:create-user -- another-user` to add a staff account. All accounts currently have full administrative dashboard access; this is not role-based access control. Re-run the command with an existing user ID to reset its password, explicitly confirm the reset, and revoke its sessions. No customer portal or public signup is enabled.

## Sessions and API clients

Passwords use salted Node.js scrypt hashes. Random 256-bit session tokens are stored only as SHA-256 hashes in MySQL, expire after eight hours and are revoked on logout. Disabling a user immediately blocks their sessions. Login is limited to ten attempts per account per fifteen-minute window; unknown users share a bucket. This is basic application throttling, not a replacement for reverse-proxy request limits.

Cookies are HttpOnly, SameSite=Lax and Secure in production. Use HTTPS on hosting. `AUTH_COOKIE_SECURE=false` is only for isolated local HTTP production-build testing. Cookie-authenticated writes require a same-origin Origin header. The host forwarded to Next.js by your reverse proxy must match the public host; do not rewrite it to localhost.

Dashboard login authorizes operations and MCP settings; staff do not need the MCP key in the UI. REST clients must now send `Authorization: Bearer YOUR_MCP_API_KEY` for all endpoints, including reads, or use a valid session cookie (same-origin Origin header required for cookie writes). `/api/auth/login` accepts `{ "username": "admin", "password": "..." }`. `/api/auth/session` returns the current user; POST `/api/auth/logout` revokes the current session.

`/mcp/v1` is unchanged: it requires its bearer key, never a dashboard cookie, and retains its origin policy. Rotate any previously shared MCP key. Preserve the `.env` and MySQL database on redeploy; no session-signing secret is required because sessions live in MySQL.

## Checks

Run `npm run db:migrate:auth` before tests. With an isolated local server running on port 3018:

```bash
npm run check:auth
```

It creates and removes its own user and checks access control, login/logout, CSRF, expiry, disabled users and throttling. Existing CRUD/operations tests use the API key; external unauthenticated clients now need to be updated.
