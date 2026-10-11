import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let root: string;
beforeEach(() => {
  vi.resetModules();
  root = mkdtempSync(join(tmpdir(), "memory-installation-"));
  vi.stubEnv("HERMES_HOME", root);
  vi.doMock("electron", () => ({
    app: { getPath: () => join(root, "desktop"), setPath: vi.fn() },
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("electron");
  vi.resetModules();
  rmSync(root, { recursive: true, force: true });
});
describe("installed Local memory discovery", () => {
  // @lat: [[external-memory-providers-tests#Actual Local profile configuration]]
  it("reads memory.provider rather than an earlier model provider and isolates named plugins", async () => {
    for (const profile of ["default", "work"]) {
      const home =
        profile === "default" ? root : join(root, "profiles", profile);
      mkdirSync(join(home, "plugins", "graphnosis"), { recursive: true });
      writeFileSync(
        join(home, "plugins", "graphnosis", "__init__.py"),
        "register_memory_provider",
      );
      writeFileSync(
        join(home, "config.yaml"),
        'model:\n  provider: openai\nmemory:\n  provider: "graphnosis" # selected memory\n',
      );
    }
    const { discoverMemoryProviders, getActiveMemoryProvider } =
      await import("../src/main/installer");
    expect(getActiveMemoryProvider("work")).toBe("graphnosis");
    expect(discoverMemoryProviders("work")).toEqual([
      {
        name: "graphnosis",
        description: "memory.providers.graphnosis",
        installed: true,
        active: true,
        envVars: [],
      },
    ]);
    expect(discoverMemoryProviders("default")).toEqual(
      discoverMemoryProviders("work"),
    );
  });
});
