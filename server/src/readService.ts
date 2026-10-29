import { altinnFetch, isTextual } from "./altinnClient.js";
import { StepRecorder, type RunStep } from "./stepRecorder.js";
import { appBaseUrl, storageInstancesUrl } from "./urls.js";
import { advanceBody } from "./processAction.js";

export interface ReadRequest {
    org: string;
    app: string;
    instanceOwnerPartyId: string;
    instanceGuid: string;
}

/** One entry of an instance's `data` array, trimmed to what the UI needs to pick one. */
export interface DataElementSummary {
    id: string;
    dataType: string;
    contentType: string | null;
    filename: string | null;
    size: number | null;
    lastChanged: string | null;
}

/**
 * Where an instance stands, which is also why it may not be in the app's own list.
 *
 * `active` is what the app offers back to the user. The other two only ever come from storage,
 * since that is the only place they are still listed.
 */
export type InstanceState = "active" | "completed" | "deleted";

/** One entry of the party's instance list, trimmed to what the UI needs to pick one. */
export interface InstanceSummary {
    /** "510001/99d0632c-…", as Altinn writes it. */
    id: string;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    lastChanged: string | null;
    /** Name of whoever last touched it, which is what Altinn's own list shows. */
    lastChangedBy: string | null;
    state: InstanceState;
}

export interface ListInstancesResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    instanceOwnerPartyId: string;
    instances: InstanceSummary[];
    /**
     * Whether the finished ones are in there: true when storage answered, false when it was asked
     * and would not, null when it was not asked. The difference matters, because a list missing
     * half of what was requested should not read as a party with nothing finished.
     */
    completedListed: boolean | null;
    /**
     * What storage answered when it would not list them, so the notice can say which refusal this
     * was rather than naming the likeliest. A 403 is the token not being allowed to act for that
     * party, which is a thing you fix; a 500 or a timeout is LocalTest, which is a thing you wait
     * for. Null when storage was not asked, or answered.
     */
    completedStatus: number | null;
}

/** Where an instance stands in its process, trimmed to what you need to decide what to do next. */
export interface ProcessSummary {
    /** Element id of the task the instance sits in. Null once the process has ended. */
    currentTask: string | null;
    /** Altinn's task type: data, confirmation, feedback, signing, payment. */
    taskType: string | null;
    started: string | null;
    ended: string | null;
    endEvent: string | null;
}

export interface ReadInstanceResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    instance: unknown;
    /** Data elements on the instance, for choosing which one to fetch next. */
    dataElements: DataElementSummary[];
    /** Null when the instance could not be read, or carried no process at all. */
    process: ProcessSummary | null;
}

export interface DeleteInstanceResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    /** Whether the instance was removed outright or only marked as deleted. */
    hard: boolean;
}

export interface AdvanceProcessResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    /** The process as it stands after the move, so the caller need not read the instance again. */
    process: ProcessSummary | null;
}

export interface ReadDataElementResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    dataGuid: string;
    contentType: string | null;
    /** utf8 for text formats, base64 for a stored binary file. */
    encoding: "utf8" | "base64";
    /** Text for XML and JSON, base64 for anything binary. */
    content: string | null;
}

/**
 * What to render, beyond the instance. Without a task the app renders the task the instance is in,
 * which in these apps is the main form with every subform after it.
 */
export interface PdfPreviewRequest extends ReadRequest {
    /** A service task of type `pdf` or `subformPdf`. See readPdfTargets. */
    taskId?: string;
    /** The subform data element a `subformPdf` task renders. The app ignores it for any other task. */
    dataElementId?: string;
    language?: string;
}

/** A `subformPdf` task, and the subform data type it renders. */
export interface SubformPdfTask {
    taskId: string;
    /**
     * Followed from the task's layout to the subform's own layout set, see readPdfTargets. Null when
     * that cannot be done, which is also how an app set up for Altinn 9 (`subformUiFolder`) looks
     * from outside: the task is real, but which subform it renders is only in the process
     * definition, which the app does not serve.
     */
    dataType: string | null;
}

export interface PdfTargetsResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    /** Tasks of type `pdf`, which render the main form on its own. */
    pdfTasks: string[];
    subformPdfTasks: SubformPdfTask[];
}

