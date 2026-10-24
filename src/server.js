import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import multer from "multer";
import { createEmailRouter } from "./auth/email.js";
import { createPasskeyRouter } from "./auth/passkey.js";
import { isAuthenticated, requireAuth } from "./auth/session.js";
import { initPersistentStorage, getStorageStats } from "./storage.js";
import {
  buildFileUrls,
  canViewInline,
  isValidFileId,
  listUploadedFiles,
  readMeta,
  resolveStoredPath,
  validateUpload,
  writeStoredFile,
  getAllowedExtensions,
} from "./files.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(rootDir, "data", "uploads");
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 25;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-change-me";
const cookieSecure =
  process.env.COOKIE_SECURE === "true" ||
  (process.env.COOKIE_SECURE !== "false" && BASE_URL.startsWith("https://"));

const storageState = await initPersistentStorage(UPLOAD_DIR);

const app = express();
app.set("trust proxy", 1);

app.use(express.json());
app.use(
  session({
    name: "pdf_link_sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

const authConfig = {
  baseUrl: BASE_URL,
  allowedEmail: process.env.ALLOWED_UPLOAD_EMAIL || "bjornhoutman14@gmail.com",
  emailFrom: process.env.EMAIL_FROM || "pdf@support.snubstad.nl",
  resendApiKey: (process.env.RESEND_API_KEY || "").trim(),
};

const allowedUploadEmail =
  process.env.ALLOWED_UPLOAD_EMAIL || "bjornhoutman14@gmail.com";

const passkeyConfig = {
  baseUrl: BASE_URL,
  rpName: process.env.RP_NAME || "PDF Link",
};

app.get("/health", async (_req, res) => {
  try {
    const stats = await getStorageStats(UPLOAD_DIR);
    res.json({
      ok: true,
      storage: {
        ready: true,
        fileCount: stats.fileCount,
        pdfCount: stats.fileCount,
        passkeyCount: stats.passkeyCount,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(503).json({ ok: false, error: "storage_unavailable" });
  }
});

app.get("/api/config", (_req, res) => {
  res.json({
    loginEmail: allowedUploadEmail,
    baseUrl: BASE_URL.replace(/\/$/, ""),
    allowedExtensions: [...getAllowedExtensions()].sort(),
  });
});

app.get("/api/auth/status", (req, res) => {
  res.json({
    authenticated: isAuthenticated(req),
    user: req.session?.user
      ? { method: req.session.user.method, email: req.session.user.email }
      : null,
  });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Uitloggen mislukt." });
    res.clearCookie("pdf_link_sid");
    res.json({ ok: true });
  });
});

app.use("/api/auth/email", createEmailRouter(authConfig));
app.use("/api/auth/passkey", createPasskeyRouter(passkeyConfig));

app.use(
  "/vendor/simplewebauthn",
  express.static(
    path.join(rootDir, "node_modules", "@simplewebauthn", "browser", "esm"),
  ),
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

async function listFilesHandler(_req, res) {
  try {
    const base = BASE_URL.replace(/\/$/, "");
    const items = await listUploadedFiles(UPLOAD_DIR);
    const files = items.map((item) => ({
      ...item,
      ...buildFileUrls(base, item),
    }));
    res.json({ files, pdfs: files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Kon bestandenlijst niet laden." });
  }
}

app.get("/api/files", requireAuth, listFilesHandler);
app.get("/api/pdfs", requireAuth, listFilesHandler);

app.post("/api/upload", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Geen bestand geüpload." });
  }

  const originalName = req.file.originalname || "bestand.bin";
  const safeName =
    path.basename(originalName).replace(/[^\w.\- ()[\]]+/g, "_") || "bestand.bin";

  const check = validateUpload(req.file.buffer, safeName, req.file.mimetype);
  if (!check.ok) {
    return res.status(400).json({ error: check.error });
  }

  const id = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();
  const canView = canViewInline(check.mimeType);

  try {
    await writeStoredFile(UPLOAD_DIR, id, req.file.buffer, {
      originalName: safeName,
      uploadedAt,
      mimeType: check.mimeType,
      ext: check.ext,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Opslaan mislukt." });
  }

  const base = BASE_URL.replace(/\/$/, "");
  const urls = buildFileUrls(base, { id });
  res.json({
    id,
    originalName: safeName,
    mimeType: check.mimeType,
    canViewInline: canView,
    ...urls,
  });
});

app.get("/p/:id", async (req, res) => {
  const id = req.params.id;
  if (!isValidFileId(id)) {
    return res.status(404).send("Niet gevonden");
  }
  const filePath = await resolveStoredPath(UPLOAD_DIR, id);
  if (!filePath) {
    return res.status(404).send("Niet gevonden");
  }
  const meta = await readMeta(UPLOAD_DIR, id);
  const mimeType = meta.mimeType || "application/octet-stream";
  if (!canViewInline(mimeType)) {
    return res.redirect(`/d/${id}`);
  }
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(filePath);
});

app.get("/d/:id", async (req, res) => {
  const id = req.params.id;
  if (!isValidFileId(id)) {
    return res.status(404).send("Niet gevonden");
  }
  const filePath = await resolveStoredPath(UPLOAD_DIR, id);
  if (!filePath) {
    return res.status(404).send("Niet gevonden");
  }
  const meta = await readMeta(UPLOAD_DIR, id);
  const mimeType = meta.mimeType || "application/octet-stream";
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${meta.originalName}"`);
  res.sendFile(filePath);
});

app.use(express.static(path.join(rootDir, "public")));

app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: `Bestand te groot (max ${MAX_FILE_SIZE_MB} MB).` });
  }
  next(err);
});

app.listen(PORT, () => {
  const emailReady = Boolean(authConfig.resendApiKey);
  console.log(`PDF Link listening on ${PORT}`);
  if (!emailReady) {
    console.warn("RESEND_API_KEY ontbreekt — e-mail inlog werkt niet.");
  }
});
