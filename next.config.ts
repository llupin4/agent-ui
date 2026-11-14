import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module + packages that must stay a single Node instance on the
  // server (the SQLite runner extends a class exported by the runtime).
  serverExternalPackages: [
    "better-sqlite3",
    "@copilotkit/runtime",
    "@copilotkit/sqlite-runner",
  ],
};

export default nextConfig;
