import Database from "better-sqlite3";
import { sessionsDbPath } from "./paths";

/**
 * App-owned session index.
 *
 * SqliteAgentRunner (1.88) durably stores every run's events and replays them
 * on connect, but it does not implement the runtime's thread list endpoints.
 * This table is the minimal extra piece: one row per session so the UI can
 * list and name them. It never stores messages or events - the runner
 * database is the only source of truth for conversation content, and this
 * file does not read the runner's tables.
 *
 * session id === AG-UI threadId.
 */
export interface SessionRow {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  runCount: number;
}

type Db = InstanceType<typeof Database>;
const globalStore = globalThis as unknown as { __a2uiSessionsDb?: Db };

function db(): Db {
  if (!globalStore.__a2uiSessionsDb) {
    const instance = new Database(sessionsDbPath());
    instance.pragma("journal_mode = WAL");
    instance.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        run_count INTEGER NOT NULL DEFAULT 0
      )
    `);
    globalStore.__a2uiSessionsDb = instance;
  }
  return globalStore.__a2uiSessionsDb;
}

const SELECT = `SELECT id, title, created_at AS createdAt, updated_at AS updatedAt, run_count AS runCount FROM sessions`;

export function listSessions(): SessionRow[] {
  return db().prepare(`${SELECT} ORDER BY updated_at DESC`).all() as SessionRow[];
}

export function getSession(id: string): SessionRow | undefined {
  return db().prepare(`${SELECT} WHERE id = ?`).get(id) as SessionRow | undefined;
}

export function createSession(id: string, title = ""): SessionRow {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(id, title, now, now);
  return getSession(id)!;
}

/**
 * Called once per run request (never on connect/replay): makes sure the
 * session exists, bumps its activity time, and titles it from the first user
 * message if it has no title yet.
 */
export function recordRun(id: string, firstUserText?: string): void {
  const now = Date.now();
  const title = (firstUserText ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  db()
    .prepare(
      `INSERT INTO sessions (id, title, created_at, updated_at, run_count) VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         updated_at = excluded.updated_at,
         run_count = run_count + 1,
         title = CASE WHEN sessions.title = '' THEN excluded.title ELSE sessions.title END`,
    )
    .run(id, title, now, now);
}

export function renameSession(id: string, title: string): SessionRow | undefined {
  db()
    .prepare(`UPDATE sessions SET title = ? WHERE id = ?`)
    .run(title.trim().slice(0, 80), id);
  return getSession(id);
}
