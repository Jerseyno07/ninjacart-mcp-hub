# GRN Flow (Goods Receipt at PM Store)

## What it is
A GRN (Goods Receipt Note) is how a PM Store Executive records a vendor delivery arriving against an open Purchase Order line.

## Process
1. Open the GRN tab, select the open PO being received against.
2. Enter received quantity and date.
3. Attach a photo of the invoice — required, not optional.
4. Submit — posts a `stock_ledger` entry (`GRN_INWARD`) and updates the PO's `received_qty_cache`.

## Partial delivery is normal
If the received quantity is less than the full PO quantity, the PO stays open (`PARTIALLY_RECEIVED`) so a later GRN can be posted against the same PO when the remaining stock arrives. This is not an error state — it's the expected path for staggered vendor deliveries.

## Closing a PO early: Force Complete
If the vendor confirms no more stock is coming on an open PO, the PM Store Exec uses **Force Complete**:
- Must type a reason (e.g. "Vendor confirmed no balance stock").
- Must then type the literal word `FORCE` in a second confirmation box before the button activates.
- This two-step confirmation exists specifically because closing a PO early is harder to undo than most other actions in the system.
- Once force-completed, no further GRNs are allowed against that PO.
- An admin can reverse a force-complete from the Admin Portal if it was done in error (see `admin_reversals` table).

## Status reference
`OPEN` → `PARTIALLY_RECEIVED` → `CLOSED`, or `CANCELLED` / `FORCE_COMPLETED` at any point after opening.
