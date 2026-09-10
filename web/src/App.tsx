import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { pendingAutoRuns } from "./lib/autoRuns";
import { hasMovedOn, selectionKeys, type SelectionKeys } from "./lib/selectionKeys";
import { useLocalStorage } from "./lib/useLocalStorage";
import { validationBlockedBy } from "./lib/elementValidation";
import { visibleSections } from "./lib/sections";
import { upsertValidation } from "./lib/validations";
import { Chain } from "./components/Chain";
import { ErrorNotice } from "./components/Notice";
import { ComparePanel } from "./components/ComparePanel";
import { FetchPanel } from "./components/FetchPanel";
import { PdfPanel } from "./components/PdfPanel";
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
    /** Which token and app have already been probed, so a refusal is not retried forever. */
    const [probeAttempted, setProbeAttempted] = useState<string | null>(null);
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

    const selection = { tokenId: activeTokenId, org, app, party: instanceOwnerPartyId, instanceGuid, dataGuid };

    /**
     * What every request is aimed at, one key per scope. Nothing here cancels a request, so a call
     * can answer after the selection it described has moved. Tagging the request with the key it
     * was aimed at is what lets a late answer be dropped rather than written over the newer one.
     */
    const keys = useMemo(() => selectionKeys(selection), [activeTokenId, org, app, instanceOwnerPartyId, instanceGuid, dataGuid]);

    /**
     * The same selection through a ref, because a callback closes over the render that started it,
     * and that is the value being tested. Kept in step on every render, and by hand where a flow
     * moves the selection and reads it back without a render in between.
     */
    const aim = useRef(selection);
    useEffect(() => {
        aim.current = selection;
    });

    /** Whether the selection has moved on from what a request was aimed at. */
    const movedOn = useCallback((requested: string, scope: keyof SelectionKeys) => hasMovedOn(requested, aim.current, scope), []);

    const HISTORY_LIMIT = 25;
    const appendLog = useCallback((result: LogResult) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const at = new Date().toLocaleTimeString("nb");
        setLogs((current) => [{ id, at, result }, ...current].slice(0, HISTORY_LIMIT));

        const validation = result.validation;
        if (!validation) return;
        // A validation view belongs to exactly one instance, so folding in one that answered
        // after another instance was selected would replace the issues on screen with the ones
        // you just left. The request itself keeps its place in the log either way.
        if (validation.instanceGuid !== aim.current.instanceGuid) return;
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
     * The three reads the tool makes without being asked. Which of them are outstanding, and how
     * long each waits for its field to settle, is decided in `lib/autoRuns.ts` and tested there.
     * What is left here is the plumbing: a timer per scope, the marker that keeps it to once per
     * selection, and the call.
     *
     * The calls are deliberately out of the dependency lists. They are rebuilt on every render,
     * and listing one would make its effect fire in a loop.
     */
    const {
        probe: nextProbe,
        list: nextList,
        read: nextRead
    } = pendingAutoRuns({
        hasToken: tokenUsable,
        selection,
        attempted: { probe: probeAttempted, list: listAttempted, read: readAttempted }
    });

    useEffect(() => {
        if (!nextProbe) return;
        const timer = window.setTimeout(() => {
            setProbeAttempted(nextProbe.key);
            void probe();
        }, nextProbe.delayMs);
        return () => window.clearTimeout(timer);
    }, [nextProbe?.key]);

    useEffect(() => {
        if (!nextList) return;
        const timer = window.setTimeout(() => {
            setListAttempted(nextList.key);
            void listInstances();
        }, nextList.delayMs);
        return () => window.clearTimeout(timer);
    }, [nextList?.key]);

    // A post marks its own instance as read, since it already reads and validates it.
    useEffect(() => {
        if (!nextRead) return;
        const timer = window.setTimeout(() => {
            setReadAttempted(nextRead.key);
            void readSelected(instanceOwnerPartyId, instanceGuid);
        }, nextRead.delayMs);
        return () => window.clearTimeout(timer);
    }, [nextRead?.key]);

    async function probe() {
        if (!activeTokenId) return;
        // Two probes are in flight whenever the target moves during one, and the older can answer
        // last. Metadata for the app you have left would then sit under the app you are on.
        const requested = keys.target;
        setProbing(true);
        setProbeError(null);
        const params = { tokenId: activeTokenId, org, app };
        try {
            const meta = await api.getAppMetadata(params);
            if (movedOn(requested, "target")) return;
            setMetadata(meta);
            // Parties are a bonus: not every token is allowed to list them.
            let partyList: AppParty[] = [];
            try {
                partyList = await api.getAppParties(params);
            } catch {
                /* none, which is what the picker falls back to */
            }
            if (movedOn(requested, "target")) return;
            setParties(partyList);
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
            if (movedOn(requested, "target")) return;
            setProbeError(error);
        } finally {
            // Unguarded: a newer probe sets this again on its way out, and a stuck spinner is
            // worse than one that stops a moment early.
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

        // The post pointed the tool at this instance, so it is the selected one unless another was
        // picked while the follow-up was in flight.
        const requested = selectionKeys({ tokenId: activeTokenId, org, app, party, instanceGuid: guid }).instance;
        if (instance?.ok && !movedOn(requested, "instance")) {
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
                const party = payload.instanceOwnerPartyId ?? instanceOwnerPartyId;
                setInstanceGuid(payload.instanceGuid);
                // By hand as well as through the render, because the follow-up reads and validates
                // the new instance before React has re-rendered. Left to the effect, those answers
                // would be checked against the instance this post replaced and thrown away.
                aim.current = { ...aim.current, party, instanceGuid: payload.instanceGuid };
                setReadAttempted(selectionKeys({ tokenId: activeTokenId, org, app, party, instanceGuid: payload.instanceGuid }).instance);
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
        const requested = keys.party;
        setListing(true);
        setListError(null);
        try {
            const result = await api.listInstances({ tokenId: activeTokenId, org, app, instanceOwnerPartyId });
            // The request happened, so it keeps its place in the log whatever is selected by now.
            // The listing itself is another party's the moment the party moves.
            appendLog(logFromInstances(result));
            if (movedOn(requested, "party")) return;
            // A failed listing stays null rather than empty, since "none" would be a claim we
            // cannot make when the request never answered.
            setInstanceList(result.ok ? result.instances : null);
        } catch (error) {
            if (movedOn(requested, "party")) return;
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
        setListAttempted(keys.party);
        void listInstances();
    }

    /**
     * Reads the selected instance and validates it, as one log entry. Both are reads, so this
     * runs on its own whenever the selection changes rather than waiting for a button.
     */
    async function readSelected(party: string, guid: string) {
        if (!activeTokenId || !org || !app || !party || !guid) return;
        // Aimed at the instance this was called for rather than the one selected now, since a post
        // reads back the instance it just made.
        const requested = selectionKeys({ tokenId: activeTokenId, org, app, party, instanceGuid: guid }).instance;
        setFetching(true);
        setFetchError(null);
        const params = { tokenId: activeTokenId, org, app, instanceOwnerPartyId: party, instanceGuid: guid };
        try {
            const read = await api.getInstance(params);
            // Another instance can be selected while this is in flight. Its data elements would
            // then be listed under the new instance's guid, and reading one would ask the new
            // instance for an element that belongs to the old.
            const stale = movedOn(requested, "instance");
            if (!stale) {
                setInstanceDataElements(read.dataElements);
                setInstanceProcess(read.process);
                // Preselect one so reading a data element is a single click.
                if (read.dataElements.length > 0) changeDataGuid(read.dataElements[0]?.id ?? "");
            }

            // Validating an instance that could not be read would just fail the same way, and one
            // the tool has already left is not worth the request.
            let validated: ValidateResult | null = null;
            if (read.ok && !stale) {
                try {
                    validated = await api.validateInstance(params);
                } catch {
                    /* the read still stands, and its own step is in the log */
                }
            }
            appendLog(logFromRead(read, validated));
        } catch (error) {
            if (movedOn(requested, "instance")) return;
            setFetchError(error);
        } finally {
            setFetching(false);
        }
    }

    async function getDataElement() {
        if (!activeTokenId || !dataGuid) return;
        const requested = keys.dataElement;
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
            // What is held is what is selected, so an answer about another element is not it.
            if (movedOn(requested, "dataElement")) return;

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
            if (movedOn(requested, "dataElement")) return;
            setFetchError(error);
        } finally {
            setFetching(false);
        }
    }

    /**
     * Compares the stored xml against what the payload holds for that data type. The payload is
     * the only source: it is where the file you are working on already is, and a picker offering
     * the example files as well was never used for anything else.
     */
    async function compareWithStored() {
        if (!activeTokenId || !dataGuid) return;
        const left = payloadForSelected?.content ?? "";
        if (!left.trim()) return;

        const requested = keys.dataElement;
        setComparing(true);
        setCompareError(null);
        try {
            const result = await api.compareStored({
                tokenId: activeTokenId,
                org,
                app,
                instanceOwnerPartyId,
                instanceGuid,
                dataGuid,
                dataType: selectedDataType,
                left
            });
            appendLog(logFromCompare(result));
            // A comparison is about one data element, and the panel names the selected one.
            if (movedOn(requested, "dataElement")) return;
            setCompareResult(result);
        } catch (error) {
            if (movedOn(requested, "dataElement")) return;
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

    async function renderPdf() {
        if (!activeTokenId) return;
        const requested = keys.instance;
        setFetching(true);
        setFetchError(null);
        try {
            const result = await api.previewPdf({ tokenId: activeTokenId, org, app, instanceOwnerPartyId, instanceGuid });
            appendLog(logFromPdf(result, result.size));
            // A pdf of the instance you have left must not open as though it were this one.
            if (movedOn(requested, "instance")) return;
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
            if (movedOn(requested, "instance")) return;
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
        const requested = keys.instance;
        setFetching(true);
        setProcessError(null);
        try {
            const result = await api.advanceProcess({
                tokenId: activeTokenId,
                org,
                app,
                instanceOwnerPartyId,
                instanceGuid,
                // Already read, so naming the action costs no extra request.
                taskType: instanceProcess?.taskType ?? null
            });
            // Read the instance afterwards, because advancing can change more than the task: the
            // app may add data elements on the way out of one, a generated pdf among them, and the
            // panels below are showing the list from before the move. A failed read must not turn
            // a successful advance into a failure, so it degrades to null with its step in the log.
            let read: ReadInstanceResult | null = null;
            if (result.ok) {
                try {
                    read = await api.getInstance({ tokenId: activeTokenId, org, app, instanceOwnerPartyId, instanceGuid });
                } catch {
                    /* the advance still stands */
                }
            }
            appendLog(logFromAdvance(result, read));
            // Both of the below describe the instance that was advanced, not whichever is selected
            // by the time the move came back.
            if (movedOn(requested, "instance")) return;

            if (read?.ok) {
                setInstanceDataElements(read.dataElements);
                // Keep the element that is selected where it survived the move, since the panels
                // below are about it, and fall back to the first of whatever is there now.
                if (!read.dataElements.some((element) => element.id === dataGuid)) {
                    changeDataGuid(read.dataElements[0]?.id ?? "");
                }
            }
            // The read is the later answer, so it wins. Without one, the advance's own response
            // still carries the process it landed in, and a refused move leaves the task the
            // instance is still in on screen rather than blanking it.
            const moved = read?.ok ? read.process : result.ok ? result.process : null;
            if (moved) setInstanceProcess(moved);
        } catch (error) {
            if (movedOn(requested, "instance")) return;
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

            {/* What the tool is working on, and what the next thing to fill in is. */}
            <Chain
                user={activeToken && tokenUsable ? activeToken.label : null}
                application={org && app ? `${org}/${app}` : null}
                party={instanceOwnerPartyId || null}
                instance={instanceGuid ? instanceGuid.slice(0, 8) : null}
                dataElement={selectedDataType || null}
            />

            <div className="deck">
                <div className="column column--rail">
                    {bootError ? <ErrorNotice error={bootError} /> : null}
                    <TokenPanel
                        id="panel-test-user"
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
                        id="panel-target"
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
                            id="panel-instances"
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
                            <span className="group">Post</span>

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

                            <span className="group">Inspect</span>

                            <FetchPanel
                                id="panel-data-element"
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
                                onGetDataElement={() => void getDataElement()}
                                onValidateDataElement={() => void validateDataElement()}
                                validateBlockedBy={validationBlockedBy(
                                    instanceProcess,
                                    metadata?.metadata.dataTypes?.find((type) => type.id === selectedDataType)
                                )}
                                busy={fetching}
                                hasToken={tokenUsable}
                                error={fetchError}
                            />

                            {sections.compare && selectedDataType && (
                                <ComparePanel
                                    dataType={selectedDataType}
                                    payload={
                                        payloadForSelected
                                            ? `${payloadForSelected.content.length.toLocaleString("nb")} characters${payloadForSelected.exampleName ? ` · from ${payloadForSelected.exampleName}` : ""}`
                                            : null
                                    }
                                    onCompare={() => void compareWithStored()}
                                    result={compareResult}
                                    busy={comparing}
                                    error={compareError}
                                />
                            )}

                            {/* After the comparison, since it is a different kind of action. */}
                            {sections.requests && instanceGuid && (
                                <PdfPanel
                                    appHost={appHost}
                                    org={org}
                                    app={app}
                                    instanceOwnerPartyId={instanceOwnerPartyId}
                                    instanceGuid={instanceGuid}
                                    onPreviewPdf={() => void renderPdf()}
                                    busy={fetching}
                                    hasToken={tokenUsable}
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
