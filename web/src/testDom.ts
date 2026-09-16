import { JSDOM } from "jsdom";
import type { ReactElement } from "react";

/**
 * A browser for the tests that need one.
 *
 * What `App.tsx` holds is wiring rather than decisions: an effect that fires once per selection,
 * state that is dropped together, an answer that arrives after the thing it was about has gone.
 * The decisions under all of it already live in `lib/` with their own tests, and none of what is
 * left can be asked of a function. It has to be rendered.
 *
 * jsdom and nothing else. Rendering is React's own `createRoot` and `act`, and finding something is
 * `document.querySelector`, which is the same trade the hand-written highlighter and xml diff make:
 * a test library would be a large dependency for what fits here.
 *
 * The globals go in as this module is evaluated, so a test file imports it before it imports
 * anything expecting a browser. `react-dom` is loaded inside `render` for the same reason, being
 * one of the things that expects one.
 */

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:5173" });
const win = dom.window as unknown as Record<string, unknown>;

/*
 * Defined rather than assigned: node supplies a few of these itself, and `navigator` in particular
 * is a getter that a plain assignment is refused by.
 */
const globals = [
    "window",
    "document",
    "navigator",
    "location",
    "history",
    "HTMLElement",
    "HTMLDialogElement",
    "Node",
    "Event",
    "CustomEvent",
    "MouseEvent",
    "DOMParser",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "localStorage",
    "sessionStorage"
];
for (const name of globals) {
    Object.defineProperty(globalThis, name, { value: win[name], configurable: true, writable: true });
}

/*
 * jsdom has no blob urls, and the pdf preview makes one for every render it holds. A counter is
 * enough: nothing reads what is behind the url, only that a new one replaced the last.
 */
let blobUrls = 0;
URL.createObjectURL = () => `blob:test/${++blobUrls}`;
URL.revokeObjectURL = () => {};

/*
 * And jsdom has the dialog element but neither of the two methods `Modal` drives it with. What a
 * test looks at is the children, which React puts in the document either way, so these only have to
 * exist and keep `open` and the close event honest: closing is how the pdf preview lets its url go.
 */
const dialog = win.HTMLDialogElement as { prototype: HTMLDialogElement };
dialog.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
};
dialog.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
};

export interface Rendered {
    /** Everything on screen, for a query the helpers below do not cover. */
    readonly container: HTMLElement;
    /** Runs the callback and lets React settle: effects, state and anything already resolved. */
    act(work?: () => void | Promise<void>): Promise<void>;
    /** Waits `ms` of real time, for the debounces in `lib/autoRuns.ts`, and settles after. */
    wait(ms: number): Promise<void>;
    unmount(): Promise<void>;
}

export async function render(element: ReactElement): Promise<Rendered> {
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    // React asks to be told the tests are tests, so `act` does not warn about the updates it wraps.
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

    const settle = async (work?: () => void | Promise<void>) => {
        await act(async () => {
            await work?.();
        });
    };

    await settle(() => {
        root.render(element);
    });

    return {
        container,
        act: settle,
        wait: (ms: number) => settle(() => new Promise((resolve) => setTimeout(resolve, ms))),
        unmount: async () => {
            await settle(() => {
                root.unmount();
            });
            container.remove();
        }
    };
}

/**
 * What a route answers with: the json itself, or a function returning it, which is what lets a
 * route answer differently the second time or hang until a test says so.
 *
 * Spelled out rather than `unknown | fn`, because `unknown` swallows the function member of a
 * union and the answer's arguments would have no types left.
 */
export type Route = ((url: URL, body: unknown) => unknown) | Record<string, unknown> | unknown[] | string | number | boolean | null;

/** Everything the tool asks the api for, keyed the way a test reads: method and path. */
export type Routes = Record<string, Route>;

export interface Stub {
    /** Every request made so far, in order, as `"GET /api/instances"`. */
    readonly calls: string[];
    /** The full url of the nth call, for asserting which instance was asked about. */
    url(index: number): URL;
    restore(): void;
}

/**
 * Answers `/api` the way the server would: a value is the json, a function is called with the url
 * and the parsed body so a route can answer differently the second time or hang on purpose.
 *
 * An unrouted path is a failure rather than an empty answer. A test that quietly gets `{}` from a
 * call it forgot to route is a test that passes for the wrong reason.
 */
export function stubFetch(routes: Routes): Stub {
    const original = globalThis.fetch;
    const calls: string[] = [];
    const urls: URL[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://localhost:5173");
        const method = (init?.method ?? "GET").toUpperCase();
        const key = `${method} ${url.pathname}`;
        calls.push(key);
        urls.push(url);

        if (!(key in routes)) throw new Error(`No route for ${key}. Routed: ${Object.keys(routes).join(", ")}`);

        const route = routes[key];
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        const value = typeof route === "function" ? await (route as (url: URL, body: unknown) => unknown)(url, body) : route;

        return new Response(JSON.stringify(value ?? null), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    return {
        calls,
        url: (index: number) => urls[index] ?? new URL("about:blank"),
        restore: () => {
            globalThis.fetch = original;
        }
    };
}

/**
 * The `value` setter one of jsdom's element classes defines.
 *
 * Wanted rather than a plain assignment because React keeps the last value it wrote on the node
 * itself and drops an event that does not change it. Assigning `element.value` writes over that
 * record, and the event is then indistinguishable from one for a value already seen.
 */
function valueSetter(className: string): ((value: string) => void) | undefined {
    const constructor = win[className] as { prototype: object } | undefined;
    return constructor && Object.getOwnPropertyDescriptor(constructor.prototype, "value")?.set;
}

/** The value of a field, set the way the browser sets it, so React hears about the change. */
export async function type(rendered: Rendered, element: HTMLTextAreaElement | HTMLInputElement, value: string): Promise<void> {
    valueSetter(element.tagName === "TEXTAREA" ? "HTMLTextAreaElement" : "HTMLInputElement")?.call(element, value);
    await rendered.act(() => {
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

/** A select moved to one of its values, which React hears as a change rather than an input. */
export async function choose(rendered: Rendered, element: HTMLSelectElement, value: string): Promise<void> {
    valueSetter("HTMLSelectElement")?.call(element, value);
    await rendered.act(() => {
        element.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

/** A click, the way the browser sends one, so React hears it on the root it listens at. */
export async function click(rendered: Rendered, element: Element | null): Promise<void> {
    assertFound(element, "the element to click");
    await rendered.act(() => {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
}

/** The one element matching, or a failure naming what was looked for rather than `null is not`. */
export function find<T extends Element>(rendered: Rendered, selector: string): T {
    const element = rendered.container.querySelector<T>(selector);
    assertFound(element, selector);
    return element;
}

/** The first element whose text contains `text`, for a button named rather than classed. */
export function findByText<T extends Element>(rendered: Rendered, selector: string, text: string): T {
    const all = [...rendered.container.querySelectorAll<T>(selector)];
    const element = all.find((candidate) => (candidate.textContent ?? "").includes(text)) ?? null;
    assertFound(element, `${selector} saying "${text}"`);
    return element;
}

function assertFound<T>(value: T | null, what: string): asserts value is T {
    if (value === null || value === undefined) throw new Error(`Nothing on screen for ${what}.`);
}
