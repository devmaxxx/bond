# Horizontal — breadth: every sibling of a kind

For each **kind** of thing the change introduces or modifies, find all its peers
and check the change is consistent with them (or that the peers now need the same
fix). Map the generic kinds below onto the repo's reality:

- New shared DTO/enum/type field → every consumer across all sides that read it.
- New schema column → migration, access policy, seed/fixtures, any DTO exposing
  it, any invariant check.
- New endpoint → matching client/proxy/route, throttling category, auth-guard
  parity with sibling endpoints.
- New domain calculation → does it use the same value object / helper as every
  other one of its kind?
- New scoped query → does it go through the same data-access boundary as its
  peers?
- New user-facing string → present in every locale/translation catalog?
- New async job → follows the established scheduling / idempotency / dedupe
  pattern?
- New import → uses the repo's import-path convention (alias vs relative) like
  its siblings?
