import { describe, expect, it } from "vitest";
import {
  LOCAL_PRESETS,
  OPENAI_COMPATIBLE_BASE_URLS,
  SETTINGS_SECTIONS,
  displayBrandFromConfig,
} from "../src/renderer/src/constants";
import { canonicalProviderBaseUrl } from "../src/main/provider-registry";
import {
  OPENAI_COMPAT_PROVIDERS,
  expectedEnvKeyForUrl,
} from "../src/shared/url-key-map";

describe("API Route preset", () => {
  // @lat: [[provider-setup#API Route provider preset#Setup persistence]]
  it("keeps setup, saved model branding, discovery and credentials on the same route", () => {
    const preset = LOCAL_PRESETS.find((entry) => entry.id === "api_route");
    expect(preset).toBeDefined();
    expect(preset?.group).toBe("remote");
    expect(preset?.baseUrl).toBe("https://global.api-route.com/v1");
    expect(preset?.envKey).toBe("API_ROUTE_API_KEY");
    expect(OPENAI_COMPAT_PROVIDERS.has("api_route")).toBe(true);
    expect(canonicalProviderBaseUrl("api_route")).toBe(preset?.baseUrl);
    expect(OPENAI_COMPATIBLE_BASE_URLS.api_route).toBe(preset?.baseUrl);
    expect(displayBrandFromConfig("custom", preset?.baseUrl || "")).toBe(
      "api_route",
    );
    expect(expectedEnvKeyForUrl(preset?.baseUrl)).toBe(preset?.envKey);
    expect(
      SETTINGS_SECTIONS.flatMap((section) => section.items),
    ).toContainEqual({
      key: "API_ROUTE_API_KEY",
      label: "constants.apiRouteApiKey",
      type: "password",
      hint: "constants.apiRouteHint",
    });
  });
});
