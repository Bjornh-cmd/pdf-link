import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data", "smoke-app");
const uploadDir = path.join(root, "data", "smoke-uploads");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function waitForHealth(port, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server did not become healthy");
}

await fs.rm(dataDir, { recursive: true, force: true });
await fs.rm(uploadDir, { recursive: true, force: true });
await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(uploadDir, { recursive: true });

const port = 3456;
const token = crypto.randomBytes(16).toString("base64url");
await fs.writeFile(
  path.join(dataDir, "email-tokens.json"),
  JSON.stringify({
    tokens: [
      {
        hash: hashToken(token),
        email: "bjornhoutman14@gmail.com",
        expiresAt: Date.now() + 600_000,
        used: false,
      },
    ],
  }),
);

const child = spawn(process.execPath, ["src/server.js"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    BASE_URL: `http://127.0.0.1:${port}`,
    SESSION_SECRET: "smoke-test-secret",
    DATA_DIR: dataDir,
    UPLOAD_DIR: uploadDir,
    NODE_ENV: "development",
  },
  stdio: "pipe",
});

child.stderr.on("data", (d) => process.stderr.write(d));

try {
  await waitForHealth(port);

  const unauth = await fetch(`http://127.0.0.1:${port}/api/upload`, { method: "POST" });
  if (unauth.status !== 401) throw new Error(`Expected 401, got ${unauth.status}`);

  const verifyRes = await fetch(
    `http://127.0.0.1:${port}/api/auth/email/verify?token=${encodeURIComponent(token)}`,
    { redirect: "manual" },
  );
  const cookie = verifyRes.headers.getSetCookie?.()?.[0] || verifyRes.headers.get("set-cookie");
  if (!cookie) throw new Error("No session cookie from verify");

  const cookieHeader = cookie.split(";")[0];
  const pdfBody = Buffer.from("%PDF-1.4 smoke test\n%%EOF\n");
  const form = new FormData();
  form.append("file", new Blob([pdfBody], { type: "application/pdf" }), "smoke.pdf");

  const uploadRes = await fetch(`http://127.0.0.1:${port}/api/upload`, {
    method: "POST",
    headers: { Cookie: cookieHeader },
    body: form,
  });
  const uploadJson = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(`Upload failed: ${JSON.stringify(uploadJson)}`);

  const viewRes = await fetch(uploadJson.viewUrl);
  if (!viewRes.ok || !viewRes.headers.get("content-type")?.includes("pdf")) {
    throw new Error("Public view failed");
  }

  console.log("Smoke test OK:", uploadJson.viewUrl);
} finally {
  child.kill();
}
