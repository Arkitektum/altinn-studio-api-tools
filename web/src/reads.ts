import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { queryKeys } from "./queries";
import { useRunLog } from "./runLog";
import { useSession } from "./session";
import { logFromCompare, logFromDataElement, logFromRead, logFromValidation } from "./lib/logResults";
import { EDIT_DELAY_MS, useSettled } from "./lib/useDebounced";
import type { AppParty, CompareResult, DataElementSummary, ReadDataElementResult, ReadInstanceResult, ValidateResult } from "./types";

/**
 * The reads several parts of the tool need, as hooks anything can call.
 *
 * A panel that shows what a read returned should be the thing that asks for it, and most of them
 * can simply own their query. These three cannot: the instance read fills the data element picker,
 * the process panel, the validation panel and the prevalidation's idea of what is already on the
 * instance, and the app's metadata is read by nearly everything.
 *
 * Shared without being lifted, because the cache makes a second caller free. Two components calling
 * the same hook with the same key make one request between them and both see the answer, which is
 * the thing that was not possible while every read was a function in `App` writing into state.
 */

/** Stood in for a query that has not answered yet, and the same array every time it is. */
const NO_PARTIES: AppParty[] = [];
const NO_ELEMENTS: DataElementSummary[] = [];

export interface AppRead {
    metadata: Awaited<ReturnType<typeof api.getAppMetadata>> | null;
    parties: AppParty[];
    probing: boolean;
    error: unknown;
    refetch: () => void;
}

/**
 * What the app says about itself, and which parties this token may act for.
 *
 * Keyed on the token and the target, so pointing somewhere else is not something anyone has to
 * remember to clear: the key moves, and a key with nothing cached reads as nothing known.
 *
 * The key takes the target as typed, so it moves with the field and no panel shows one app's answer
 * under another's name. What waits for the typing to stop is the request, which `useSettled` gates:
 * "et-v4" is one read and not five.
 */
export function useAppRead(): AppRead {
    const { tokenId, tokenUsable, org, app, targetSettled: settled } = useSession();
    const aimed = tokenUsable && Boolean(tokenId && org && app);
    const params = { tokenId: tokenId ?? "", org, app };

    const metadataQuery = useQuery({
        queryKey: queryKeys.appMetadata(params.tokenId, org, app),
        queryFn: () => api.getAppMetadata(params),
        enabled: aimed && settled
    });

    /* A bonus: not every token may list them, and a refusal costs the picker its options and no more. */
    const partiesQuery = useQuery<AppParty[]>({
        queryKey: queryKeys.appParties(params.tokenId, org, app),
        queryFn: async () => {
            try {
                return await api.getAppParties(params);
            } catch {
                return NO_PARTIES;
            }
        },
        enabled: aimed && settled
    });

    return {
        metadata: metadataQuery.data ?? null,
        parties: partiesQuery.data ?? NO_PARTIES,
        probing: metadataQuery.isFetching || partiesQuery.isFetching,
        error: metadataQuery.error,
        refetch: () => {
            void metadataQuery.refetch();
            void partiesQuery.refetch();
        }
    };
}

export interface InstanceRead {
    read: ReadInstanceResult | null;
    dataElements: DataElementSummary[];
    process: ReadInstanceResult["process"];
    fetching: boolean;
    error: unknown;
    /** Whether the fields it is aimed at have settled, which the reads below it share. */
    aimed: boolean;
}

/**
 * The selected instance, read back and validated as one thing.
 *
 * Two requests and one answer, which is why the `queryFn` makes both: the log has always shown them
 * as one entry, and the panels below describe one moment rather than two. Validating an instance
 * that could not be read would fail the same way, so it is only asked after a read that worked, and
 * a validation that fails leaves the read standing with its own step in the log.
 */
export function useInstanceRead(): InstanceRead {
    const { tokenId, tokenUsable, org, app, partyId, instanceGuid, targetSettled, partySettled, instanceSettled } = useSession();
    const { append } = useRunLog();
    const settled = targetSettled && partySettled && instanceSettled;
    const aimed = tokenUsable && Boolean(tokenId && org && app && partyId);

    const params = { tokenId: tokenId ?? "", org, app, instanceOwnerPartyId: partyId, instanceGuid };

    const query = useQuery({
        queryKey: queryKeys.instance(params.tokenId, org, app, partyId, instanceGuid),
        queryFn: async () => {
            const read = await api.getInstance(params);
            let validated: ValidateResult | null = null;
            if (read.ok) {
                try {
                    validated = await api.validateInstance(params);
                } catch {
                    /* the read still stands, and its own step is in the log */
                }
            }
            append(logFromRead(read, validated));
            return { read, validated };
        },
        enabled: aimed && settled && Boolean(instanceGuid)
    });

    return {
        read: query.data?.read ?? null,
        dataElements: query.data?.read.dataElements ?? NO_ELEMENTS,
        process: query.data?.read.process ?? null,
        fetching: query.isFetching,
        error: query.error,
        aimed: aimed && settled
    };
}

