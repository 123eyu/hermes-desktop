import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Welcome from "./Welcome";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({ t: (key: string): string => key }),
}));

// @lat: [[external-memory-providers-tests#Welcome setup before optional integration]]
it("keeps setup and connection actions before the optional download and routes their panels", () => {
  const onStart = vi.fn();
  const openExternal = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: { openExternal },
  });
  render(
    <Welcome
      error={null}
      connectionMode="local"
      onStart={onStart}
      onRecheck={vi.fn()}
      onSwitchToLocal={vi.fn()}
    />,
  );
  const actionNames = Array.from(
    document.querySelectorAll(".onboard-body button"),
  ).map((button) => button.textContent);
  expect(actionNames).toEqual([
    "welcome.getStarted",
    "settings.connectSsh",
    "welcome.connectRemote",
    "welcome.graphnosisDownload",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "welcome.getStarted" }));
  expect(onStart).toHaveBeenCalledOnce();
  fireEvent.click(
    screen.getByRole("button", { name: "welcome.graphnosisDownload" }),
  );
  expect(openExternal).toHaveBeenCalledWith("https://graphnosis.com/download");
  fireEvent.click(screen.getByRole("button", { name: "settings.connectSsh" }));
  expect(
    screen.getByRole("heading", { name: "settings.sshTitle" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "common.back" }));
  fireEvent.click(
    screen.getByRole("button", { name: "welcome.connectRemote" }),
  );
  expect(
    screen.getByRole("heading", { name: "welcome.connectRemoteTitle" }),
  ).toBeTruthy();
});
