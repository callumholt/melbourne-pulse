/**
 * Upload a file to Vercel Blob storage.
 * Usage: npx tsx scripts/upload-to-blob.ts <filepath>
 *
 * Requires BLOB_READ_WRITE_TOKEN in .env.local
 * Get it by: vercel link && vercel env pull .env.local
 */
import { put } from "@vercel/blob";
import { readFileSync } from "fs";
import { basename } from "path";

const filepath = process.argv[2];
if (!filepath) {
  console.error("Usage: npx tsx scripts/upload-to-blob.ts <filepath>");
  process.exit(1);
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Missing BLOB_READ_WRITE_TOKEN. Run: vercel env pull .env.local");
  process.exit(1);
}

async function main() {
  const filename = basename(filepath);
  const file = readFileSync(filepath);

  const { url } = await put(filename, file, {
    access: "public",
    addRandomSuffix: false,
  });

  console.log(`Uploaded ${filename} to: ${url}`);
  console.log(`\nSet in Vercel env vars:`);
  console.log(`  NEXT_PUBLIC_BLOB_URL=${url.replace(`/${filename}`, "")}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
