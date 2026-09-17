import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { queryKeys } from "./queries";
import { useAppRead, useInstanceRead } from "./reads";
import { usePrevalidation } from "./writes";
import { summarisePrevalidation } from "./lib/validationReport";
import { useRunLog } from "./runLog";
import { useSession } from "./session";
import { splitPastedInstanceId } from "./lib/instanceId";
import { bytesFromBase64 } from "./lib/formats";
import { logFromAdvance, logFromPdf } from "./lib/logResults";
import { withIdentity } from "./lib/formIdentity";
import { withAppDefaults } from "./lib/payloadDefaults";
import { identityFor } from "./lib/identity";
import { processLabel } from "./lib/format";
import { fingerprintInstance, pdfStand } from "./lib/pdfCache";
import { neededExamples, refKey, removePayload, restoreElements, toSavedPayload, upsertPayload } from "./lib/savedPayloads";
import { useLocalStorage } from "./lib/useLocalStorage";
import { readiness } from "./lib/readiness";
import type { PrevalidationSummary } from "./lib/chain";
import { Chain } from "./components/Chain";
import { ErrorNotice } from "./components/Notice";
import { FetchPanel } from "./components/FetchPanel";
import { PdfPanel } from "./components/PdfPanel";
import { InstancesPanel } from "./components/InstancesPanel";
import { PayloadPanel } from "./components/PayloadPanel";
import { PrevalidationPanel } from "./components/PrevalidationPanel";
import { PostPanel } from "./components/PostPanel";
import { ProcessPanel } from "./components/ProcessPanel";
import { RunLog } from "./components/RunLog";
import { PdfModal, type PdfPreview } from "./components/PdfModal";
import { ValidationPanel } from "./components/ValidationPanel";
import { TargetPanel } from "./components/TargetPanel";
import { TokenPanel } from "./components/TokenPanel";
import type { DataElementInput, ExampleContent, InstanceSummary, ReadInstanceResult, SavedPayload, ValidateResult } from "./types";
import { Icon } from "./components/Icon";

const EMPTY_ELEMENT: DataElementInput = { dataType: "", content: "" };

/** What the instance query answers with: the read and the validation that went with it. */
interface InstanceAnswer {
    read: ReadInstanceResult;
    validated: ValidateResult | null;
}

