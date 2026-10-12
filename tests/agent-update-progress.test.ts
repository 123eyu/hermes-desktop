// @vitest-environment node
import { readFileSync } from "fs";
import { join } from "path";
import { runInNewContext } from "vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

function handler(
  scope: Record<string, unknown>,
): (event: unknown, requestId?: string) => Promise<unknown> {
  const file = join(__dirname, "../src/main/ipc/register.ts");
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let callback: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "ipcMain.handle" &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === "run-hermes-update"
    )
      callback = node.arguments[1];
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!callback) throw new Error("Missing real update handler");
  const output = ts.transpileModule(
    `exports.handle = ${callback.getText(source)};`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const exports: {
    handle?: (event: unknown, requestId?: string) => Promise<unknown>;
  } = {};
  runInNewContext(output, { exports, ...scope });
  return exports.handle!;
}

// @lat: [[desktop-updates#Agent phases#SSH phases follow operations]]
it("emits real SSH phases before their operations and never measures the pending command as complete", async () => {
  let finish!: () => void;
  const calls: string[] = [];
  const updates: Array<{
    title: string;
    step: number;
    totalSteps: number;
    operation?: string;
  }> = [];
  const ssh = { host: "isolated.example" };
  const run = handler({
    getConnectionConfig: () => ({ mode: "ssh", ssh }),
    sshRunUpdate: async () => {
      calls.push("update");
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    ensureSshDashboardCompatibility: async () => {
      calls.push("compatibility");
      return { ok: true };
    },
    sshStartGateway: async () => {
      calls.push("gateway");
    },
    startSshTunnel: async () => {
      calls.push("tunnel");
    },
    sshReadRemoteApiKey: async () => {
      calls.push("credential");
      return "fixture-key";
    },
    setSshRemoteApiKey: vi.fn(),
    clearAgentCapabilityEvidence: vi.fn(),
    getActiveConnection: () => ({ connectionId: "ssh-fixture" }),
  });
  const pending = run({
    sender: {
      send: (_channel: string, progress: (typeof updates)[number]) =>
        updates.push(progress),
    },
  });
  expect(calls).toEqual(["update"]);
  expect(updates).toHaveLength(1);
  expect(updates[0]).toMatchObject({
    operation: "update",
    step: 0,
    totalSteps: 0,
  });
  finish();
  expect(await pending).toEqual({ success: true });
  expect(calls).toEqual([
    "update",
    "compatibility",
    "gateway",
    "tunnel",
    "credential",
  ]);
  expect(updates.map((p) => p.title)).toEqual([
    "Updating remote Hermes Agent",
    "Checking dashboard compatibility",
    "Restarting gateway",
    "Reconnecting tunnel",
    "Refreshing connection",
  ]);
  expect(
    updates.every((p) => p.operation === "update" && p.totalSteps === 0),
  ).toBe(true);
});

// @lat: [[desktop-updates#Agent phases#Remote update refusal remains read-only]]
it("keeps remote update refusal free of local or SSH updater operations", async () => {
  const update = vi.fn();
  const send = vi.fn();
  const run = handler({
    getConnectionConfig: () => ({ mode: "remote" }),
    runHermesUpdate: update,
    sshRunUpdate: update,
  });
  expect(await run({ sender: { send } })).toMatchObject({ success: false });
  expect(update).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

// @lat: [[desktop-updates#Agent phases#IPC echoes the update owner]]
it("echoes only the supplied update owner while retaining legacy callers", async () => {
  for (const owner of [undefined, "fixture-update-owner"] as const) {
    const send = vi.fn();
    const run = handler({
      getConnectionConfig: () => ({ mode: "local" }),
      runHermesUpdate: async (emit: (p: unknown) => void) =>
        emit({
          operation: "update",
          step: 0,
          totalSteps: 0,
          title: "Updating",
          detail: "output",
          log: "output",
        }),
      ensureLocalDashboardCompatibility: () => ({ ok: true }),
      clearAgentCapabilityEvidence: vi.fn(),
      getActiveConnection: () => ({ connectionId: "local-fixture" }),
    });
    expect(await run({ sender: { send } }, owner)).toEqual({ success: true });
    expect(send.mock.calls).toHaveLength(2);
    for (const [, progress] of send.mock.calls) {
      if (owner) expect(progress.requestId).toBe(owner);
      else expect(progress).not.toHaveProperty("requestId");
    }
  }
});