export interface PdfPreviewResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    contentType: string | null;
    /** The pdf bytes, base64 encoded because the rest of the api is json. */
    content: string | null;
    /** Decoded byte count, so the ui can show a size without decoding first. */
    size: number;
}

/** One entry of Altinn's validation response. */
export interface ValidationIssue {
    severity: number;
    code: string | null;
    description: string | null;
    field: string | null;
    dataElementId: string | null;
    source: string | null;
}

export interface ValidationCounts {
    errors: number;
    warnings: number;
    other: number;
}

export interface ValidateResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    /** The instance that was validated. Results are only meaningful for this instance. */
    instanceGuid: string;
    /** Set when validating a single data element rather than the whole instance. */
    dataGuid: string | null;
    issues: ValidationIssue[];
    counts: ValidationCounts;
}

function toSummary(value: unknown): DataElementSummary | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record["id"] !== "string") return null;
    const asString = (key: string): string | null => (typeof record[key] === "string" ? (record[key] as string) : null);
    return {
        id: record["id"],
        dataType: asString("dataType") ?? "unknown",
        contentType: asString("contentType"),
        filename: asString("filename"),
        size: typeof record["size"] === "number" ? record["size"] : null,
        lastChanged: asString("lastChanged")
    };
}

/**
 * Reads a process state out of either an instance body or a bare process state, because
 * `PUT process/next` answers with the latter.
 */
function toProcess(value: unknown): ProcessSummary | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const nested = record["process"];
    const process = (nested && typeof nested === "object" ? nested : record) as Record<string, unknown>;
    const asString = (source: Record<string, unknown>, key: string): string | null =>
        typeof source[key] === "string" ? (source[key] as string) : null;

    const rawTask = process["currentTask"];
    const task = rawTask && typeof rawTask === "object" ? (rawTask as Record<string, unknown>) : null;
    const started = asString(process, "started");
    const ended = asString(process, "ended");
    // None of the three means this was not a process state at all, which is not the same as a
    // process that has not started.
    if (!task && !started && !ended) return null;

    return {
        currentTask: task ? asString(task, "elementId") : null,
        taskType: task ? asString(task, "altinnTaskType") : null,
        started,
        ended,
        endEvent: asString(process, "endEvent")
    };
}

/**
 * What state a storage row is in. Both spellings of each flag are read, since Altinn has written
 * `softDeleted` as a timestamp and `isSoftDeleted` as a boolean in different places, and a row
 * whose state cannot be established is treated as active rather than hidden.
 */
function stateOf(record: Record<string, unknown>): InstanceState {
    const status = record["status"];
    if (status && typeof status === "object") {
        const flags = status as Record<string, unknown>;
        if (flags["softDeleted"] || flags["isSoftDeleted"] || flags["hardDeleted"] || flags["isHardDeleted"]) return "deleted";
    }
    const process = record["process"];
    if (process && typeof process === "object" && typeof (process as Record<string, unknown>)["ended"] === "string") {
        return "completed";
    }
    return "active";
}

function toInstanceSummary(value: unknown, fallbackPartyId: string, state?: InstanceState): InstanceSummary | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const id = record["id"];
    if (typeof id !== "string" || !id.trim()) return null;
    // Instance ids read "510001/99d0632c-…". A bare guid is accepted too, in which case the party
    // is the one we asked about.
    const [first, second] = id.split("/");
    const guid = second ?? first ?? "";
    if (!guid) return null;
    const asString = (key: string): string | null => (typeof record[key] === "string" ? (record[key] as string) : null);
    return {
        id,
        instanceOwnerPartyId: second ? (first ?? fallbackPartyId) : fallbackPartyId,
        instanceGuid: guid,
        lastChanged: asString("lastChanged"),
        lastChangedBy: asString("lastChangedBy"),
        state: state ?? stateOf(record)
    };
}

/** Altinn's list endpoints answer with a bare array, storage with `{ instances: [...] }`. */
function rowsOf(body: unknown): unknown[] {
    if (Array.isArray(body)) return body;
    const wrapped = (body as { instances?: unknown } | null)?.instances;
    return Array.isArray(wrapped) ? wrapped : [];
}

