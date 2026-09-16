import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { queryKeys } from "./queries";
import { useRunLog } from "./runLog";
import { useSession } from "./session";
import { logFromDataElement, logFromRead, logFromValidation } from "./lib/logResults";
import { PROBE_DELAY_MS, SELECTION_DELAY_MS, useSettled } from "./lib/useDebounced";
import type { AppParty, DataElementSummary, ReadDataElementResult, ReadInstanceResult, ValidateResult } from "./types";

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
    const { tokenId, tokenUsable, org, app } = useSession();
    const settled = useSettled(`${org}/${app}`, PROBE_DELAY_MS);
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
    const { tokenId, tokenUsable, org, app, partyId, instanceGuid } = useSession();
    const { append } = useRunLog();

    const targetSettled = useSettled(`${org}/${app}`, PROBE_DELAY_MS);
    const partySettled = useSettled(partyId, SELECTION_DELAY_MS);
    const instanceSettled = useSettled(instanceGuid, SELECTION_DELAY_MS);
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
