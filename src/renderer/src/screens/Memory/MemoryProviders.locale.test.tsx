import { act, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../../components/I18nProvider";
import {
  APP_LOCALES,
  setLocale,
  t,
  type AppLocale,
} from "../../../../shared/i18n";
import { MEMORY_PROVIDER_METADATA } from "../../../../shared/memory-provider-metadata";
import { MemoryProviders } from "./MemoryProviders";

const completeLocales = APP_LOCALES.filter(
  (locale) => locale !== "en" && locale !== "fa",
);

afterEach(() => {
  setLocale("en");
  localStorage.removeItem("hermes-locale");
});

async function renderRecallCards(locale: AppLocale): Promise<HTMLElement> {
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      getLocale: vi.fn().mockResolvedValue(locale),
      setLocale: vi.fn().mockResolvedValue(undefined),
    },
  });
  let container!: HTMLElement;
  await act(async () => {
    ({ container } = render(
      <I18nProvider>
        <MemoryProviders
          providers={["recall", "recall-memory-hermes"].map((name) => ({
            name,
            ...MEMORY_PROVIDER_METADATA[name],
            installed: true,
            active: false,
          }))}
          activeProvider={null}
          onRefresh={vi.fn()}
        />
      </I18nProvider>,
    ));
  });
  await waitFor(() =>
    expect(document.documentElement).toHaveAttribute("lang", locale),
  );
  return container;
}

// @lat: [[external-memory-providers-tests#Recall localized descriptions]]
it.each(completeLocales)(
  "renders localized Recall descriptions for both provider names in %s",
  async (locale) => {
    const container = await renderRecallCards(locale);
    const descriptions = Array.from(
      container.querySelectorAll(".memory-provider-desc"),
      (node) => node.textContent,
    );
    expect(descriptions).toHaveLength(2);
    for (const description of descriptions) {
      expect(description).toBe(t("memory.providers.recall", locale));
      expect(description).toContain("SQLite");
      expect(description).not.toMatch(
        /Zero-LLM|SQLite memory with tiered retrieval/,
      );
      expect(description).not.toBe(t("memory.providers.recall", "en"));
    }
  },
);

// @lat: [[external-memory-providers-tests#Recall partial locale fallback]]
it("preserves English Recall fallback for the intentionally partial Persian resources", async () => {
  const container = await renderRecallCards("fa");
  const descriptions = Array.from(
    container.querySelectorAll(".memory-provider-desc"),
    (node) => node.textContent,
  );
  expect(descriptions).toEqual([
    t("memory.providers.recall", "en"),
    t("memory.providers.recall", "en"),
  ]);
});