/** Newest first, which is nearly always the one you just made or just finished. */
function byLastChanged(a: InstanceSummary, b: InstanceSummary): number {
    return (b.lastChanged ?? "").localeCompare(a.lastChanged ?? "");
}

/**
 * GET {app}/instances/{party}/active
 *
 * The app's own list endpoint, the one its frontend uses to offer an unfinished form back to the
 * user. It answers with the party's instances whose process has not ended, so an archived
 * instance is not in the list.
 */
export async function listInstances(
    token: string,
    request: { org: string; app: string; instanceOwnerPartyId: string; includeCompleted?: boolean }
): Promise<ListInstancesResult> {
    const recorder = new StepRecorder();
    const url = `${appBaseUrl(request.org, request.app)}/instances/${request.instanceOwnerPartyId}/active`;

    const response = await recorder.run("List active instances", "GET", url, () => altinnFetch({ url, token }));

    // The app answers with a bare array. Storage-style `{ instances: [...] }` is accepted too, so
    // pointing this at another endpoint still yields a list rather than nothing.
    //
    // Everything the app offers back is active by definition of the endpoint, so the state comes
    // from which endpoint answered rather than from the row, which carries no process.
    const active = rowsOf(response.ok ? response.body : null)
        .map((row) => toInstanceSummary(row, request.instanceOwnerPartyId, "active"))
        .filter((instance): instance is InstanceSummary => instance !== null);

    let instances = [...active].sort(byLastChanged);
    let completedListed: boolean | null = null;
    let completedStatus: number | null = null;

    /*
     * The finished ones, from storage, and only when asked for. Two reads rather than one because
     * the app's list is the one that must not depend on storage being there: LocalTest serves the
     * storage api, and if it is down or refuses the party, an active listing still stands on its
     * own. What storage adds is merged by guid, so an instance in both is listed once, as the app
     * described it.
     */
    if (request.includeCompleted) {
        const storageUrl = storageInstancesUrl(request.org, request.app, request.instanceOwnerPartyId);
        const stored = await recorder.run("List every instance from storage", "GET", storageUrl, () => altinnFetch({ url: storageUrl, token }));
        completedListed = stored.ok;
        completedStatus = stored.ok ? null : stored.status;

        if (stored.ok) {
            const known = new Set(active.map((instance) => instance.instanceGuid));
            const extra = rowsOf(stored.body)
                .map((row) => toInstanceSummary(row, request.instanceOwnerPartyId))
                .filter((instance): instance is InstanceSummary => instance !== null && !known.has(instance.instanceGuid));
            instances = [...active, ...extra].sort(byLastChanged);
        }
    }

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not list the instances for this party.",
        instanceOwnerPartyId: request.instanceOwnerPartyId,
        instances,
        completedListed,
        completedStatus
    };
}

/** GET {app}/instances/{party}/{guid} */
export async function readInstance(token: string, request: ReadRequest): Promise<ReadInstanceResult> {
    const recorder = new StepRecorder();
    const url = `${appBaseUrl(request.org, request.app)}/instances/${request.instanceOwnerPartyId}/${request.instanceGuid}`;

    const response = await recorder.run("Get instance", "GET", url, () => altinnFetch({ url, token }));

    const instance = response.ok ? response.body : null;
    const rawData = instance && typeof instance === "object" ? (instance as Record<string, unknown>)["data"] : undefined;
    const dataElements = Array.isArray(rawData) ? rawData.map(toSummary).filter((element): element is DataElementSummary => element !== null) : [];

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not read the instance.",
        instanceOwnerPartyId: request.instanceOwnerPartyId,
        instanceGuid: request.instanceGuid,
        instance,
        dataElements,
        process: toProcess(instance)
    };
}

/**
 * DELETE {app}/instances/{party}/{guid}
 *
 * Soft by default, which marks the instance deleted and takes it out of the active list while
 * leaving it in storage. `hard` removes it outright, which is what a test run wants when it is
 * clearing up after itself.
 */
