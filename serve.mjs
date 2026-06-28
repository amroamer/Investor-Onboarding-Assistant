import "dotenv/config";
import { serve } from "srvx/node";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import server from "./dist/server/server.js";

const CLIENT_DIR = path.join(process.cwd(), "dist/client");
const BASEPATH = "/InvestorAssistant";
const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

function stripBasepath(pathname) {
  if (pathname === BASEPATH) return "/";
  if (pathname.startsWith(BASEPATH + "/")) return pathname.slice(BASEPATH.length);
  return pathname;
}

async function tryStatic(pathname) {
  const p = stripBasepath(pathname);
  if (p === "/" || p.includes("..")) return null;
  const filePath = path.join(CLIENT_DIR, p);
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return null;
    const ext = path.extname(filePath).toLowerCase();
    const body = await readFile(filePath);
    const isImmutable = p.startsWith("/assets/");
    return new Response(body, {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": isImmutable ? "public, max-age=31536000, immutable" : "public, max-age=3600",
      },
    });
  } catch {
    return null;
  }
}

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

serve({
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(null, { status: 302, headers: { location: `${BASEPATH}/` } });
    }
    const staticResp = await tryStatic(url.pathname);
    if (staticResp) return staticResp;
    return server.fetch(req, {}, {});
  },
  port,
  hostname: "::",
});

console.log(`Server listening on http://localhost:${port}${BASEPATH}/`);
