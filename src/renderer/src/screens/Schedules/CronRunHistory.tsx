import { useCallback, useEffect, useRef, useState } from "react";
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
  refreshKey = 0,
}: {
  jobId: string;
  profile?: string;
  /** Bump to re-fetch the run list (after a run is triggered or jobs refresh). */
  refreshKey?: number;
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

  // Only the latest output request may write state; a bump also drops the
  // result of an in-flight request after the job or profile changes.
  const outputRequest = useRef(0);

  useEffect(() => {
    outputRequest.current += 1;
    setRuns(null);
    setOpenRun(null);
    setOutput(null);
    setOutputLoading(false);
  }, [jobId, profile]);

  useEffect(() => {
    let cancelled = false;
    setListError("");
    setUnsupported(false);
    window.hermesAPI
      .listCronRuns(jobId, 20, profile)
      .then((res) => {
        if (cancelled) return;
        if (res.success) setRuns(res.runs);
        else {
          setUnsupported(Boolean(res.unsupported));
          setListError(res.error || "");
          setRuns([]);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setListError(err instanceof Error ? err.message : String(err));
        setRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, profile, refreshKey]);

  const toggleRun = useCallback(
    async (runId: string): Promise<void> => {
      if (openRun === runId) {
        outputRequest.current += 1;
        setOpenRun(null);
        setOutputLoading(false);
        return;
      }
      const request = ++outputRequest.current;
      setOpenRun(runId);
      setOutput(null);
      setOutputLoading(true);
      try {
        const result = await window.hermesAPI.getCronRunOutput(
          jobId,
          runId,
          profile,
        );
        if (request === outputRequest.current) setOutput(result);
      } catch (err) {
        if (request === outputRequest.current) {
          setOutput({
            success: false,
            output: "",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        if (request === outputRequest.current) setOutputLoading(false);
      }
    },
    [jobId, profile, openRun],
  );

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
            onClick={() => void toggleRun(run.id)}
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
