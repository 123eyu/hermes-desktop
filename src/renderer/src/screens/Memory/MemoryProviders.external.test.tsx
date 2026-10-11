import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryProviders } from "./MemoryProviders";
import type { ProfileEditorTarget } from "../../../../shared/profile-editor-target";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("external provider cards", () => {
  // @lat: [[external-memory-providers-tests#Recall renderer links and routing]]
  it("uses fixed official links and captured activation without key fields or inherited URLs", async () => {
    const external = vi.fn();
    const config = vi.fn().mockResolvedValue(true);
    window.hermesAPI = {
      openExternal: external,
      setConfig: config,
    } as unknown as typeof window.hermesAPI;
    const target: ProfileEditorTarget = {
      connectionId: "local",
      profile: "work",
      mode: "local",
      scopeToken: "captured",
    };
    render(
      <MemoryProviders
        profile="work"
        target={target}
        isCurrent={() => true}
        activeProvider={null}
        onRefresh={vi.fn()}
        providers={["recall", "recall-memory-hermes", "constructor"].map(
          (name) => ({
            name,
            description: "memory.providers.recall",
            installed: true,
            active: false,
            envVars: [],
          }),
        )}
      />,
    );
    const buttons = screen.getAllByTitle("memory.openProviderWebsite");
    expect(buttons).toHaveLength(2);
    for (const button of buttons) fireEvent.click(button);
    expect(external.mock.calls).toEqual([
      ["https://github.com/Jnocode/recall-memory-hermes"],
      ["https://github.com/Jnocode/recall-memory-hermes"],
    ]);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    const card = screen
      .getByText("recall-memory-hermes")
      .closest(".memory-provider-card") as HTMLElement;
    fireEvent.click(within(card).getByText("memory.activate"));
    await waitFor(() =>
      expect(config).toHaveBeenCalledWith(
        "memory.provider",
        "recall-memory-hermes",
        "work",
        target,
      ),
    );
  });
});