export async function deleteInstance(token: string, request: ReadRequest & { hard?: boolean }): Promise<DeleteInstanceResult> {
    const recorder = new StepRecorder();
    const hard = request.hard === true;
    const url = `${appBaseUrl(request.org, request.app)}/instances/${request.instanceOwnerPartyId}/${request.instanceGuid}?hard=${hard}`;

    const response = await recorder.run(hard ? "Delete instance (hard)" : "Delete instance (soft)", "DELETE", url, () =>
        altinnFetch({ url, method: "DELETE", token })
    );

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not delete the instance.",
        instanceOwnerPartyId: request.instanceOwnerPartyId,
        instanceGuid: request.instanceGuid,
        hard
    };
}

/**
 * PUT {app}/instances/{party}/{guid}/process/next
 *
 * Submits the current task and moves to the next one. The app validates before it moves, so this
 * failing on validation is an answer rather than a problem with the request.
 *
 * The body names the action for the task type the caller is looking at, `{"action":"sign"}` on a
 * signing task. The task type comes from the process this tool has already read, so no extra
 * request is needed to learn it.
 */
export async function advanceProcess(token: string, request: ReadRequest & { taskType?: string | null }): Promise<AdvanceProcessResult> {
    const recorder = new StepRecorder();
    const url = `${appBaseUrl(request.org, request.app)}/instances/${request.instanceOwnerPartyId}/${request.instanceGuid}/process/next`;
    const body = advanceBody(request.taskType);

    const response = await recorder.run(
        "Advance process to next task",
        "PUT",
        url,
        () => altinnFetch({ url, method: "PUT", token, body, contentType: "application/json" }),
        { preview: body, verbatim: true }
    );

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not advance the process.",
        instanceOwnerPartyId: request.instanceOwnerPartyId,
        instanceGuid: request.instanceGuid,
        process: response.ok ? toProcess(response.body) : null
    };
}

/** GET {app}/instances/{party}/{guid}/data/{dataGuid} */
export async function readDataElement(token: string, request: ReadRequest & { dataGuid: string }): Promise<ReadDataElementResult> {
    const recorder = new StepRecorder();
    const url = `${appBaseUrl(request.org, request.app)}/instances/${request.instanceOwnerPartyId}/${request.instanceGuid}/data/${request.dataGuid}`;

    // Accept anything, and expect two different answers.
    //
    // A data type with `appLogic` is served through the app's model: Altinn reads the stored XML,
    // deserialises it into the model class and returns that object, which comes back as JSON. A
    // data type without appLogic is streamed as stored, so XML arrives as XML. Asking for
    // `application/xml` was tried and changes nothing, because the app registers no XML output
    // formatter, so the only effect would have been a misleading header.
    //
    // Asking for JSON, on the other hand, would stop the streamed ones coming back as stored.
    // Read the bytes rather than text, because an attachment is not text.
    const response = await recorder.run("Get data element", "GET", url, () => altinnFetch({ url, token, accept: "*/*", binaryResponse: true }));

    const textual = isTextual(response.contentType);
    const bytes = response.bytes;

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not read the data element.",
        dataGuid: request.dataGuid,
        contentType: response.contentType,
        encoding: textual ? "utf8" : "base64",
        content: response.ok && bytes ? bytes.toString(textual ? "utf8" : "base64") : null
    };
}

/**
 * GET {app}/instances/{party}/{guid}/pdf/preview
 *
 * The app renders the pdf it would archive, which is the quickest way to see what the
 * form data turns into without walking the process to the end. Named a task, it renders that task
 * instead: the main form alone for a `pdf` task, one subform for a `subformPdf` task and the data
 * element it is given. Only what was asked for goes in the query, so a plain preview is the same
 * request it always was.
 */
export async function previewPdf(token: string, request: PdfPreviewRequest): Promise<PdfPreviewResult> {
    const recorder = new StepRecorder();
    const query = new URLSearchParams();
    if (request.taskId) query.set("taskId", request.taskId);
    if (request.dataElementId) query.set("dataElementId", request.dataElementId);
    if (request.language) query.set("language", request.language);
    const search = query.size > 0 ? `?${query}` : "";
    const url = `${appBaseUrl(request.org, request.app)}/instances/${request.instanceOwnerPartyId}/${request.instanceGuid}/pdf/preview${search}`;

    const response = await recorder.run("Preview pdf", "GET", url, () =>
        altinnFetch({ url, token, accept: "application/pdf", binaryResponse: true })
    );

    const bytes = response.ok ? response.bytes : null;
    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not render the pdf preview.",
        contentType: response.contentType,
        content: bytes ? bytes.toString("base64") : null,
        size: bytes?.byteLength ?? 0
    };
}

