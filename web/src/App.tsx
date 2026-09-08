import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { preferredContentType } from "./lib/contentType";
import { isExpired } from "./lib/format";
import { downloadContent, suggestedFilename } from "./lib/download";
import { bytesFromBase64 } from "./lib/formats";
import { clampRepeat, MAX_REPEAT, splitPastedInstanceId } from "./lib/inputs";
import { buildInstanceTemplate, type TemplateFields } from "./lib/instanceTemplate";
import {
    logFromAdvance,
    logFromDataElement,
    logFromDelete,
    logFromInstance,
    logFromInstances,
    logFromPdf,
    logFromRun,
    logFromValidation
} from "./lib/logResults";
import { placeLoaded } from "./lib/payload";
import { useLocalStorage } from "./lib/useLocalStorage";
import { visibleSections } from "./lib/sections";
import { upsertValidation } from "./lib/validations";
import { ErrorNotice } from "./components/Notice";
import { FetchPanel } from "./components/FetchPanel";
import { PayloadPanel } from "./components/PayloadPanel";
import { ProcessPanel } from "./components/ProcessPanel";
import { RunLog } from "./components/RunLog";
import { PdfPanel, type PdfPreview } from "./components/PdfPanel";
import { ValidationPanel } from "./components/ValidationPanel";
import { TargetPanel } from "./components/TargetPanel";
import { TokenPanel } from "./components/TokenPanel";
import type {
    AppMetadataResponse,
    AppParty,
    CatalogueApp,
    DataElementInput,
    DataElementSummary,
    ExampleGroup,
    FetchedDataElement,
    InstanceSummary,
    LocaltestStatus,
    LogEntry,
    LogResult,
    ProcessSummary,
    PublicToken,
    ReadInstanceResult,
    RunMode,
    RunResult,
    ServerConfig,
    ValidateResult,
    ValidationView
} from "./types";

const EMPTY_ELEMENT: DataElementInput = { dataType: "", content: "" };

