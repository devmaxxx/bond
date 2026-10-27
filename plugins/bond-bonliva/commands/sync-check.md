---
description: Explain why an ERP accommodation taxation and its CRM booking disagree — given the two URLs — from live data, the sync chain's code and whether a fix is already on main and deployed
---

# /bond-bonliva:sync-check

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*). The check itself is read-only and needs no question; only a fix, a resync or a deploy watch does.

The short, chat-sized sibling of `/bond:investigate` for one recurring
question: "why isn't this taxation synced to the CRM?" — no write-up doc, the
answer in a few lines, then an offer to fix or to watch the deploy.

## Usage

```
/bond-bonliva:sync-check <erp taxation url> [<crm booking url>]
```

`erp-…/taxation/<uuid>` gives the taxation id; `crm-…/bookings/<ObjectId>/…`
the booking.

## Rules

- **Read-only until the cause is proven.** No save, resync or event before the
  user says so.
- **Verify a guess against live data before saying it.** A cause read off the
  code alone has been wrong — check the field that would prove it.
- **"By design" is an answer.** A subcontractor's zero tax, or lines the ERP
  deliberately does not send, is reported as such, with the rule's `file:line`.

## Steps

1. **Is it already fixed?** Read `docs/accommodations/taxation-crm-integration.md`
   in bonliva-erp, then `git fetch origin main` and scan `git log origin/main`
   for recent taxation/CRM-sync work. A fix merged but not deployed changes the
   answer: check the commit's deploy (`gh run list --commit <sha>`).
2. **Read the taxation live** — in claude-in-chrome on the ERP page
   (`javascript_tool` fetching the app's own `/api/proxy/api/taxation/<id>`,
   `…/crm-sync-status`, `…/activity`), or from the CLI with a minted token. Keep
   the JSON out of the conversation: print only these fields —
   `version` against `crmSyncedVersion`, `crmSyncStatus`,
   `recomputeBlockedReasons`, `bookingGroups`, `weeks`,
   `accommodationBookings[].paymentMethod`, and the consultant's
   `legalPersonType`.
3. **Match the two sides.** The booking in the CRM link must belong to one of
   the taxation's `bookingGroups` — a link to a different booking is the answer
   by itself. One stay crossing two booking groups is a known failure shape.
4. **Follow the events.** The `/debug/audit-log/feed?entityId=<id>` and
   `/debug/outbox?correlationId=<id>` endpoints: was
   `accommodation-taxation.changed` sent for the current version, did a
   sync-result come back, how many reconcile attempts ran.
5. **Read the sync chain** where the data points: the worker's
   `ac-taxation-sync` Hatchet flow and its result listener, the app-service
   `accommodation-taxation-crm-sync.service.ts`, and on the CRM side
   (bonliva-crm-nx) the ERP accommodation-taxation mirror service. Name the
   branch the data took, with `file:line`.
6. **Answer** in chat: the cause in one line, the evidence (fields and
   versions), `file:line`, and what would fix it — a code fix (on which ticket
   branch), a re-save, or a one-off resync event. Offer the fix and the deploy
   watch; a watch goes to a background agent.

## Do NOT

- Do not save the taxation, publish an event or resync before the user agrees.
- Do not report a cause the live fields do not show.
- Do not paste raw API JSON or tokens into the conversation.
