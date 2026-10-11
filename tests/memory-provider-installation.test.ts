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
  // @lat: [[external-memory-providers-tests#Recall bundled metadata]]
  it("gives a legacy bundled Recall install the localized description", async () => {
    const provider = join(root, "hermes-agent", "plugins", "memory", "recall");
    mkdirSync(provider, { recursive: true });
    writeFileSync(
      join(provider, "__init__.py"),
      "class Provider(MemoryProvider): pass",
    );
    writeFileSync(join(root, "config.yaml"), "memory:\n  provider: recall\n");
    const { discoverMemoryProviders } = await import("../src/main/installer");
    expect(discoverMemoryProviders("default")).toEqual([
      {
        name: "recall",
        description: "memory.providers.recall",
        envVars: [],
        installed: true,
        active: true,
      },
    ]);
  });
  // @lat: [[external-memory-providers-tests#Recall actual installer configuration]]
  it("keeps the current hyphenated Recall identity and legacy provider in their named home", async () => {
    const named = join(root, "profiles", "work");
    for (const [home, name] of [
      [root, "graphnosis"],
      [named, "recall"],
      [named, "recall-memory-hermes"],
    ]) {
      mkdirSync(join(home, "plugins", name), { recursive: true });
      writeFileSync(
        join(home, "plugins", name, "__init__.py"),
        "class Provider(MemoryProvider): pass",
      );
    }
    writeFileSync(
      join(named, "config.yaml"),
      'model:\n  provider: openai\nmemory:\n  provider: "recall-memory-hermes" # active\n',
    );
    const { discoverMemoryProviders, getActiveMemoryProvider } =
      await import("../src/main/installer");
    expect(getActiveMemoryProvider("work")).toBe("recall-memory-hermes");
    const providers = discoverMemoryProviders("work");
    expect(
      providers.map((p) => [p.name, p.description, p.active, p.envVars]),
    ).toEqual([
      ["recall-memory-hermes", "memory.providers.recall", true, []],
      ["recall", "memory.providers.recall", false, []],
    ]);
  });
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
