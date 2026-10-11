// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { load } from "js-yaml";

const state = vi.hoisted(() => ({
  root: "",
  id: "local",
  config: { mode: "local", apiKey: "", remoteUrl: "" } as Record<
    string,
    unknown
  >,
}));
vi.mock("./config", () => ({
  getConnectionConfig: () => state.config,
  getActiveConnection: () => ({ connectionId: state.id }),
}));
vi.mock("./hermes", () => ({
  isRemoteMode: () => state.config.mode !== "local",
}));
vi.mock("./installer", () => ({
  HERMES_PYTHON: "must-not-run",
  getEnhancedPath: () => "",
  hermesCliArgs: () => [],
}));
vi.mock("./utils", async () => {
  const { mkdirSync, writeFileSync } = await import("fs");
  return {
    getActiveProfileNameSync: () => "default",
    profilePaths: (profile?: string) => ({
      configFile: join(state.root, profile || "default", "config.yaml"),
    }),
    safeWriteFile: (path: string, data: string) => {
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, data);
    },
  };
});
vi.mock("./remote-api", () => ({
  remoteDashboardRequestJson: () => {
    throw new Error("must not request remote");
  },
}));
import { addMcpServer } from "./mcp-servers";
import { captureProfileEditorTarget } from "./profile-editor-target";

const input = {
  name: "graphnosis",
  type: "stdio" as const,
  command: "npx",
  args: ["-y", "@graphnosis/mcp-relay@1.0.3"],
  env: {},
};
const roots: string[] = [];
function setup(): void {
  state.root = mkdtempSync(join(tmpdir(), "captured-mcp-"));
  roots.push(state.root);
  state.id = "local";
  state.config = { mode: "local", apiKey: "", remoteUrl: "" };
  for (const profile of ["default", "work", "other"]) {
    mkdirSync(join(state.root, profile));
    writeFileSync(
      join(state.root, profile, "config.yaml"),
      "model: unchanged\n",
    );
  }
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("captured local MCP registration", () => {
  // @lat: [[external-memory-providers-tests#Captured local MCP registration]]
  it("writes only the captured named profile without launching or fetching the relay", async () => {
    setup();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      await addMcpServer(input, "work", captureProfileEditorTarget("work")),
    ).toEqual({ success: true });
    expect(
      readFileSync(join(state.root, "work/config.yaml"), "utf8"),
    ).toContain("@graphnosis/mcp-relay@1.0.3");
    for (const profile of ["default", "other"])
      expect(
        readFileSync(join(state.root, profile, "config.yaml"), "utf8"),
      ).toBe("model: unchanged\n");
    expect(fetch).not.toHaveBeenCalled();
  });

  // @lat: [[external-memory-providers-tests#Stale MCP targets refuse writes]]
  it.each(["connection", "private-config", "profile", "remote", "ssh"])(
    "refuses %s changes without touching any config",
    async (change) => {
      setup();
      const target = captureProfileEditorTarget("work");
      let profile = "work";
      if (change === "connection") state.id = "another";
      if (change === "private-config")
        state.config.apiKey = "replacement-private-key";
      if (change === "profile") profile = "other";
      if (change === "remote" || change === "ssh") {
        state.config.mode = change;
        target.mode = change;
        target.scopeToken = captureProfileEditorTarget("work").scopeToken;
      }
      expect((await addMcpServer(input, profile, target)).success).toBe(false);
      for (const name of ["default", "work", "other"])
        expect(
          readFileSync(join(state.root, name, "config.yaml"), "utf8"),
        ).toBe("model: unchanged\n");
    },
  );
});

// @lat: [[external-memory-providers-tests#MCP YAML document preservation]]
it.each([
  {
    yaml: "model: unchanged\n... # end\n# trailer",
    suffix: "... # end\n# trailer",
  },
  {
    yaml: "--- # start\r\nmodel: unchanged\r\n... # end\r\n# trailer",
    suffix: "... # end\r\n# trailer",
  },
  { yaml: "model: unchanged\n...", suffix: "..." },
  { yaml: "---", suffix: "" },
  { yaml: "", suffix: "" },
  { yaml: "mcp_servers: # empty\n...\n# trailer", suffix: "...\n# trailer" },
  { yaml: "note: |\n  ...\nmodel: unchanged\n... # end", suffix: "... # end" },
  {
    yaml: 'model: unchanged\nmcp_servers: # keep header\n  existing:\n    command: "old"\n...\n# trailer',
    suffix: "...\n# trailer",
  },
])(
  "preserves a single YAML document while registering the captured relay: $yaml",
  async ({ yaml, suffix }) => {
    setup();
    const file = join(state.root, "work/config.yaml");
    writeFileSync(file, yaml);
    expect(
      await addMcpServer(input, "work", captureProfileEditorTarget("work")),
    ).toEqual({ success: true });
    const saved = readFileSync(file, "utf8");
    const parsed = load(saved) as {
      model?: string;
      mcp_servers: Record<string, { command: string; args?: string[] }>;
    };
    expect(parsed.mcp_servers.graphnosis).toEqual({
      command: "npx",
      args: input.args,
    });
    if (yaml.includes("model:")) expect(parsed.model).toBe("unchanged");
    if (suffix) expect(saved.endsWith(suffix)).toBe(true);
    if (yaml.startsWith("--- # start"))
      expect(saved.startsWith("--- # start\r\n")).toBe(true);
    if (yaml.includes("existing:")) {
      expect(parsed.mcp_servers.existing.command).toBe("old");
      expect(saved).toContain("mcp_servers: # keep header");
    }
    for (const profile of ["default", "other"])
      expect(
        readFileSync(join(state.root, profile, "config.yaml"), "utf8"),
      ).toBe("model: unchanged\n");
  },
);

// @lat: [[external-memory-providers-tests#MCP unsupported documents refuse unchanged]]
it.each([
  "model: first\n---\nmodel: second\n",
  "model: first\n...\nmodel: after\n",
  "model: first\n...\n---\nmodel: second\n",
  "mcp_servers: {}\n",
  "model: first\nmodel: duplicate\n",
  "model: [unterminated\n",
  "mcp_servers:\n  old:\n    command: first\n  old:\n    command: duplicate\n",
  "mcp_servers: &shared\n  existing:\n    command: old\n",
])(
  "refuses unsupported captured MCP config without any profile writes: $yaml",
  async (yaml) => {
    setup();
    writeFileSync(join(state.root, "work/config.yaml"), yaml);
    expect(
      (await addMcpServer(input, "work", captureProfileEditorTarget("work")))
        .success,
    ).toBe(false);
    for (const profile of ["default", "work", "other"])
      expect(
        readFileSync(join(state.root, profile, "config.yaml"), "utf8"),
      ).toBe(profile === "work" ? yaml : "model: unchanged\n");
  },
);
