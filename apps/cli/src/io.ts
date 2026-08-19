import { readFile } from "node:fs/promises";

export async function readJsonArtifact(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}