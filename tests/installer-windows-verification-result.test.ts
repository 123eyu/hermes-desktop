// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("fs", async (original) => ({
  ...(await original<typeof import("fs")>()),
  existsSync: () => true,
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));
vi.mock("../src/main/config", () => ({
  getConnectionConfig: vi.fn(),
  getModelConfig: vi.fn(),
  hasOAuthCredentials: vi.fn(),
}));
vi.mock("child_process", async (original) => {
  const { EventEmitter } = await import("events");
  return {
    ...(await original<typeof import("child_process")>()),
    spawn: () => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 87));
      return child;
    },
  };
});

import { runInstall } from "../src/main/installer";

describe("Windows installer verification result", () => {
  it("cannot accept verification failure because older Agent binaries exist", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
    try {
      Object.defineProperty(process, "platform", {
        ...descriptor,
        value: "win32",
      });
      const progress = vi.fn();
      await expect(runInstall(progress)).rejects.toThrow("verification failed");
      expect(
        progress.mock.calls.some(([event]) =>
          String(event.log).includes("installed successfully"),
        ),
      ).toBe(false);
    } finally {
      Object.defineProperty(process, "platform", descriptor);
    }
  });
});
