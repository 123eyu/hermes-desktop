// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  gitObjectHash,
  VerifiedRegistrySnapshot,
} from "../src/main/registry-integrity";

const stores = vi.hoisted(() => ({
  write: vi.fn(),
  create: vi.fn(() => ({ success: true })),
  soul: vi.fn(() => true),
}));
vi.mock("../src/main/utils", () => ({
  profileHome: () => "/fixture/profile",
  safeWriteFile: stores.write,
}));
vi.mock("../src/main/skills", () => ({
  installSkill: vi.fn(),
  listInstalledSkills: () => [],
}));
vi.mock("../src/main/profiles", () => ({ createProfile: stores.create }));
vi.mock("../src/main/soul", () => ({ writeSoul: stores.soul }));
vi.mock("../src/main/installer", () => ({ listMcpServers: () => [] }));

afterEach(() => {
  vi.doUnmock("../src/main/registry-integrity");
  vi.clearAllMocks();
  vi.resetModules();
});

async function registry(
  corrupt: boolean,
): Promise<typeof import("../src/main/registry")> {
  const payloads = new Map([
    ["entry/AGENT.md", Buffer.from("Reviewed persona\n")],
    ["entry/manifest.json", Buffer.from('{"entry":"AGENT.md"}')],
  ]);
  const blobs = [...payloads].map(([path, bytes]) => ({
    path,
    type: "blob",
    mode: "100644",
    sha: gitObjectHash("blob", bytes),
  }));
  const folder = gitObjectHash(
    "tree",
    Buffer.concat(
      blobs.map((e) =>
        Buffer.concat([
          Buffer.from(`100644 ${e.path.slice(6)}\0`),
          Buffer.from(e.sha, "hex"),
        ]),
      ),
    ),
  );
  const root = gitObjectHash(
    "tree",
    Buffer.concat([Buffer.from("40000 entry\0"), Buffer.from(folder, "hex")]),
  );
  const request = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url.includes("api.github.com"))
      return Response.json({
        truncated: false,
        tree: [
          { path: "entry", type: "tree", mode: "040000", sha: folder },
          ...blobs,
        ],
      });
    const path = "entry/" + url.split("/").at(-1);
    return new Response(
      corrupt && path.endsWith("manifest.json")
        ? Buffer.from("modified")
        : payloads.get(path),
    );
  });
  const snapshot = new VerifiedRegistrySnapshot("a".repeat(40), root, request);
  vi.doMock("../src/main/registry-integrity", () => ({
    registrySnapshot: snapshot,
    REGISTRY_COMMIT: "a".repeat(40),
  }));
  return import("../src/main/registry");
}

describe("registry installation integrity", () => {
  it.each([false, true])(
    "verifies an entire workflow before any store write (corrupt=%s)",
    async (corrupt) => {
      const { installRegistryItem } = await registry(corrupt);
      const result = await installRegistryItem("workflows", {
        id: "fixture",
        name: "Fixture",
        description: "",
        path: "entry",
      });
      expect(result.success).toBe(!corrupt);
      expect(stores.write).toHaveBeenCalledTimes(corrupt ? 0 : 2);
      if (corrupt) expect(result.error).toContain("checksum mismatch");
    },
  );

  it("does not create an agent profile when its reviewed manifest is corrupt", async () => {
    const { installRegistryItem } = await registry(true);
    expect(
      (
        await installRegistryItem("agents", {
          id: "fixture",
          name: "Fixture",
          description: "",
          path: "entry",
        })
      ).success,
    ).toBe(false);
    expect(stores.create).not.toHaveBeenCalled();
    expect(stores.soul).not.toHaveBeenCalled();
  });
});
