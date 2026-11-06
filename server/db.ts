import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true }); this.db = new DatabaseSync(path);
    // Inspect schema version before running DDL or changing its journal mode.
    const hasMigrations=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'").get();
    if(hasMigrations){const versions=this.db.prepare('SELECT version FROM migrations').all().map(r=>Number(r.version));if(versions.some(v=>v!==1)){this.db.close();throw new Error('Unsupported ArchivePass database schema version; preserve this database and use a compatible application.');}}
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO migrations VALUES(1);
      CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commitments(asset_id TEXT NOT NULL REFERENCES assets(id), id TEXT NOT NULL, provider_id TEXT NOT NULL, slot TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(asset_id,id), UNIQUE(asset_id,provider_id,slot));
      CREATE TABLE IF NOT EXISTS payments(asset_id TEXT NOT NULL REFERENCES assets(id), id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(asset_id,id));
      CREATE TABLE IF NOT EXISTS outbox(asset_id TEXT NOT NULL, id TEXT NOT NULL, outcome TEXT NOT NULL, delivery TEXT, PRIMARY KEY(asset_id,id), FOREIGN KEY(asset_id,id) REFERENCES payments(asset_id,id));
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, asset_id TEXT NOT NULL REFERENCES assets(id), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency(scope TEXT NOT NULL, request_id TEXT NOT NULL, body_hash TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(scope,request_id));
      CREATE TABLE IF NOT EXISTS observations(id INTEGER PRIMARY KEY AUTOINCREMENT, asset_id TEXT NOT NULL REFERENCES assets(id), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    `);
  }
  transaction<T>(fn: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  close() { this.db.close(); }
}
