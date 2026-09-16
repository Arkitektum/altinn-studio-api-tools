import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { queryKeys } from "./queries";
import { useAppRead, useInstanceRead } from "./reads";
import { useRunLog } from "./runLog";
import { useSession } from "./session";
import { logFromRun, logFromValidationReport } from "./lib/logResults";
import { buildValidationRequest, sameSubmission } from "./lib/validationRequest";
import { parseValidationReport, requirementsFrom, type Prevalidation } from "./lib/validationReport";
import type { AppDataType, DataElementInput, ReadInstanceResult, RunMode, RunResult, ValidateResult, ValidationReportRequest } from "./types";

/**
 * The two writes that act on the payload: sending it to the validation service, and posting it.
 *
 * Hooks rather than functions in `App`, for the same reason the reads are. What acts on the payload
 * belongs with the panel the payload is in, and a panel cannot reach into `App` for it.
 */

/** Stood in for an app that has not been read yet, and the same array every time it is. */
const EMPTY_TYPES: AppDataType[] = [];

/**
 * Posts the payload, then reads the instance back and validates it.
 *
 * The follow-up is part of the post rather than something that happens afterwards: the log has
 * always shown them as one entry, and what Altinn stored is the thing you posted to see. A failure
 * in either follow-up must not mask a successful post, so each degrades to null with its own step
 * still in the log.
 */
export function usePostRun() {
    const { tokenId, org, app, partyId, instanceGuid, setInstanceGuid } = useSession();
    const { append, markSelected } = useRunLog();
    const queryClient = useQueryClient();

    /**
     * Where a post goes, which is not a setting: an instance selected in Instances means the data
     * is added to it, and the new instance row means the post creates one. Two controls could
     * disagree, and this one cannot.
     */
    const mode: RunMode = instanceGuid ? "existing" : "multipart";

    async function followUp(payload: RunResult) {
        const party = payload.instanceOwnerPartyId;
        const guid = payload.instanceGuid;
        if (!tokenId || !payload.ok || !party || !guid) return { instance: null, validation: null };

        const params = { tokenId, org, app, instanceOwnerPartyId: party, instanceGuid: guid };
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
         * What was read goes into the cache under the instance it was read for, rather than into the
         * state of whichever instance is selected by the time it lands. That is what makes a late
         * answer harmless: it goes where it belongs either way, and the panels show it when and only
         * when that is the instance they are about. It also saves the read the instance query would
         * otherwise make as soon as the selection catches up.
         */
        if (instance) {
            queryClient.setQueryData(queryKeys.instance(tokenId, org, app, party, guid), { read: instance, validated: validation });
        }
        return { instance, validation };
    }

    return useMutation({
        mutationFn: async (input: { dataElements: DataElementInput[]; advanceProcess: boolean }) => {
            const payload = await api.postRun({
                tokenId: tokenId ?? "",
                org,
                app,
                instanceOwnerPartyId: partyId,
                mode,
                ...(mode === "existing" ? { instanceGuid } : {}),
                // Only the wire fields. exampleName and collapsed are UI state.
                dataElements: input.dataElements.map((element) => ({
                    dataType: element.dataType,
                    content: element.content,
                    ...(element.encoding ? { encoding: element.encoding } : {}),
                    ...(element.contentType ? { contentType: element.contentType } : {}),
                    ...(element.filename ? { filename: element.filename } : {})
                })),
                // Validation runs as a follow-up request instead of a step inside the run.
                validate: false,
                advanceProcess: input.advanceProcess
            });

            /*
             * The instance is marked before the follow-up runs, not after. The follow-up reads and
             * validates the new instance before React has re-rendered, and its validation would
             * otherwise be checked against the instance this post replaced and thrown away.
             */
            if (payload.instanceGuid) markSelected(payload.instanceGuid);

            append(logFromRun(payload, await followUp(payload)));
            return payload;
        },
        onSuccess: (payload) => {
            // Chain naturally into "now post more data to that instance".
            if (payload.instanceGuid) setInstanceGuid(payload.instanceGuid);
            // The post either made an instance or changed one, so what was listed is out of date.
            // Every listing of this app, since a post can change which party's list it turns up in.
            if (payload.ok) void queryClient.invalidateQueries({ queryKey: queryKeys.allInstances(tokenId ?? "", org, app) });
        }
    });
}

