import { useEffect, useState } from "react";
import { useI18n } from "../../components/useI18n";
import { useProfileEditorTarget } from "../../hooks/useProfileEditorTarget";

// @lat: [[external-memory-providers#Optional Graphnosis MCP]]
export function GraphnosisMcp({
  profile,
  onInstalled,
}: {
  profile?: string;
  onInstalled: () => Promise<void>;
}): React.JSX.Element | null {
  const { t } = useI18n();
  const { target, isCurrent } = useProfileEditorTarget(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setBusy(false);
    setError("");
  }, [target]);
  if (!target || target.mode !== "local") return null;
  const install = async (): Promise<void> => {
    if (busy || !isCurrent(target)) return;
    setBusy(true);
    setError("");
    try {
      const result = await window.hermesAPI.addMcpServer(
        {
          name: "graphnosis",
          type: "stdio",
          command: "npx",
          args: ["-y", "@graphnosis/mcp-relay@1.0.3"],
          env: {},
        },
        target.profile,
        target,
      );
      if (!isCurrent(target)) return;
      if (!result.success)
        throw new Error(result.error || t("tools.mcpInstallFailed"));
      await onInstalled();
    } catch (reason) {
      if (isCurrent(target))
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (isCurrent(target)) setBusy(false);
    }
  };
  return (
    <div className="tools-graphnosis-promo">
      <div>
        <div className="tools-card-label">{t("tools.graphnosisMcpTitle")}</div>
        <div className="tools-card-description">
          {t("tools.graphnosisMcpDescription")}
        </div>
        {error && (
          <div role="alert" className="tools-error">
            {error}
          </div>
        )}
      </div>
      <div className="tools-graphnosis-promo-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void install()}
        >
          {busy
            ? t("tools.mcpInstallWorking")
            : t("tools.graphnosisMcpInstall")}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            void window.hermesAPI.openExternal(
              "https://graphnosis.com/download",
            )
          }
        >
          {t("tools.graphnosisMcpDownload")}
        </button>
      </div>
    </div>
  );
}
