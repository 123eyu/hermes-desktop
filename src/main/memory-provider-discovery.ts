import { closeSync, existsSync, openSync, readSync, readdirSync } from "fs";
import { join } from "path";
import { MEMORY_PROVIDER_METADATA } from "../shared/memory-provider-metadata";
import type { MemoryProviderInfo } from "./installer";

function providerSource(path: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const bytes = Buffer.alloc(8192);
    const text = bytes
      .subarray(0, readSync(fd, bytes, 0, bytes.length, 0))
      .toString();
    return (
      text.includes("MemoryProvider") ||
      text.includes("register_memory_provider")
    );
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// @lat: [[external-memory-providers#Discovery boundaries]]
export function discoverMemoryProviderDirectories(
  bundled: string,
  home: string,
  active: string,
): MemoryProviderInfo[] {
  const found = new Set<string>();
  for (const [root, external] of [
    [bundled, false],
    [join(home, "plugins"), true],
  ] as const) {
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || /^[_.]/.test(entry.name)) continue;
        const init = join(root, entry.name, "__init__.py");
        if (external ? providerSource(init) : existsSync(init))
          found.add(entry.name);
      }
    } catch {
      /* A missing bundled install does not hide user plugins. */
    }
  }
  return [...new Set([...found, ...(active ? [active] : [])])]
    .map((name) => ({
      name,
      description: MEMORY_PROVIDER_METADATA[name]?.description || name,
      envVars: MEMORY_PROVIDER_METADATA[name]?.envVars || [],
      installed: found.has(name),
      active: name === active,
    }))
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        Number(b.installed) - Number(a.installed) ||
        a.name.localeCompare(b.name),
    );
}

// Python runs only bounded file inspection; it never imports a provider.
export function memoryProviderDiscoveryScript(): string {
  return `
import json, os, sys
payload = json.load(sys.stdin)
profile = payload.get("profile")
base = os.path.expanduser("~/.hermes")
launchers = [os.path.expanduser("~/.config/hermes-desktop/remote-hermes"),
             os.path.join(base, "desktop-remote-hermes")]
if any(os.path.isfile(path) and os.access(path, os.X_OK) for path in launchers):
    raise RuntimeError("Memory provider discovery is unavailable for a managed SSH launcher; its runtime plugin home cannot be verified by directory inspection.")
configured_home = os.environ.get("HERMES_HOME")
if configured_home and os.path.realpath(os.path.expanduser(configured_home)) != os.path.realpath(base):
    raise RuntimeError("Memory provider discovery is unavailable for a custom SSH HERMES_HOME.")
home = os.path.join(base, "profiles", profile) if profile and profile != "default" else base
known = ${JSON.stringify(MEMORY_PROVIDER_METADATA)}
roots = [os.path.join(base, "hermes-agent", "plugins", "memory"),
         os.path.expanduser("~/hermes/plugins/memory"),
         os.path.expanduser("~/hermes-agent/plugins/memory"),
         "/usr/local/lib/hermes-agent/plugins/memory",
         "/opt/hermes/hermes-agent/plugins/memory"]
found = set()
def scan(root, external):
    try:
        for name in os.listdir(root):
            if name.startswith(("_", ".")) or not os.path.isdir(os.path.join(root, name)): continue
            init = os.path.join(root, name, "__init__.py")
            if not os.path.isfile(init): continue
            if external:
                try:
                    with open(init, encoding="utf-8", errors="replace") as f: source = f.read(8192)
                    if "MemoryProvider" not in source and "register_memory_provider" not in source: continue
                except OSError: continue
            found.add(name)
    except OSError: pass
for root in roots: scan(root, False)
scan(os.path.join(home, "plugins"), True)
active = payload.get("active") or ""
names = found | ({active} if active else set())
result = []
for name in sorted(names):
    meta = known.get(name, {"description": name, "envVars": []})
    result.append({"name": name, "description": meta["description"], "envVars": meta["envVars"], "installed": name in found, "active": name == active})
result.sort(key=lambda p: (not p["active"], not p["installed"], p["name"]))
print(json.dumps(result))
`;
}
