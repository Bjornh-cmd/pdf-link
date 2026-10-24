import fs from "node:fs/promises";
import path from "node:path";
import { getCredentials, migrateLegacyDataDir, dataDir as getDataDir } from "./auth/store.js";
import { listUploadedFiles } from "./files.js";

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

  const files = await listUploadedFiles(uploadDir);
  const credentials = await getCredentials();

  console.log(
    `[storage] uploads=${uploadDir} data=${appDataDir} files=${files.length} passkeys=${credentials.length}`,
  );

  return {
    uploadDir,
    dataDir: appDataDir,
    fileCount: files.length,
    passkeyCount: credentials.length,
  };
}

export async function getStorageStats(uploadDir) {
  const files = await listUploadedFiles(uploadDir);
  const credentials = await getCredentials();
  return {
    fileCount: files.length,
    pdfCount: files.length,
    passkeyCount: credentials.length,
    dataDir: getDataDir(),
    uploadDir,
  };
}
