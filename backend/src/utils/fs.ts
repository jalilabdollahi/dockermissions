import fs from "node:fs";

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

