import pg from 'pg';

const { Pool } = pg;

// Dedicated read-only pool — never shared with another project's credentials.
// Connects as the `mcp_readonly` Postgres role (packtrack-pro/db/024_mcp_readonly_role.sql),
// which has SELECT on every table except `users`/`sessions` and a 10s statement_timeout
// enforced DB-side.
export const pool = new Pool({ connectionString: process.env.PACKTRACK_READONLY_DATABASE_URL, max: 5 });
