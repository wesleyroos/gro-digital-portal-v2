import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import { join } from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('No DATABASE_URL set, skipping migrations');
  process.exit(0);
}

console.log('Running database migrations...');
const connection = await mysql.createConnection(DATABASE_URL);
const db = drizzle(connection);
await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
await connection.end();
console.log('Migrations complete ✓');
