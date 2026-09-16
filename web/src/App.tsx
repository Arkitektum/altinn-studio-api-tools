import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { queryKeys } from "./queries";
import { isExpired } from "./lib/format";
import { downloadContent } from "./lib/download";
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
    logFromValidation,
    logFromValidationReport
} from "./lib/logResults";
import { withIdentity } from "./lib/formIdentity";
import { heldElement } from "./lib/heldElement";
import { withAppDefaults } from "./lib/payloadDefaults";
import { identityFor } from "./lib/identity";
import { buildValidationRequest, sameSubmission } from "./lib/validationRequest";
import { parseValidationReport, requirementsFrom, type Prevalidation } from "./lib/validationReport";
import { neededExamples, refKey, removePayload, restoreElements, toSavedPayload, upsertPayload } from "./lib/savedPayloads";
import { useSettled } from "./lib/useDebounced";
import { useLocalStorage } from "./lib/useLocalStorage";
import { validationBlockedBy } from "./lib/elementValidation";
import { visibleSections } from "./lib/sections";
import { upsertValidation } from "./lib/validations";
import { Chain } from "./components/Chain";
import { ErrorNotice } from "./components/Notice";
import { CompareSection } from "./components/CompareSection";
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
    AppParty,
    CatalogueApp,
    DataElementInput,
    DataElementSummary,
    ExampleContent,
    ExampleGroup,
    InstanceSummary,
    ListInstancesResult,
    LogEntry,
    LogResult,
    PublicToken,
    ReadInstanceResult,
    RunMode,
    RunResult,
    SavedPayload,
    ValidateResult,
    ValidationReportRequest,
    ValidationView
} from "./types";

const EMPTY_ELEMENT: DataElementInput = { dataType: "", content: "" };

/** Stood in for a query that has not answered yet, and the same array every time it is. */
const NO_APPS: CatalogueApp[] = [];
const NO_GROUPS: ExampleGroup[] = [];
const NO_TOKENS: PublicToken[] = [];
const NO_PARTIES: AppParty[] = [];
const NO_ELEMENTS: DataElementSummary[] = [];

/** What the instance query answers with: the read and the validation that went with it. */
interface InstanceAnswer {
    read: ReadInstanceResult;
    validated: ValidateResult | null;
}

/** Org and app are typed a character at a time, and "et-v4" should not be five probes. */
const PROBE_DELAY_MS = 400;

/** So is a party id, and so is a guid pasted into "Other instance". */
const SELECTION_DELAY_MS = 500;

/**
 * The comparison waits longer, because what it depends on is a document being edited rather than a
 * field being filled in, and a pause in typing is not the same as being finished. It is also what
 * keeps the parse of the whole document to one per pause rather than one per key.
 */
const EDIT_DELAY_MS = 800;

/**
 * Whether the payload is xml the server could compare, asked of the browser's own parser.
 *
 * Not in `lib/`, for once, because it is the one decision here that cannot be made without a
 * browser: `DOMParser` is what does the work, and node's test runner has none to lend it.
 */
function isWellFormedXml(text: string): boolean {
    const parsed = new DOMParser().parseFromString(text, "application/xml");
    return parsed.getElementsByTagName("parsererror").length === 0;
}

