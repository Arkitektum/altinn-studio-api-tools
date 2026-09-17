import { usePostRun } from "../writes";
import { postBlockers } from "../lib/postBlockers";
import { useSession } from "../session";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { PrevalidationSummary } from "../lib/chain";
import type { DataElementInput } from "../types";
import { Icon } from "./Icon";

interface PostPanelProps {
    /** Why the panel cannot be used yet, or null when it can. See lib/readiness.ts. */
    notReady: string | null;
    dataElements: DataElementInput[];
    advanceProcess: boolean;
    onAdvanceProcessChange: (next: boolean) => void;
    /** What the service last said, or null when it is switched off. Only for the note above the button. */
    prevalidation: PrevalidationSummary | null;
}

/**
 * The send: a new instance, or more data on the one selected.
 *
 * Which of the two is not a setting. An instance selected in Instances means the data is added to
 * it, and the new instance row means the post creates one, so two controls could disagree and this
 * one cannot. The button says which it will do.
 *
 * Its own panel rather than the foot of Payload, because it is the step everything above it leads
 * to and the rail points at it.
 */
export function PostPanel({ notReady, dataElements, advanceProcess, onAdvanceProcessChange, prevalidation }: PostPanelProps) {
    const { org, app, tokenUsable, partyId, instanceGuid } = useSession();
    const post = usePostRun();

    /** What the post is still missing, all of it at once. See lib/postBlockers.ts. */
    const blockers = postBlockers({ hasToken: tokenUsable, org, app, party: partyId, elements: dataElements });

    return (
        <Panel icon="upload" id="panel-post" notReady={notReady} tone="post" title="Post">
            <p className="field__hint" style={{ marginBottom: 10 }}>
                The instance is read back and validated automatically after every post.
            </p>

            <label className="check">
                <input type="checkbox" checked={advanceProcess} onChange={(event) => onAdvanceProcessChange(event.target.checked)} />
                <span className="check__body">
                    <span className="check__title">Sign and submit once it is posted</span>
                    {/*
                     * Which task the instance lands in is the app's business, so this says
                     * what the step is rather than naming an action it cannot know yet.
                     */}
                    <span className="check__note">
                        PUT /process/next straight after the upload, the same step as pressing send in the app. The app validates first, so it fails
                        while validation does not pass, and the data stays posted either way.
                    </span>
                </span>
            </label>

            <div style={{ marginTop: 18 }}>
                {blockers.length > 0 && (
                    <div className="notice notice--warn" style={{ marginBottom: 12 }}>
                        Needs {blockers.join(", ")}.
                    </div>
                )}

                {/*
                 * What the panel above has not been asked, or has been asked about something else.
                 * Said here rather than left to the prevalidation panel, because this is the button
                 * it would have saved you pressing.
                 */}
                {prevalidation && !prevalidation.run && (
                    <div className="notice" style={{ marginBottom: 12 }}>
                        Not prevalidated. What <strong>Prevalidate</strong> answers is what a refused submit would have told you, read before the
                        submit rather than after.
                    </div>
                )}
                {prevalidation?.stale && (
                    <div className="notice notice--warn" style={{ marginBottom: 12 }}>
                        The payload has changed since it was prevalidated, so what the service said describes something else.
                    </div>
                )}

                {post.error ? (
                    <div style={{ marginBottom: 12 }}>
                        <ErrorNotice error={post.error} />
                    </div>
                ) : null}

                <button
                    type="button"
                    className="btn btn--primary btn--fire"
                    onClick={() => post.mutate({ dataElements, advanceProcess })}
                    disabled={post.isPending || blockers.length > 0}
                >
                    {post.isPending ? <span className="btn__spinner" /> : <Icon name="upload" />}
                    {post.isPending ? "Posting…" : instanceGuid ? `Add data to ${instanceGuid.slice(0, 8)}` : `Post a new instance to ${org}/${app}`}
                </button>
            </div>
        </Panel>
    );
}
