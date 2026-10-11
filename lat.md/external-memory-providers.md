# External memory providers

External memory integrations are optional plugins installed separately from Desktop. Discovery reports code presence, not a working database, socket or dependency installation.

## Discovery boundaries

Local and SSH discovery inspect bundled provider directories and the selected profile's flat plugins directory. They never import plugin code, and a missing bundled install does not hide user plugins.

External `__init__.py` files must mention the Agent's memory-provider contract within their first 8 KiB. Hidden directories and ordinary plugins are ignored. A configured provider without discovered code remains visible with `installed: false`.

Direct Remote discovery stays server-authoritative through the selected profile's configuration schema and active provider. Desktop metadata never invents installed Remote providers; Remote Memory stays read-only as described in [[profile-editors#Profile editors#Remote capabilities]].

Project-local opt-in plugins and Python entry-point enumeration remain outside the Desktop directory scanner. Agent availability checks may execute plugins; Desktop deliberately does not use them for listing.

## Optional Graphnosis MCP

Graphnosis requires its separately installed app and memory plugin. The optional Local action registers a pinned stdio relay in the captured profile without downloading or starting it.

The relay is `@graphnosis/mcp-relay@1.0.3`; its default socket resolves through `os.homedir()` without shell expansion. Node.js and the unlocked Graphnosis app must be available on this machine when Hermes starts the server. Registration alone does not verify socket connectivity.

The main process validates [[profile-editors#Profile editors#Captured request target]] before any write and refuses this action for SSH or Remote targets. Existing manual MCP controls remain available. Target changes suppress delayed UI success, errors and refresh callbacks.

Graphnosis download links use fixed HTTPS destinations. Onboarding explains the external plugin prerequisite without installing it or changing `memory.provider`.