/** The `processTasks` of an app's process state, as element id and task type. */
function processTasksOf(body: unknown): { taskId: string; taskType: string | null }[] {
    const raw = body && typeof body === "object" ? (body as Record<string, unknown>)["processTasks"] : undefined;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        if (typeof record["elementId"] !== "string") return [];
        return [{ taskId: record["elementId"], taskType: typeof record["altinnTaskType"] === "string" ? record["altinnTaskType"] : null }];
    });
}

/**
 * A body as JSON whatever it was labelled. The app serves its layout sets and layouts as the files'
 * text, and not as `application/json`, so `altinnFetch` hands them over unparsed. A text that is not
 * JSON stays as it was, and reads as having nothing in it.
 */
function asJson(body: unknown): unknown {
    if (typeof body !== "string") return body;
    try {
        return JSON.parse(body);
    } catch {
        return body;
    }
}

interface LayoutSet {
    id: string;
    dataType: string | null;
    tasks: string[];
    type: string | null;
}

function layoutSetsOf(body: unknown): LayoutSet[] {
    const sets = body && typeof body === "object" ? (body as Record<string, unknown>)["sets"] : undefined;
    if (!Array.isArray(sets)) return [];
    return sets.flatMap((set) => {
        if (!set || typeof set !== "object") return [];
        const record = set as Record<string, unknown>;
        if (typeof record["id"] !== "string") return [];
        return [
            {
                id: record["id"],
                dataType: typeof record["dataType"] === "string" ? record["dataType"] : null,
                tasks: Array.isArray(record["tasks"]) ? record["tasks"].filter((task): task is string => typeof task === "string") : [],
                type: typeof record["type"] === "string" ? record["type"] : null
            }
        ];
    });
}

/**
 * The layout set a `Subform` component points at, found anywhere in a set's layouts.
 *
 * Searched for rather than read from a known path, because the app answers with its layout files as
 * they are, keyed by page, and nothing here needs to depend on how they nest.
 */
function subformLayoutSetIn(value: unknown): string | null {
    if (Array.isArray(value)) {
        for (const entry of value) {
            const found = subformLayoutSetIn(entry);
            if (found) return found;
        }
        return null;
    }
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record["type"] === "Subform" && typeof record["layoutSet"] === "string") return record["layoutSet"];
    for (const child of Object.values(record)) {
        const found = subformLayoutSetIn(child);
        if (found) return found;
    }
    return null;
}

/**
 * GET {app}/instances/{party}/{guid}/process, then GET {app}/api/layoutsets, then
 * GET {app}/api/layouts/{set} for each subform pdf task
 *
 * What the pdf preview can be pointed at besides the instance as a whole. The process state lists
 * every task with its type, which is where the `pdf` and `subformPdf` service tasks are found. It
 * does not say which subform a `subformPdf` task renders, and the task's own layout set does not
 * reliably say either: et-v4 has one on its main form's data type. What does say is the hidden
 * `Subform` component Altinn 8 requires in that task's layout, whose `layoutSet` names the subform's
 * own set, and that set's data type is the answer.
 *
 * Where those layouts cannot be read, the task's set is believed only when its data type is one a
 * subform set has. A task that cannot be placed is returned with its data type unknown, and gets no
 * buttons: a button that sends the wrong data element to a task is one the app refuses.
 *
 * Only asked for when there is a subform task to place, and a failure past the process read leaves
 * the tasks unplaced rather than failing the read, since the tasks themselves still stand.
 */