export function App() {
    const queryClient = useQueryClient();

    /*
     * Who the tool is, where it is pointed, and what the server says. Read rather than held: the
     * session provider above owns it, so the panels below read the same thing this does instead of
     * being handed pieces of it. See session.tsx.
     */
    const {
        activeToken,
        tokenId: activeTokenId,
        tokenUsable,
        tokens,
        setPreferredTokenId,
        org,
        app,
        partyId: instanceOwnerPartyId,
        instanceGuid,
        setOrg,
        setApp,
        setPartyId: setInstanceOwnerPartyId,
        setInstanceGuid,
        appHost,
        serverConfig,
        localtest,
        catalogue,
        exampleGroups,
        bootError
    } = useSession();

    const runLog = useRunLog();
    const appendLog = runLog.append;

    // The party value this session last filled in from a token claim. See the effect below.
    const [autoFilledParty, setAutoFilledParty] = useLocalStorage<string | null>("partyAutoFilledFrom", null);
    const [dataElements, setDataElements] = useLocalStorage<DataElementInput[]>("dataElements", [EMPTY_ELEMENT]);
    /** Whole payloads kept for later, newest first. See lib/savedPayloads.ts for what is kept. */
    const [savedPayloads, setSavedPayloads] = useLocalStorage<SavedPayload[]>("savedPayloads", []);
    /** What the last load had to say, an example that has gone since being the case worth saying. */
    const [payloadLoadNotice, setPayloadLoadNotice] = useState<string | null>(null);
    const [advanceProcess, setAdvanceProcess] = useLocalStorage("advanceProcess", false);

    const appRead = useAppRead();
    const metadata = appRead.metadata;
    const parties = appRead.parties;

    /**
     * Every run that has happened this session, newest first. Posting used to wipe whatever a
     * fetch had left behind, and vice versa, so they are kept instead.
     */
    /**
     * The latest validation per target, so an instance result and several data element results can
     * be on screen together. Kept apart from the run history: a fetch should not blank the issues.
     */

    /**
     * The rendered pdf, held as a blob url. Only one at a time: rendering again replaces it, and
     * the old url is revoked so the blob can be collected.
     *
     * Kept after the window is closed, which is why the window has a flag of its own. It used to be
     * thrown away on close, so looking at the same document twice meant rendering it twice.
     */
    const [pdfPreview, setPdfPreview] = useState<PdfPreview | null>(null);
    const [pdfOpen, setPdfOpen] = useState(false);

    /** And which instance has already been read, so it is read once per selection. */

    /** Which data element the operator picked. Empty means whichever the instance lists first. */
    const [preferredDataGuid, setPreferredDataGuid] = useState("");

    /*
     * One flag per action rather than one for all of them. They run at different times and belong
     * to different panels: the instance read starts on its own when a selection changes, and it
     * used to grey out Render pdf and Advance while it ran, neither of which it has anything to do
     * with. The errors are split for the same reason. A read that failed without being asked for
     * has no business appearing under the buttons in Data element.
     */

    /**
     * The instance on screen, for the pdf render to compare against. A callback closes over the
     * render that started it, and what a late answer has to be checked against is the selection
     * now. Set by hand as well, where a flow moves the selection and reads it back without a
     * render in between.
     */
    const shownInstance = useRef(instanceGuid);
    useEffect(() => {
        shownInstance.current = instanceGuid;
    });

    const instanceRead = useInstanceRead();
    const instanceDataElements = instanceRead.dataElements;
    /** Where the instance stands, from the last read or process move. */
    const instanceProcess = instanceRead.process;

    /**
     * The instance as it stands, and where the pdf in hand is against it.
     *
     * A render is the most expensive read the tool makes, so it is only asked for again once
     * something it would render has moved. See lib/pdfCache.ts for what counts as moved.
     */
    const pdfFingerprint = useMemo(
        () => fingerprintInstance({ dataElements: instanceDataElements, process: instanceProcess }),
        [instanceDataElements, instanceProcess]
    );
    const pdfHeld = pdfStand(pdfPreview?.fingerprint ?? null, pdfFingerprint);

    /**
     * The data element the Inspect column is about: the one picked, or the first the instance has.
     *
     * Derived the way the token in use is, and it replaces the same repair in two places. Reading an
     * instance used to preselect the first element, and advancing the process used to check whether
     * the selected one had survived the move and fall back if it had not. Both are this.
     */
    const selectedElement = instanceDataElements.find((element) => element.id === preferredDataGuid) ?? instanceDataElements[0] ?? null;
    const dataGuid = selectedElement?.id ?? "";

    const selectedDataType = selectedElement?.dataType ?? "";

    /**
     * The payload element the comparison reads, which is the one of the same data type holding
     * text. Base64 is left out: a comparison is about xml.
     */
    const payloadForSelected = useMemo(
        () =>
            selectedDataType
                ? dataElements.find((element) => element.dataType === selectedDataType && element.content.trim() && element.encoding !== "base64")
                : undefined,
        [selectedDataType, dataElements]
    );

    /**
     * And the text itself. Whether it parses is not asked here: that is a scan of the whole
     * document, this is recomputed on every keystroke, and the 838-neighbour Nabovarsel in
     * `examples/forms/NV` is a megabyte. The comparison asks it once, behind the delay below.
     */
    const comparable = useMemo(() => {
        // Only while there is something to compare it against.
        if (!dataGuid) return null;
        const text = payloadForSelected?.content ?? "";
        return text.trim() ? text : null;
    }, [payloadForSelected, dataGuid]);

    /** How much the payload holds for the selected type and where it came from, for the diff. */
    const writtenLabel = payloadForSelected
        ? `${payloadForSelected.content.length.toLocaleString("nb")} characters${payloadForSelected.exampleName ? ` · from ${payloadForSelected.exampleName}` : ""}`
        : null;

    /** Picking another data element is a different key, so nothing here has to be dropped by hand. */
    const changeDataGuid = useCallback((next: string) => setPreferredDataGuid(next), []);

    /** Replaces the held preview, revoking the previous blob url so it is not leaked. */
    const showPdf = useCallback((next: PdfPreview | null) => {
        setPdfPreview((current) => {
            if (current) URL.revokeObjectURL(current.url);
            return next;
        });
        // A fresh render opens; dropping the held one shuts the window it was in.
        setPdfOpen(next !== null);
    }, []);

    const clearPdf = useCallback(() => showPdf(null), [showPdf]);

    /**
     * Points the tool at an instance, or at none.
     *
     * The data element list, the process and which element is selected used to be cleared here, and
     * are not any more: they are the instance query and a preference read against it, both keyed on
     * the guid this is setting. What is left is the state that is nobody's answer, the issues and
     * the pdf, which nothing would drop on its own.
     */
    const selectInstance = useCallback(
        (instance: InstanceSummary | null) => {
            const guid = instance?.instanceGuid ?? "";
            if (guid !== instanceGuid) {
                runLog.clearValidations();
                clearPdf();
            }
            setInstanceGuid(guid);
            // The party follows the instance, since a listing is per party and a row knows its own.
            if (instance) setInstanceOwnerPartyId(instance.instanceOwnerPartyId);
        },
        [instanceGuid, runLog, clearPdf, setInstanceGuid, setInstanceOwnerPartyId]
    );

    /**
     * An instance reached by its guid rather than by a row, for one the active list leaves out.
     * A pasted "510001/guid" pair brings its party with it, and a bare guid belongs to the party
     * already chosen.
     */
    const selectTypedInstance = useCallback(
        (value: string) => {
            const { partyId, guid } = splitPastedInstanceId(value);
            selectInstance(
                guid
                    ? {
                          id: `${partyId ?? instanceOwnerPartyId}/${guid}`,
                          instanceOwnerPartyId: partyId ?? instanceOwnerPartyId,
                          instanceGuid: guid,
                          lastChanged: null,
                          lastChangedBy: null,
                          // Nothing has said where it stands, and a guid alone does not.
                          state: "active"
                      }
                    : null
            );
        },
        [instanceOwnerPartyId, selectInstance]
    );

    /** A party of its own, since choosing one drops the instance that belonged to the last. */
    const changeParty = useCallback(
        (next: string) => {
            setInstanceOwnerPartyId(next);
            if (next !== instanceOwnerPartyId) selectInstance(null);
        },
        [instanceOwnerPartyId, setInstanceOwnerPartyId, selectInstance]
    );

    /*
     * Held rather than spelled out again each render, because the fallback is a fresh empty array
     * every time and several memos below list this in their dependencies. One of them would never
     * hit while the app is unprobed, which is exactly when it is cheapest to be wrong about.
     */
    const dataTypes = useMemo(() => metadata?.metadata.dataTypes ?? [], [metadata]);

    /**
     * Who the payload is from: the party being acted for, or the token's own claim before the app
     * has been read for its parties. Written into the form data as it is loaded, and sent to the
     * validation service as the submitter, which is the same fact told twice on purpose.
     */
    const identity = useMemo(() => identityFor(parties, instanceOwnerPartyId, activeToken), [parties, instanceOwnerPartyId, activeToken]);

    const catalogueEntry = useMemo(() => catalogue.find((entry) => entry.org === org && entry.app === app) ?? null, [catalogue, org, app]);

    /**
     * What to offer in the data-type field before the app has been probed: the catalogue's view of
     * this app if we know it, otherwise every data type we have example files for.
     */
    const suggestedDataTypes = useMemo(() => {
        if (catalogueEntry) {
            return [catalogueEntry.dataType, ...catalogueEntry.subForms.map((subform) => subform.dataType)];
        }
        // Attachment groups are keyed by content type, so they are not data type suggestions.
        return exampleGroups.filter((group) => group.kind !== "attachment").map((group) => group.key);
    }, [catalogueEntry, exampleGroups]);

    /**
     * Keep the instance owner in step with the token's own party claim, which for a LocalTest user
     * is almost always the party you want.
     *
     * Only fills an empty field or replaces a value this effect put there itself, so a party typed
     * by hand survives a token switch. Acting on behalf of another party is a real case.
     *
     * The marker is persisted rather than kept in a ref, because otherwise a party restored from a
     * previous session would look hand-typed and switching user would leave the wrong party behind.
     */
    useEffect(() => {
        const claim = activeToken?.partyId;
        if (!claim) return;
        if (instanceOwnerPartyId && instanceOwnerPartyId !== autoFilledParty) return;
        if (instanceOwnerPartyId !== claim) setInstanceOwnerPartyId(claim);
        if (autoFilledParty !== claim) setAutoFilledParty(claim);
    }, [activeToken, instanceOwnerPartyId, setInstanceOwnerPartyId, autoFilledParty, setAutoFilledParty]);

    /**
     * Puts the test user into the form data, so the submission is from whoever the token is.
     *
     * Only elements still holding a shipped example unedited, which is what `example` marks: an
     * example is data to work from and this is part of loading it, but text you wrote or a file you
     * picked is yours and is left alone. An edit clears the marker, so the tool stops writing into
     * an element the moment you start.
     *
     * Here rather than at the example picker, because who you are arrives on its own schedule. The
     * app is read for its parties while the first example is already loading, and the party can
     * change afterwards. Running it again on every change keeps the two in step, and it settles
     * after one pass: writing the same identity into a form it is already in changes nothing, and
     * an unchanged list is returned as it was.
     */
    useEffect(() => {
        if (!identity) return;
        setDataElements((current) => withIdentity(current, identity));
    }, [identity, dataElements, setDataElements]);

    /**
     * And what the app declares, filled into the payload: its form data type where nothing has been
     * chosen, and a content type on any element without one.
     *
     * On the answer rather than on the way out of the request that fetched it. There is no longer a
     * call holding a payload from an earlier render to write back over this one, which is exactly
     * what this got wrong before. `withAppDefaults` returns the list it was given when there is
     * nothing to add, so running again on every answer costs nothing and settles after one pass.
     */
    useEffect(() => {
        if (dataTypes.length === 0) return;
        setDataElements((current) => withAppDefaults(current, dataTypes));
    }, [dataTypes, setDataElements]);

    /**
     * Keeps the payload as it stands, under a name.
     *
     * localStorage can refuse, and a payload holding a file picked off disk is the way to make it:
     * base64 of a few megabytes fills a quota that everything else in here is nowhere near. The
     * refusal is worth saying out loud rather than losing the save silently.
     */
    function savePayload(name: string) {
        const payload = toSavedPayload({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            savedAt: new Date().toISOString(),
            org,
            app,
            elements: dataElements
        });
        try {
            setSavedPayloads(upsertPayload(savedPayloads, payload));
            setPayloadLoadNotice(null);
        } catch {
            setPayloadLoadNotice(
                "The browser would not store that payload. An element holding a file picked off disk is usually why: its bytes are kept in full, " +
                    "where an example is only a reference. Remove it, or load it from disk again after loading the payload."
            );
        }
    }

    /**
     * Puts a saved payload back, reading every example it points at as the file stands now. One
     * that has gone since leaves its element behind, empty, and is named in the notice: a payload
     * quietly one element short would post quietly too.
     */
    async function loadPayload(payload: SavedPayload) {
        const files = new Map<string, ExampleContent>();
        await Promise.all(
            neededExamples(payload).map(async (ref) => {
                try {
                    // The app as selected now, not as it was when the payload was saved: a saved
                    // payload is a pointer at the examples, and it is read as they stand today.
                    files.set(refKey(ref), await api.getExampleFile({ ...ref, app }));
                } catch {
                    /* left out of the map, which is what marks it missing below */
                }
            })
        );

        const { elements, missing } = restoreElements(payload, files);
        setDataElements(elements);
        setPayloadLoadNotice(
            missing.length === 0
                ? null
                : `Loaded "${payload.name}" without ${missing.length === 1 ? "one example that is" : `${missing.length} examples that are`} no longer on disk: ${missing.join(", ")}. ` +
                      "Those elements are here with their data type and no content."
        );
    }

    /**
     * Renders the instance as the pdf Altinn would produce.
     *
     * The one read still guarded by hand, because what it produces is not an answer in the cache
     * but a blob url held open in a window. The instance it was asked for is named before the
     * request so a render that lands after the selection moved does not open as though it were the
     * instance now on screen.
     *
     * The fingerprint is taken with it for the same reason: what the pdf describes is the instance
     * as it was when the render was asked for, not as it is when the bytes arrive.
     */
    const renderPdf = useMutation({
        mutationFn: async (asked: { requested: string; fingerprint: string | null }) => {
            const result = await api.previewPdf({
                tokenId: activeTokenId ?? "",
                org,
                app,
                instanceOwnerPartyId,
                instanceGuid: asked.requested
            });
            appendLog(logFromPdf(result, result.size));
            return { result, asked };
        },
        onSuccess: ({ result, asked }) => {
            if (shownInstance.current !== asked.requested) return;
            if (!result.ok || !result.content) {
                // A failed render must not leave the previous pdf on screen looking current.
                clearPdf();
                return;
            }
            const bytes = bytesFromBase64(result.content);
            showPdf({
                url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
                size: result.size,
                at: new Date().toLocaleTimeString("nb"),
                fingerprint: asked.fingerprint
            });
        }
    });

    const advance = useMutation({
        mutationFn: async () => {
            const params = { tokenId: activeTokenId ?? "", org, app, instanceOwnerPartyId, instanceGuid };
            // The task the instance is in, which is what names the action. Already read, so this
            // costs no extra request.
            const from = instanceProcess?.taskType ?? null;
            const result = await api.advanceProcess({ ...params, taskType: from });

            // Read the instance afterwards, because advancing can change more than the task: the
            // app may add data elements on the way out of one, a generated pdf among them, and the
            // panels below are showing the list from before the move. A failed read must not turn
            // a successful advance into a failure, so it degrades to null with its step in the log.
            let read: ReadInstanceResult | null = null;
            if (result.ok) {
                try {
                    read = await api.getInstance(params);
                } catch {
                    /* the advance still stands */
                }
            }
            appendLog(logFromAdvance(result, read, from));

            // Named before the move, so the answer lands on the instance that was advanced rather
            // than on whichever is selected when it comes back.
            return { result, read, key: queryKeys.instance(params.tokenId, org, app, instanceOwnerPartyId, instanceGuid) };
        },
        onSuccess: ({ result, read, key }) => {
            /*
             * Nothing here has to preserve which data element was selected: that is a preference
             * read against the list, so one that survived the move stays and one that did not falls
             * back to the first.
             *
             * The read is the later answer, so it wins. Without one, the advance's own response
             * still carries the process it landed in, and a refused move leaves the task the
             * instance is still in on screen rather than blanking it.
             */
            queryClient.setQueryData<InstanceAnswer>(key, (current) => {
                if (read?.ok) return { read, validated: current?.validated ?? null };
                const moved = result.ok ? result.process : null;
                if (!moved || !current) return current;
                return { ...current, read: { ...current.read, process: moved } };
            });
        }
    });

    // Panels you cannot use yet are left out rather than shown dead.
    /*
     * What the rail says about the payload and the prevalidation, which the payload panel also
     * shows in full. Reading it twice costs nothing: the report lives in the cache and the request
     * it is compared against is a memo of the payload.
     */
    const prevalidation = usePrevalidation(dataElements);
    const payloadSummary = {
        elements: dataElements.length,
        ready: dataElements.length > 0 && dataElements.every((element) => element.dataType && element.content.trim())
    };

    /**
     * What the service last said, or null when it is switched off.
     *
     * Built once and handed to both the rail and the post panel, which want the same fact for
     * different reasons: one says where you are, the other says what you are about to skip.
     */
    const prevalidationSummary: PrevalidationSummary | null = prevalidation.url ? summarisePrevalidation(prevalidation.prevalidation) : null;

    // Every panel is on screen from the start, and one you cannot use yet says what it is waiting
    // for. See lib/readiness.ts.
    const waiting = readiness({
        hasToken: tokenUsable,
        org,
        app,
        party: instanceOwnerPartyId,
        instance: instanceGuid,
        dataElement: dataGuid
    });

    return (
        /*
         * Everything is inside it, because where the tool is pointed is what the whole page is
         * about. The panels that act on the target take what they act on as props; the ones that
         * only print the url they would call read it from here.
         */
        <div className="shell">
            <header className="masthead">
                <span className="masthead__mark">Altinn API tools</span>
                {/*
                 * Three states. Each was a coloured dot and nothing else, which made the masthead a
                 * row of three greens or three reds you had to already know the order of. A tick or
                 * a cross says which without the colour, and each still carries the same message in
                 * words for anyone neither reaches. The region is polite: these change on their own,
                 * and they are worth hearing about.
                 */}
                <div className="masthead__meta" role="status">
                    <span className="gauge" title={appHost}>
                        <span className={`gauge__mark gauge__mark--${serverConfig ? "ok" : "bad"}`}>
                            <Icon name={serverConfig ? "check" : "cross"} />
                        </span>
                        {appHost.replace(/^https?:\/\//, "")}
                        <span className="sr-only">{serverConfig ? " api answering" : " api not answering"}</span>
                    </span>
                    <span className="gauge" title={localtest?.error ?? localtest?.url}>
                        <span className={`gauge__mark gauge__mark--${localtest?.reachable ? "ok" : "bad"}`}>
                            <Icon name={localtest?.reachable ? "check" : "cross"} />
                        </span>
                        LocalTest
                        <span className="sr-only">{localtest?.reachable ? " answering" : " not answering"}</span>
                    </span>
                    <span className="gauge">
                        <span className={`gauge__mark gauge__mark--${tokenUsable ? "ok" : "bad"}`}>
                            <Icon name={tokenUsable ? "check" : "cross"} />
                        </span>
                        {activeToken ? activeToken.label : "No token"}
                        <span className="sr-only">{tokenUsable ? " token valid" : " no usable token"}</span>
                    </span>
                </div>
            </header>

            <div className="deck">
                {/* What the tool is working on, how far down it you are, and what is left to fill in. */}
                <Chain
                    user={activeToken && tokenUsable ? activeToken.label : null}
                    application={org && app ? `${org}/${app}` : null}
                    party={instanceOwnerPartyId || null}
                    instance={instanceGuid ? instanceGuid.slice(0, 8) : null}
                    dataElement={selectedDataType || null}
                    payload={payloadSummary}
                    prevalidation={prevalidationSummary}
                    post={{ stored: instanceDataElements.length }}
                    pdf={pdfHeld}
                    process={instanceProcess ? { at: processLabel(instanceProcess), ended: instanceProcess.ended !== null } : null}
                />

                <div className="column">
                    {bootError ? <ErrorNotice error={bootError} /> : null}

                    {/* First, because everything below it needs a token and the chain says so. */}
                    <TokenPanel
                        id="panel-test-user"
                        serverConfig={serverConfig}
                        localtest={localtest}
                        tokens={tokens}
                        activeToken={activeToken}
                        onActivate={setPreferredTokenId}
                    />

                    <TargetPanel
                        notReady={waiting.target}
                        id="panel-target"
                        org={org}
                        app={app}
                        onOrgChange={setOrg}
                        onAppChange={setApp}
                        instanceOwnerPartyId={instanceOwnerPartyId}
                        onPartyChange={changeParty}
                        catalogue={catalogue}
                        onPickCatalogueApp={(entry) => {
                            setOrg(entry.org);
                            setApp(entry.app);
                            // Point the first element at this app's form data type unless the operator
                            // has already put something there.
                            if (dataElements.length === 1 && !dataElements[0]?.content.trim()) {
                                setDataElements([{ dataType: entry.dataType, content: "" }]);
                            }
                        }}
                        metadata={metadata}
                        parties={parties}
                        onProbe={appRead.refetch}
                        probing={appRead.probing}
                        probeError={appRead.error}
                    />

                    {/* Right under the destination, since choosing one is how you aim at it. */}
                    <InstancesPanel
                        notReady={waiting.instances}
                        id="panel-instances"
                        elementCount={dataElements.length}
                        onSelect={selectInstance}
                        onSelectTyped={selectTypedInstance}
                    />

                    <>
                        <span className="group">Post</span>

                        <PayloadPanel
                            notReady={waiting.requests}
                            dataElements={dataElements}
                            onChange={setDataElements}
                            suggestedDataTypes={suggestedDataTypes}
                            savedPayloads={savedPayloads}
                            onSavePayload={savePayload}
                            onLoadPayload={(payload) => void loadPayload(payload)}
                            onDeletePayload={(id) => setSavedPayloads(removePayload(savedPayloads, id))}
                            loadNotice={payloadLoadNotice}
                        />

                        {/*
                         * Only where a service is configured. Switched off is not a step you
                         * skipped, so there is nothing to show rather than a panel that would wait
                         * for ever. The rail leaves the step out on the same condition.
                         */}
                        {prevalidationSummary && (
                            <PrevalidationPanel notReady={waiting.requests} dataElements={dataElements} onChange={setDataElements} />
                        )}

                        <PostPanel
                            notReady={waiting.requests}
                            dataElements={dataElements}
                            advanceProcess={advanceProcess}
                            onAdvanceProcessChange={setAdvanceProcess}
                            prevalidation={prevalidationSummary}
                        />

                        <span className="group">Inspect</span>

                        <FetchPanel
                            notReady={waiting.requests}
                            id="panel-data-element"
                            dataGuid={dataGuid}
                            onDataGuidChange={changeDataGuid}
                            written={comparable}
                            writtenLabel={writtenLabel}
                        />

                        {/* After the data element, since it is a different kind of action. */}
                        <PdfPanel
                            notReady={waiting.process}
                            stand={pdfHeld}
                            onRender={() => renderPdf.mutate({ requested: instanceGuid, fingerprint: pdfFingerprint })}
                            onShow={() => setPdfOpen(true)}
                            busy={renderPdf.isPending}
                            hasToken={tokenUsable}
                            error={renderPdf.error}
                        />

                        {/* Where the instance stands, once a read has said. */}
                        <ProcessPanel
                            notReady={waiting.process ?? (instanceProcess ? null : "Reading the instance…")}
                            process={instanceProcess}
                            onAdvance={() => advance.mutate()}
                            busy={advance.isPending}
                            hasToken={tokenUsable}
                            error={advance.error}
                        />
                    </>
                </div>

                <div className="column column--log">
                    <ValidationPanel />
                    <RunLog />
                </div>
            </div>

            {/* Closing puts the pdf away rather than throwing it out, so Show pdf can open it again. */}
            {pdfPreview && pdfOpen && <PdfModal preview={pdfPreview} onClose={() => setPdfOpen(false)} />}
        </div>
    );
}
