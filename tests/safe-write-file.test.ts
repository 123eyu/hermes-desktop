import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { safeWriteFile } from "../src/main/utils";

const TEST_DIR = join(tmpdir(), `hermes-safe-write-${Date.now()}`);

describe("safeWriteFile", () => {
  it("creates parent directories before writing", () => {
    const filePath = join(TEST_DIR, "nested", "config.yaml");

    safeWriteFile(filePath, "provider: openai\n");

    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("provider: openai\n");
  });

  it("replaces an existing file through a same-directory temp file", () => {
    const dir = join(TEST_DIR, "replace");
    const filePath = join(dir, "models.json");
    mkdirSync(dir, { recursive: true });

    safeWriteFile(filePath, "old");
    safeWriteFile(filePath, "new");

    expect(readFileSync(filePath, "utf-8")).toBe("new");
    expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual(
      [],
    );
  });
  it("preserves verified binary payloads byte-for-byte", () => {
    const filePath = join(TEST_DIR, "binary", "payload.bin");
    const bytes = Buffer.from([0, 255, 128, 13, 10]);
    safeWriteFile(filePath, bytes);
    expect(readFileSync(filePath)).toEqual(bytes);
  });
});
