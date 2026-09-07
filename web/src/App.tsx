import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { preferredContentType } from "./lib/contentType";
import { isExpired, severityLabel } from "./lib/format";
import { useLocalStorage } from "./lib/useLocalStorage";
import { visibleSections } from "./lib/sections";
import { upsertValidation } from "./lib/validations";
import { ErrorNotice } from "./components/Notice";
import { FetchPanel } from "./components/FetchPanel";
import { PayloadPanel } from "./components/PayloadPanel";
import { RunLog } from "./components/RunLog";
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
    LocaltestStatus,
    LogEntry,
    LogIssue,
    LogResult,
    ValidationView,
    PublicToken,
    ReadDataElementResult,
    ReadInstanceResult,
    RunMode,
    RunResult,
    RunStep,
    ServerConfig,
    ValidateResult
} from "./types";

const EMPTY_ELEMENT: DataElementInput = { dataType: "", content: "" };

/** Accepts "510001/99d0632c-..." as well as a bare guid, so an instance id can be pasted whole. */
function splitPastedInstanceId(value: string): { partyId?: string; guid: string } {
    const match = /^(\d+)\/(.+)$/.exec(value.trim());
    if (match?.[1] && match[2]) return { partyId: match[1], guid: match[2].trim() };
    return { guid: value.trim() };
}

/**
 * Each request numbers its own steps from 1, so concatenating them needs a renumber to keep the
 * indexes unique across the whole log entry.
 */
function renumber(steps: RunStep[]): RunStep[] {
    return steps.map((step, position) => ({ ...step, index: position + 1 }));
}

/**
 * Builds the log for a post, folding in the instance read and validation that run automatically
 * afterwards. They are separate requests but one story, so they share a single log entry.
 */
function logFromRun(result: RunResult, followUp: { instance: ReadInstanceResult | null; validation: ValidateResult | null }): LogResult {
    const rows: LogResult["rows"] = [{ label: "Mode", value: result.mode }];
    if (result.instanceOwnerPartyId) {
        rows.push({ label: "Party", value: result.instanceOwnerPartyId });
    }
    if (result.instanceGuid) rows.push({ label: "Instance", value: result.instanceGuid });
    if (followUp.instance?.ok) {
        rows.push({
            label: "Data elements",
            value: String(followUp.instance.dataElements.length)
        });
    }
    if (followUp.validation?.ok) rows.push(issueRow(followUp.validation));

    return {
        ok: result.ok,
        steps: renumber([...result.steps, ...(followUp.instance?.steps ?? []), ...(followUp.validation?.steps ?? [])]),
        failedAt: result.failedAt,
        title: "Posted",
        rows,
        instanceUrl: result.instanceUrl,
        validation: toValidation(followUp.validation, followUp.instance?.dataElements ?? [])
    };
}

/**
 * Prepares a validation result for display: issues sorted by severity, with data element ids
 * resolved to data type names where the instance read told us what they are.
 */
function toValidation(result: ValidateResult | null, dataElements: DataElementSummary[]): LogResult["validation"] {
    if (!result?.ok) return undefined;
    const names = new Map(dataElements.map((element) => [element.id, element.dataType]));
    const issues = [...result.issues]
        .sort((a, b) => a.severity - b.severity)
        .map((issue) => ({
            severity: issue.severity,
            severityLabel: severityLabel(issue.severity),
            description: issue.description ?? "",
            code: issue.code,
            field: issue.field,
            dataElement: issue.dataElementId ? (names.get(issue.dataElementId) ?? issue.dataElementId) : null,
            source: issue.source
        }));
    const instanceGuid = result.instanceGuid;
    if (!result.dataGuid) return { key: "instance", instanceGuid, scope: "instance", label: "Instance", issues };
    return {
        key: `data:${result.dataGuid}`,
        instanceGuid,
        scope: "data element",
        label: names.get(result.dataGuid) ?? result.dataGuid,
        issues
    };
}

/** Summarises a validation response by severity, following Altinn's ValidationIssueSeverity. */
function issueRow(result: ValidateResult): { label: string; value: string; tone: "ok" | "warn" | "bad" } {
    const { errors, warnings, other } = result.counts;
    return {
        label: "Issues",
        tone: errors > 0 ? "bad" : warnings > 0 ? "warn" : "ok",
        value:
            result.issues.length === 0
                ? "none"
                : [
                      `${errors} error${errors === 1 ? "" : "s"}`,
                      `${warnings} warning${warnings === 1 ? "" : "s"}`,
                      ...(other > 0 ? [`${other} other`] : [])
                  ].join(", ")
    };
}

