/**
 * What advancing a task is, in Altinn's terms and in the operator's.
 *
 * The action mirrors the server's own map, `server/src/processAction.ts`, so the panel can show
 * the body it is about to send. Altinn authorises `PUT process/next` against an action, and the
 * action depends on the task the instance sits in: a data task is written, a signing task signed.
 *
 * The words are here because "advance the process to the next task" describes the request rather
 * than what it does to the form. Advancing a data task is how a form is signed and submitted, and
 * the button may as well say so. Both forms are kept, since a button asks for something and the
 * run log reports what happened.
 */
interface AdvanceWords {
    action: string;
    /** On the button. */
    asking: string;
    /** In the run log, which reports rather than asks. */
    done: string;
    /** What the same step is in the app itself, for anyone who knows the form and not the api. */
    inApp: string;
}

const ADVANCE_BY_TASK_TYPE: Record<string, AdvanceWords> = {
    data: { action: "write", asking: "Sign and submit", done: "Signed and submitted", inApp: "pressing send in the app" },
    confirmation: { action: "confirm", asking: "Confirm", done: "Confirmed", inApp: "confirming in the app" },
    signing: { action: "sign", asking: "Sign", done: "Signed", inApp: "signing in the app" },
    payment: { action: "pay", asking: "Pay", done: "Paid", inApp: "paying in the app" }
};

function wordsFor(taskType: string | null | undefined): AdvanceWords | null {
    if (!taskType) return null;
    return ADVANCE_BY_TASK_TYPE[taskType.trim().toLowerCase()] ?? null;
}

export function actionForTaskType(taskType: string | null | undefined): string | null {
    return wordsFor(taskType)?.action ?? null;
}

/**
 * What the button says. A task type this does not know sends no action, so it promises nothing
 * more than the move itself.
 */
export function advanceLabel(taskType: string | null | undefined): string {
    return wordsFor(taskType)?.asking ?? "Advance to the next task";
}

/** The same in the past tense, for the run log entry, which reports rather than asks. */
export function advancedLabel(taskType: string | null | undefined): string {
    return wordsFor(taskType)?.done ?? "Advanced the process";
}

/**
 * What this is in the app, or null where there is no such thing. A feedback task is advanced by
 * the app rather than by anyone pressing anything, so it gets no such sentence.
 */
export function advanceInApp(taskType: string | null | undefined): string | null {
    return wordsFor(taskType)?.inApp ?? null;
}

/** Body for `PUT process/next`. An unrecognised task type sends `{}` and lets Altinn decide. */
export function advanceBody(taskType: string | null | undefined): string {
    const action = actionForTaskType(taskType);
    return action ? JSON.stringify({ action }) : "{}";
}
