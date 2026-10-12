// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  verifiedWindowsInstallerScript,
  PINNED_WINDOWS_INSTALL_SHA256,
} from "../src/main/installer-windows-download";
import { PINNED_INSTALL_COMMIT } from "../src/main/installer-download";

describe("Windows bootstrap integrity boundary", () => {
  // @lat: [[desktop-security#Runtime security#Verified Windows bootstrap]]
  it("checks original bytes before BOM conversion and execution; cleanup encloses download", () => {
    const script = verifiedWindowsInstallerScript(
      "C:\\Users\\O'Brien\\.hermes",
      "C:\\fixture",
    );
    expect(script).toContain("O''Brien");
    expect(script).toContain(`/${PINNED_INSTALL_COMMIT}/scripts/install.ps1`);
    expect(script).toContain(PINNED_WINDOWS_INSTALL_SHA256);
    expect(script).toContain(`-Commit '${PINNED_INSTALL_COMMIT}'`);
    const download = script.indexOf("Invoke-WebRequest");
    const check = script.indexOf("Get-FileHash");
    const convert = script.indexOf("WriteAllText");
    const invoke = script.indexOf("& $installer");
    expect(download).toBeLessThan(check);
    expect(check).toBeLessThan(convert);
    expect(convert).toBeLessThan(invoke);
    expect(script.lastIndexOf("try {", download)).toBeGreaterThan(
      script.indexOf("$exit = 87"),
    );
    expect(script).toContain(
      "} finally {\r\n  Remove-Item -LiteralPath $installer",
    );
  });
});
