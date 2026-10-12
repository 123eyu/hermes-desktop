import { createHash } from "crypto";
import { posix } from "path";

export const REGISTRY_COMMIT = "9eac45a2beba230414b9bcf2041b5ff407d3c935";
export const REGISTRY_TREE = "a6cd718e31c378760832f9a5980d045fef96cdd4";
const REPO = "fathah/hermes-registry";
const TTL_MS = 60 * 60 * 1000;
interface Entry {
  path: string;
  mode: string;
  type: string;
  sha: string;
}

export function gitObjectHash(type: "tree" | "blob", bytes: Buffer): string {
  return createHash("sha1")
    .update(`${type} ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

function safePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    path
      .split("/")
      .every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

/** Rebuild every tree; the pinned root binds both paths and blob identities. */
export function verifyRegistryTree(
  value: unknown,
  expectedRoot: string,
): Map<string, Entry> {
  const json = value as { truncated?: boolean; tree?: Entry[] };
  if (!json || json.truncated !== false || !Array.isArray(json.tree))
    throw new Error("Registry tree is incomplete");
  const entries = new Map<string, Entry>();
  const folders = new Map<string, Entry[]>();
  for (const entry of json.tree) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      !safePath(entry.path) ||
      entries.has(entry.path) ||
      !/^[a-f0-9]{40}$/.test(entry.sha) ||
      !(
        (entry.type === "tree" && entry.mode === "040000") ||
        (entry.type === "blob" && ["100644", "100755"].includes(entry.mode))
      )
    ) {
      throw new Error("Registry tree contains unsupported or unsafe entries");
    }
    entries.set(entry.path, entry);
    const parent =
      posix.dirname(entry.path) === "." ? "" : posix.dirname(entry.path);
    folders.set(parent, [...(folders.get(parent) || []), entry]);
  }
  for (const entry of entries.values()) {
    const parent = posix.dirname(entry.path);
    if (parent !== "." && entries.get(parent)?.type !== "tree")
      throw new Error("Registry tree has a missing parent");
    if (entry.type === "tree" && !folders.has(entry.path))
      folders.set(entry.path, []);
  }
  if (!folders.has("")) folders.set("", []);
  for (const [folder, children] of folders) {
    const ordered = children
      .slice()
      .sort((a, b) =>
        Buffer.compare(
          Buffer.from(posix.basename(a.path) + (a.type === "tree" ? "/" : "")),
          Buffer.from(posix.basename(b.path) + (b.type === "tree" ? "/" : "")),
        ),
      );
    const bytes = Buffer.concat(
      ordered.map((entry) =>
        Buffer.concat([
          Buffer.from(
            `${entry.mode.replace(/^0+/, "")} ${posix.basename(entry.path)}\0`,
          ),
          Buffer.from(entry.sha, "hex"),
        ]),
      ),
    );
    if (
      gitObjectHash("tree", bytes) !==
      (folder ? entries.get(folder)?.sha : expectedRoot)
    )
      throw new Error("Registry tree checksum mismatch");
  }
  return entries;
}

export class VerifiedRegistrySnapshot {
  private cached: { at: number; entries: Map<string, Entry> } | null = null;
  private pending: Promise<Map<string, Entry>> | null = null;

  constructor(
    private commit = REGISTRY_COMMIT,
    private root = REGISTRY_TREE,
    private request: typeof fetch = fetch,
  ) {}

  private async tree(): Promise<Map<string, Entry>> {
    if (this.cached && Date.now() - this.cached.at < TTL_MS)
      return this.cached.entries;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await this.request(
        `https://api.github.com/repos/${REPO}/git/trees/${this.commit}?recursive=1`,
        { headers },
      );
      if (!response.ok)
        throw new Error(`Registry tree fetch failed (${response.status})`);
      const entries = verifyRegistryTree(await response.json(), this.root);
      this.cached = { at: Date.now(), entries };
      return entries;
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }

  private async readBlob(path: string, entry: Entry): Promise<Buffer> {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const response = await this.request(
      `https://raw.githubusercontent.com/${REPO}/${this.commit}/${encoded}`,
    );
    if (!response.ok)
      throw new Error(
        `Registry file fetch failed (${response.status}): ${path}`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (gitObjectHash("blob", bytes) !== entry.sha)
      throw new Error(`Registry file checksum mismatch: ${path}`);
    return bytes;
  }

  async readOptionalText(path: string): Promise<string | null> {
    if (!safePath(path)) throw new Error("Unsafe registry path");
    const entry = (await this.tree()).get(path);
    if (!entry) return null;
    if (entry.type !== "blob") throw new Error("Registry path is not a file");
    return (await this.readBlob(path, entry)).toString("utf8");
  }

  async readText(path: string): Promise<string> {
    const text = await this.readOptionalText(path);
    if (text === null)
      throw new Error(`Registry file absent from reviewed snapshot: ${path}`);
    return text;
  }

  async readFolder(
    folder: string,
  ): Promise<{ relativePath: string; bytes: Buffer }[]> {
    if (!safePath(folder)) throw new Error("Unsafe registry folder");
    const entries = await this.tree();
    const prefix = `${folder}/`;
    const files = [...entries.values()].filter(
      (entry) => entry.type === "blob" && entry.path.startsWith(prefix),
    );
    const verified: { relativePath: string; bytes: Buffer }[] = [];
    for (const entry of files)
      verified.push({
        relativePath: entry.path.slice(prefix.length),
        bytes: await this.readBlob(entry.path, entry),
      });
    return verified;
  }
}

export const registrySnapshot = new VerifiedRegistrySnapshot();
