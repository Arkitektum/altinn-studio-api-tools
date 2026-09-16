import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { queryKeys } from "./queries";
import { useAppRead, useDataElementRead, useInstanceRead } from "./reads";
import { useRunLog } from "./runLog";
import { useSession } from "./session";
import { downloadContent } from "./lib/download";
import { splitPastedInstanceId } from "./lib/instanceId";
import { bytesFromBase64 } from "./lib/formats";
import { logFromAdvance, logFromCompare, logFromPdf, logFromRun, logFromValidationReport } from "./lib/logResults";
import { withIdentity } from "./lib/formIdentity";
import { heldElement } from "./lib/heldElement";
import { withAppDefaults } from "./lib/payloadDefaults";
import { identityFor } from "./lib/identity";
import { buildValidationRequest, sameSubmission } from "./lib/validationRequest";
import { parseValidationReport, requirementsFrom, type Prevalidation } from "./lib/validationReport";
import { neededExamples, refKey, removePayload, restoreElements, toSavedPayload, upsertPayload } from "./lib/savedPayloads";
import { EDIT_DELAY_MS, useSettled } from "./lib/useDebounced";
import { useLocalStorage } from "./lib/useLocalStorage";
import { validationBlockedBy } from "./lib/elementValidation";
import { visibleSections } from "./lib/sections";
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
    DataElementInput,
    ExampleContent,
    InstanceSummary,
    ReadInstanceResult,
    RunMode,
    RunResult,
    SavedPayload,
    ValidateResult,
    ValidationReportRequest
} from "./types";

const EMPTY_ELEMENT: DataElementInput = { dataType: "", content: "" };

/** What the instance query answers with: the read and the validation that went with it. */
interface InstanceAnswer {
    read: ReadInstanceResult;
    validated: ValidateResult | null;
}

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
     */
    const [pdfPreview, setPdfPreview] = useState<PdfPreview | null>(null);

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
    const elementQuery = useDataElementRead(dataGuid, elementChangedAt, validateBlockedBy);

    /** Held so it can be saved as a file rather than read again. */
    const fetchedElement = useMemo(
        () => (elementQuery.read ? heldElement(dataGuid, elementQuery.read, selectedElement) : null),
        [elementQuery.read, dataGuid, selectedElement]
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
        queryKey: queryKeys.compare(activeTokenId ?? "", org, app, instanceOwnerPartyId, instanceGuid, dataGuid, elementChangedAt, comparable ?? ""),
        queryFn: async () => {
            const written = comparable ?? "";
            // Half-typed xml is not a comparison waiting to happen, and asking anyway would put a
            // "could not compare" entry in the log for every pause in typing.
            if (!isWellFormedXml(written)) return { wellFormed: false, result: null };
            const result = await api.compareStored({
                tokenId: activeTokenId ?? "",
                org,
                app,
                instanceOwnerPartyId,
                instanceGuid,
                dataGuid,
                dataType: selectedDataType,
                left: written
            });
            appendLog(logFromCompare(result));
            return { wellFormed: true, result };
        },
        enabled: instanceRead.aimed && comparableSettled && Boolean(instanceGuid && dataGuid && comparable),
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
            if (payload.instanceGuid) {
                runLog.markSelected(payload.instanceGuid);
                shownInstance.current = payload.instanceGuid;
            }

            appendLog(logFromRun(payload, await followUpAfterPost(payload)));
            return payload;
        },
        onSuccess: (payload) => {
            // Chain naturally into "now post more data to that instance".
            if (payload.instanceGuid) setInstanceGuid(payload.instanceGuid);
            // The post either made an instance or changed one, so what was listed is out of date.
            // By key, the listing being the panel's now. Every listing of this app, since a post
            // can change which party's list an instance turns up in.
            if (payload.ok) void queryClient.invalidateQueries({ queryKey: queryKeys.allInstances(activeTokenId ?? "", org, app) });
        }
    });

    /**
     * Asks for the selected element again, for the Refresh button.
     *
     * A refetch of both rather than an invalidation: nothing about the selection has changed, so
     * the keys are already the right ones, and the question is not whether the answers have gone
     * stale but that they are being asked for again.
     */
    function refreshElement() {
        elementQuery.refetch();
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
            if (shownInstance.current !== requested) return;
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

    /**
     * Where a post goes, which is not a setting: an instance selected in Instances means the data
     * is added to it, and the new instance row means the post creates one. Two controls could
     * disagree, and this one cannot.
     */
    const mode: RunMode = instanceGuid ? "existing" : "multipart";

    /** Anything at all in flight, which is what the log reports rather than any one action. */
    const inFlight =
        run.isPending || instanceRead.fetching || elementQuery.fetching || compareQuery.isFetching || renderPdf.isPending || advance.isPending;

    // Panels you cannot use yet are left out rather than shown dead.
    const sections = visibleSections({
        hasToken: tokenUsable,
        org,
        app,
        validationCount: runLog.validations.length,
        runCount: runLog.entries.length,
        hasProcess: instanceProcess !== null,
        party: instanceOwnerPartyId,
        dataSelected: Boolean(dataGuid),
        busy: inFlight
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
                            onProbe={appRead.refetch}
                            probing={appRead.probing}
                            probeError={appRead.error}
                        />
                    )}

                    {/* Right under the destination, since choosing one is how you aim at it. */}
                    {sections.instances && (
                        <InstancesPanel
                            id="panel-instances"
                            elementCount={dataElements.length}
                            onSelect={selectInstance}
                            onSelectTyped={selectTypedInstance}
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
                                dataElements={instanceDataElements}
                                dataGuid={dataGuid}
                                onDataGuidChange={changeDataGuid}
                                fetched={fetchedElement}
                                onDownloadDataElement={downloadDataElement}
                                onRefresh={refreshElement}
                                validateBlockedBy={validateBlockedBy}
                                // Also while the instance is being read, since that read is what
                                // replaces the list this panel is choosing from.
                                busy={elementQuery.fetching || instanceRead.fetching}
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
                                    onPreviewPdf={() => renderPdf.mutate(instanceGuid)}
                                    busy={renderPdf.isPending}
                                    hasToken={tokenUsable}
                                    error={renderPdf.error}
                                />
                            )}

                            {/* Where the instance stands. Arrives with the first instance read. */}
                            {sections.process && instanceProcess && (
                                <ProcessPanel
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
                        {sections.validation && <ValidationPanel />}
                        {sections.log && <RunLog running={inFlight} />}
                    </div>
                )}
            </div>

            {pdfPreview && <PdfModal preview={pdfPreview} onClose={clearPdf} />}
        </div>
    );
}
