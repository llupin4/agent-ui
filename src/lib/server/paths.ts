import fs from "node:fs";
import path from "node:path";

/** Directory that holds every on-disk SQLite file. Gitignored. */
export function dataDir(): string {
  const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR ?? "./data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Runner-owned database: AG-UI run events, written by SqliteAgentRunner. */
export const runnerDbPath = () => path.join(dataDir(), "runner.sqlite");

/** App-owned database: the session index (id, title, timestamps) only. */
export const sessionsDbPath = () => path.join(dataDir(), "sessions.sqlite");
