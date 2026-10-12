// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  gitObjectHash,
  VerifiedRegistrySnapshot,
  verifyRegistryTree,
} from "../src/main/registry-integrity";

function fixture(): {
  a: Buffer;
  b: Buffer;
  root: string;
  tree: {
    truncated: boolean;
    tree: { path: string; type: string; mode: string; sha: string }[];
  };
} {
  const a = Buffer.from("verified persona\n");
  const b = Buffer.from('{"command":"safe-fixture"}\n');
  const entries = [
    {
      path: "entry/a.md",
      type: "blob",
      mode: "100644",
      sha: gitObjectHash("blob", a),
    },
    {
      path: "entry/b.json",
      type: "blob",
      mode: "100644",
      sha: gitObjectHash("blob", b),
    },
  ];
  const folder = gitObjectHash(
    "tree",
    Buffer.concat(
      entries.map((e) =>
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
  return {
    a,
    b,
    root,
    tree: {
      truncated: false,
      tree: [
        { path: "entry", type: "tree", mode: "040000", sha: folder },
        ...entries,
      ],
    },
  };
}

describe("reviewed registry snapshot", () => {
  // @lat: [[desktop-security#Runtime security#Reviewed registry snapshot]]
  it("binds names, modes and blob hashes to the reviewed root", () => {
    const f = fixture();
    expect(verifyRegistryTree(f.tree, f.root).size).toBe(3);
    for (const change of [
      { ...f.tree, truncated: true },
      { ...f.tree, tree: f.tree.tree.slice(0, 2) },
      {
        ...f.tree,
        tree: f.tree.tree.map((e) => ({
          ...e,
          path: e.path.replace("a.md", "other.md"),
        })),
      },
      {
        ...f.tree,
        tree: [...f.tree.tree, { ...f.tree.tree[1], path: "entry/../escape" }],
      },
      {
        ...f.tree,
        tree: f.tree.tree.map((e) =>
          e.path === "entry/a.md" ? { ...e, mode: "120000" } : e,
        ),
      },
    ])
      expect(() => verifyRegistryTree(change, f.root)).toThrow();
  });

  it("fetches immutable bytes and refuses a corrupt final file before returning any folder", async () => {
    const f = fixture();
    let corrupt = false;
    const request = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes("api.github.com")) return Response.json(f.tree);
      return new Response(
        url.endsWith("a.md") ? f.a : corrupt ? Buffer.from("tampered") : f.b,
      );
    });
    const client = new VerifiedRegistrySnapshot(
      "a".repeat(40),
      f.root,
      request,
    );
    expect(
      (await client.readFolder("entry")).map((x) => x.bytes.toString()),
    ).toEqual([f.a.toString(), f.b.toString()]);
    corrupt = true;
    await expect(client.readFolder("entry")).rejects.toThrow(
      "checksum mismatch",
    );
    expect(
      request.mock.calls.every(([url]) => String(url).includes("a".repeat(40))),
    ).toBe(true);
    expect(await client.readOptionalText("entry/missing.md")).toBeNull();
    await expect(client.readText("entry/../escape")).rejects.toThrow("Unsafe");
  });
  it("retains its verified immutable tree after an hour and API failure", async () => {
    const f = fixture();
    let unavailable = false;
    const request = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes("api.github.com"))
        return unavailable
          ? new Response("rate limited", { status: 429 })
          : Response.json(f.tree);
      return new Response(url.endsWith("a.md") ? f.a : f.b);
    });
    const client = new VerifiedRegistrySnapshot(
      "a".repeat(40),
      f.root,
      request,
    );
    expect(await client.readText("entry/a.md")).toBe(f.a.toString());
    unavailable = true;
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.now() + 2 * 60 * 60 * 1000);
    try {
      expect(await client.readText("entry/a.md")).toBe(f.a.toString());
      expect(
        request.mock.calls.filter(([url]) =>
          String(url).includes("api.github.com"),
        ),
      ).toHaveLength(1);
    } finally {
      now.mockRestore();
    }
  });
});
