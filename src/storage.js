import fs from "node:fs/promises";
import path from "node:path";
import { getCredentials, migrateLegacyDataDir, dataDir as getDataDir } from "./auth/store.js";
import { listUploadedPdfs } from "./pdf.js";

async function assertWritable(dir) {
  const probe = path.join(dir, `.probe-${Date.now()}`);
  await fs.writeFile(probe, "ok");
  await fs.unlink(probe);
}

export async function initPersistentStorage(uploadDir) {
  const appDataDir = getDataDir();

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.mkdir(appDataDir, { recursive: true });
  await migrateLegacyDataDir();

  await assertWritable(uploadDir);
  await assertWritable(appDataDir);

  if (process.env.DATA_DIR === "/data/app") {
    console.warn(
      "[storage] DATA_DIR=/data/app is verouderd en vaak niet persistent. Gebruik DATA_DIR=/data/uploads/.app en mount /data/uploads in Coolify.",
    );
  }

  const pdfs = await listUploadedPdfs(uploadDir);
  const credentials = await getCredentials();

  console.log(
    `[storage] uploads=${uploadDir} data=${appDataDir} pdfs=${pdfs.length} passkeys=${credentials.length}`,
  );

  return { uploadDir, dataDir: appDataDir, pdfCount: pdfs.length, passkeyCount: credentials.length };
}

export async function getStorageStats(uploadDir) {
  const pdfs = await listUploadedPdfs(uploadDir);
  const credentials = await getCredentials();
  return {
    pdfCount: pdfs.length,
    passkeyCount: credentials.length,
    dataDir: getDataDir(),
    uploadDir,
  };
}
