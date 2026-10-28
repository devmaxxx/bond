---
name: insecure-defaults
description: Judges insecure default configuration in a diff or path — fallback secrets, default credentials, fail-open security switches, weak crypto, permissive access, debug leakage — each candidate traced to the security decision it reaches before it is reported. Use when reviewing code that adds or changes config lookups, env-var fallbacks, defaults, seeds, feature flags, CORS, TLS or debug settings.
allowed-tools: Read Grep Glob Bash
---

# Insecure defaults

Find the value a security control takes when nobody configured it, and report it
only when that value is insecure and reaches a security decision.

## Categories

Read only the corpus for the category a candidate belongs to. Each `.md` holds
**Report when** / **Skip when** and worked vulnerable/secure pairs; each `.json`
holds seed patterns (POSIX ERE).

| Category | Corpus |
|---|---|
| Fallback secrets | references/fallback-secrets.md |
| Default credentials | references/default-credentials.md |
| Fail-open switches | references/fail-open-security.md |
| Weak crypto | references/weak-crypto.md |
| Permissive access | references/permissive-access.md |
| Debug leakage | references/debug-features.md |

## Two shapes

- **Configurable** — a lookup with a fallback (`env.get('K', 'x')`). A bug only
  if the app can run with the fallback. `env['K']` crashes instead, so it is fine.
- **Unconditional** — insecure as written, no configuration anywhere. A missing
  env var is not grounds to drop one.

## Patterns

Seeds are a floor. Derive patterns from the stack: the project's own config
wrappers (flag any that can return a default), language idioms (`ENV.fetch`,
`System.getProperty(k, d)`, `${VAR:-default}`), and manifest formats
(`default =` in HCL, `ENV` in a Dockerfile).

## Verify — start at refuted, stop at the first step that kills it

1. Is the file reachable in production?
2. Is the insecure value the one that runs? Configurable: does it fail secure
   instead? Unconditional: this step cannot refute it.
3. Is the value actually insecure?
4. Does it reach a security decision? Cite the sink.
5. Configurable only: does every deployment supply the variable? Every manifest
   setting it lowers severity; none setting it is the critical case; a partial
   or unknown answer counts as reachable.

An incomplete trace is refuted. Committed credentials at scale are a job for
gitleaks or trufflehog, not this skill.
