import { useEffect, useState } from "react";
import { toCurl } from "../lib/curl";
import { prettyJson } from "../lib/format";
import { CopyButton } from "./CopyButton";
import { Dump } from "./Dump";
import { Modal } from "./Modal";
import { Panel } from "./Panel";
import type { LogEntry, LogResult, RunStep } from "../types";

interface RunLogProps {
    /** Newest first. */
    entries: LogEntry[];
    running: boolean;
    onClear: () => void;
    /** For the login link, since opening the app is a session of its own. */
    localtestUrl: string;
}

export function RunLog({ entries, running, onClear, localtestUrl }: RunLogProps) {
    // One run open at a time, following whatever ran last. Older runs stay one line each.
    const [openId, setOpenId] = useState<string | null>(null);
    const newestId = entries[0]?.id ?? null;
    useEffect(() => {
        if (newestId) setOpenId(newestId);
    }, [newestId]);

    return (
        <Panel
            title="Run log"
            aside={
                // A request starting or a run landing is worth hearing about, and this is the terse
                // version of it. The runs themselves are not a live region: each one is a wall of
                // steps, headers and bodies, and having that read out would bury the answer.
                <span className="row" style={{ gap: 6 }} role="status">
                    {running && (
                        <span className="badge">
                            <span className="led led--warn led--live" aria-hidden="true" />
                            running
                        </span>
                    )}
                    {entries.length > 0 && (
                        <>
                            {/* Named apart from the payload element's Clear, which does something else. */}
                            <button type="button" className="btn btn--ghost" onClick={onClear}>
                                Clear history
                            </button>
                            <span className="badge">
                                {entries.length} run{entries.length === 1 ? "" : "s"}
                            </span>
                        </>
                    )}
                </span>
            }
        >
            {entries.length === 0 && !running && (
                <div className="log-empty">
                    <strong>No requests yet</strong>
                    Every request this tool makes to Altinn is recorded here: method, URL, status, timing, and both bodies. Runs are kept, so a fetch
                    no longer replaces a post.
                </div>
            )}

            <div className="runs">
                {entries.map((entry) => (
                    <Run
                        key={entry.id}
                        entry={entry}
                        open={entry.id === openId}
                        onToggle={() => setOpenId(entry.id === openId ? null : entry.id)}
                        localtestUrl={localtestUrl}
                    />
                ))}
            </div>
        </Panel>
    );
}

