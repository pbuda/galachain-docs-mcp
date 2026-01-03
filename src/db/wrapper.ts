import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SqlJsDatabase | null = null;
let dbPath: string = '';

export async function openDatabase(filePath: string, readonly = false): Promise<void> {
  SQL = await initSqlJs();
  dbPath = filePath;

  if (fs.existsSync(filePath)) {
    const buffer = fs.readFileSync(filePath);
    db = new SQL.Database(buffer);
  } else if (!readonly) {
    // Create new database
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new SQL.Database();
  } else {
    throw new Error(`Database not found: ${filePath}`);
  }
}

export function isOpen(): boolean {
  return db !== null;
}

export function exec(sql: string): void {
  if (!db) throw new Error('Database not open');
  db.run(sql);
}

export function run(sql: string, params: unknown[] = []): void {
  if (!db) throw new Error('Database not open');
  db.run(sql, params as (string | number | Uint8Array | null)[]);
}

export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  if (!db) throw new Error('Database not open');
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params as (string | number | Uint8Array | null)[]);

  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  const rows = all<T>(sql, params);
  return rows[0];
}

export function save(): void {
  if (!db) throw new Error('Database not open');
  const data = db.export();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export function close(): void {
  if (db) {
    save();
    db.close();
    db = null;
  }
}

export function reset(): void {
  if (!SQL) throw new Error('SQL.js not initialized');
  if (db) db.close();
  db = new SQL.Database();
}

export function getLastInsertId(): number {
  if (!db) throw new Error('Database not open');
  const result = get<{ id: number }>('SELECT last_insert_rowid() as id');
  return result?.id || 0;
}
