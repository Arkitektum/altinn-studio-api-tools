import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { preferredContentType } from "./lib/contentType";
import { isExpired } from "./lib/format";
import { downloadContent, suggestedFilename } from "./lib/download";
import { splitPastedInstanceId } from "./lib/instanceId";
import { bytesFromBase64 } from "./lib/formats";
import {
    logFromAdvance,
    logFromCompare,
    logFromDataElement,
    logFromDelete,
    logFromInstances,
    logFromRead,
    logFromPdf,
    logFromRun,
    logFromValidation
} from "./lib/logResults";
import { placeLoaded } from "./lib/payload";
import { useLocalStorage } from "./lib/useLocalStorage";
import { visibleSections } from "./lib/sections";
import { upsertValidation } from "./lib/validations";
import { ErrorNotice } from "./components/Notice";
import { ComparePanel, type CompareSource } from "./components/ComparePanel";
import { FetchPanel } from "./components/FetchPanel";
import { InstancesPanel } from "./components/InstancesPanel";
import { PayloadPanel } from "./components/PayloadPanel";
import { ProcessPanel } from "./components/ProcessPanel";
import { RunLog } from "./components/RunLog";
import { PdfModal, type PdfPreview } from "./components/PdfModal";
import { ValidationPanel } from "./components/ValidationPanel";
import { TargetPanel } from "./components/TargetPanel";
import { TokenPanel } from "./components/TokenPanel";
import type {
    AppMetadataResponse,
    AppParty,
    CatalogueApp,
    CompareResult,
    DataElementInput,
    DataElementSummary,
    ExampleGroup,
    ExampleKind,
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
    const [listing, setListing] = useState(false);
    const [listError, setListError] = useState<unknown>(null);
    /** Which token, app and party the listing has already been attempted for. */
    const [listAttempted, setListAttempted] = useState<string | null>(null);
    /** And which instance has already been read, so it is read once per selection. */
    const [readAttempted, setReadAttempted] = useState<string | null>(null);

    /** Where the instance stands, from the last instance read or process move. */
    const [instanceProcess, setInstanceProcess] = useState<ProcessSummary | null>(null);

    const [instanceDataElements, setInstanceDataElements] = useState<DataElementSummary[]>([]);
    const [dataGuid, setDataGuid] = useState("");
    /** The last comparison of the stored xml against the xml as written. */
    const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
    const [comparing, setComparing] = useState(false);
    const [compareError, setCompareError] = useState<unknown>(null);

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
        // A comparison describes one data element, so it is stale the moment another is picked.
        setCompareResult((current) => (current?.dataGuid === next ? current : null));
        setCompareError(null);
    }, []);

    /** Replaces the held preview, revoking the previous blob url so it is not leaked. */
    const showPdf = useCallback((next: PdfPreview | null) => {
        setPdfPreview((current) => {
            if (current) URL.revokeObjectURL(current.url);
            return next;
        });
    }, []);

    const clearPdf = useCallback(() => showPdf(null), [showPdf]);

    /**
     * Points the tool at an instance, or at none. Everything that described the previous one goes
     * with it: the validation issues, the data element list, the process state and the pdf. Stale
     * results are more misleading than absent ones.
     */
    const selectInstance = useCallback(
        (instance: InstanceSummary | null) => {
            const guid = instance?.instanceGuid ?? "";
            if (guid !== instanceGuid) {
                clearValidations();
                setInstanceDataElements([]);
                setDataGuid("");
                setFetchedElement(null);
                setInstanceProcess(null);
                clearPdf();
            }
            setInstanceGuid(guid);
            // The party follows the instance, since a listing is per party and a row knows its own.
            if (instance) setInstanceOwnerPartyId(instance.instanceOwnerPartyId);
        },
        [instanceGuid, clearValidations, clearPdf, setInstanceGuid, setInstanceOwnerPartyId]
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
                          lastChangedBy: null
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

    /**
     * Read and validate the selected instance without being asked. Both are reads, and the panels
     * below exist to show what they return, so a button for them was busywork.
     *
     * Attempted once per token, app, party and instance, so it does not re-read on every render,
     * and debounced because a guid typed into "Other instance" arrives a character at a time. A
     * post marks its own instance as read, since it already reads and validates it.
     */
    useEffect(() => {
        if (!tokenUsable || !activeTokenId || !org || !app || !instanceOwnerPartyId || !instanceGuid) return;
        const key = `${activeTokenId}:${org}/${app}:${instanceOwnerPartyId}/${instanceGuid}`;
        if (readAttempted === key) return;

        const timer = window.setTimeout(() => {
            setReadAttempted(key);
            void readSelected(instanceOwnerPartyId, instanceGuid);
        }, 500);
        return () => window.clearTimeout(timer);
    }, [tokenUsable, activeTokenId, org, app, instanceOwnerPartyId, instanceGuid, readAttempted]);

    /**
     * List the party's instances without being asked. It is one read, and the panel exists to
     * show them, so making anyone press a button for it was busywork.
     *
     * Debounced and attempted once per token, app and party, for the same reasons the app read
     * is: the party is typed a character at a time, and a party that 403s should not be retried
     * forever. Refresh in the panel header lists again on demand.
     */
    useEffect(() => {
        if (!tokenUsable || !activeTokenId || !org || !app || !instanceOwnerPartyId) return;
        const key = `${activeTokenId}:${org}/${app}:${instanceOwnerPartyId}`;
        if (listAttempted === key) return;

        const timer = window.setTimeout(() => {
            setListAttempted(key);
            void listInstances();
        }, 500);
        return () => window.clearTimeout(timer);
    }, [tokenUsable, activeTokenId, org, app, instanceOwnerPartyId, listAttempted]);

    /**
     * Probe on its own once there is a token and a target. It is two reads that create nothing,
     * so there is no reason to make anyone press a button for it.
     *
     * Debounced, because org and app are typed a character at a time and "et-v4" would otherwise
     * be five probes. Attempted once per token and target, so an app that is not running does not
     * get retried forever; the button re-probes by hand, which is also how you pick up metadata
     * that changed while the tool was open.
     */
    const [probeAttempted, setProbeAttempted] = useState<string | null>(null);
    useEffect(() => {
        if (!tokenUsable || !activeTokenId || !org || !app) return;
        const key = `${activeTokenId}:${org}/${app}`;
        if (probeAttempted === key) return;

        const timer = window.setTimeout(() => {
            setProbeAttempted(key);
            // Not in the dependencies on purpose: probe is rebuilt every render, and listing it
            // would make this effect fire in a loop.
            void probe();
        }, 400);
        return () => window.clearTimeout(timer);
    }, [tokenUsable, activeTokenId, org, app, probeAttempted]);

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
            // Chain naturally into "now post more data to that instance". The follow-up below
            // reads and validates it, so mark it read: the effect would otherwise do it twice.
            if (payload.instanceGuid) {
                setInstanceGuid(payload.instanceGuid);
                setReadAttempted(`${activeTokenId}:${org}/${app}:${payload.instanceOwnerPartyId ?? instanceOwnerPartyId}/${payload.instanceGuid}`);
            }

            appendLog(logFromRun(payload, await followUpAfterPost(payload)));
            // The post either made an instance or changed one, so what was listed is out of date.
            if (payload.ok) refreshInstances();
        } catch (error) {
            setRunError(error);
        } finally {
            setRunning(false);
        }
    }

    async function listInstances() {
        if (!activeTokenId || !org || !app || !instanceOwnerPartyId) return;
        setListing(true);
        setListError(null);
        try {
            const result = await api.listInstances({ tokenId: activeTokenId, org, app, instanceOwnerPartyId });
            appendLog(logFromInstances(result));
            // A failed listing stays null rather than empty, since "none" would be a claim we
            // cannot make when the request never answered.
            setInstanceList(result.ok ? result.instances : null);
        } catch (error) {
            setListError(error);
        } finally {
            setListing(false);
        }
    }

    /**
     * Lists again on demand, for the Refresh button and after a post.
     *
     * Marks the current target as attempted rather than clearing the marker: clearing it would
     * make the effect below schedule a second listing on top of this one.
     */
    function refreshInstances() {
        if (!activeTokenId) return;
        setListAttempted(`${activeTokenId}:${org}/${app}:${instanceOwnerPartyId}`);
        void listInstances();
    }

    /**
     * Reads the selected instance and validates it, as one log entry. Both are reads, so this
     * runs on its own whenever the selection changes rather than waiting for a button.
     */
    async function readSelected(party: string, guid: string) {
        if (!activeTokenId || !org || !app || !party || !guid) return;
        setFetching(true);
        setFetchError(null);
        const params = { tokenId: activeTokenId, org, app, instanceOwnerPartyId: party, instanceGuid: guid };
        try {
            const read = await api.getInstance(params);
            setInstanceDataElements(read.dataElements);
            setInstanceProcess(read.process);
            // Preselect one so reading a data element is a single click.
            if (read.dataElements.length > 0) changeDataGuid(read.dataElements[0]?.id ?? "");

            // Validating an instance that could not be read would just fail the same way.
            let validated: ValidateResult | null = null;
            if (read.ok) {
                try {
                    validated = await api.validateInstance(params);
                } catch {
                    /* the read still stands, and its own step is in the log */
                }
            }
            appendLog(logFromRead(read, validated));
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

    /**
     * Compares the stored xml against the xml as written. The left-hand side is either what is in
     * the payload editor or an example file, which is fetched here rather than held, since it is
     * only needed at the moment of comparing.
     */
    async function compareWithStored(source: string) {
        if (!activeTokenId || !dataGuid) return;
        const dataType = instanceDataElements.find((element) => element.id === dataGuid)?.dataType ?? "";
        setComparing(true);
        setCompareError(null);
        try {
            let left = "";
            if (source === "payload") {
                left = dataElements.find((element) => element.dataType === dataType && element.content.trim())?.content ?? "";
            } else {
                const [, kind, ...rest] = source.split(":");
                const file = await api.getExampleFile({ kind: (kind ?? "form") as ExampleKind, group: dataType, name: rest.join(":") });
                left = file.content;
            }
            if (!left.trim()) {
                setCompareError(new Error("That source has no content to compare."));
                return;
            }

            const result = await api.compareStored({
                tokenId: activeTokenId,
                org,
                app,
                instanceOwnerPartyId,
                instanceGuid,
                dataGuid,
                dataType,
                left
            });
            appendLog(logFromCompare(result));
            setCompareResult(result);
        } catch (error) {
            setCompareError(error);
        } finally {
            setComparing(false);
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

    async function removeInstance(instance: InstanceSummary, hard: boolean) {
        if (!activeTokenId) return;
        setListing(true);
        setListError(null);
        try {
            const result = await api.deleteInstance({
                tokenId: activeTokenId,
                org,
                app,
                instanceOwnerPartyId: instance.instanceOwnerPartyId,
                instanceGuid: instance.instanceGuid,
                hard: hard ? "true" : "false"
            });
            appendLog(logFromDelete(result));
            if (!result.ok) return;

            // Take it out of the listing, since a deleted instance is not one to offer next.
            setInstanceList((current) => current?.filter((held) => held.instanceGuid !== result.instanceGuid) ?? null);
            // Only clear the fields when they pointed at the instance that just went. Clearing the
            // guid drops the data elements, process and issues along with it, which would be wrong
            // to do while looking at a different instance.
            if (instanceGuid === result.instanceGuid) selectInstance(null);
        } catch (error) {
            setListError(error);
        } finally {
            setListing(false);
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

    /** Validates one data element. The instance's own validation runs with the read. */
    async function validateDataElement() {
        if (!activeTokenId || !dataGuid) return;
        setFetching(true);
        setFetchError(null);
        try {
            const result = await api.validateDataElement({ tokenId: activeTokenId, org, app, instanceOwnerPartyId, instanceGuid, dataGuid });
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
    if (!org || !app) blockers.push("an application");
    if (!instanceOwnerPartyId) blockers.push("an instance owner party id");
    if (dataElements.some((element) => !element.dataType)) blockers.push("a data type on every element");
    if (dataElements.some((element) => !element.content.trim())) blockers.push("content on every element");

    const selectedDataType = instanceDataElements.find((element) => element.id === dataGuid)?.dataType ?? "";

    /**
     * What the stored xml can be compared against: an element in the payload editor of the same
     * data type, and the example files for it. Base64 content is left out, since a comparison is
     * about xml.
     */
    const compareSources: CompareSource[] = useMemo(() => {
        if (!selectedDataType) return [];
        const sources: CompareSource[] = [];
        const payload = dataElements.find(
            (element) => element.dataType === selectedDataType && element.content.trim() && element.encoding !== "base64"
        );
        if (payload) {
            sources.push({
                value: "payload",
                label: `Payload element${payload.exampleName ? ` · from ${payload.exampleName}` : ""}`
            });
        }
        for (const group of exampleGroups) {
            if (group.kind === "attachment" || group.key !== selectedDataType) continue;
            for (const file of group.files) {
                sources.push({ value: `example:${group.kind}:${file.name}`, label: `Example · ${file.label}` });
            }
        }
        return sources;
    }, [selectedDataType, dataElements, exampleGroups]);

    const appHost = serverConfig?.appHost ?? "http://local.altinn.cloud:8000";

    /**
     * Where a post goes, which is not a setting: an instance selected in Instances means the data
     * is added to it, and the new instance row means the post creates one. Two controls could
     * disagree, and this one cannot.
     */
    const mode: RunMode = instanceGuid ? "existing" : "multipart";

    // Panels you cannot use yet are left out rather than shown dead.
    const sections = visibleSections({
        hasToken: tokenUsable,
        org,
        app,
        validationCount: validations.length,
        runCount: logs.length,
        hasProcess: instanceProcess !== null,
        party: instanceOwnerPartyId,
        dataSelected: Boolean(dataGuid),
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
                        onPartyChange={changeParty}
                        instanceGuid={instanceGuid}
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

                    {/* Right under the destination, since choosing one is how you aim at it. */}
                    {sections.instances && (
                        <InstancesPanel
                            appHost={appHost}
                            org={org}
                            app={app}
                            instanceOwnerPartyId={instanceOwnerPartyId}
                            localtestUrl={localtest?.url ?? serverConfig?.localtestUrl ?? "http://localhost:5101"}
                            instances={instanceList}
                            instanceGuid={instanceGuid}
                            onSelect={selectInstance}
                            onSelectTyped={selectTypedInstance}
                            onDelete={(instance, hard) => void removeInstance(instance, hard)}
                            onRefresh={refreshInstances}
                            busy={listing}
                            error={listError}
                        />
                    )}

                    {/* Nothing below can be aimed anywhere without a token and an app. */}
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
                                        ? "Posting…"
                                        : instanceGuid
                                          ? `Add data to ${instanceGuid.slice(0, 8)}`
                                          : `Post a new instance to ${org || "org"}/${app || "app"}`}
                                </button>
                            </section>

                            <FetchPanel
                                appHost={appHost}
                                org={org}
                                app={app}
                                instanceOwnerPartyId={instanceOwnerPartyId}
                                instanceGuid={instanceGuid}
                                dataElements={instanceDataElements}
                                dataGuid={dataGuid}
                                onDataGuidChange={changeDataGuid}
                                fetched={fetchedElement}
                                onDownloadDataElement={downloadDataElement}
                                onLoadIntoPayload={loadFetchedIntoPayload}
                                onGetDataElement={() => void getDataElement()}
                                onValidateDataElement={() => void validateDataElement()}
                                busy={fetching}
                                hasToken={tokenUsable}
                                error={fetchError}
                                onPreviewPdf={() => void renderPdf()}
                            />

                            {sections.compare && selectedDataType && (
                                <ComparePanel
                                    dataType={selectedDataType}
                                    sources={compareSources}
                                    onCompare={(source) => void compareWithStored(source)}
                                    result={compareResult}
                                    busy={comparing}
                                    error={compareError}
                                />
                            )}

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
                </div>

                {(sections.validation || sections.log) && (
                    <div className="column column--log">
                        {sections.validation && <ValidationPanel validations={validations} onClear={clearValidations} />}
                        {sections.log && (
                            <RunLog
                                entries={logs}
                                running={running || fetching}
                                onClear={() => setLogs([])}
                                localtestUrl={localtest?.url ?? serverConfig?.localtestUrl ?? "http://localhost:5101"}
                            />
                        )}
                    </div>
                )}
            </div>

            {pdfPreview && <PdfModal preview={pdfPreview} onClose={clearPdf} />}
        </div>
    );
}
