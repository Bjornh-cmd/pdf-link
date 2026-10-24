import fs from "node:fs/promises";
import path from "node:path";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_EXTENSIONS = [
  "pdf",
  "stl",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "zip",
  "txt",
  "csv",
  "json",
  "md",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "mp3",
  "mp4",
  "wav",
  "step",
  "stp",
  "3mf",
  "obj",
];

export function getAllowedExtensions() {
  const raw = process.env.ALLOWED_EXTENSIONS;
  if (!raw?.trim()) return new Set(DEFAULT_EXTENSIONS);
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean),
  );
}

export function isValidFileId(id) {
  return UUID_RE.test(id);
}

export function metaPath(uploadDir, id) {
  const resolvedDir = path.resolve(uploadDir);
  const resolved = path.resolve(uploadDir, `${id}.meta.json`);
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
    throw new Error("Invalid path");
  }
  return resolved;
}

function blobPath(uploadDir, id) {
  const resolvedDir = path.resolve(uploadDir);
  const resolved = path.resolve(uploadDir, `${id}.bin`);
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
    throw new Error("Invalid path");
  }
  return resolved;
}

function legacyPdfPath(uploadDir, id) {
  const resolvedDir = path.resolve(uploadDir);
  const resolved = path.resolve(uploadDir, `${id}.pdf`);
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

export function extensionFromName(filename) {
  const base = path.basename(filename || "");
  const idx = base.lastIndexOf(".");
  if (idx <= 0) return "";
  return base.slice(idx + 1).toLowerCase();
}

export function mimeFromExtension(ext) {
  const map = {
    pdf: "application/pdf",
    stl: "model/stl",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    zip: "application/zip",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    md: "text/markdown",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    wav: "audio/wav",
    stp: "model/step",
    step: "model/step",
    "3mf": "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
    obj: "model/obj",
  };
  return map[ext] || "application/octet-stream";
}

export function canViewInline(mimeType) {
  if (!mimeType) return false;
  if (mimeType === "application/pdf") return true;
  if (mimeType.startsWith("image/")) return true;
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/json") return true;
  return false;
}

export function isPdfBuffer(buffer) {
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function isStlBuffer(buffer, ext) {
  if (ext !== "stl" || !buffer || buffer.length < 84) return false;
  const head = buffer.subarray(0, 5).toString("ascii").toLowerCase();
  if (head === "solid") return true;
  return buffer.length >= 84;
}

export function validateUpload(buffer, originalName, reportedMime) {
  const allowed = getAllowedExtensions();
  const ext = extensionFromName(originalName);
  if (!ext || !allowed.has(ext)) {
    return { ok: false, error: `Bestandstype .${ext || "?"} is niet toegestaan.` };
  }

  if (ext === "pdf") {
    if (!isPdfBuffer(buffer)) {
      return { ok: false, error: "Ongeldig PDF-bestand." };
    }
    return { ok: true, ext, mimeType: "application/pdf" };
  }

  if (ext === "stl") {
    if (!isStlBuffer(buffer, ext)) {
      return { ok: false, error: "Ongeldig STL-bestand." };
    }
    return { ok: true, ext, mimeType: "model/stl" };
  }

  const mimeType =
    reportedMime && reportedMime !== "application/octet-stream"
      ? reportedMime
      : mimeFromExtension(ext);

  return { ok: true, ext, mimeType };
}

export async function readMeta(uploadDir, id) {
  try {
    const raw = await fs.readFile(metaPath(uploadDir, id), "utf8");
    return JSON.parse(raw);
  } catch {
    return { originalName: "bestand.bin", mimeType: "application/octet-stream" };
  }
}

export async function resolveStoredPath(uploadDir, id) {
  const meta = await readMeta(uploadDir, id);
  if (meta.storageFile) {
    const resolvedDir = path.resolve(uploadDir);
    const resolved = path.resolve(uploadDir, meta.storageFile);
    if (resolved.startsWith(resolvedDir + path.sep) && (await fileExists(resolved))) {
      return resolved;
    }
  }
  const pdfLegacy = legacyPdfPath(uploadDir, id);
  if (await fileExists(pdfLegacy)) return pdfLegacy;
  const bin = blobPath(uploadDir, id);
  if (await fileExists(bin)) return bin;
  return null;
}

export async function listUploadedFiles(uploadDir) {
  let files;
  try {
    files = await fs.readdir(uploadDir);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  const metaFiles = files.filter((f) => f.endsWith(".meta.json"));
  const items = [];

  for (const metaFile of metaFiles) {
    const id = metaFile.slice(0, -".meta.json".length);
    if (!isValidFileId(id)) continue;

    const storedPath = await resolveStoredPath(uploadDir, id);
    if (!storedPath) continue;

    const stat = await fs.stat(storedPath);
    const meta = await readMeta(uploadDir, id);
    const ext = extensionFromName(meta.originalName) || meta.ext || "";

    items.push({
      id,
      originalName: meta.originalName || "bestand",
      uploadedAt: meta.uploadedAt || stat.mtime.toISOString(),
      sizeBytes: stat.size,
      mimeType: meta.mimeType || mimeFromExtension(ext),
      ext,
      canViewInline: canViewInline(meta.mimeType || mimeFromExtension(ext)),
    });
  }

  for (const file of files) {
    if (!file.endsWith(".pdf")) continue;
    const id = file.slice(0, -4);
    if (!isValidFileId(id) || metaFiles.includes(`${id}.meta.json`)) continue;

    const filePath = legacyPdfPath(uploadDir, id);
    const stat = await fs.stat(filePath);
    items.push({
      id,
      originalName: `${id}.pdf`,
      uploadedAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      mimeType: "application/pdf",
      ext: "pdf",
      canViewInline: true,
    });
  }

  items.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadAt));
  return items;
}

export async function writeStoredFile(uploadDir, id, buffer, meta) {
  const storageFile = `${id}.bin`;
  await fs.writeFile(blobPath(uploadDir, id), buffer);
  await fs.writeFile(
    metaPath(uploadDir, id),
    JSON.stringify({
      ...meta,
      storageFile,
    }),
    "utf8",
  );
}

export function buildFileUrls(baseUrl, item) {
  const base = baseUrl.replace(/\/$/, "");
  return {
    viewUrl: `${base}/p/${item.id}`,
    downloadUrl: `${base}/d/${item.id}`,
  };
}

// Backwards compatibility
export const isValidPdfId = isValidFileId;
export const pdfPath = legacyPdfPath;
export const listUploadedPdfs = listUploadedFiles;
