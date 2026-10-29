import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "../queries";
import { useAppRead, useInstanceRead } from "../reads";
import { useRunLog } from "../runLog";
import { useSession, useTarget } from "../session";
import { ErrorNotice } from "./Notice";
import { Explained } from "./Explained";
import { Panel } from "./Panel";
import type { PdfStand } from "../lib/pdfCache";
import { readSubFormDataTypes } from "../lib/dataTypeGroups";
import { logFromPdfTargets } from "../lib/logResults";
import { PDF_LANGUAGES, pdfPreviewQuery, pdfTargetKey, pdfTargetOptions, type PdfLanguage, type PdfTargetOption } from "../lib/pdfTargets";
import { Icon } from "./Icon";

/** The pdf in hand: which target it is of, by key and by name, and in which language. */
export interface HeldPdf {
    key: string;
    label: string;
    language: PdfLanguage;
}

interface PdfPanelProps {
    /** Why the panel cannot be used yet, or null when it can. See lib/readiness.ts. */
    notReady: string | null;
    /** The pdf in hand, or null when there is none. */
    held: HeldPdf | null;
    /** Where the pdf in hand stands against the instance. See lib/pdfCache.ts. */
    stand: PdfStand;
    language: PdfLanguage;
    onLanguageChange: (language: PdfLanguage) => void;
    /** Ask the app to render this target, whatever is held. */
    onRender: (target: PdfTargetOption) => void;
    /** Open the pdf already in hand, without asking again. */
    onShow: () => void;
    /** The key of the target being rendered, or null when nothing is. */
    rendering: string | null;
    hasToken: boolean;
    /** A render that never reached the app. One the app refused is a step in the log instead. */
    error: unknown;
}

/**
 * The pdf the app would archive, on its own and last.
 *
 * Not called the receipt pdf, which is what Altinn calls it, because some of the forms are
 * themselves receipts and the word would then mean two things a line apart.
 *
 * A different kind of action from everything above it: those read data, and this renders a
 * document from it. It is also the one read that is still a button, since rendering a pdf on
 * every selection would be wasteful, and it opens in a window over the tool rather than filling
 * a panel.
 *
 * Besides the whole instance it renders the main form alone, or one subform element, where the app
 * has the service tasks for it. Which tasks it has is asked of the app once per app, see
 * lib/pdfTargets.ts, and until it has answered the whole instance is all there is to press.
 *
 * What the buttons offer is the whole of the cache, said out loud. A render already in hand that
 * still describes the instance is shown rather than asked for again, and the panel says so rather
 * than quietly not making a request: a tool whose whole point is the run log should not have an
 * action that sometimes logs nothing without explaining itself.
 */
export function PdfPanel({ notReady, held, stand, language, onLanguageChange, onRender, onShow, rendering, hasToken, error }: PdfPanelProps) {
    const { instance, org, app, partyId, instanceGuid } = useTarget();
    const { tokenId } = useSession();
    const { append } = useRunLog();
    const { read, dataElements } = useInstanceRead();
    const { metadata } = useAppRead();
    const ready = hasToken && Boolean(org && app && partyId && instanceGuid);
    const busy = rendering !== null;

    const targetsQuery = useQuery({
        queryKey: queryKeys.pdfTargets(tokenId ?? "", org, app),
        queryFn: async () => {
            const result = await api.getPdfTargets({ tokenId: tokenId ?? "", org, app, instanceOwnerPartyId: partyId, instanceGuid });
            append(logFromPdfTargets(result));
            return result;
        },
        // Only through an instance the app has just answered for: a guid still being typed, or one
        // it does not know, would be a refused read in the log and an empty answer kept for the app.
        enabled: ready && read?.ok === true
    });

    const options = pdfTargetOptions(targetsQuery.data ?? null, dataElements, readSubFormDataTypes(metadata?.metadata ?? null));
    const single = options.length === 1;
    /** The button whose pdf is in hand and still current, if any is on screen. */
    const shownKey = held && stand === "current" ? held.key : null;
    const shownOption = options.find((option) => pdfTargetKey(option, language) === shownKey) ?? null;
    const languageName = (value: PdfLanguage) => PDF_LANGUAGES.find((entry) => entry.value === value)?.label ?? value;

    return (
        <Panel icon="file" id="panel-pdf" notReady={notReady} title="Pdf" tone="pdf">
            <Explained className="below-m" lead="The PDF the app would archive, made from the data as it is now.">
                The quickest way to see what the form turns into without walking the process to the end. It opens in a window over the tool. Where the
                app has the service tasks for it, the main form and each subform can be rendered on their own as well.
            </Explained>

            <div className="field below-m">
                <label htmlFor="pdfLanguage">Language</label>
                <select id="pdfLanguage" value={language} onChange={(event) => onLanguageChange(event.target.value as PdfLanguage)}>
                    {PDF_LANGUAGES.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                            {entry.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="row">
                {options.map((option) => {
                    const key = pdfTargetKey(option, language);
                    const current = key === shownKey;
                    const label = single ? (current ? "Show pdf" : "Render pdf") : option.label;
                    /*
                     * Grey when it shows the pdf in hand, blue when it asks for one. A method colour
                     * means the button talks to Altinn, and opening a render already held does not:
                     * it belongs with Show content and Full size rather than with Refresh.
                     */
                    return (
                        <button
                            key={key}
                            type="button"
                            className={`btn ${current ? "btn--ghost" : "btn--get"}`}
                            onClick={current ? onShow : () => onRender(option)}
                            disabled={busy || !ready}
                            title={`${instance}/pdf/preview${pdfPreviewQuery(option, language)}`}
                        >
                            {rendering === key ? <span className="btn__spinner" /> : <Icon name={current ? "eye" : "file"} />}
                            {label}
                        </button>
                    );
                })}

                {/* The other half of the choice, offered only where it is a different thing to do. */}
                {shownOption && (
                    <button type="button" className="btn btn--get" onClick={() => onRender(shownOption)} disabled={busy || !ready}>
                        <Icon name="refresh" />
                        Render again
                    </button>
                )}
                {held && !shownOption && (
                    <button type="button" className="btn btn--ghost" onClick={onShow} disabled={busy}>
                        <Icon name="eye" />
                        Show the last one
                    </button>
                )}
            </div>

            <p className="field__hint above-s">
                {shownOption ? (
                    <>
                        Nothing has changed on the instance since this was rendered, so{" "}
                        <strong>{single ? "Show pdf" : `the grey ${shownOption.label}`}</strong> opens the one in hand and asks the app for nothing.
                        <br />
                    </>
                ) : null}
                {held && stand === "stale" ? (
                    <>
                        The instance has changed since the last render, so that pdf describes what it was rather than what it is.
                        <br />
                    </>
                ) : null}
                {held && stand === "current" && !shownOption ? (
                    <>
                        The one in hand is {single ? "the pdf" : held.label} in {languageName(held.language)}.
                        <br />
                    </>
                ) : null}
                <span className="method method--get">GET</span> {instance}/pdf/preview?language={language}
                {single ? null : (
                    <>
                        <br />
                        Main form adds <code>taskId</code>, a subform <code>taskId</code> and <code>dataElementId</code>. Hover a button for its url.
                    </>
                )}
            </p>

            {error ? (
                <div className="above-m">
                    <ErrorNotice error={error} />
                </div>
            ) : null}
        </Panel>
    );
}