export function App() {
    const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
    const [localtest, setLocaltest] = useState<LocaltestStatus | null>(null);
    const [catalogue, setCatalogue] = useState<CatalogueApp[]>([]);
    const [exampleGroups, setExampleGroups] = useState<ExampleGroup[]>([]);
    const [bootError, setBootError] = useState<unknown>(null);

    const [tokens, setTokens] = useState<PublicToken[]>([]);
    const [activeTokenId, setActiveTokenId] = useState<string | null>(null);

    const [org, setOrg] = useLocalStorage("org", "");
    const [app, setApp] = useLocalStorage("app", "");
    const [instanceOwnerPartyId, setInstanceOwnerPartyId] = useLocalStorage("partyId", "");
    const [instanceGuid, setInstanceGuid] = useLocalStorage("instanceGuid", "");
    // The party value this session last filled in from a token claim. See the effect below.
    const [autoFilledParty, setAutoFilledParty] = useLocalStorage<string | null>("partyAutoFilledFrom", null);
    const [mode, setMode] = useLocalStorage<RunMode>("mode", "sequential");
    const [dataElements, setDataElements] = useLocalStorage<DataElementInput[]>("dataElements", [EMPTY_ELEMENT]);
    const [advanceProcess, setAdvanceProcess] = useLocalStorage("advanceProcess", false);
    /** How many times to post the same payload, for building up test data. */
    const [repeat, setRepeat] = useLocalStorage("repeat", 1);
    /** Optional instance template. Empty strings mean the field is not sent. */
    const [template, setTemplate] = useLocalStorage<TemplateFields>("instanceTemplate", { dueBefore: "", visibleAfter: "" });

    const [metadata, setMetadata] = useState<AppMetadataResponse | null>(null);
    const [parties, setParties] = useState<AppParty[]>([]);
    const [probing, setProbing] = useState(false);
    const [probeError, setProbeError] = useState<unknown>(null);

    /**
     * Every run that has happened this session, newest first. Posting used to wipe whatever a
     * fetch had left behind, and vice versa, so they are kept instead.
     */
    const [logs, setLogs] = useState<LogEntry[]>([]);
    /**
     * The latest validation per target, so an instance result and several data element results can
     * be on screen together. Kept apart from the run history: a fetch should not blank the issues.
     */
    const [validations, setValidations] = useState<ValidationView[]>([]);
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<unknown>(null);
    /** Which post of a repeat run is in flight. Null when a single post is running. */
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    /**
     * The rendered pdf, held as a blob url. Only one at a time: rendering again replaces it, and
     * the old url is revoked so the blob can be collected.
     */
    const [pdfPreview, setPdfPreview] = useState<PdfPreview | null>(null);

    /**
     * The party's instances from the last listing, so a guid can be picked instead of pasted.
     * Null means nothing has been listed yet, which reads differently from a party with none.
     */
    const [instanceList, setInstanceList] = useState<InstanceSummary[] | null>(null);

    /** Where the instance stands, from the last instance read or process move. */
    const [instanceProcess, setInstanceProcess] = useState<ProcessSummary | null>(null);

    const [instanceDataElements, setInstanceDataElements] = useState<DataElementSummary[]>([]);
    const [dataGuid, setDataGuid] = useState("");
    /** The data element last read back, so it can be downloaded or copied rather than reread. */
    const [fetchedElement, setFetchedElement] = useState<FetchedDataElement | null>(null);
    const [fetching, setFetching] = useState(false);
    const [fetchError, setFetchError] = useState<unknown>(null);
    // Kept apart from fetchError so a refused move is reported in the process panel, not in Fetch.
    const [processError, setProcessError] = useState<unknown>(null);

    const HISTORY_LIMIT = 25;
    const appendLog = useCallback((result: LogResult) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const at = new Date().toLocaleTimeString("nb");
        setLogs((current) => [{ id, at, result }, ...current].slice(0, HISTORY_LIMIT));

        const validation = result.validation;
        if (!validation) return;
        setValidations((current) => upsertValidation(current, validation, at, id));
    }, []);

    const clearValidations = useCallback(() => setValidations([]), []);

    /** Picking another data element drops the held one, which is no longer what is selected. */
    const changeDataGuid = useCallback((next: string) => {
        setDataGuid(next);
        setFetchedElement((current) => (current?.dataGuid === next ? current : null));
    }, []);

    /** Replaces the held preview, revoking the previous blob url so it is not leaked. */
    const showPdf = useCallback((next: PdfPreview | null) => {
        setPdfPreview((current) => {
            if (current) URL.revokeObjectURL(current.url);
            return next;
        });
    }, []);

    const clearPdf = useCallback(() => showPdf(null), [showPdf]);

    const changeInstanceGuid = useCallback(
        (value: string) => {
            const { partyId, guid } = splitPastedInstanceId(value);
            // Issues describe one instance. Pointing at another one makes them stale, not wrong,
            // which is the more misleading of the two.
            if (guid !== instanceGuid) {
                clearValidations();
                // The data element list came from the old instance, so it would offer guids that
                // are not in this one.
                setInstanceDataElements([]);
                setDataGuid("");
                setFetchedElement(null);
                // Likewise the process state, which described the instance we just left.
                setInstanceProcess(null);
                clearPdf();
            }
            setInstanceGuid(guid);
            if (partyId) setInstanceOwnerPartyId(partyId);
        },
        [instanceGuid, clearValidations, clearPdf, setInstanceGuid, setInstanceOwnerPartyId]
    );

    // Ticks once a second so token expiry counts down live.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const refreshTokens = useCallback(async () => {
        try {
            const list = await api.listTokens();
            setTokens(list);
            // Keep the selection valid across server restarts and expiry pruning.
            setActiveTokenId((current) => (current && list.some((token) => token.id === current) ? current : (list[0]?.id ?? null)));
        } catch (error) {
            setBootError(error);
        }
    }, []);

    useEffect(() => {
        void (async () => {
            try {
                const [config, cat, examples] = await Promise.all([api.getConfig(), api.getCatalogue(), api.getExamples()]);
                setServerConfig(config);
                setCatalogue(cat);
                setExampleGroups(examples.groups);
            } catch (error) {
                setBootError(error);
            }
            try {
                setLocaltest(await api.getLocaltestStatus());
            } catch {
                /* the status dot stays grey */
            }
        })();
        void refreshTokens();
    }, [refreshTokens]);

    const activeToken = useMemo(() => tokens.find((token) => token.id === activeTokenId) ?? null, [tokens, activeTokenId]);

    const tokenUsable = Boolean(activeToken) && !isExpired(activeToken?.expiresAt ?? null, now);
    const dataTypes = metadata?.metadata.dataTypes ?? [];

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

    // A probe result belongs to one org and app, so drop it when the target moves.
    useEffect(() => {
        setMetadata(null);
        setParties([]);
        setProbeError(null);
    }, [org, app]);

    // An instance listing belongs to one app and one party, so drop it when either moves.
    useEffect(() => {
        setInstanceList(null);
    }, [org, app, instanceOwnerPartyId]);

    async function probe() {
        if (!activeTokenId) return;
        setProbing(true);
        setProbeError(null);
        const params = { tokenId: activeTokenId, org, app };
        try {
            const meta = await api.getAppMetadata(params);
            setMetadata(meta);
            // Parties are a bonus: not every token is allowed to list them.
            try {
                setParties(await api.getAppParties(params));
            } catch {
                setParties([]);
            }
            const types = meta.metadata.dataTypes ?? [];

            // Preselect the app's form data type if no type has been chosen yet.
            const formType = types.find((type) => type.appLogic);
            let next = dataElements;
            if (formType && next.length === 1 && !next[0]?.dataType) {
                next = [{ ...EMPTY_ELEMENT, dataType: formType.id }];
            }

            // The app has now declared its content types, so fill in any element still without one.
            // This also covers types chosen from the catalogue before the app was probed.
            next = next.map((element) => {
                if (!element.dataType || element.contentType) return element;
                const contentType = preferredContentType(types.find((type) => type.id === element.dataType)?.allowedContentTypes ?? []);
                return contentType ? { ...element, contentType } : element;
            });

            if (next.some((element, index) => element !== dataElements[index])) {
                setDataElements(next);
            }
        } catch (error) {
            setProbeError(error);
        } finally {
            setProbing(false);
        }
    }

    /**
     * Reads the instance back and validates it straight after a post, so the log shows what Altinn
     * actually stored without anyone pressing another button. Sequential rather than parallel so
     * the step timings in the log stay honest.
     */
    async function followUpAfterPost(payload: RunResult) {
        const party = payload.instanceOwnerPartyId;
        const guid = payload.instanceGuid;
        if (!activeTokenId || !payload.ok || !party || !guid) {
            return { instance: null, validation: null };
        }
        const params = {
            tokenId: activeTokenId,
            org,
            app,
            instanceOwnerPartyId: party,
            instanceGuid: guid
        };

        // A failure here must not mask a successful post, so each one degrades to null and the
        // failing step still shows up in the log.
        let instance: ReadInstanceResult | null = null;
        let validation: ValidateResult | null = null;
        try {
            instance = await api.getInstance(params);
        } catch {
            /* leave it null, the post itself still succeeded */
        }
        try {
            validation = await api.validateInstance(params);
        } catch {
            /* same */
        }

        if (instance?.ok) {
            setInstanceDataElements(instance.dataElements);
            changeDataGuid(instance.dataElements[0]?.id ?? "");
            setInstanceProcess(instance.process);
        }
        return { instance, validation };
    }

    async function run() {
        if (!activeTokenId) return;
        const times = repeatTimes;
        const instanceTemplate = buildInstanceTemplate(template);
        setRunning(true);
        setRunError(null);
        try {
            for (let attempt = 0; attempt < times; attempt++) {
                if (times > 1) setProgress({ done: attempt, total: times });
                const payload = await api.postRun({
                    tokenId: activeTokenId,
                    org,
                    app,
                    instanceOwnerPartyId,
                    mode,
                    // The guid from the closure, so every repeat posts onto the instance you
                    // aimed at rather than onto the one the previous repeat created.
                    ...(mode === "existing" ? { instanceGuid } : {}),
                    // Only sent when a field is set, and only for a new instance.
                    ...(mode !== "existing" && instanceTemplate ? { instanceTemplate } : {}),
                    // Only the wire fields. exampleName and collapsed are UI state.
                    dataElements: dataElements.map((element) => ({
                        dataType: element.dataType,
                        content: element.content,
                        ...(element.encoding ? { encoding: element.encoding } : {}),
                        ...(element.contentType ? { contentType: element.contentType } : {}),
                        ...(element.filename ? { filename: element.filename } : {})
                    })),
                    // Validation runs as a follow-up request instead of a step inside the run.
                    validate: false,
                    advanceProcess
                });
                // Chain naturally into "now post more data to that instance".
                if (payload.instanceGuid) setInstanceGuid(payload.instanceGuid);

                appendLog(logFromRun(payload, await followUpAfterPost(payload)));

                // Stop rather than fail the same way another forty times. What ran is in the log.
                if (!payload.ok) break;
            }
        } catch (error) {
            setRunError(error);
        } finally {
            setRunning(false);
            setProgress(null);
        }
    }

    async function listInstances() {
        if (!activeTokenId) return;
        setFetching(true);
        setFetchError(null);
        try {
            const result = await api.listInstances({ tokenId: activeTokenId, org, app, instanceOwnerPartyId });
            appendLog(logFromInstances(result));
            // A failed listing stays null rather than empty, since "none" would be a claim we
            // cannot make when the request never answered.
            setInstanceList(result.ok ? result.instances : null);
        } catch (error) {
            setFetchError(error);
        } finally {
            setFetching(false);
        }
    }

    async function getInstance() {
        if (!activeTokenId) return;
        setFetching(true);
        setFetchError(null);
        try {
            const read = await api.getInstance({
                tokenId: activeTokenId,
                org,
                app,
                instanceOwnerPartyId,
                instanceGuid
            });
            appendLog(logFromInstance(read));
            setInstanceDataElements(read.dataElements);
            setInstanceProcess(read.process);
            // Preselect one so fetching a data element is a single click.
            if (read.dataElements.length > 0 && !read.dataElements.some((el) => el.id === dataGuid)) {
                changeDataGuid(read.dataElements[0]?.id ?? "");
            }
        } catch (error) {
            setFetchError(error);
        } finally {
            setFetching(false);
        }
    }

    async function getDataElement() {
        if (!activeTokenId || !dataGuid) return;
        setFetching(true);
        setFetchError(null);
        try {
            const read = await api.getDataElement({
                tokenId: activeTokenId,
                org,
                app,
                instanceOwnerPartyId,
                instanceGuid,
                dataGuid
            });
            appendLog(logFromDataElement(read));

            // Held so it can be saved as a file. A failed read clears it rather than leaving the
            // previous element looking like the one you just asked for.
            const summary = instanceDataElements.find((element) => element.id === dataGuid);
            setFetchedElement(
                read.ok && read.content !== null
                    ? {
                          dataGuid,
                          dataType: summary?.dataType ?? "data",
                          filename: suggestedFilename({
                              dataType: summary?.dataType ?? "data",
                              filename: summary?.filename ?? null,
                              contentType: read.contentType
                          }),
                          contentType: read.contentType,
                          encoding: read.encoding,
                          content: read.content,
                          size: read.encoding === "base64" ? Math.ceil((read.content.length * 3) / 4) : new Blob([read.content]).size
                      }
                    : null
            );
        } catch (error) {
            setFetchError(error);
        } finally {
            setFetching(false);
        }
    }

    /** Saves the held data element as a file, under the name Altinn stored or the data type. */
    function downloadDataElement() {
        if (!fetchedElement) return;
        downloadContent(fetchedElement.filename, fetchedElement.content, fetchedElement.encoding, fetchedElement.contentType);
    }

    /**
     * Puts what was read back into the payload editor, so stored data can be changed and posted
     * again. The destination is left alone: posting it back to the same instance and using it as
     * the payload for a new one are both real cases, and only you know which this is.
     */
    function loadFetchedIntoPayload() {
        if (!fetchedElement) return;
        const loaded: DataElementInput = {
            dataType: fetchedElement.dataType,
            content: fetchedElement.content,
            // Parameters are dropped, so a stored "application/xml; charset=utf-8" does not become
            // an extra option in the content type picker.
            ...(fetchedElement.contentType ? { contentType: fetchedElement.contentType.split(";")[0]?.trim() } : {}),
            ...(fetchedElement.encoding === "base64" ? { encoding: "base64" as const, filename: fetchedElement.filename } : {}),
            exampleName: `instance ${instanceGuid.slice(0, 8)}`,
            collapsed: false
        };

        setDataElements(placeLoaded(dataElements, loaded));
    }

    async function renderPdf() {
        if (!activeTokenId) return;
        setFetching(true);
        setFetchError(null);
        try {
            const result = await api.previewPdf({ tokenId: activeTokenId, org, app, instanceOwnerPartyId, instanceGuid });
            appendLog(logFromPdf(result, result.size));
            if (!result.ok || !result.content) {
                // A failed render must not leave the previous pdf on screen looking current.
                clearPdf();
                return;
            }
            const bytes = bytesFromBase64(result.content);
            showPdf({
                url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
                size: result.size,
                at: new Date().toLocaleTimeString("nb")
            });
        } catch (error) {
            setFetchError(error);
        } finally {
            setFetching(false);
        }
    }

    async function removeInstance(hard: boolean) {
        if (!activeTokenId) return;
        setFetching(true);
        setFetchError(null);
        try {
            const result = await api.deleteInstance({
                tokenId: activeTokenId,
                org,
                app,
                instanceOwnerPartyId,
                instanceGuid,
                hard: hard ? "true" : "false"
            });
            appendLog(logFromDelete(result));
            if (!result.ok) return;

            // Take it out of the listing, since a deleted instance is not one to offer next.
            setInstanceList((current) => current?.filter((instance) => instance.instanceGuid !== result.instanceGuid) ?? null);
            // Clearing the guid drops the data elements, process and issues along with it. Leaving
            // them would describe an instance that is no longer there.
            changeInstanceGuid("");
        } catch (error) {
            setFetchError(error);
        } finally {
            setFetching(false);
        }
    }

    async function advance() {
        if (!activeTokenId) return;
        setFetching(true);
        setProcessError(null);
        try {
            const result = await api.advanceProcess({ tokenId: activeTokenId, org, app, instanceOwnerPartyId, instanceGuid });
            appendLog(logFromAdvance(result));
            // The response carries the process it landed in, so a refused move leaves the panel
            // showing the task the instance is still in rather than blanking it.
            if (result.ok && result.process) setInstanceProcess(result.process);
        } catch (error) {
            setProcessError(error);
        } finally {
            setFetching(false);
        }
    }

    // Named runValidation to avoid shadowing the `validate` option used by the post flow.
    async function runValidation(scope: "instance" | "dataElement") {
        if (!activeTokenId) return;
        if (scope === "dataElement" && !dataGuid) return;
        setFetching(true);
        setFetchError(null);
        const params = { tokenId: activeTokenId, org, app, instanceOwnerPartyId, instanceGuid };
        try {
            const result = scope === "instance" ? await api.validateInstance(params) : await api.validateDataElement({ ...params, dataGuid });
            // The instance read is what lets an issue name its data type instead of a guid.
            appendLog(logFromValidation(result, instanceDataElements));
        } catch (error) {
            setFetchError(error);
        } finally {
            setFetching(false);
        }
    }

    const blockers: string[] = [];
    if (!tokenUsable) blockers.push("a valid token");
    if (!org) blockers.push("an org");
    if (!app) blockers.push("an app");
    if (!instanceOwnerPartyId) blockers.push("an instance owner party id");
    if (mode === "existing" && !instanceGuid) blockers.push("an instance guid");
    if (dataElements.some((element) => !element.dataType)) blockers.push("a data type on every element");
    if (dataElements.some((element) => !element.content.trim())) blockers.push("content on every element");

    const appHost = serverConfig?.appHost ?? "http://local.altinn.cloud:8000";
    const repeatTimes = clampRepeat(repeat);

    // Panels you cannot use yet are left out rather than shown dead.
    const sections = visibleSections({
        hasToken: tokenUsable,
        org,
        app,
        validationCount: validations.length,
        runCount: logs.length,
        hasPdf: pdfPreview !== null,
        hasProcess: instanceProcess !== null,
        busy: running || fetching
    });

    return (
        <div className="shell">
            <header className="masthead">
                <span className="masthead__mark">Altinn API tools</span>
                <div className="masthead__meta">
                    <span className="gauge" title={appHost}>
                        <span className={`led ${serverConfig ? "led--ok" : "led--bad"}`} />
                        {appHost.replace(/^https?:\/\//, "")}
                    </span>
                    <span className="gauge" title={localtest?.error ?? localtest?.url}>
                        <span className={`led ${localtest?.reachable ? "led--ok" : "led--bad"}`} />
                        LocalTest
                    </span>
                    <span className="gauge">
                        <span className={`led ${tokenUsable ? "led--ok" : "led--bad"}`} />
                        {activeToken ? activeToken.label : "No token"}
                    </span>
                </div>
            </header>

            <div className="deck">
                <div className="column column--rail">
                    {bootError ? <ErrorNotice error={bootError} /> : null}
                    <TokenPanel
                        serverConfig={serverConfig}
                        localtest={localtest}
                        tokens={tokens}
                        activeToken={activeToken}
                        onActivate={setActiveTokenId}
                        onTokensChanged={() => void refreshTokens()}
                        now={now}
                    />
                </div>

                <div className="column">
                    <TargetPanel
                        appHost={appHost}
                        org={org}
                        app={app}
                        onOrgChange={setOrg}
                        onAppChange={setApp}
                        instanceOwnerPartyId={instanceOwnerPartyId}
                        onPartyChange={setInstanceOwnerPartyId}
                        instanceGuid={instanceGuid}
                        onInstanceGuidChange={changeInstanceGuid}
                        mode={mode}
                        onModeChange={setMode}
                        template={template}
                        onTemplateChange={setTemplate}
                        now={now}
                        catalogue={catalogue}
                        onPickCatalogueApp={(entry) => {
                            setOrg(entry.org);
                            setApp(entry.app);
                            // Point the first element at this app's form data type unless the operator has
                            // already put something there.
                            if (dataElements.length === 1 && !dataElements[0]?.content.trim()) {
                                setDataElements([{ dataType: entry.dataType, content: "" }]);
                            }
                        }}
                        metadata={metadata}
                        parties={parties}
                        onProbe={() => void probe()}
                        probing={probing}
                        probeError={probeError}
                        hasToken={tokenUsable}
                        elementCount={dataElements.length}
                    />

                    {/* Nothing here can be aimed anywhere without a token and an app. */}
                    {sections.requests && (
                        <>
                            <PayloadPanel
                                dataElements={dataElements}
                                onChange={setDataElements}
                                dataTypes={dataTypes}
                                metadata={metadata?.metadata ?? null}
                                suggestedDataTypes={suggestedDataTypes}
                                exampleGroups={exampleGroups}
                                advanceProcess={advanceProcess}
                                onAdvanceProcessChange={setAdvanceProcess}
                            />

                            <section className="panel">
                                {blockers.length > 0 && (
                                    <div className="notice notice--warn" style={{ marginBottom: 12 }}>
                                        Needs {blockers.join(", ")}.
                                    </div>
                                )}
                                {runError ? (
                                    <div style={{ marginBottom: 12 }}>
                                        <ErrorNotice error={runError} />
                                    </div>
                                ) : null}
                                <button
                                    type="button"
                                    className="btn btn--primary btn--fire"
                                    onClick={() => void run()}
                                    disabled={running || blockers.length > 0}
                                >
                                    {running && <span className="btn__spinner" />}
                                    {running
                                        ? progress
                                            ? `Posting ${progress.done + 1} of ${progress.total}…`
                                            : "Posting…"
                                        : mode === "existing"
                                          ? `Post data to instance${repeatTimes > 1 ? ` ${repeatTimes} times` : ""}`
                                          : `Post to ${org || "org"}/${app || "app"}${repeatTimes > 1 ? ` ${repeatTimes} times` : ""}`}
                                </button>

                                {/* For building up test data without clicking the same button ten times. */}
                                <div className="row" style={{ marginTop: 12, gap: 10 }}>
                                    <label htmlFor="repeat" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                        Repeat
                                    </label>
                                    <input
                                        id="repeat"
                                        type="text"
                                        inputMode="numeric"
                                        value={repeat}
                                        onChange={(event) => setRepeat(Number(event.target.value.replace(/\D/g, "")) || 1)}
                                        onBlur={() => setRepeat(repeatTimes)}
                                        style={{ width: 64 }}
                                        disabled={running}
                                    />
                                    <span className="field__hint" style={{ margin: 0 }}>
                                        {repeatTimes === 1
                                            ? `One post. Up to ${MAX_REPEAT} for a pile of test instances.`
                                            : mode === "existing"
                                              ? `${repeatTimes} posts onto the same instance, one after another.`
                                              : `${repeatTimes} instances, one after another. Each is read back and validated, and a failure stops the rest.`}
                                    </span>
                                </div>
                            </section>

                            <FetchPanel
                                appHost={appHost}
                                org={org}
                                app={app}
                                instanceOwnerPartyId={instanceOwnerPartyId}
                                onPartyChange={setInstanceOwnerPartyId}
                                instanceGuid={instanceGuid}
                                onInstanceGuidChange={changeInstanceGuid}
                                instances={instanceList}
                                onListInstances={() => void listInstances()}
                                dataElements={instanceDataElements}
                                dataGuid={dataGuid}
                                onDataGuidChange={changeDataGuid}
                                fetched={fetchedElement}
                                onDownloadDataElement={downloadDataElement}
                                onLoadIntoPayload={loadFetchedIntoPayload}
                                onGetInstance={() => void getInstance()}
                                onGetDataElement={() => void getDataElement()}
                                onValidateInstance={() => void runValidation("instance")}
                                onValidateDataElement={() => void runValidation("dataElement")}
                                busy={fetching}
                                hasToken={tokenUsable}
                                error={fetchError}
                                onPreviewPdf={() => void renderPdf()}
                                onDeleteInstance={(hard) => void removeInstance(hard)}
                            />

                            {/* Where the instance stands. Arrives with the first instance read. */}
                            {sections.process && instanceProcess && (
                                <ProcessPanel
                                    appHost={appHost}
                                    org={org}
                                    app={app}
                                    instanceOwnerPartyId={instanceOwnerPartyId}
                                    instanceGuid={instanceGuid}
                                    process={instanceProcess}
                                    onAdvance={() => void advance()}
                                    busy={fetching}
                                    hasToken={tokenUsable}
                                    error={processError}
                                />
                            )}
                        </>
                    )}

                    {sections.pdf && pdfPreview && <PdfPanel preview={pdfPreview} onClear={clearPdf} />}
                </div>

                {(sections.validation || sections.log) && (
                    <div className="column column--log">
                        {sections.validation && <ValidationPanel validations={validations} onClear={clearValidations} />}
                        {sections.log && <RunLog entries={logs} running={running || fetching} onClear={() => setLogs([])} />}
                    </div>
                )}
            </div>
        </div>
    );
}
