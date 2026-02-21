import mysql from 'mysql2/promise';

const LOCAL_URL = 'mysql://root@localhost:3306/gro_portal';
const RAILWAY_URL = process.argv[2];

if (!RAILWAY_URL) {
  console.error('Usage: node scripts/import-to-railway.js <railway-url>');
  process.exit(1);
}

const TABLES = ['users', 'invoices', 'tasks', 'leads'];

const local = await mysql.createConnection(LOCAL_URL);
const railway = await mysql.createConnection(RAILWAY_URL);

for (const table of TABLES) {
  let rows;
  try {
    [rows] = await local.execute(`SELECT * FROM \`${table}\``);
  } catch {
    console.log(`⚠ Skipping ${table} (not found locally)`);
    continue;
  }

  if (!rows.length) {
    console.log(`– ${table}: empty, skipping`);
    continue;
  }

  // Clear existing rows then insert
  await railway.execute(`DELETE FROM \`${table}\``);

  for (const row of rows) {
    const cols = Object.keys(row).map(k => `\`${k}\``).join(', ');
    const placeholders = Object.keys(row).map(() => '?').join(', ');
    const vals = Object.values(row).map(v => v instanceof Date ? v : v);
    await railway.execute(
      `INSERT INTO \`${table}\` (${cols}) VALUES (${placeholders})`,
      vals
    );
  }

  console.log(`✓ ${table}: ${rows.length} rows imported`);
}

await local.end();
await railway.end();
console.log('\nDone! Refresh your Railway app.');
