# Vertical — depth: one feature, all layers

Trace the change from its deepest layer (persistence / data) up to the
user-visible surface, layer by layer. A typical stack, adapt to what the repo
has:

1. **Persistence** — schema/entities, migrations, indexes, DB constraints, access
   policies (RLS, scoping).
2. **Data-access boundary** — is every scoped read going through the repo's
   sanctioned path (repository/guard/tenant scope), not a raw escape hatch?
3. **Domain / pure logic** — calculations and rules in a domain service or shared
   module, not inlined in a controller or component.
4. **API / transport** — handlers, request/response validation, guards,
   throttling, error mapping.
5. **Shared contracts** — DTOs/enums/types consumed by multiple sides; check for
   a local copy that has drifted from the single source.
6. **Workers / async** — queued jobs, schedules, external syncs: idempotent and
   safe to retry?
7. **UI** — data fetching, forms, cache invalidation, URL/state; loading/empty/
   error states.
8. **Security / privacy** — authn/authz at the right boundary, secrets, PII,
   public-endpoint gating.

For each layer the change touches, ask:

- Does the type/contract match the layer above and below? Did a local copy drift
  from the shared source of truth?
- Is the data-access / isolation boundary intact — scoped correctly, not bypassed
  by a raw query or a dropped transaction context?
- Do domain values use the repo's sanctioned representation (e.g. integer minor
  units for money, the project's date/calendar utility) end to end?
- Are validation and authorization at the **right** boundary — not duplicated,
  not missing?
- What happens on error, null, empty, or network loss? Is there a visible UX
  state for each?
- Are async effects idempotent and safe to retry?
