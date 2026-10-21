import fs from "node:fs/promises";
import path from "node:path";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data", "app");

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readJson(filename, fallback) {
  await ensureDataDir();
  const filePath = path.join(dataDir, filename);
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
  const filePath = path.join(dataDir, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function getCredentials() {
  const data = await readJson("credentials.json", { credentials: [] });
  return data.credentials ?? [];
}

export async function saveCredentials(credentials) {
  await writeJson("credentials.json", { credentials });
}

export async function getEmailTokens() {
  return readJson("email-tokens.json", { tokens: [] });
}

export async function saveEmailTokens(tokens) {
  await writeJson("email-tokens.json", { tokens });
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

export { dataDir };
