import mysql from 'mysql2/promise';

const RAILWAY_URL = 'mysql://root:QsDoSvrTnjqFxozjkItmjfexYNwTvcMc@crossover.proxy.rlwy.net:32137/railway';
const LOCAL_URL = 'mysql://root@localhost:3306/gro_portal';
const TABLES = ['users', 'invoices', 'tasks', 'leads'];

const direction = process.argv[2];

if (direction !== 'push' && direction !== 'pull') {
  console.log('Usage:');
  console.log('  node scripts/sync-db.js push   → local → Railway (overwrite prod)');
  console.log('  node scripts/sync-db.js pull   → Railway → local (overwrite local)');
  process.exit(1);
}

const isPush = direction === 'push';
const [srcUrl, dstUrl] = isPush ? [LOCAL_URL, RAILWAY_URL] : [RAILWAY_URL, LOCAL_URL];
const srcLabel = isPush ? 'local' : 'Railway';
const dstLabel = isPush ? 'Railway' : 'local';

console.log(`\nSyncing ${srcLabel} → ${dstLabel}\n`);

const src = await mysql.createConnection(srcUrl);
const dst = await mysql.createConnection(dstUrl);

for (const table of TABLES) {
  let rows;
  try {
    [rows] = await src.execute(`SELECT * FROM \`${table}\``);
  } catch {
    console.log(`⚠  ${table}: not found in source, skipping`);
    continue;
  }

  await dst.execute(`DELETE FROM \`${table}\``);

  for (const row of rows) {
    const cols = Object.keys(row).map(k => `\`${k}\``).join(', ');
    const placeholders = Object.keys(row).map(() => '?').join(', ');
    const vals = Object.values(row);
    await dst.execute(
      `INSERT INTO \`${table}\` (${cols}) VALUES (${placeholders})`,
      vals
    );
  }

  console.log(`✓  ${table}: ${rows.length} row${rows.length !== 1 ? 's' : ''}`);
}

await src.end();
await dst.end();
console.log(`\nDone! ${dstLabel} is now up to date.`);
