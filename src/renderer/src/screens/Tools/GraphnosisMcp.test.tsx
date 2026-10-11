import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GraphnosisMcp } from "./GraphnosisMcp";
import type { ProfileEditorTarget } from "../../../../shared/profile-editor-target";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
let listener: () => void;
let target: ProfileEditorTarget;
const add = vi.fn();
const external = vi.fn();
beforeEach(() => {
  target = {
    connectionId: "local",
    profile: "work",
    mode: "local",
    scopeToken: "captured",
  };
  add.mockReset();
  external.mockReset();
  window.hermesAPI = {
    getProfileEditorTarget: vi.fn(async () => target),
    onConnectionConfigChanged: (callback: () => void) => {
      listener = callback;
      return () => {};
    },
    addMcpServer: add,
    openExternal: external,
  } as unknown as typeof window.hermesAPI;
});
describe("optional Graphnosis MCP action", () => {
  // @lat: [[external-memory-providers-tests#Graphnosis renderer routing]]
  it("uses a captured Local profile and a fixed HTTPS download link", async () => {
    add.mockResolvedValue({ success: true });
    const reload = vi.fn().mockResolvedValue(undefined);
    render(<GraphnosisMcp profile="work" onInstalled={reload} />);
    fireEvent.click(await screen.findByText("tools.graphnosisMcpInstall"));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(add).toHaveBeenCalledWith(
      {
        name: "graphnosis",
        type: "stdio",
        command: "npx",
        args: ["-y", "@graphnosis/mcp-relay@1.0.3"],
        env: {},
      },
      "work",
      target,
    );
    fireEvent.click(screen.getByText("tools.graphnosisMcpDownload"));
    expect(external).toHaveBeenCalledWith("https://graphnosis.com/download");
  });

  // @lat: [[external-memory-providers-tests#Graphnosis renderer lifetime]]
  it("does not reload or paint a late installation into a changed profile", async () => {
    let resolve!: (result: { success: boolean; error: string }) => void;
    add.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const reload = vi.fn();
    render(<GraphnosisMcp profile="work" onInstalled={reload} />);
    fireEvent.click(await screen.findByText("tools.graphnosisMcpInstall"));
    target = { ...target, mode: "remote", scopeToken: "new-target" };
    await act(async () => {
      listener();
    });
    await act(async () =>
      resolve({ success: false, error: "obsolete failure" }),
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("tools.graphnosisMcpInstall")).toBeNull();
  });

  // @lat: [[external-memory-providers-tests#Graphnosis nonlocal boundary]]
  it.each(["remote", "ssh"] as const)(
    "does not offer this-machine socket installation on %s",
    async (mode) => {
      target.mode = mode;
      render(<GraphnosisMcp onInstalled={vi.fn()} />);
      await act(async () => {});
      expect(screen.queryByText("tools.graphnosisMcpInstall")).toBeNull();
      expect(add).not.toHaveBeenCalled();
    },
  );
});
