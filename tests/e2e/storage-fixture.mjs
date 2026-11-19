// Local Supabase HTTP boundary double. No cloud keys, buckets or objects used.
import { createServer } from "node:http";
const files = new Map();
createServer(async (req, res) => {
  const path = new URL(req.url, "http://127.0.0.1:54329").pathname;
  const json = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (path === "/health") return json(200, { status: "ok" });
  if (req.method === "POST" && path.startsWith("/storage/v1/object/sign/"))
    return json(200, {
      signedURL: path.replace("/storage/v1", "") + "?token=local-test-only",
    });
  if (
    req.method === "POST" &&
    path.startsWith("/storage/v1/object/question-assets/")
  ) {
    const parts = [];
    for await (const part of req) parts.push(part);
    files.set(path, {
      body: Buffer.concat(parts),
      mime: req.headers["content-type"],
    });
    return json(200, { Key: path.slice("/storage/v1/object/".length) });
  }
  if (
    req.method === "DELETE" &&
    path === "/storage/v1/object/question-assets"
  ) {
    const parts = [];
    for await (const part of req) parts.push(part);
    const { prefixes } = JSON.parse(Buffer.concat(parts).toString());
    for (const prefix of prefixes)
      files.delete(`/storage/v1/object/question-assets/${prefix}`);
    return json(
      200,
      prefixes.map((name) => ({ name })),
    );
  }
  if (req.method === "GET" && path.startsWith("/storage/v1/object/sign/")) {
    const file = files.get(path.replace("/object/sign/", "/object/"));
    if (!file) return json(404, { error: "not found" });
    res.writeHead(200, {
      "Content-Type": file.mime || "image/png",
      "Access-Control-Allow-Origin": "http://localhost:5173",
    });
    return res.end(file.body);
  }
  return json(404, { error: "unsupported test request" });
}).listen(54329, "127.0.0.1");
