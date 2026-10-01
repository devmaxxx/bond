# Security checklist — the questions

Ask each question of the changed lines and what they call. "Yes" to a question in
**bold** is a finding.

## secrets

- **Is a key, token, password or connection string written in code, a test fixture or a
  committed `.env`?** Move it to the secret store (Key Vault, CI secret) and rotate it —
  a committed secret is leaked even after the commit is reverted.
- Does a new variable fail fast at startup when missing, instead of running with `undefined`?
- **Is a secret sent to the client bundle** (`NEXT_PUBLIC_*`, Vite `VITE_*`, a config
  endpoint)?

## input

- Is every field validated at the boundary — DTO with `class-validator`/zod, `whitelist`
  and `forbidNonWhitelisted` on — before any service sees it?
- **Can a client set a field it should not** (`role`, `ownerId`, `price`, `status`) through
  mass assignment or a spread of the body?
- Are sizes bounded: string length, array length, page size, upload size?
- Is a webhook's signature verified before its payload is trusted?

## injection

- **Is any SQL built by string concatenation or template literal from input?** Use the
  ORM's parameters, `sql` tagged templates (Kysely), or `$1` placeholders.
- **Does a Mongo filter accept an object from input** (`{ $ne: null }` login bypass)?
  Cast to the expected scalar type first.
- **Does input reach `exec`, `spawn` with `shell: true`, `eval`, `new Function`, or a
  template engine?**
- Is a path built from input normalised and checked to stay under its root?

## authn/authz

- **Does every new route, resolver, queue handler and MCP tool sit behind the guard?**
  A route that is public on purpose says so in code.
- **Is an id from the request used to load a record without checking it belongs to the
  caller (IDOR)?** Scope the query by the caller's tenant or user id.
- Are JWTs verified with a pinned algorithm, issuer, audience and expiry?
- Does a role check happen on the server, not only by hiding a button?
- Can an AI agent through MCP do more than the user it acts for?

## web

- **Is user content rendered as HTML** (`dangerouslySetInnerHTML`, markdown without a
  sanitizer)?
- **Is a redirect target taken from input without an allow-list?**
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax` or stricter for session cookies?
- **Does CORS reflect any origin while allowing credentials?**
- Do state-changing requests from a cookie session carry CSRF protection?

## uploads

- Is the file type checked by content, not only extension or client MIME type?
- Is the stored name generated, never the client's filename?
- **Is the blob container or bucket public, or are SAS/presigned URLs long-lived?**

## exposure

- **Does a log line carry a token, password, personal number (BankID, PESEL), health
  data or a full request body?**
- Do error responses hide stack traces and SQL in production?
- Does a serializer return fields the caller should not see (`passwordHash`, internal notes)?

## abuse

- Is there a rate limit on login, OTP/SMS sending, password reset, signup and exports?
- **Can one request trigger unbounded work** — fan-out, N+1 over a user-sized list, an
  export of everything?
- Are ids guessable where enumeration matters (sequential ids on public URLs)?