export function App() {
    const queryClient = useQueryClient();

    /*
     * What the server has to say for itself, asked once. None of these are keyed on anything the
     * operator can move, so they are read at startup and not again: the settings come from the
     * server's environment, and the catalogue and the example files are fixtures on disk.
     */
    const configQuery = useQuery({ queryKey: queryKeys.config(), queryFn: api.getConfig });
    const catalogueQuery = useQuery({ queryKey: queryKeys.catalogue(), queryFn: api.getCatalogue });
    const examplesQuery = useQuery({ queryKey: queryKeys.examples(), queryFn: api.getExamples });
    /* Its own, because it is allowed to fail. The status dot stays grey and nothing else cares. */
    const localtestQuery = useQuery({ queryKey: queryKeys.localtestStatus(), queryFn: api.getLocaltestStatus });

    const serverConfig = configQuery.data ?? null;
    const localtest = localtestQuery.data ?? null;
    // Through the constants rather than a literal, so a pending query hands the same empty array
    // every render. A fresh one would make every memo listing it hold nothing, which is a mistake
    // this file has made before.
    const catalogue = catalogueQuery.data ?? NO_APPS;
    const exampleGroups = examplesQuery.data?.groups ?? NO_GROUPS;
    /* The three that have to answer. LocalTest being down is a state, not a failure to boot. */
    const bootError = configQuery.error ?? catalogueQuery.error ?? examplesQuery.error ?? null;

    /*
     * The tokens the server is holding. Minting, renewing and deleting one all invalidate this,
     * from the panel that does them, so the list is never something a caller has to remember to
     * refresh. A failed listing leaves no tokens, which is what the panel would say anyway.
     */
    const tokensQuery = useQuery({ queryKey: queryKeys.tokens(), queryFn: api.listTokens });
    const tokens = tokensQuery.data ?? NO_TOKENS;

    /** Which token the operator picked. Null means whichever the server lists first. */
    const [preferredTokenId, setPreferredTokenId] = useState<string | null>(null);

    /**
     * The token in use: the one picked, or the first the server has.
     *
     * Derived rather than stored, which is what lets a preference for a token that has gone fall
     * back on its own. The server prunes expired tokens and a restart loses all of them, so the
     * list moving under the selection is the normal case rather than the odd one. This used to be a
     * repair run after every listing, and a repair only runs where someone remembered to put it.
     */
    const activeToken = useMemo(() => tokens.find((token) => token.id === preferredTokenId) ?? tokens[0] ?? null, [tokens, preferredTokenId]);
    const activeTokenId = activeToken?.id ?? null;

    // Ticks once a second so token expiry counts down live.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    /** Whether there is a token worth aiming anything with. Everything below reads this. */
    const tokenUsable = Boolean(activeToken) && !isExpired(activeToken?.expiresAt ?? null, now);

    const [org, setOrg] = useLocalStorage("org", "");
    const [app, setApp] = useLocalStorage("app", "");
    const [instanceOwnerPartyId, setInstanceOwnerPartyId] = useLocalStorage("partyId", "");
    const [instanceGuid, setInstanceGuid] = useLocalStorage("instanceGuid", "");
    // The party value this session last filled in from a token claim. See the effect below.
    const [autoFilledParty, setAutoFilledParty] = useLocalStorage<string | null>("partyAutoFilledFrom", null);
    const [dataElements, setDataElements] = useLocalStorage<DataElementInput[]>("dataElements", [EMPTY_ELEMENT]);
    /** Whole payloads kept for later, newest first. See lib/savedPayloads.ts for what is kept. */
    const [savedPayloads, setSavedPayloads] = useLocalStorage<SavedPayload[]>("savedPayloads", []);
    /** What the last load had to say, an example that has gone since being the case worth saying. */
    const [payloadLoadNotice, setPayloadLoadNotice] = useState<string | null>(null);
    const [advanceProcess, setAdvanceProcess] = useLocalStorage("advanceProcess", false);

    /*
     * What the app says about itself, and which parties this token may act for.
     *
     * Keyed on the token and the target, so pointing somewhere else is not something anyone has to
     * remember to clear: the key moves, and a key with nothing cached reads as nothing known. It is
     * also why an answer for the app you have left cannot land under the app you are on, which used
     * to be a guard at each of three points inside the probe.
     *
     * The key takes the target as typed, so it moves with the field and the panel never shows one
     * app's answer under another's name. What waits for the typing to stop is the request, which is
     * what `useSettled` gates: "et-v4" is one read and not five. See `lib/useDebounced.ts`.
     */
    const targetSettled = useSettled(`${org}/${app}`, PROBE_DELAY_MS);
    const probeAimed = tokenUsable && Boolean(activeTokenId && org && app);
    const probeParams = { tokenId: activeTokenId ?? "", org, app };

    const metadataQuery = useQuery({
        queryKey: queryKeys.appMetadata(probeParams.tokenId, org, app),
        queryFn: () => api.getAppMetadata(probeParams),
        enabled: probeAimed && targetSettled
    });

    /* A bonus: not every token may list them, and a refusal costs the picker its options and nothing else. */
    const partiesQuery = useQuery<AppParty[]>({
        queryKey: queryKeys.appParties(probeParams.tokenId, org, app),
        queryFn: async () => {
            try {
                return await api.getAppParties(probeParams);
            } catch {
                return NO_PARTIES;
            }
        },
        enabled: probeAimed && targetSettled
    });

    const metadata = metadataQuery.data ?? null;
    const parties = partiesQuery.data ?? NO_PARTIES;
    const probing = metadataQuery.isFetching || partiesQuery.isFetching;
    const probeError = metadataQuery.error;

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

    /**
     * The rendered pdf, held as a blob url. Only one at a time: rendering again replaces it, and
     * the old url is revoked so the blob can be collected.
     */
    const [pdfPreview, setPdfPreview] = useState<PdfPreview | null>(null);

    /**
     * Whether the listing also asks storage for the instances the app's active list leaves out.
     * A view of the moment rather than something you chose, so it is not persisted: the cheaper
     * listing is the right thing to come back to.
     */
    const [includeCompleted, setIncludeCompleted] = useState(false);
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
     * The last validation report, kept with the submission it was about. The payload panel reads it
     * for which documents are required, and the pair is what tells it whether the payload has moved
     * on since. React state rather than storage: it describes a moment, like everything else read
     * back.
     */
    const [validationAnswer, setValidationAnswer] = useState<{ report: unknown; request: ValidationReportRequest } | null>(null);

    /**
     * The instance selected right now, through a ref. `appendLog` is called from requests that
     * closed over an earlier render, and the guid it has to compare against is the one on screen at
     * the moment the answer arrives.
     */
    const selectedInstance = useRef(instanceGuid);
    useEffect(() => {
        selectedInstance.current = instanceGuid;
    });

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
        if (validation.instanceGuid !== selectedInstance.current) return;
        setValidations((current) => upsertValidation(current, validation, at, id));
    }, []);

    const clearValidations = useCallback(() => setValidations([]), []);

    /*
     * The party's instances, so a guid can be picked rather than pasted.
     *
     * The party settles first, the way the target does: it is typed, and it is also filled in from
     * the token's claim, both of which would otherwise list a party per character.
     *
     * The log entry is written in the `queryFn` rather than from the answer, because the log is a
     * record of requests made and this is the request. A listing read back out of the cache is not
     * one, and does not appear.
     */
    const partySettled = useSettled(instanceOwnerPartyId, SELECTION_DELAY_MS);
    const listParams = { tokenId: activeTokenId ?? "", org, app, instanceOwnerPartyId };

    const instancesKey = queryKeys.instances(listParams.tokenId, org, app, instanceOwnerPartyId, includeCompleted);

    const listQuery = useQuery({
        queryKey: instancesKey,
        queryFn: async () => {
            const result = await api.listInstances({ ...listParams, includeCompleted: includeCompleted ? "true" : "false" });
            appendLog(logFromInstances(result));
            return result;
        },
        enabled: probeAimed && targetSettled && partySettled && Boolean(instanceOwnerPartyId)
    });

    /**
     * A failed listing stays null rather than empty, since "none" would be a claim we cannot make
     * when the request never answered. So does one the app refused, for the same reason.
     */
    const instanceList = listQuery.data?.ok ? listQuery.data.instances : null;
    /** False when the completed ones were asked for and storage would not answer. */
    const completedListed = listQuery.data?.completedListed ?? null;

    /*
     * The selected instance, read back and validated as one thing.
     *
     * Two requests and one answer, which is why the `queryFn` makes both: the log has always shown
     * them as one entry, and the panels below describe one moment rather than two. Validating an
     * instance that could not be read would fail the same way, so it is only asked for after a read
     * that worked, and a validation that fails leaves the read standing with its own step in the log.
     *
     * Everything those panels show hangs off this key. An answer for the instance you have left
     * cannot appear under the one you are on, and selecting another instance does not have to
     * remember to clear the data elements, the process or the issues: they are this, and this is
     * keyed on the instance.
     */
    const instanceSettled = useSettled(instanceGuid, SELECTION_DELAY_MS);
    const instanceParams = { ...listParams, instanceGuid };
    const instanceKey = queryKeys.instance(listParams.tokenId, org, app, instanceOwnerPartyId, instanceGuid);

    const instanceQuery = useQuery({
        queryKey: instanceKey,
        queryFn: async () => {
            const read = await api.getInstance(instanceParams);
            let validated: ValidateResult | null = null;
            if (read.ok) {
                try {
                    validated = await api.validateInstance(instanceParams);
                } catch {
                    /* the read still stands, and its own step is in the log */
                }
            }
            appendLog(logFromRead(read, validated));
            return { read, validated };
        },
        enabled: probeAimed && targetSettled && partySettled && instanceSettled && Boolean(instanceOwnerPartyId && instanceGuid)
    });

    const instanceDataElements = instanceQuery.data?.read.dataElements ?? NO_ELEMENTS;
    /** Where the instance stands, from the last read or process move. */
    const instanceProcess = instanceQuery.data?.read.process ?? null;

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

    /** Why validating it would say nothing useful, or null when it would. */
    const validateBlockedBy = validationBlockedBy(
        instanceProcess,
        metadata?.metadata.dataTypes?.find((type) => type.id === selectedDataType)
    );

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

    /*
     * The selected data element, read back and validated.
     *
     * `lastChanged` is part of the key, so a post that rewrote the element under the same guid is a
     * different thing to read rather than the same one read already. Validation is skipped where it
     * would say nothing, which is what `validateBlockedBy` decides, and the two are one `queryFn`
     * running in order so the timings in the log stay honest. They stay two log entries, as they
     * have always been: they are two requests and answer two different questions.
     */
    const elementChangedAt = selectedElement?.lastChanged ?? null;
    const elementParams = { ...instanceParams, dataGuid };
    const elementKey = queryKeys.dataElement(listParams.tokenId, org, app, instanceOwnerPartyId, instanceGuid, dataGuid, elementChangedAt);

    const elementQuery = useQuery({
        queryKey: elementKey,
        queryFn: async () => {
            const read = await api.getDataElement(elementParams);
            appendLog(logFromDataElement(read));
            if (!validateBlockedBy) {
                try {
                    const validated = await api.validateDataElement(elementParams);
                    // The instance read is what lets an issue name its data type instead of a guid.
                    appendLog(logFromValidation(validated, instanceDataElements));
                } catch {
                    /* the read still stands, and its own step is in the log */
                }
            }
            return read;
        },
        enabled: probeAimed && targetSettled && partySettled && instanceSettled && Boolean(instanceOwnerPartyId && instanceGuid && dataGuid)
    });

    /** Held so it can be saved as a file rather than read again. */
    const fetchedElement = useMemo(
        () => (elementQuery.data ? heldElement(dataGuid, elementQuery.data, selectedElement) : null),
        [elementQuery.data, dataGuid, selectedElement]
    );

    /*
     * The stored xml against the xml as written.
     *
     * Keyed on the settled payload text, so the cache holds one entry per pause in the typing and
     * not one per keystroke, and `gcTime` is finite here alone: superseded entries hold a copy of
     * the document, and a long editing session would otherwise keep every version of it.
     *
     * Whether the text parses is part of the answer rather than state beside it. The comparison is
     * the only thing that asks, it asks once per settled document, and the panel's "not well formed
     * yet" reads what it found.
     */
    const comparableSettled = useSettled(comparable, EDIT_DELAY_MS);
    const compareQuery = useQuery({
        queryKey: queryKeys.compare(listParams.tokenId, org, app, instanceOwnerPartyId, instanceGuid, dataGuid, elementChangedAt, comparable ?? ""),
        queryFn: async () => {
            const written = comparable ?? "";
            // Half-typed xml is not a comparison waiting to happen, and asking anyway would put a
            // "could not compare" entry in the log for every pause in typing.
            if (!isWellFormedXml(written)) return { wellFormed: false, result: null };
            const result = await api.compareStored({ ...elementParams, dataType: selectedDataType, left: written });
            appendLog(logFromCompare(result));
            return { wellFormed: true, result };
        },
        enabled:
            probeAimed &&
            targetSettled &&
            partySettled &&
            instanceSettled &&
            comparableSettled &&
            Boolean(instanceOwnerPartyId && instanceGuid && dataGuid && comparable),
        /*
         * The one query that keeps its last answer while the next key loads. Everywhere else an
         * empty panel is the honest thing while the tool is between answers, but this panel is
         * watched while the document under it is being typed: the key moves on every keystroke, and
         * clearing the diff on each one would leave it flickering rather than settling.
         */
        placeholderData: (previous) => previous,
        gcTime: 60_000
    });

    const compareResult = compareQuery.data?.result ?? null;
    /** Whether the payload parsed, as of the last time the comparison looked. */
    const payloadParses = compareQuery.data?.wellFormed ?? true;

    /** Picking another data element is a different key, so nothing here has to be dropped by hand. */
    const changeDataGuid = useCallback((next: string) => setPreferredDataGuid(next), []);

    /** Replaces the held preview, revoking the previous blob url so it is not leaked. */
    const showPdf = useCallback((next: PdfPreview | null) => {
        setPdfPreview((current) => {
            if (current) URL.revokeObjectURL(current.url);
            return next;
        });
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
                clearValidations();
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

        /*
         * What was read goes into the cache under the instance it was read for, rather than into
         * the state of whichever instance is selected by the time it lands. That is what makes a
         * late answer harmless here: it goes where it belongs either way, and the panels show it
         * when and only when that is the instance they are about. It also saves the read the
         * instance query would otherwise make as soon as the selection catches up.
         */
        if (instance) {
            queryClient.setQueryData(queryKeys.instance(activeTokenId, org, app, party, guid), {
                read: instance,
                validated: validation
            });
        }
        return { instance, validation };
    }

    const run = useMutation({
        mutationFn: async () => {
            const payload = await api.postRun({
                tokenId: activeTokenId ?? "",
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

            /*
             * The instance goes in before the follow-up runs, not after. The follow-up reads and
             * validates the new instance before React has re-rendered, and its validation would
             * otherwise be checked against the instance this post replaced and thrown away.
             */
            if (payload.instanceGuid) selectedInstance.current = payload.instanceGuid;

            appendLog(logFromRun(payload, await followUpAfterPost(payload)));
            return payload;
        },
        onSuccess: (payload) => {
            // Chain naturally into "now post more data to that instance".
            if (payload.instanceGuid) setInstanceGuid(payload.instanceGuid);
            // The post either made an instance or changed one, so what was listed is out of date.
            if (payload.ok) refreshInstances();
        }
    });

    /**
     * Lists again on demand, for the Refresh button and after a post.
     *
     * A refetch rather than an invalidation, because this is the one listing on screen and the
     * question is not whether it has gone stale but that it is being asked again.
     */
    function refreshInstances() {
        void listQuery.refetch();
    }

    /**
     * Asks for the selected element again, for the Refresh button.
     *
     * A refetch of both rather than an invalidation: nothing about the selection has changed, so
     * the keys are already the right ones, and the question is not whether the answers have gone
     * stale but that they are being asked for again.
     */
    function refreshElement() {
        void elementQuery.refetch();
        if (comparable) void compareQuery.refetch();
    }

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
                    files.set(refKey(ref), await api.getExampleFile(ref));
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
     * Asks the DIBK validation service what it makes of the payload.
     *
     * It answers which documents a submission of this form needs, which `applicationmetadata`
     * cannot: a `minCount` is what the app declares and not what the validation insists on. The
     * whole report goes to the run log as well, since the payload panel reads only the part of it
     * about documents and the rest is about the form.
     */
    const validationReport = useMutation({
        mutationFn: async (request: ValidationReportRequest) => {
            const result = await api.validationReport(request);
            appendLog(logFromValidationReport(result, request));
            return { result, request };
        },
        onSuccess: ({ result, request }) => {
            // Kept with the submission it was about, so the panel can say when that has moved on.
            // A refusal leaves the previous report alone: the log says what happened, and dropping
            // what the service last said would lose the list you were working through.
            if (result.ok) setValidationAnswer({ report: result.report, request });
        }
    });

    /** Saves the held data element as a file, under the name Altinn stored or the data type. */
    function downloadDataElement() {
        if (!fetchedElement) return;
        downloadContent(fetchedElement.filename, fetchedElement.content, fetchedElement.encoding, fetchedElement.contentType);
    }

    /**
     * Renders the instance as the pdf Altinn would produce.
     *
     * The one read still guarded by hand, because what it produces is not an answer in the cache
     * but a blob url held open in a window. The instance it was asked for is named before the
     * request so a render that lands after the selection moved does not open as though it were the
     * instance now on screen.
     */
    const renderPdf = useMutation({
        mutationFn: async (requested: string) => {
            const result = await api.previewPdf({ tokenId: activeTokenId ?? "", org, app, instanceOwnerPartyId, instanceGuid: requested });
            appendLog(logFromPdf(result, result.size));
            return { result, requested };
        },
        onSuccess: ({ result, requested }) => {
            if (selectedInstance.current !== requested) return;
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
        }
    });

    /**
     * Removes an instance outright. Soft deletion is still on the api, which the docs cover, but
     * not offered here: everything this tool can reach is local test data, and a soft delete left
     * the instance in storage where the completed listing would keep finding it.
     */
    const removeInstance = useMutation({
        mutationFn: async (instance: InstanceSummary) => {
            const result = await api.deleteInstance({
                tokenId: activeTokenId ?? "",
                org,
                app,
                instanceOwnerPartyId: instance.instanceOwnerPartyId,
                instanceGuid: instance.instanceGuid,
                hard: "true"
            });
            appendLog(logFromDelete(result));
            return result;
        },
        onSuccess: (result) => {
            if (!result.ok) return;

            // Taken out of the listing rather than asking for it again: a delete that succeeded is
            // the whole of what changed, and a deleted instance is not one to offer next.
            queryClient.setQueryData<ListInstancesResult>(instancesKey, (current) =>
                current ? { ...current, instances: current.instances.filter((held) => held.instanceGuid !== result.instanceGuid) } : current
            );
            // Only clear the fields when they pointed at the instance that just went. Clearing the
            // guid drops the data elements, process and issues along with it, which would be wrong
            // to do while looking at a different instance.
            if (instanceGuid === result.instanceGuid) selectInstance(null);
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

    const blockers: string[] = [];
    if (!tokenUsable) blockers.push("a valid token");
    if (!org || !app) blockers.push("an application");
    if (!instanceOwnerPartyId) blockers.push("an instance owner party id");
    if (dataElements.some((element) => !element.dataType)) blockers.push("a data type on every element");
    if (dataElements.some((element) => !element.content.trim())) blockers.push("content on every element");

    /**
     * The payload as the validation service would be told it, which is both what the button sends
     * and what says whether the report on screen still describes the payload in front of you.
     *
     * Held, because it is rebuilt from the payload and the payload is the largest thing here. A
     * rebuilt one is also a new object, which was enough to keep `prevalidation` below from ever
     * reusing its answer: between them they cost about 2 ms of every render, and this component
     * re-renders once a second for the token countdown alone.
     */
    const validationRequest = useMemo(
        () =>
            buildValidationRequest({
                elements: dataElements,
                dataTypes,
                metadata: metadata?.metadata ?? null,
                parties,
                partyId: instanceOwnerPartyId,
                token: activeToken ?? null
            }),
        [dataElements, dataTypes, metadata, parties, instanceOwnerPartyId, activeToken]
    );

    /**
     * What the validation service last said about this payload, counted against the payload as it
     * stands. Here rather than in the panel because two places read it: the panel lists what is
     * missing, and the post button says whether this has been through the service at all.
     */
    const prevalidation = useMemo((): Prevalidation | null => {
        const report = parseValidationReport(validationAnswer?.report ?? null);
        if (!report) return null;
        return {
            requirements: requirementsFrom(report, {
                dataTypes,
                payload: dataElements.map((element) => element.dataType).filter(Boolean),
                onInstance: instanceDataElements.map((element) => element.dataType)
            }),
            stale: !sameSubmission(validationAnswer?.request ?? null, validationRequest.request)
        };
    }, [validationAnswer, dataTypes, dataElements, instanceDataElements, validationRequest.request]);

    const appHost = serverConfig?.appHost ?? "http://local.altinn.cloud:8000";

    /**
     * Where a post goes, which is not a setting: an instance selected in Instances means the data
     * is added to it, and the new instance row means the post creates one. Two controls could
     * disagree, and this one cannot.
     */
    const mode: RunMode = instanceGuid ? "existing" : "multipart";

    /** Anything at all in flight, which is what the log reports rather than any one action. */
    const inFlight =
        run.isPending || instanceQuery.isFetching || elementQuery.isFetching || compareQuery.isFetching || renderPdf.isPending || advance.isPending;

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
        busy: inFlight
    });

    return (
        <div className="shell">
            <header className="masthead">
                <span className="masthead__mark">Altinn API tools</span>
                {/*
                 * Three states, each of them a coloured dot. The dot is the whole message, so each
                 * one carries the same message in words for anyone the colour does not reach. The
                 * region is polite: these change on their own, and they are worth hearing about.
                 */}
                <div className="masthead__meta" role="status">
                    <span className="gauge" title={appHost}>
                        <span className={`led ${serverConfig ? "led--ok" : "led--bad"}`} aria-hidden="true" />
                        {appHost.replace(/^https?:\/\//, "")}
                        <span className="sr-only">{serverConfig ? " api answering" : " api not answering"}</span>
                    </span>
                    <span className="gauge" title={localtest?.error ?? localtest?.url}>
                        <span className={`led ${localtest?.reachable ? "led--ok" : "led--bad"}`} aria-hidden="true" />
                        LocalTest
                        <span className="sr-only">{localtest?.reachable ? " answering" : " not answering"}</span>
                    </span>
                    <span className="gauge">
                        <span className={`led ${tokenUsable ? "led--ok" : "led--bad"}`} aria-hidden="true" />
                        {activeToken ? activeToken.label : "No token"}
                        <span className="sr-only">{tokenUsable ? " token valid" : " no usable token"}</span>
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
                        now={now}
                    />

                    {/* Nothing here can be read without a token, so the panel waits for one. */}
                    {sections.target && (
                        <TargetPanel
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
                            onProbe={() => {
                                void metadataQuery.refetch();
                                void partiesQuery.refetch();
                            }}
                            probing={probing}
                            probeError={probeError}
                        />
                    )}

                    {/* Right under the destination, since choosing one is how you aim at it. */}
                    {sections.instances && (
                        <InstancesPanel
                            id="panel-instances"
                            appHost={appHost}
                            org={org}
                            app={app}
                            instanceOwnerPartyId={instanceOwnerPartyId}
                            localtestUrl={localtest?.url ?? serverConfig?.localtestUrl ?? "http://localhost:5101"}
                            elementCount={dataElements.length}
                            instances={instanceList}
                            instanceGuid={instanceGuid}
                            onSelect={selectInstance}
                            onSelectTyped={selectTypedInstance}
                            onDelete={(instance) => removeInstance.mutate(instance)}
                            onRefresh={refreshInstances}
                            includeCompleted={includeCompleted}
                            onIncludeCompletedChange={setIncludeCompleted}
                            completedListed={completedListed}
                            // Listing only. A read of the selected instance is reported by the
                            // panels that show what it returns, and holding this one busy would
                            // put a spinner on Refresh for a request it did not make.
                            busy={listQuery.isFetching || removeInstance.isPending}
                            // The error does belong here: selecting a row is what starts the read.
                            error={listQuery.error ?? removeInstance.error ?? instanceQuery.error}
                        />
                    )}

                    {/* Nothing below can be aimed anywhere without a token and an app. */}
                    {sections.requests && (
                        <>
                            <span className="group">Post</span>

                            <PayloadPanel
                                dataElements={dataElements}
                                onChange={setDataElements}
                                org={org}
                                app={app}
                                dataTypes={dataTypes}
                                metadata={metadata?.metadata ?? null}
                                suggestedDataTypes={suggestedDataTypes}
                                exampleGroups={exampleGroups}
                                advanceProcess={advanceProcess}
                                onAdvanceProcessChange={setAdvanceProcess}
                                savedPayloads={savedPayloads}
                                onSavePayload={savePayload}
                                onLoadPayload={(payload) => void loadPayload(payload)}
                                onDeletePayload={(id) => setSavedPayloads(removePayload(savedPayloads, id))}
                                loadNotice={payloadLoadNotice}
                                validationUrl={serverConfig?.validationUrl ?? ""}
                                validationBlockedBy={validationRequest.blockedBy}
                                onValidationReport={() => validationRequest.request && validationReport.mutate(validationRequest.request)}
                                validating={validationReport.isPending}
                                prevalidation={prevalidation}
                            >
                                <div style={{ marginTop: 18 }}>
                                    <span className="legend">Post</span>

                                    {blockers.length > 0 && (
                                        <div className="notice notice--warn" style={{ marginBottom: 12 }}>
                                            Needs {blockers.join(", ")}.
                                        </div>
                                    )}

                                    {/*
                                     * The one thing the prevalidation notice above cannot say,
                                     * because there is no report for it to be part of. The rest of
                                     * what the service said is already on screen a few lines up.
                                     */}
                                    {serverConfig?.validationUrl && !prevalidation && (
                                        <div className="notice" style={{ marginBottom: 12 }}>
                                            Not prevalidated. What <strong>Prevalidate</strong> answers is what a refused submit would have told you,
                                            read before the submit rather than after.
                                        </div>
                                    )}

                                    {/* Both are asked for from this panel, and only one at a time. */}
                                    {(run.error ?? validationReport.error) ? (
                                        <div style={{ marginBottom: 12 }}>
                                            <ErrorNotice error={run.error ?? validationReport.error} />
                                        </div>
                                    ) : null}

                                    <button
                                        type="button"
                                        className="btn btn--primary btn--fire"
                                        onClick={() => run.mutate()}
                                        disabled={run.isPending || blockers.length > 0}
                                    >
                                        {run.isPending && <span className="btn__spinner" />}
                                        {run.isPending
                                            ? "Posting…"
                                            : instanceGuid
                                              ? `Add data to ${instanceGuid.slice(0, 8)}`
                                              : `Post a new instance to ${org || "org"}/${app || "app"}`}
                                    </button>
                                </div>
                            </PayloadPanel>

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
                                onRefresh={refreshElement}
                                validateBlockedBy={validateBlockedBy}
                                // Also while the instance is being read, since that read is what
                                // replaces the list this panel is choosing from.
                                busy={elementQuery.isFetching || instanceQuery.isFetching}
                                hasToken={tokenUsable}
                                error={elementQuery.error}
                            >
                                {/* Inside the panel, because it compares what the select above it
                                    is pointing at. Beside it as its own card, that was left to be
                                    worked out from the order the two happened to be in. */}
                                {sections.compare && selectedDataType && (
                                    <CompareSection
                                        dataType={selectedDataType}
                                        payload={
                                            payloadForSelected
                                                ? `${payloadForSelected.content.length.toLocaleString("nb")} characters${payloadForSelected.exampleName ? ` · from ${payloadForSelected.exampleName}` : ""}`
                                                : null
                                        }
                                        parses={payloadParses}
                                        result={compareResult}
                                        busy={compareQuery.isFetching}
                                        error={compareQuery.error}
                                    />
                                )}
                            </FetchPanel>

                            {/* After the data element, since it is a different kind of action. */}
                            {sections.requests && instanceGuid && (
                                <PdfPanel
                                    appHost={appHost}
                                    org={org}
                                    app={app}
                                    instanceOwnerPartyId={instanceOwnerPartyId}
                                    instanceGuid={instanceGuid}
                                    onPreviewPdf={() => renderPdf.mutate(instanceGuid)}
                                    busy={renderPdf.isPending}
                                    hasToken={tokenUsable}
                                    error={renderPdf.error}
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
                                    onAdvance={() => advance.mutate()}
                                    busy={advance.isPending}
                                    hasToken={tokenUsable}
                                    error={advance.error}
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
                                running={inFlight}
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
