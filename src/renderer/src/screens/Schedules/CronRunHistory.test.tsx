import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      undefined,
    );
    fireEvent.click(row);
    await waitFor(() => expect(screen.queryByText(/all good/)).toBeNull());
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