export interface DataElementRead {
    read: ReadDataElementResult | null;
    fetching: boolean;
    error: unknown;
    refetch: () => void;
}

/**
 * One data element, read back and validated.
 *
 * `changedAt` is part of the key because a post rewrites an element in place: the guid stays where
 * it was while what is stored under it does not, and without it the tool would go on showing what
 * it read before the post.
 *
 * `blocked` is why validating would say nothing useful, or null when it would. The read happens
 * either way; only the validation is skipped, with the reason shown in place of its url.
 */
export function useDataElementRead(dataGuid: string, changedAt: string | null, blocked: string | null): DataElementRead {
    const { tokenId, org, app, partyId, instanceGuid } = useSession();
    const { append } = useRunLog();
    const { dataElements, aimed } = useInstanceRead();

    const params = { tokenId: tokenId ?? "", org, app, instanceOwnerPartyId: partyId, instanceGuid, dataGuid };

    const query = useQuery({
        queryKey: queryKeys.dataElement(params.tokenId, org, app, partyId, instanceGuid, dataGuid, changedAt),
        queryFn: async () => {
            const read = await api.getDataElement(params);
            append(logFromDataElement(read));
            if (!blocked) {
                try {
                    const validated = await api.validateDataElement(params);
                    // The instance read is what lets an issue name its data type instead of a guid.
                    append(logFromValidation(validated, dataElements));
                } catch {
                    /* the read still stands, and its own step is in the log */
                }
            }
            return read;
        },
        enabled: aimed && Boolean(instanceGuid && dataGuid)
    });

    return {
        read: query.data ?? null,
        fetching: query.isFetching,
        error: query.error,
        refetch: () => void query.refetch()
    };
}

/**
 * Whether the payload is xml the server could compare, asked of the browser's own parser.
 *
 * Here rather than in `lib/`, because `DOMParser` is what does the work and node's test runner has
 * none to lend it. The comparison is the only thing that asks.
 */
function isWellFormedXml(text: string): boolean {
    const parsed = new DOMParser().parseFromString(text, "application/xml");
    return parsed.getElementsByTagName("parsererror").length === 0;
}

export interface Comparison {
    result: CompareResult | null;
    /** Whether the payload parsed, as of the last time this looked. */
    wellFormed: boolean;
    fetching: boolean;
    error: unknown;
    refetch: () => void;
}

/**
 * The stored xml against the xml as written, which is `written`.
 *
 * Keyed on the text itself, because that is half of what is being compared and a length or a
 * timestamp would miss an edit that swapped one character for another. The key moves with every
 * keystroke, so this is the one read with a finite `gcTime`, superseded keys each holding a copy of
 * the document, and the one that keeps its last answer while the next key loads: the panel is
 * watched while the document under it is typed, and clearing the diff on each character would leave
 * it flickering rather than settling.
 *
 * Whether the text parses is part of the answer rather than state beside it. Half-typed xml is not a
 * comparison waiting to happen, and asking anyway would put a failed compare in the log for every
 * pause in typing.
 */
export function useCompare(dataGuid: string, changedAt: string | null, dataType: string, written: string | null): Comparison {
    const { tokenId, org, app, partyId, instanceGuid } = useSession();
    const { append } = useRunLog();
    const { aimed } = useInstanceRead();
    const settled = useSettled(written, EDIT_DELAY_MS);

    const query = useQuery({
        queryKey: queryKeys.compare(tokenId ?? "", org, app, partyId, instanceGuid, dataGuid, changedAt, written ?? ""),
        queryFn: async () => {
            const left = written ?? "";
            if (!isWellFormedXml(left)) return { wellFormed: false, result: null };
            const result = await api.compareStored({
                tokenId: tokenId ?? "",
                org,
                app,
                instanceOwnerPartyId: partyId,
                instanceGuid,
                dataGuid,
                dataType,
                left
            });
            append(logFromCompare(result));
            return { wellFormed: true, result };
        },
        enabled: aimed && settled && Boolean(instanceGuid && dataGuid && written),
        placeholderData: (previous) => previous,
        gcTime: 60_000
    });

    return {
        result: query.data?.result ?? null,
        wellFormed: query.data?.wellFormed ?? true,
        fetching: query.isFetching,
        error: query.error,
        refetch: () => void query.refetch()
    };
}
