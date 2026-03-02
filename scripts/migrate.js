import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import { join } from 'path';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('No DATABASE_URL set, skipping migrations');
  process.exit(0);
}

console.log('Running database migrations...');
const connection = await mysql.createConnection(DATABASE_URL);

// Pre-flight: handle any migration that has columns which may already partially exist.
// This happens when a multi-statement migration partially applied before failing.
// We run each statement individually and skip ER_DUP_FIELDNAME (1060) / ER_DUP_KEYNAME (1061).
const SAFE_MIGRATIONS = [
  'drizzle/0027_campaign_share_token.sql',
  'drizzle/0028_post_video.sql',
];

for (const relPath of SAFE_MIGRATIONS) {
  const filePath = join(process.cwd(), relPath);
  let fileContent;
  try {
    fileContent = readFileSync(filePath).toString();
  } catch {
    continue; // file doesn't exist, skip
  }

  const hash = createHash('sha256').update(fileContent).digest('hex');

  // Ensure migrations table exists before querying it
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
      id SERIAL PRIMARY KEY NOT NULL,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const [rows] = await connection.execute(
    'SELECT id FROM `__drizzle_migrations` WHERE hash = ?',
    [hash]
  );

  if (rows.length > 0) {
    continue; // already applied
  }

  console.log(`Pre-flight: applying ${relPath} statement-by-statement...`);

  // Split on the --> statement-breakpoint marker OR on semicolons followed by newlines
  const statements = fileContent
    .split(/--> statement-breakpoint/)
    .flatMap(chunk => chunk.split(/;\s*\n/))
    .map(s => s.trim().replace(/;$/, ''))
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      await connection.execute(stmt);
    } catch (err) {
      if (err.errno === 1060 || err.errno === 1061 || err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME') {
        console.log(`  Skipped (already exists): ${stmt.substring(0, 80)}`);
        continue;
      }
      throw err;
    }
  }

  // Mark as applied with the exact hash Drizzle would compute
  await connection.execute(
    'INSERT INTO `__drizzle_migrations` (hash, created_at) VALUES (?, ?)',
    [hash, Date.now()]
  );
  console.log(`  ✓ Pre-flight complete for ${relPath}`);
}

// Run remaining migrations via Drizzle as normal
const db = drizzle(connection);
await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
await connection.end();
console.log('Migrations complete ✓');
