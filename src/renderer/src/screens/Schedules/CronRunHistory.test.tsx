import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({ t: (key: string): string => key }),
}));

import { CronRunHistory, formatRunTime } from "./CronRunHistory";

const run = {
  id: "cron_job1_20260101_100000",
  source: "cron",
  started_at: 1_767_261_600,
  ended_at: null,
  title: "t",
  preview: "rebuilt 3 files",
  message_count: 4,
  input_tokens: 120,
  output_tokens: 30,
  is_active: false,
};

function mockApi(overrides: Record<string, unknown> = {}): void {
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      getProfileEditorTarget: vi.fn(
        async (profile = "default", connectionId = "a") => ({
          connectionId,
          profile,
          mode: "remote",
          scopeToken: `${connectionId}:${profile}`,
        }),
      ),
      onConnectionConfigChanged: vi.fn(() => () => {}),
      listCronRuns: vi.fn().mockResolvedValue({ success: true, runs: [run] }),
      getCronRunOutput: vi
        .fn()
        .mockResolvedValue({ success: true, output: "[assistant]\nall good" }),
      ...overrides,
    },
  });
}

describe("CronRunHistory", () => {
  beforeEach(() => mockApi());

  it("lists runs for the job and profile, with preview and tokens", async () => {
    render(<CronRunHistory jobId="job1" profile="work" />);
    expect(await screen.findByText("rebuilt 3 files")).toBeTruthy();
    expect(screen.getByText("↑120 ↓30")).toBeTruthy();
    expect(window.hermesAPI.listCronRuns).toHaveBeenCalledWith(
      "job1",
      20,
      "work",
      expect.objectContaining({ connectionId: "a", profile: "work" }),
    );
  });

  it("loads the output of a run on click and hides it on a second click", async () => {
    render(<CronRunHistory jobId="job1" />);
    const row = await screen.findByText("rebuilt 3 files");
    fireEvent.click(row);
    expect(await screen.findByText(/all good/)).toBeTruthy();
    expect(window.hermesAPI.getCronRunOutput).toHaveBeenCalledWith(
      "job1",
      run.id,
      "default",
      expect.objectContaining({ connectionId: "a", profile: "default" }),
    );
    fireEvent.click(row);
    await waitFor(() => expect(screen.queryByText(/all good/)).toBeNull());
  });

  it("ignores a slower output response from a previously opened run", async () => {
    const run2 = { ...run, id: "run2", preview: "second run" };
    let resolveFirst: (v: unknown) => void = () => {};
    const getCronRunOutput = vi.fn((_job: string, id: string) =>
      id === run.id
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve({ success: true, output: "output of B" }),
    );
    mockApi({
      listCronRuns: vi
        .fn()
        .mockResolvedValue({ success: true, runs: [run, run2] }),
      getCronRunOutput,
    });
    render(<CronRunHistory jobId="job1" />);
    fireEvent.click(await screen.findByText("rebuilt 3 files"));
    fireEvent.click(await screen.findByText("second run"));
    expect(await screen.findByText("output of B")).toBeTruthy();
    resolveFirst({ success: true, output: "output of A" });
    await Promise.resolve();
    expect(screen.queryByText("output of A")).toBeNull();
    expect(screen.getByText("output of B")).toBeTruthy();
  });

  it("re-fetches the run list when refreshKey changes, keeping the list visible", async () => {
    const { rerender } = render(<CronRunHistory jobId="job1" refreshKey={0} />);
    await screen.findByText("rebuilt 3 files");
    rerender(<CronRunHistory jobId="job1" refreshKey={1} />);
    await waitFor(() =>
      expect(window.hermesAPI.listCronRuns).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByText("rebuilt 3 files")).toBeTruthy();
  });

  // @lat: [[scheduled-jobs#Test specifications#Open output refresh]]
  it("refreshes the open output when jobs reload", async () => {
    const output = vi
      .fn()
      .mockResolvedValueOnce({ success: true, output: "before completion" })
      .mockResolvedValue({ success: true, output: "completed output" });
    mockApi({ getCronRunOutput: output });
    const { rerender } = render(<CronRunHistory jobId="job1" refreshKey={0} />);
    fireEvent.click(await screen.findByText("rebuilt 3 files"));
    await screen.findByText("before completion");
    rerender(<CronRunHistory jobId="job1" refreshKey={1} />);
    expect(await screen.findByText("completed output")).toBeTruthy();
    expect(screen.queryByText("before completion")).toBeNull();
    expect(output).toHaveBeenCalledTimes(2);
  });

  // @lat: [[scheduled-jobs#Test specifications#History view lifetime]]
  it.each(["connection", "profile"])(
    "ignores delayed output after the %s changes",
    async (scope) => {
      let resolveOld!: (value: unknown) => void;
      const output = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveOld = resolve;
            }),
        )
        .mockResolvedValue({ success: true, output: "current output" });
      mockApi({ getCronRunOutput: output });
      const { rerender } = render(
        <CronRunHistory jobId="job1" connectionId="a" profile="work" />,
      );
      fireEvent.click(await screen.findByText("rebuilt 3 files"));
      await waitFor(() => expect(output).toHaveBeenCalledTimes(1));
      rerender(
        <CronRunHistory
          jobId="job1"
          connectionId={scope === "connection" ? "b" : "a"}
          profile={scope === "profile" ? "other" : "work"}
        />,
      );
      fireEvent.click(await screen.findByText("rebuilt 3 files"));
      await screen.findByText("current output");
      await act(async () => {
        resolveOld({ success: true, output: "old output" });
      });
      expect(screen.queryByText("old output")).toBeNull();
      expect(screen.getByText("current output")).toBeTruthy();
      expect(output.mock.calls[1][3]).toMatchObject({
        connectionId: scope === "connection" ? "b" : "a",
        profile: scope === "profile" ? "other" : "work",
      });
    },
  );

  it("revokes an old list synchronously during same-ID configuration reload", async () => {
    let changed!: () => void;
    let resolveOld!: (value: unknown) => void;
    let revision = 0;
    const list = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue({
        success: true,
        runs: [{ ...run, preview: "new configuration run" }],
      });
    mockApi({
      listCronRuns: list,
      getProfileEditorTarget: vi.fn(async () => ({
        connectionId: "a",
        profile: "work",
        mode: "remote",
        scopeToken: `revision:${revision}`,
      })),
      onConnectionConfigChanged: (callback: () => void) => {
        changed = callback;
        return () => {};
      },
    });
    render(<CronRunHistory jobId="job1" connectionId="a" profile="work" />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    await act(async () => {
      revision += 1;
      changed();
      resolveOld({
        success: true,
        runs: [{ ...run, preview: "old configuration run" }],
      });
    });
    expect(await screen.findByText("new configuration run")).toBeTruthy();
    expect(screen.queryByText("old configuration run")).toBeNull();
    expect(list.mock.calls[1][3]).toMatchObject({ scopeToken: "revision:1" });
  });

  it("keeps output errors visible and closes a run removed by a refreshed history", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ success: true, runs: [run] })
      .mockResolvedValue({ success: true, runs: [] });
    mockApi({
      listCronRuns: list,
      getCronRunOutput: vi.fn().mockResolvedValue({
        success: false,
        output: "",
        error: "run missing",
      }),
    });
    const { rerender } = render(<CronRunHistory jobId="job1" />);
    fireEvent.click(await screen.findByText("rebuilt 3 files"));
    expect(await screen.findByText("run missing")).toBeTruthy();
    rerender(<CronRunHistory jobId="job1" refreshKey={1} />);
    expect(await screen.findByText("schedules.historyEmpty")).toBeTruthy();
    expect(screen.queryByText("run missing")).toBeNull();
  });

  it("says when only a preview of the output exists", async () => {
    mockApi({
      getCronRunOutput: vi
        .fn()
        .mockResolvedValue({ success: true, output: "head", partial: true }),
    });
    render(<CronRunHistory jobId="job1" />);
    fireEvent.click(await screen.findByText("rebuilt 3 files"));
    expect(
      await screen.findByText("schedules.historyOutputPartial"),
    ).toBeTruthy();
  });

  it("shows an empty state and an unsupported state", async () => {
    mockApi({
      listCronRuns: vi.fn().mockResolvedValue({ success: true, runs: [] }),
    });
    const { unmount } = render(<CronRunHistory jobId="job1" />);
    expect(await screen.findByText("schedules.historyEmpty")).toBeTruthy();
    unmount();

    mockApi({
      listCronRuns: vi.fn().mockResolvedValue({
        success: false,
        runs: [],
        unsupported: true,
        error: "404",
      }),
    });
    render(<CronRunHistory jobId="job1" />);
    expect(
      await screen.findByText(/schedules.historyUnsupported/),
    ).toBeTruthy();
  });

  it("surfaces a request failure instead of an empty list", async () => {
    mockApi({
      listCronRuns: vi
        .fn()
        .mockResolvedValue({ success: false, runs: [], error: "boom" }),
    });
    render(<CronRunHistory jobId="job1" />);
    expect(await screen.findByText("boom")).toBeTruthy();
  });
});

describe("formatRunTime", () => {
  it("accepts epoch seconds, epoch ms and ISO strings, and a placeholder for null", () => {
    expect(formatRunTime(null)).toBe("--");
    const fromSeconds = formatRunTime(1_767_261_600);
    expect(fromSeconds).toBe(formatRunTime(1_767_261_600_000));
    expect(fromSeconds).toBe(formatRunTime("2026-01-01T10:00:00.000Z"));
    expect(formatRunTime("not a date")).toBe("not a date");
  });
});