/** The report and the submission it described, which is the pair staleness is told from. */
export interface ValidationAnswer {
    report: unknown;
    request: ValidationReportRequest;
}

export interface PrevalidationState {
    /** What the service last said, counted against the payload as it stands. Null until asked. */
    prevalidation: Prevalidation | null;
    /** Why the payload cannot be sent to it yet, or null when it can. */
    blockedBy: string | null;
    /** Where the service lives, for the line under the button. Empty when it is switched off. */
    url: string;
    asking: boolean;
    error: unknown;
    ask: () => void;
}

/**
 * What the DIBK validation service makes of the payload.
 *
 * It answers which documents a submission of this form needs, which `applicationmetadata` cannot: a
 * `minCount` is what the app declares and not what the validation insists on. The whole report goes
 * to the run log as well, since only the part of it about documents is read here.
 */
export function usePrevalidation(elements: DataElementInput[]): PrevalidationState {
    const { partyId, activeToken, serverConfig } = useSession();
    const { append } = useRunLog();
    const { dataElements: onInstance } = useInstanceRead();
    const { metadata: appMetadata, parties } = useAppRead();

    const metadata = appMetadata?.metadata ?? null;
    const dataTypes = metadata?.dataTypes ?? EMPTY_TYPES;

    /**
     * The payload as the service would be told it, which is both what the button sends and what
     * says whether the report on screen still describes the payload in front of you.
     */
    const request = useMemo(
        () => buildValidationRequest({ elements, dataTypes, metadata, parties, partyId, token: activeToken }),
        [elements, dataTypes, metadata, parties, partyId, activeToken]
    );

    /*
     * The last report, kept with the submission it was about so staleness can be told, and held in
     * the cache so every caller sees the same one. The query never fetches: the mutation below
     * writes it, and this is how a component subscribes to that.
     */
    const queryClient = useQueryClient();
    const { data: answer } = useQuery<ValidationAnswer | null>({
        queryKey: queryKeys.validationReport(),
        /*
         * There is nothing to fetch, so this hands back what is already there. A query without a
         * `queryFn` at all warns on every render even when it is disabled, and a fetch that returns
         * whatever it was holding cannot lose the report if one is ever asked for anyway.
         */
        queryFn: () => queryClient.getQueryData<ValidationAnswer | null>(queryKeys.validationReport()) ?? null,
        enabled: false,
        initialData: null
    });

    const mutation = useMutation({
        mutationFn: async (sent: ValidationReportRequest) => {
            const result = await api.validationReport(sent);
            append(logFromValidationReport(result, sent));
            return { result, sent };
        },
        onSuccess: ({ result, sent }) => {
            // A refusal leaves the previous report alone: the log says what happened, and dropping
            // what the service last said would lose the list you were working through.
            if (result.ok) queryClient.setQueryData<ValidationAnswer>(queryKeys.validationReport(), { report: result.report, request: sent });
        }
    });

    const prevalidation = useMemo((): Prevalidation | null => {
        const report = parseValidationReport(answer?.report ?? null);
        if (!report) return null;
        return {
            requirements: requirementsFrom(report, {
                dataTypes,
                payload: elements.map((element) => element.dataType).filter(Boolean),
                onInstance: onInstance.map((element) => element.dataType)
            }),
            stale: !sameSubmission(answer?.request ?? null, request.request)
        };
    }, [answer, dataTypes, elements, onInstance, request.request]);

    return {
        prevalidation,
        blockedBy: request.blockedBy,
        url: serverConfig?.validationUrl ?? "",
        asking: mutation.isPending,
        error: mutation.error,
        ask: () => request.request && mutation.mutate(request.request)
    };
}
