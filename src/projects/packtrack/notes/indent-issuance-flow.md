# Indent → Issue → Receipt Flow

## Stage semantics
This is the outward path: an FC/CC facility requests material (indent), PM Store dispatches it
(issue), and the facility acknowledges what actually arrived (receipt).

1. **Indent** — an Admin (on behalf of CC_EXEC/FC_EXEC/CC_DP/FC_DP) uploads a CSV of material
   requests for a facility. The indent date is picked once per upload, not per row — every row in
   that file shares the same `indent_date`. One row per (facility + material) combination.
   Required columns: `facility_code`, `sku_code`, and either `requested_qty` (non-roll materials)
   or `no_of_rolls` (roll-type materials). A duplicate (facility + material + date) combination
   hard-rejects the whole upload, same as PO uploads.

2. **Issue** — a PM Store Executive opens "Issue Against Indent", picks a pending indent line, sees
   the expected quantity plus live on-hand stock at both PM Store and the destination facility,
   confirms a dispatch quantity and vehicle number, and submits. This posts a `stock_issues` row and
   an `ISSUE_OUT` ledger entry, deducting PM Store stock immediately (dispatch, not delivery).
   If PM Store can't fulfil the full indent quantity, the same Force Complete pattern applies:
   type a reason, the indent line closes with whatever was actually dispatched, and the unfulfilled
   remainder is **not** silently carried forward — a fresh indent line is needed if more stock
   arrives later.

3. **Receipt** — the FC/CC Executive acknowledges the dispatch. If the received quantity matches
   the dispatched quantity exactly, "Confirm Receipt" closes the shipment and credits the facility's
   stock. If less arrived, a reason is required and "Force Complete" closes the shipment with the
   actual received quantity — the shortfall is recorded in the audit log, not routed as a formal
   vendor/PM-Store claim (that's a manual follow-up outside PackTrack). Zero receipt (nothing
   arrived) is also a supported explicit action — "Confirm Zero Receipt & Close Issue" — rather than
   leaving a dispatch open indefinitely.

## Status reference
- **Indent lines**: `PENDING` → `PARTIALLY_ISSUED` → `FULLY_ISSUED`, or `CANCELLED` / `FORCE_COMPLETED`.
- **Stock issues**: `DISPATCHED` (awaiting receipt) → `PARTIALLY_RECEIVED` → `RECEIVED`, or
  `CANCELLED` / `FORCE_COMPLETED`.

## Force Complete — one concept, three screens
"Force Complete" appears on PO/GRN, Indent Issue, and Stock Receipt screens. It always means the
same thing conceptually — close this record now, short of the originally expected quantity, and
record why — but it's a **different status column on a different table** each time
(`purchase_orders.status`, `indent_lines.status`, `stock_issues.status`). Never assume a
`FORCE_COMPLETED` row means the same specific event across tables; always check which table/record
you're looking at. Use it for genuine short deliveries or supply shortfalls, never as a workaround
for a data-entry mistake — a typo is better fixed by an admin reversal than papered over with a
force-complete, since the latter creates an audit-log discrepancy that doesn't reflect reality.
