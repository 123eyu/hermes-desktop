import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionConfig } from "./config";

const state = vi.hoisted(() => ({
  conn: {} as ConnectionConfig,
  oauthRequest: vi.fn(() => {
    throw new Error("OAuth cookie authentication refused");
  }),
}));
vi.mock("electron", () => ({
  app: { isReady: () => true },
  BrowserWindow: class {},
  net: { request: state.oauthRequest },
  session: { fromPartition: () => ({}) },
}));
vi.mock("./installer", () => ({
  HERMES_HOME: "unused",
  HERMES_PYTHON: "python",
  hermesCliArgs: () => [],
}));
vi.mock("./config", () => ({
  readDesktopConfig: () => ({}),
  getConnectionConfig: () => state.conn,
  getActiveConnection: () => ({ connectionId: "proxy" }),
}));
vi.mock("./utils", () => ({
  profileHome: () => "unused",
  getActiveProfileNameSync: () => "default",
}));
vi.mock("./hermes", () => ({
  isRemoteMode: () => true,
  getApiUrl: () => state.conn.remoteUrl,
  getRemoteAuthHeader: () => ({}),
  normaliseRemoteUrl: (url: string) => url,
}));
vi.mock("./ssh-remote", () => ({ sshRunCron: vi.fn() }));

// Keep the real auth probe, dashboard client and cron transport together.
import { getCronRunOutput, listCronRuns } from "./cronjobs";
import { captureProfileEditorTarget } from "./profile-editor-target";

const basic = `Basic ${Buffer.from("proxy user:p@ss").toString("base64")}`;
const runId = "cron_job1_20260101_100000";
interface RequestRecord {
  path: string;
  authorization: string;
  token: string;
}

describe("cron history through an automatically detected Basic proxy", () => {
  let server: http.Server;
  let requests: RequestRecord[];
  let statusCode: number;
  let oauthRequired: boolean;
  let releaseStatus: (() => void) | undefined;
  let statusGate: Promise<void> | undefined;

  beforeEach(async () => {
    requests = [];
    statusCode = 200;
    oauthRequired = false;
    releaseStatus = undefined;
    statusGate = undefined;
    state.oauthRequest.mockClear();
    server = http.createServer((req, res) => {
      const url = new URL(req.url!, "http://proxy.test");
      const record = {
        path: req.url!,
        authorization: String(req.headers.authorization || ""),
        token: String(req.headers["x-hermes-session-token"] || ""),
      };
      requests.push(record);
      res.setHeader("Content-Type", "application/json");
      if (record.authorization !== basic) {
        res.writeHead(401).end(JSON.stringify({ detail: "Proxy refused" }));
        return;
      }
      if (url.pathname === "/api/status") {
        void Promise.resolve(statusGate).then(() => {
          res
            .writeHead(statusCode)
            .end(JSON.stringify({ auth_required: oauthRequired }));
        });
        return;
      }
      if (state.conn.apiKey && record.token !== state.conn.apiKey) {
        res.writeHead(401).end(JSON.stringify({ detail: "Token refused" }));
        return;
      }
      if (url.pathname === "/api/cron/jobs/job1/runs") {
        res.end(JSON.stringify({ runs: [{ id: runId, source: "cron" }] }));
      } else if (url.pathname === `/api/sessions/${runId}/messages`) {
        res.end(
          JSON.stringify({
            messages: [{ role: "assistant", content: "done" }],
          }),
        );
      } else {
        res.writeHead(404).end(JSON.stringify({ detail: "Unexpected route" }));
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as { port: number }).port;
    state.conn = {
      mode: "remote",
      remoteUrl: `http://proxy%20user:p%40ss@127.0.0.1:${port}/api?old=1#fragment`,
      apiKey: "",
      remoteAuthMode: "auto",
    } as ConnectionConfig;
  });

  afterEach(async () => {
    releaseStatus?.();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // @lat: [[scheduled-jobs#Test specifications#History automatic proxy authentication]]
  it.each([
    ["work", ""],
    ["default", "server-token"],
  ])(
    "reads %s history with the actual probe and transport",
    async (profile, key) => {
      state.conn = { ...state.conn, apiKey: key };
      const target = captureProfileEditorTarget(profile, "proxy");
      expect(await listCronRuns("job1", 20, profile, target)).toMatchObject({
        success: true,
        runs: [expect.objectContaining({ id: runId })],
      });
      expect(
        await getCronRunOutput("job1", runId, profile, target),
      ).toMatchObject({
        success: true,
        output: "[assistant]\ndone",
      });
      expect(requests.map((request) => request.path)).toEqual([
        "/api/status",
        `/api/cron/jobs/job1/runs?limit=20&profile=${profile}`,
        "/api/status",
        `/api/cron/jobs/job1/runs?limit=100&profile=${profile}`,
        "/api/status",
        `/api/sessions/${runId}/messages?order=oldest&limit=500&profile=${profile}`,
      ]);
      expect(requests.every((request) => request.authorization === basic)).toBe(
        true,
      );
      expect(
        requests
          .filter((request) => request.path === "/api/status")
          .every((request) => request.token === ""),
      ).toBe(true);
      expect(
        requests
          .filter((request) => request.path !== "/api/status")
          .every((request) => request.token === key),
      ).toBe(true);
      expect(state.oauthRequest).not.toHaveBeenCalled();
    },
  );

  // @lat: [[scheduled-jobs#Test specifications#History proxy authentication refusal]]
  it.each([401, 403, "oauth"])(
    "keeps %s authentication refusal fail-closed",
    async (failure) => {
      if (failure === "oauth") oauthRequired = true;
      else statusCode = Number(failure);
      const target = captureProfileEditorTarget("work", "proxy");
      const result = await listCronRuns("job1", 20, "work", target);
      expect(result).toMatchObject({ success: false, runs: [] });
      expect(result.error).toContain(
        failure === "oauth"
          ? "OAuth cookie authentication refused"
          : String(failure),
      );
      expect(requests.map((request) => request.path)).toEqual(["/api/status"]);
      if (failure === "oauth")
        expect(state.oauthRequest).toHaveBeenCalledOnce();
      else expect(state.oauthRequest).not.toHaveBeenCalled();
    },
  );

  // @lat: [[scheduled-jobs#Test specifications#History deferred proxy target]]
  it("rejects revoked authority after the actual proxy probe before reading history", async () => {
    statusGate = new Promise<void>((resolve) => {
      releaseStatus = resolve;
    });
    const target = captureProfileEditorTarget("work", "proxy");
    const pending = listCronRuns("job1", 20, "work", target);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    state.conn = { ...state.conn, apiKey: "new-private-key" };
    releaseStatus!();
    const result = await pending;
    expect(result).toMatchObject({ success: false, runs: [] });
    expect(result.error).toContain("configuration changed");
    expect(requests.map((request) => request.path)).toEqual(["/api/status"]);
  });
});
