# PO Upload Validations

## Where and who
Admin Portal → Purchase Orders → Upload Purchase Orders. Uploaded by ADMIN or PM_STORE_EXEC.

## Required columns
- `po_no` — must be unique per material; the same PO number can repeat across rows only if each row is a different material.
- `vendor_name` — free text, no need to match an existing vendor list.
- `sku_code` — must match an existing, active material code exactly.
- `pm_store_code` — must match an active PM Store facility code.
- `po_qty` — required for non-roll materials. For butter paper specifically, entered in **Kg**; the system converts to pieces automatically.
- `no_of_rolls` — required instead of `po_qty` for roll-type materials (net rolls, ribbon rolls, sticker rolls).
- `unit_price` — numeric, zero is allowed.
- `po_date` — required.
- `expected_delivery` — optional.

## Whole-file validation
Every PO upload validates *all* rows before saving anything. One bad row rejects the entire file — nothing is partially saved. The response lists exactly which rows failed and why; fix those rows and re-upload the whole file.

## Duplicates are hard-blocked, not merged
If a row matches an existing (PO number + material) combination, the whole upload is rejected — there is no "add on top" behavior, to prevent accidental double-counting. Remove the duplicate line and re-upload.

## Common PO upload errors
- `Unknown sku_code 'X'` — material code doesn't exist or isn't active.
- `Unknown or non-PM-Store pm_store_code 'X'` — facility code typo or wrong facility type.
- `"No. of Rolls" is required for...` — left `no_of_rolls` blank for a roll-type material.
- `PO 'X' already has a line for material 'Y'` — duplicate (PO + material) combination.
- `Invalid po_date 'X'` — date format not recognized (use `DD/MM/YYYY` or `YYYY-MM-DD`; never `MM/DD/YYYY`, which is always misread as day-first).

## General upload rules (apply to PO, Indent, and SKU Master uploads alike)
- Accepted file types: `.csv`, `.xlsx`, `.xls`, max 10MB.
- Header row required, matched case-insensitively; spaces treated as underscores.
- Dates: `DD/MM/YYYY` or `YYYY-MM-DD` only — `MM/DD/YYYY` is always read day-first and will silently misinterpret the date, not error out.
- Any text field containing a comma (vendor name, remarks) must be wrapped in double quotes in the CSV, or the file will misparse from that column onward.
