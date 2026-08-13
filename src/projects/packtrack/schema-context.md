# PackTrack Pro — Database Schema (for `query_packtrack_db` grounding)

Packaging material tracking: PM Store → FC/CC warehouse logistics. Read-only access via the
`mcp_readonly` Postgres role — `users` and `sessions` are excluded entirely (password hashes,
session tokens), so queries against them will fail with a permission error, not return rows.

## Table Index

| Table | Purpose |
|---|---|
| `warehouses` | PM Store, FC, and CC facilities |
| `materials` | Packaging material master (28 active SKUs) |
| `po_batches` / `purchase_orders` | Vendor PO upload batches / one row per material per PO |
| `goods_receipts` | Inward GRN records against a PO line |
| `indent_batches` / `indent_lines` | FC/CC material request uploads / one line per material |
| `stock_issues` | PM Store dispatches to FC/CC against an indent line |
| `stock_receipts` | FC/CC acknowledgement of a received dispatch |
| `stock_ledger` | **Append-only.** Every stock movement. Current stock = SUM(qty_delta) grouped by (warehouse_id, material_id) |
| `min_stock_levels` | Per-facility low-stock thresholds |
| `sku_packaging_master` | FSN → primary/secondary/tertiary PM code mapping |
| `consumption_runs` / `consumption_run_lines` | Daily consumption scraper log |
| `audit_entries` / `audit_entry_lines` | Physical stock count audits |
| `audit_log` | System-wide action trail (all API mutations) |
| `admin_reversals` | Admin cancel/reverse-force-complete records |

**Views** (read-only, derived, prefer these for common questions):
- `v_current_stock` — live on-hand qty + weighted avg cost per warehouse × material
- `v_po_schedule` — PO list with `remaining_qty = po_qty - received_qty_cache`
- `v_indent_to_process` — pending indent summary grouped by warehouse × material
- `v_low_stock_alerts` — warehouse × material rows where `on_hand_qty < min_qty`

## Enums
- `user_role`: `ADMIN` · `PM_STORE_EXEC` · `CC_EXEC` · `FC_EXEC` · `CC_DP` · `FC_DP`
- `warehouse_type`: `PM_STORE` · `CC` · `FC`
- `po_line_status`: `OPEN` → `PARTIALLY_RECEIVED` → `CLOSED` | `CANCELLED` | `FORCE_COMPLETED`
- `indent_line_status`: `PENDING` → `PARTIALLY_ISSUED` → `FULLY_ISSUED` | `CANCELLED` | `FORCE_COMPLETED`
- `issue_status`: `DISPATCHED` → `PARTIALLY_RECEIVED` → `RECEIVED` | `CANCELLED` | `FORCE_COMPLETED`
- `ledger_movement_type`: `GRN_INWARD` · `ISSUE_OUT` · `RECEIPT_IN` · `RECEIPT_SHORTAGE_WRITE_OFF` · `ADJUSTMENT` · `REVERSAL` · `CONSUMPTION` · `AUDIT_ADJUSTMENT`

## Flow
1. Admin uploads PO CSV → `po_batches` + `purchase_orders`
2. PM Store exec posts GRN → `goods_receipts` → updates `purchase_orders.received_qty_cache` + `stock_ledger` (GRN_INWARD)
3. FC/CC exec uploads indent → `indent_batches` + `indent_lines`
4. PM Store exec dispatches → `stock_issues` → updates `indent_lines.issued_qty` + `stock_ledger` (ISSUE_OUT)
5. FC/CC exec acknowledges → `stock_receipts` → `stock_ledger` (RECEIPT_IN, RECEIPT_SHORTAGE_WRITE_OFF if short)
6. Daily consumption scraper → `consumption_runs` + `consumption_run_lines` → `stock_ledger` (CONSUMPTION)
7. Physical audit → `audit_entries` + `audit_entry_lines` → `stock_ledger` (AUDIT_ADJUSTMENT)

## Behavioral gotchas (not obvious from column names — apply these when reasoning about results)

1. **`FORCE_COMPLETED` is a shared status string** across `indent_lines.status`, `stock_issues.status`,
   and `purchase_orders.status` — same string, different meaning per table, disambiguated only by
   context/`force_complete_reason`, never by the string alone. Don't assume a `FORCE_COMPLETED` row
   in one table means the same thing as in another.

2. **IST/UTC**: the database and server run in UTC. Any `date`/`timestamptz` column reasoning that
   needs to match "today" or a specific IST calendar date must account for IST = UTC+5:30 — a raw
   UTC date comparison can be off by a day around the UTC/IST boundary (18:30 UTC). When filtering
   by calendar date, prefer casting to `::text` in SQL or being explicit about the offset rather than
   assuming the stored value already reflects IST.

Full column-level reference (types, defaults, indexes, FKs): `packtrack-pro/docs/db-schema.md`.
