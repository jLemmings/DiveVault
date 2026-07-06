import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const port = Number(process.env.PORT || process.argv[2] || 4173);
const idleTimeoutMs = Number(process.env.IDLE_TIMEOUT_MS || process.argv[3] || 15000);
const distDir = path.resolve(process.cwd(), "dist");
let idleTimer = null;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://127.0.0.1").pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const candidate = path.resolve(distDir, relativePath);
  if (candidate.startsWith(distDir) && existsSync(candidate) && statSync(candidate).isFile()) {
    return { filePath: candidate, found: true };
  }
  if (path.extname(pathname)) {
    return { filePath: candidate, found: false };
  }
  return { filePath: path.resolve(distDir, "index.html"), found: true };
}

const server = createServer((request, response) => {
  const { filePath, found } = resolveRequestPath(request.url || "/");
  if (!found) {
    response.statusCode = 404;
    response.end("Not found");
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  response.setHeader("Content-Type", contentTypes[extension] || "application/octet-stream");
  createReadStream(filePath).pipe(response);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function resetIdleTimer() {
  if (!idleTimeoutMs) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(shutdown, idleTimeoutMs);
  idleTimer.unref?.();
}

server.on("request", resetIdleTimer);

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving ${distDir} at http://127.0.0.1:${port}`);
  resetIdleTimer();
});