function Run({ entry, open, onToggle, localtestUrl }: { entry: LogEntry; open: boolean; onToggle: () => void; localtestUrl: string }) {
    const { result } = entry;
    const totalMs = result.steps.reduce((sum, step) => sum + step.durationMs, 0);

    return (
        <div className={`run ${result.ok ? "run--ok" : "run--bad"}`}>
            <button type="button" className="run__head" aria-expanded={open} onClick={onToggle}>
                <span className="element__chevron" aria-hidden="true">
                    {open ? "▼" : "▶"}
                </span>
                {/* The title already says "Failed" when it did, so the dot is decoration here. */}
                <span className={`led ${result.ok ? "led--ok" : "led--bad"}`} aria-hidden="true" />
                <span className="run__title">{result.ok ? result.title : "Failed"}</span>
                <span className="spacer" />
                <span className="run__meta">
                    {result.steps.length} step{result.steps.length === 1 ? "" : "s"} · {totalMs} ms · {entry.at}
                </span>
            </button>

            {open && (
                <div className="run__body">
                    <Verdict result={result} totalMs={totalMs} localtestUrl={localtestUrl} />
                    <div className="tape">
                        {result.steps.map((step, position) => (
                            <Step key={`${position}-${step.name}`} step={step} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function Verdict({ result, totalMs, localtestUrl }: { result: LogResult; totalMs: number; localtestUrl: string }) {
    return (
        <div className={`verdict ${result.ok ? "verdict--ok" : "verdict--bad"}`}>
            {result.failedAt && (
                <div className="notice notice--bad" style={{ marginBottom: 10 }}>
                    {result.failedAt}
                </div>
            )}

            <dl className="verdict__rows">
                {result.rows.map((row) => (
                    <div key={row.label} style={{ display: "contents" }}>
                        <dt>{row.label}</dt>
                        <dd data-tone={row.tone}>{row.value}</dd>
                    </div>
                ))}
                <dt>Total</dt>
                <dd>{totalMs} ms</dd>
            </dl>

            {result.instanceUrl && (
                <div style={{ marginTop: 10 }}>
                    <div className="row" style={{ gap: 12 }}>
                        <a href={result.instanceUrl} target="_blank" rel="noreferrer">
                            Open instance in the app
                        </a>
                        <a href={`${localtestUrl}/`} target="_blank" rel="noreferrer">
                            Log in to LocalTest
                        </a>
                    </div>
                    {/*
                     * The token lives in server memory so the browser never holds one, which also
                     * means opening the app is a separate session. Without it Altinn bounces to
                     * LocalTest's front page with a goto, and the deep link's fragment is lost on
                     * the way back, so you land on the app rather than on the instance.
                     */}
                    <p className="field__hint" style={{ marginTop: 6 }}>
                        The app needs its own LocalTest session. If it bounces to a user picker, log in there once and open the instance again.
                    </p>
                </div>
            )}
        </div>
    );
}

/** 2xx reads as fine, 3xx as informational, 4xx as the request, 5xx as the app. */
function statusTone(status: number): "ok" | "info" | "warn" | "bad" {
    if (status < 300) return "ok";
    if (status < 400) return "info";
    if (status < 500) return "warn";
    return "bad";
}

/**
 * One request, as a block you can open.
 *
 * The block itself is the button. It used to carry two of its own, a fold for the bodies and a
 * copy for the curl, which put controls inside a list whose rows are already a fold inside a fold.
 * Now the whole thing is one target and everything it holds is in the window it opens, at the size
 * a request body actually needs.
 */
function Step({ step }: { step: RunStep }) {
    const [open, setOpen] = useState(false);
    // A step that made no request and carries no body has nothing to open.
    const openable = step.url !== "-" || step.requestPreview !== undefined || step.response !== undefined;

    return (
        <>
            <button
                type="button"
                className={`step${openable ? " step--openable" : ""}`}
                onClick={() => setOpen(true)}
                disabled={!openable}
                aria-haspopup="dialog"
                title={openable ? "Open this request, with its bodies and a curl command" : undefined}
            >
                <span className="step__head">
                    <span className="step__name">{step.name}</span>
                    <span className="spacer" />
                    {step.status !== null && <span className={`step__status step__status--${statusTone(step.status)}`}>{step.status}</span>}
                    <span className="step__status">{step.durationMs} ms</span>
                </span>

                {step.url !== "-" && (
                    <span className="step__url">
                        <span className={`step__method step__method--${step.method.toLowerCase()}`}>{step.method}</span> {step.url}
                    </span>
                )}

                {step.error && <span className="notice notice--bad step__error">{step.error}</span>}
            </button>

            {open && <StepWindow step={step} onClose={() => setOpen(false)} />}
        </>
    );
}

/** The request at full size: what was asked, what came back, and the command to ask again. */
function StepWindow({ step, onClose }: { step: RunStep; onClose: () => void }) {
    return (
        <Modal
            title={step.name}
            // The status and the timing belong with the title rather than on a row of their own:
            // what the window is for is the url and the bodies, and they may as well start at the
            // top of it.
            aside={
                <span className="row" style={{ gap: 8 }}>
                    {step.status !== null && <span className={`step__status step__status--${statusTone(step.status)}`}>{step.status}</span>}
                    <span className="step__status">{step.durationMs} ms</span>
                    {step.url !== "-" && (
                        <CopyButton
                            label="Copy curl"
                            title="The request as a curl command, with the token left as $TOKEN"
                            text={() => toCurl(step)}
                        />
                    )}
                </span>
            }
            bodyClassName="modal__stack"
            onClose={onClose}
        >
            {/* The url first, since it is what the rest of the window is about. */}
            {step.url !== "-" && (
                <p className="detail__url">
                    <span className={`step__method step__method--${step.method.toLowerCase()}`}>{step.method}</span> {step.url}
                </p>
            )}

            {step.error && <div className="notice notice--bad">{step.error}</div>}

            {step.requestPreview !== undefined && (
                <>
                    {/* Said here rather than in the header, since it is about this body and only
                        two kinds of step have one: a base64 upload and a multipart instantiation. */}
                    {step.requestVerbatim === false && (
                        <p className="field__hint">A summary of what was sent, not the bytes themselves, so it cannot be replayed as written.</p>
                    )}
                    {/* The request went out as it is written, so its own content type names the
                        language. A multipart body says multipart, and is left uncoloured. */}
                    <Dump label="Request" text={step.requestPreview} contentType={step.requestHeaders?.["content-type"]} />
                </>
            )}

            {step.response !== undefined && step.response !== null && (
                // Always json by the time it is here: the api hands back parsed bodies, and an xml
                // one arrives as a string inside them.
                <Dump label="Response" text={prettyJson(step.response)} contentType="application/json" />
            )}

            {step.requestPreview === undefined && step.response === undefined && (
                <p className="field__hint">No bodies were recorded for this request.</p>
            )}
        </Modal>
    );
}
