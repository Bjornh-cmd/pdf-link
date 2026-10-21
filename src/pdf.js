import fs from "node:fs/promises";
import path from "node:path";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidPdfId(id) {
  return UUID_RE.test(id);
}

export function pdfPath(uploadDir, id) {
  const resolvedDir = path.resolve(uploadDir);
  const resolved = path.resolve(uploadDir, `${id}.pdf`);
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
    throw new Error("Invalid path");
  }
  return resolved;
}

export function metaPath(uploadDir, id) {
  const resolvedDir = path.resolve(uploadDir);
  const resolved = path.resolve(uploadDir, `${id}.meta.json`);
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
    throw new Error("Invalid path");
  }
  return resolved;
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function isPdfBuffer(buffer) {
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

export async function readMeta(uploadDir, id) {
  try {
    const raw = await fs.readFile(metaPath(uploadDir, id), "utf8");
    return JSON.parse(raw);
  } catch {
    return { originalName: "document.pdf" };
  }
}

export async function listUploadedPdfs(uploadDir) {
  let files;
  try {
    files = await fs.readdir(uploadDir);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  const items = [];
  for (const file of files) {
    if (!file.endsWith(".pdf")) continue;
    const id = file.slice(0, -4);
    if (!isValidPdfId(id)) continue;

    const filePath = pdfPath(uploadDir, id);
    const stat = await fs.stat(filePath);
    const meta = await readMeta(uploadDir, id);

    items.push({
      id,
      originalName: meta.originalName || "document.pdf",
      uploadedAt: meta.uploadedAt || stat.mtime.toISOString(),
      sizeBytes: stat.size,
    });
  }

  items.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return items;
}
