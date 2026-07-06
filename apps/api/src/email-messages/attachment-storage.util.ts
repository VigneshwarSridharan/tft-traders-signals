import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150);
}

export async function storeAttachment(
  basePath: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  await mkdir(basePath, { recursive: true });
  const storagePath = join(
    basePath,
    `${randomUUID()}-${sanitizeFilename(filename)}`,
  );
  await writeFile(storagePath, buffer);
  return storagePath;
}
