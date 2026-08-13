export const MAX_ROWS = 500;

const WRITE_KEYWORDS = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE', 'CREATE'];

// Word-boundary, case-insensitive check for standalone write/DDL keywords —
// rejects before any DB round-trip. Runs ahead of the DB-side statement
// timeout and row cap as the first layer of defense-in-depth.
export function rejectIfUnsafe(sql) {
  for (const keyword of WRITE_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
    if (pattern.test(sql)) {
      return `Query rejected: contains a write/DDL keyword ('${keyword}'). This tool is strictly read-only.`;
    }
  }
  return null;
}

export function wrapWithLimit(sql) {
  return `SELECT * FROM (${sql}) AS q LIMIT ${MAX_ROWS + 1}`;
}

export function applyRowCap(rows) {
  if (rows.length > MAX_ROWS) {
    return { rows: rows.slice(0, MAX_ROWS), truncated: true };
  }
  return { rows, truncated: false };
}
