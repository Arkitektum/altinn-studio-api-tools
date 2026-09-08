import type { RunStep } from "../types";

/** Wraps a value for bash. Single quotes take everything literally except a single quote itself. */
function quote(value: string): string {
    return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Turns a logged step into a curl command, for handing a surprising request to someone else.
 *
 * The authorization header carries the `$TOKEN` placeholder the server logged rather than a real
 * token, so the command is a `TOKEN=…` away from running. A step whose body was logged as a
 * summary rather than verbatim, such as base64 content or an assembled multipart body, says so in
 * a comment instead of pretending the summary is the payload.
 */
export function toCurl(step: RunStep): string {
    // A step that made no request has nothing to replay.
    if (step.url === "-") return "";

    const lines = [`curl -i -X ${step.method} ${quote(step.url)}`];
    for (const [name, value] of Object.entries(step.requestHeaders ?? {})) {
        lines.push(`  -H ${quote(`${name}: ${value}`)}`);
    }
    if (step.requestPreview !== undefined) {
        lines.push(step.requestVerbatim ? `  --data-binary ${quote(step.requestPreview)}` : "  --data-binary @body");
    }

    const command = lines.join(" \\\n");
    return step.requestPreview !== undefined && !step.requestVerbatim
        ? `# The body was logged as a summary, not verbatim. Put the real payload in ./body first.\n${command}`
        : command;
}
