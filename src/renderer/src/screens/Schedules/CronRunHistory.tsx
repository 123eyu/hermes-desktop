import { useEffect, useState } from "react";
import { useProfileEditorTarget } from "../../hooks/useProfileEditorTarget";
import type { ProfileEditorTarget } from "../../../../shared/profile-editor-target";
import { useI18n } from "../../components/useI18n";

type Runs = Awaited<ReturnType<typeof window.hermesAPI.listCronRuns>>;
type Run = Runs["runs"][number];

/** Server times are epoch seconds (or ISO strings); render either. */
export function formatRunTime(value: number | string | null): string {
  if (value === null || value === "") return "--";
  const date =
    typeof value === "number"
      ? new Date(value < 1e12 ? value * 1000 : value)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function tokenSummary(run: Run): string {
  if (run.input_tokens === null && run.output_tokens === null) return "";
  return `↑${run.input_tokens ?? 0} ↓${run.output_tokens ?? 0}`;
}

/**
 * Run history of one cron job: the list of past runs and, on click, the output
 * of a run. Mounted only while a card is expanded, so nothing is requested for
 * collapsed jobs.
 */
export function CronRunHistory({
  jobId,
  profile,
  connectionId,
  refreshKey = 0,
}: {
  jobId: string;
  profile?: string;
  connectionId?: string;
  refreshKey?: number;
}): React.JSX.Element {
  const { t } = useI18n();
  const { target, error, isCurrent } = useProfileEditorTarget(
    profile || "default",
    connectionId,
  );
  if (error) return <div className="schedules-card-error">{error}</div>;
  if (!target)
    return (
      <div className="schedules-history">{t("schedules.historyLoading")}</div>
    );
  return (
    <CronRunHistoryContent
      key={JSON.stringify([jobId, target.scopeToken])}
      jobId={jobId}
      target={target}
      isCurrent={isCurrent}
      refreshKey={refreshKey}
    />
  );
}

function CronRunHistoryContent({
  jobId,
  target,
  isCurrent,
  refreshKey,
}: {
  jobId: string;
  target: ProfileEditorTarget;
  isCurrent: (target: ProfileEditorTarget) => boolean;
  refreshKey: number;
}): React.JSX.Element {
  const { t } = useI18n();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [listError, setListError] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [output, setOutput] = useState<Awaited<
    ReturnType<typeof window.hermesAPI.getCronRunOutput>
  > | null>(null);
  const [outputLoading, setOutputLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setListError("");
    setUnsupported(false);
    void window.hermesAPI
      .listCronRuns(jobId, 20, target.profile, target)
      .then((res) => {
        if (cancelled || !isCurrent(target)) return;
        if (res.success) {
          setRuns(res.runs);
          setOpenRun((previous) =>
            res.runs.some((run) => run.id === previous) ? previous : null,
          );
        } else {
          setUnsupported(Boolean(res.unsupported));
          setListError(res.error || "");
          setRuns([]);
          setOpenRun(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled || !isCurrent(target)) return;
        setListError(err instanceof Error ? err.message : String(err));
        setRuns([]);
        setOpenRun(null);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, target, isCurrent, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setOutput(null);
    setOutputLoading(Boolean(openRun));
    if (!openRun || !isCurrent(target)) return;
    void window.hermesAPI
      .getCronRunOutput(jobId, openRun, target.profile, target)
      .then((result) => {
        if (!cancelled && isCurrent(target)) setOutput(result);
      })
      .catch((err: unknown) => {
        if (!cancelled && isCurrent(target))
          setOutput({
            success: false,
            output: "",
            error: err instanceof Error ? err.message : String(err),
          });
      })
      .finally(() => {
        if (!cancelled && isCurrent(target)) setOutputLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, target, isCurrent, openRun, refreshKey]);

  if (runs === null) {
    return (
      <div className="schedules-history">{t("schedules.historyLoading")}</div>
    );
  }
  if (unsupported) {
    return (
      <div className="schedules-history">
        {t("schedules.historyUnsupported")}
        {listError ? ` (${listError})` : ""}
      </div>
    );
  }
  if (listError) {
    return <div className="schedules-card-error">{listError}</div>;
  }
  if (runs.length === 0) {
    return (
      <div className="schedules-history">{t("schedules.historyEmpty")}</div>
    );
  }

  return (
    <div className="schedules-history">
      {runs.map((run) => (
        <div key={run.id} className="schedules-history-run">
          <button
            type="button"
            className="schedules-history-row"
            aria-expanded={openRun === run.id}
            onClick={() => {
              if (isCurrent(target))
                setOpenRun((previous) => (previous === run.id ? null : run.id));
            }}
          >
            <span>{formatRunTime(run.started_at)}</span>
            {run.is_active && <span>●</span>}
            <span className="schedules-history-preview">
              {run.preview || run.title}
            </span>
            <span>{tokenSummary(run)}</span>
          </button>
          {openRun === run.id && (
            <div className="schedules-history-output">
              {outputLoading && t("schedules.historyLoading")}
              {output && !output.success && (
                <div className="schedules-card-error">{output.error}</div>
              )}
              {output?.success && (
                <>
                  {output.partial && (
                    <div className="schedules-field-hint">
                      {t("schedules.historyOutputPartial")}
                    </div>
                  )}
                  <pre>{output.output}</pre>
                  {output.truncated && (
                    <div className="schedules-field-hint">
                      {t("schedules.historyOutputTruncated")}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