export async function readPdfTargets(token: string, request: ReadRequest): Promise<PdfTargetsResult> {
    const recorder = new StepRecorder();
    const base = appBaseUrl(request.org, request.app);
    const processUrl = `${base}/instances/${request.instanceOwnerPartyId}/${request.instanceGuid}/process`;

    const process = await recorder.run("Get process tasks", "GET", processUrl, () => altinnFetch({ url: processUrl, token }));
    const tasks = process.ok ? processTasksOf(process.body) : [];
    const subformTaskIds = tasks.filter((task) => task.taskType === "subformPdf").map((task) => task.taskId);

    const placed = new Map<string, string>();
    if (subformTaskIds.length > 0) {
        const layoutSetsUrl = `${base}/api/layoutsets`;
        const layoutSets = await recorder.run("Get layout sets", "GET", layoutSetsUrl, () => altinnFetch({ url: layoutSetsUrl, token }));
        const sets = layoutSets.ok ? layoutSetsOf(asJson(layoutSets.body)) : [];
        const subformDataTypes = new Set(sets.flatMap((set) => (set.type === "subform" && set.dataType ? [set.dataType] : [])));

        for (const taskId of subformTaskIds) {
            const set = sets.find((candidate) => candidate.tasks.includes(taskId));
            if (!set) continue;

            const layoutsUrl = `${base}/api/layouts/${encodeURIComponent(set.id)}`;
            const layouts = await recorder.run(`Get layouts for ${taskId}`, "GET", layoutsUrl, () => altinnFetch({ url: layoutsUrl, token }));
            const subformSet = layouts.ok ? subformLayoutSetIn(asJson(layouts.body)) : null;
            const viaComponent = subformSet ? sets.find((candidate) => candidate.id === subformSet)?.dataType : null;
            const viaSet = set.dataType && subformDataTypes.has(set.dataType) ? set.dataType : null;
            const dataType = viaComponent ?? viaSet;
            if (dataType) placed.set(taskId, dataType);
        }
    }

    return {
        ok: process.ok,
        steps: recorder.steps,
        failedAt: process.ok ? null : "Could not read the process tasks.",
        pdfTasks: tasks.filter((task) => task.taskType === "pdf").map((task) => task.taskId),
        subformPdfTasks: subformTaskIds.map((taskId) => ({ taskId, dataType: placed.get(taskId) ?? null }))
    };
}

function toIssue(value: unknown): ValidationIssue | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const asString = (key: string): string | null => (typeof record[key] === "string" ? (record[key] as string) : null);
    return {
        severity: typeof record["severity"] === "number" ? record["severity"] : 0,
        code: asString("code"),
        description: asString("description"),
        field: asString("field"),
        dataElementId: asString("dataElementId"),
        source: asString("source")
    };
}

/** Altinn answers with an array of issues, empty when everything passes. */
function summariseIssues(body: unknown): { issues: ValidationIssue[]; counts: ValidationCounts } {
    const issues = Array.isArray(body) ? body.map(toIssue).filter((issue): issue is ValidationIssue => issue !== null) : [];
    return {
        issues,
        counts: {
            errors: issues.filter((issue) => issue.severity === 1).length,
            warnings: issues.filter((issue) => issue.severity === 2).length,
            other: issues.filter((issue) => issue.severity !== 1 && issue.severity !== 2).length
        }
    };
}

/** GET {app}/instances/{party}/{guid}/validate */
export async function validateInstance(token: string, request: ReadRequest): Promise<ValidateResult> {
    const recorder = new StepRecorder();
    const url = `${appBaseUrl(request.org, request.app)}/instances/${request.instanceOwnerPartyId}/${request.instanceGuid}/validate`;

    const response = await recorder.run("Validate instance", "GET", url, () => altinnFetch({ url, token }));

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not validate the instance.",
        instanceGuid: request.instanceGuid,
        dataGuid: null,
        ...summariseIssues(response.ok ? response.body : null)
    };
}

/** GET {app}/instances/{party}/{guid}/data/{dataGuid}/validate */
export async function validateDataElement(token: string, request: ReadRequest & { dataGuid: string }): Promise<ValidateResult> {
    const recorder = new StepRecorder();
    const url = `${appBaseUrl(request.org, request.app)}/instances/${
        request.instanceOwnerPartyId
    }/${request.instanceGuid}/data/${request.dataGuid}/validate`;

    const response = await recorder.run("Validate data element", "GET", url, () => altinnFetch({ url, token }));

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not validate the data element.",
        instanceGuid: request.instanceGuid,
        dataGuid: request.dataGuid,
        ...summariseIssues(response.ok ? response.body : null)
    };
}