function logFromInstance(result: ReadInstanceResult): LogResult {
    const rows = [
        { label: "Party", value: result.instanceOwnerPartyId },
        { label: "Instance", value: result.instanceGuid }
    ];
    if (result.ok) {
        rows.push({ label: "Data elements", value: String(result.dataElements.length) });
    }
    return {
        ok: result.ok,
        steps: result.steps,
        failedAt: result.failedAt,
        title: "Fetched instance",
        rows,
        // Offering to open an instance that could not be read would just 404 again.
        instanceUrl: result.ok ? result.instanceUrl : null
    };
}

function logFromDataElement(result: ReadDataElementResult): LogResult {
    return {
        ok: result.ok,
        steps: result.steps,
        failedAt: result.failedAt,
        title: "Fetched data element",
        rows: [
            { label: "Data guid", value: result.dataGuid },
            ...(result.contentType ? [{ label: "Content type", value: result.contentType }] : []),
            // Binary content comes back base64 encoded, which is worth saying out loud.
            ...(result.ok && result.encoding === "base64"
                ? [
                      {
                          label: "Bytes",
                          value: String(Math.ceil(((result.content?.length ?? 0) * 3) / 4))
                      }
                  ]
                : [])
        ]
    };
}

function logFromValidation(result: ValidateResult, dataElements: DataElementSummary[]): LogResult {
    const rows: LogResult["rows"] = [];
    if (result.dataGuid) rows.push({ label: "Data guid", value: result.dataGuid });
    // On a failed request there is no issue list, and "none" would read as "validated clean".
    if (result.ok) rows.push(issueRow(result));
    return {
        ok: result.ok,
        steps: result.steps,
        failedAt: result.failedAt,
        title: result.dataGuid ? "Validated data element" : "Validated instance",
        rows,
        validation: toValidation(result, dataElements)
    };
}

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

    const [instanceDataElements, setInstanceDataElements] = useState<DataElementSummary[]>([]);
    const [dataGuid, setDataGuid] = useState("");
    const [fetching, setFetching] = useState(false);
    const [fetchError, setFetchError] = useState<unknown>(null);

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
            }
            setInstanceGuid(guid);
            if (partyId) setInstanceOwnerPartyId(partyId);
        },
        [instanceGuid, clearValidations, setInstanceGuid, setInstanceOwnerPartyId]
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
            setDataGuid(instance.dataElements[0]?.id ?? "");
        }
        return { instance, validation };
    }

    async function run() {
        if (!activeTokenId) return;
        setRunning(true);
        setRunError(null);
        try {
            const payload = await api.postRun({
                tokenId: activeTokenId,
                org,
                app,
                instanceOwnerPartyId,
                mode,
                ...(mode === "existing" ? { instanceGuid } : {}),
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
        } catch (error) {
            setRunError(error);
        } finally {
            setRunning(false);
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
            // Preselect one so fetching a data element is a single click.
            if (read.dataElements.length > 0 && !read.dataElements.some((el) => el.id === dataGuid)) {
                setDataGuid(read.dataElements[0]?.id ?? "");
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
            appendLog(
                logFromDataElement(
                    await api.getDataElement({
                        tokenId: activeTokenId,
                        org,
                        app,
                        instanceOwnerPartyId,
                        instanceGuid,
                        dataGuid
                    })
                )
            );
        } catch (error) {
            setFetchError(error);
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

    // Panels you cannot use yet are left out rather than shown dead.
    const sections = visibleSections({
        hasToken: tokenUsable,
        org,
        app,
        validationCount: validations.length,
        runCount: logs.length,
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
                                    {running ? "Posting…" : mode === "existing" ? "Post data to instance" : `Post to ${org || "org"}/${app || "app"}`}
                                </button>
                            </section>

                            <FetchPanel
                                appHost={appHost}
                                org={org}
                                app={app}
                                instanceOwnerPartyId={instanceOwnerPartyId}
                                onPartyChange={setInstanceOwnerPartyId}
                                instanceGuid={instanceGuid}
                                onInstanceGuidChange={changeInstanceGuid}
                                dataElements={instanceDataElements}
                                dataGuid={dataGuid}
                                onDataGuidChange={setDataGuid}
                                onGetInstance={() => void getInstance()}
                                onGetDataElement={() => void getDataElement()}
                                onValidateInstance={() => void runValidation("instance")}
                                onValidateDataElement={() => void runValidation("dataElement")}
                                busy={fetching}
                                hasToken={tokenUsable}
                                error={fetchError}
                            />
                        </>
                    )}
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
