# Role Model

## Roles and apps
| Role | App | URL | Responsibility |
|---|---|---|---|
| `ADMIN` (Supply Chain team) | Admin Portal | `/` | Uploads POs, Indents, SKU Master. Full visibility, reversal/cancel powers, reports. |
| `PM_STORE_EXEC` | PM Store Ops | `/ops` | Posts GRN (vendor deliveries), issues stock against indents, runs physical audits at the PM Store. |
| `FC_EXEC` / `CC_EXEC` | Stock Receipt App | `/receipt` | Receives stock dispatched from PM Store, views consumption, runs physical audits at their facility. |
| `FC_DP` / `CC_DP` | Stock Receipt App | `/receipt` | Read-only variant of FC_EXEC/CC_EXEC — same views, cannot post receipts or run audits. |

## Facility scoping
Every non-admin user is tied to one or more specific facilities via `user_warehouses`. Everything
they see — stock, indents, audits — is automatically scoped to their assigned facility(ies). If a
facility is missing from someone's view, the fix is a facility assignment on their account, not a
bug in the data.

## Note on this MCP hub's own role model
The hub's own `roles.js` allowlist (who can sign in, which project's tools they can call) reuses
these same role names for familiarity, but is a **separate access-control layer** — it gates which
MCP tools someone can invoke, not which rows of PackTrack data a query returns. Today, `query_packtrack_db`
does not enforce PackTrack's own facility-level row scoping (e.g. a `CC_EXEC`'s hub access still
sees all facilities' data if they're granted the `packtrack` project) — this is a known gap, tracked
as an open risk, not an oversight.
