import fs from "node:fs/promises";
import path from "node:path";

function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const uploadDir =
    process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
  return path.join(uploadDir, ".app");
}

async function ensureDataDir() {
  await fs.mkdir(getDataDir(), { recursive: true });
}

async function readJson(filename, fallback) {
  await ensureDataDir();
  const filePath = path.join(getDataDir(), filename);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(filename, data) {
  await ensureDataDir();
  const filePath = path.join(getDataDir(), filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function migrateLegacyDataDir() {
  const target = getDataDir();
  const sources = [
    process.env.LEGACY_DATA_DIR,
    "/data/app",
    path.join(process.cwd(), "data", "app"),
  ].filter((s, i, arr) => s && s !== target && arr.indexOf(s) === i);

  await fs.mkdir(target, { recursive: true });

  for (const src of sources) {
    for (const file of ["credentials.json", "email-tokens.json", "challenges.json"]) {
      const destPath = path.join(target, file);
      try {
        await fs.access(destPath);
        continue;
      } catch {
        /* copy if missing */
      }
      try {
        await fs.copyFile(path.join(src, file), destPath);
        console.log(`Migrated ${file} from ${src} to ${target}`);
      } catch {
        /* source missing */
      }
    }
  }
}

export async function getCredentials() {
  const data = await readJson("credentials.json", { credentials: [] });
  return data.credentials ?? [];
}

export async function saveCredentials(credentials) {
  await writeJson("credentials.json", { credentials });
}

export async function getEmailTokenList() {
  const data = await readJson("email-tokens.json", { tokens: [] });
  const raw = data.tokens;
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.tokens)) return raw.tokens;
  return [];
}

export async function saveEmailTokenList(tokenList) {
  await writeJson("email-tokens.json", { tokens: tokenList });
}

export async function getChallenge(key) {
  const data = await readJson("challenges.json", { challenges: {} });
  return data.challenges[key] ?? null;
}

export async function setChallenge(key, value) {
  const data = await readJson("challenges.json", { challenges: {} });
  data.challenges[key] = value;
  await writeJson("challenges.json", data);
}

export async function deleteChallenge(key) {
  const data = await readJson("challenges.json", { challenges: {} });
  delete data.challenges[key];
  await writeJson("challenges.json", data);
}

export { getDataDir as dataDir };
