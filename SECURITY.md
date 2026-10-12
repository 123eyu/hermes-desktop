# Security and downloaded content

Hermes Desktop treats Agent bootstrap scripts and community registry payloads as executable content. Released builds bind their automatic bootstrap downloads to an immutable Agent commit and SHA-256 digest. Windows verifies original bytes before its PowerShell 5.1 UTF-8 conversion. Both platforms pass the same commit to the Agent installer and fail installation on verification errors, even if an older Agent is already installed.

Discover uses an immutable registry commit and a build-pinned Git tree hash. Desktop reconstructs every tree object, rejects unsafe paths and symlinks, and verifies each downloaded blob before consuming its manifest or writing selected files. A folder is completely verified before writing any of its payloads. Agent personas are verified before profile creation. A missing or invalid snapshot produces an error; it does not fall back to mutable `main` content.

Review and update the commit and digest constants together in `src/main/installer-download.ts`, `src/main/installer-windows-download.ts` and `src/main/registry-integrity.ts`. Registry catalog additions require a reviewed Desktop pin update. Remote servers and external plugin providers retain their own installation and update policies.

This authenticates the bootstrap and registry snapshot, not every transitive package installed by Agent. Agent dependency resolution and explicit Agent updates remain managed by upstream; the pinned bootstrap avoids rolling an existing newer Agent backwards. Manual installation commands displayed for troubleshooting are explicit upstream-managed operations rather than the automatic verified path. Registry MCP commands can execute software supplied by other services, and their manifests must still be reviewed before a pin is approved.

Report suspected vulnerabilities privately through the repository's GitHub security advisory workflow when available. Never include API keys or unredacted private configuration in an issue.
