import type { ReactNode } from "react";

/**
 * The icon set, drawn here rather than taken off the shelf.
 *
 * An icon set would be a fourth runtime dependency next to react, react-dom and react-query, for
 * two dozen shapes, and it would bring a house style that is not this one. These are the shapes
 * the tool actually uses and nothing else.
 *
 * The rule they follow is the rail's, from `Chain.tsx`: a glyph belongs where it carries something
 * on its own. The outcome marks do, because severity is otherwise colour alone and colour is a
 * channel not everyone has. The rest sit next to a label that still says the word, so they are a
 * second way to find a row, never the only way to read it.
 *
 * All on a 16 grid, stroked in `currentColor` at 1.5, sized in `em`. So an icon takes the colour
 * and the size of the text it sits in, and a button that is disabled or a notice that is red needs
 * no rule of its own to bring the icon with it.
 */
export type IconName =
    // Outcome and severity
    | "check"
    | "cross"
    | "warning"
    | "info"
    // Panel identity
    | "user"
    | "target"
    | "layers"
    | "form"
    | "shield"
    | "upload"
    | "download"
    | "file"
    | "flow"
    | "clipboard"
    | "terminal"
    // Actions
    | "refresh"
    | "trash"
    | "bookmark"
    | "copy"
    | "expand"
    | "braces"
    | "key"
    | "eye"
    | "chevron";

const PATHS: Record<IconName, ReactNode> = {
    check: <path d="M3.2 8.4l3.2 3.2L12.8 4.4" />,
    cross: <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />,
    warning: (
        <>
            <path d="M8 2.4l6.1 10.6a.7.7 0 01-.6 1H2.5a.7.7 0 01-.6-1z" />
            <path d="M8 6.6v2.9M8 11.8h.01" />
        </>
    ),
    info: (
        <>
            <circle cx="8" cy="8" r="6.1" />
            <path d="M8 7.4v3.8M8 5.1h.01" />
        </>
    ),

    /* Head and shoulders. The test user, which is the one thing here that is a who. */
    user: (
        <>
            <circle cx="8" cy="5.3" r="2.6" />
            <path d="M2.9 13.8c0-2.9 2.3-4.3 5.1-4.3s5.1 1.4 5.1 4.3" />
        </>
    ),
    /* Crosshair: the app you are pointed at. */
    target: (
        <>
            <circle cx="8" cy="8" r="5.3" />
            <circle cx="8" cy="8" r="1.3" />
            <path d="M8 1.2v1.9M8 12.9v1.9M1.2 8h1.9M12.9 8h1.9" />
        </>
    ),
    /* A stack, for a list of instances. */
    layers: (
        <>
            <path d="M8 1.9l6.1 3.3L8 8.5 1.9 5.2z" />
            <path d="M2.4 8.6L8 11.6l5.6-3M2.4 11.5L8 14.5l5.6-3" />
        </>
    ),
    /* A sheet with lines on it: the payload you are filling in. */
    form: (
        <>
            <rect x="3.1" y="2.1" width="9.8" height="11.8" rx="1.2" />
            <path d="M5.6 5.6h4.8M5.6 8h4.8M5.6 10.4h2.9" />
        </>
    ),
    /* Shield and tick, for the check made before anything is sent. */
    shield: (
        <>
            <path d="M8 1.6l5.1 1.8v4.2c0 3.3-2.2 5.4-5.1 6.7-2.9-1.3-5.1-3.4-5.1-6.7V3.4z" />
            <path d="M5.9 7.8l1.5 1.5 3-3.2" />
        </>
    ),
    /* Out of the machine and into Altinn. */
    upload: (
        <>
            <path d="M8 10.4V2.2M4.9 5.3L8 2.2l3.1 3.1" />
            <path d="M2.3 11.2v1.4a1.2 1.2 0 001.2 1.2h9a1.2 1.2 0 001.2-1.2v-1.4" />
        </>
    ),
    /* And back out of it. */
    download: (
        <>
            <path d="M8 2.2v8.2M4.9 7.3L8 10.4l3.1-3.1" />
            <path d="M2.3 11.2v1.4a1.2 1.2 0 001.2 1.2h9a1.2 1.2 0 001.2-1.2v-1.4" />
        </>
    ),
    /* A document with its corner turned: the rendered pdf. */
    file: (
        <>
            <path d="M9.4 1.7H4.6a1.2 1.2 0 00-1.2 1.2v10.2a1.2 1.2 0 001.2 1.2h6.8a1.2 1.2 0 001.2-1.2V4.7z" />
            <path d="M9.4 1.7v3h3.2" />
        </>
    ),
    /* One step to the next, for where the instance has got to. */
    flow: (
        <>
            <circle cx="3.3" cy="8" r="1.6" />
            <path d="M5.4 8h5.3M8.9 5.9L11 8l-2.1 2.1" />
            <circle cx="13.1" cy="8" r="1.1" />
        </>
    ),
    /* A clipboard with a tick: what the validation had to say. */
    clipboard: (
        <>
            <path d="M6 2.9H4.4a1.2 1.2 0 00-1.2 1.2v9a1.2 1.2 0 001.2 1.2h7.2a1.2 1.2 0 001.2-1.2v-9a1.2 1.2 0 00-1.2-1.2H10" />
            <rect x="6" y="1.5" width="4" height="2.8" rx=".8" />
            <path d="M6.1 9.4l1.4 1.4 2.7-2.9" />
        </>
    ),
    /* A prompt, for the log of every call made. */
    terminal: (
        <>
            <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.2" />
            <path d="M4.6 6.3l1.9 1.9-1.9 1.9M8.6 10.1h3" />
        </>
    ),

    /* Two half arcs and their heads, so it reads as going round rather than as a broken ring. */
    refresh: (
        <>
            <path d="M2.9 8a5.1 5.1 0 018.8-3.5" />
            <path d="M11.9 1.9v2.8H9.1" />
            <path d="M13.1 8a5.1 5.1 0 01-8.8 3.5" />
            <path d="M4.1 14.1v-2.8h2.8" />
        </>
    ),
    trash: (
        <>
            <path d="M2.8 4.3h10.4M6.2 4.3V3a1 1 0 011-1h1.6a1 1 0 011 1v1.3" />
            <path d="M4.3 4.3l.6 9a1 1 0 001 .9h4.2a1 1 0 001-.9l.6-9" />
            <path d="M6.7 6.9v4.6M9.3 6.9v4.6" />
        </>
    ),
    /* A bookmark rather than a floppy: what Save does here is keep one to come back to. */
    bookmark: <path d="M4.3 2.1h7.4a.9.9 0 01.9.9v10.9L8 11.2l-4.6 2.7V3a.9.9 0 01.9-.9z" />,
    copy: (
        <>
            <rect x="5.4" y="5.4" width="8.5" height="8.5" rx="1.2" />
            <path d="M10.6 5.4V3.3a1.2 1.2 0 00-1.2-1.2H3.3a1.2 1.2 0 00-1.2 1.2v6.1a1.2 1.2 0 001.2 1.2h2.1" />
        </>
    ),
    expand: <path d="M6.2 2.4H2.4v3.8M9.8 2.4h3.8v3.8M6.2 13.6H2.4V9.8M9.8 13.6h3.8V9.8" />,
    /* Braces, for the button that puts the json back into shape. */
    braces: (
        <>
            <path d="M6.3 2.2c-1.6 0-2.2.7-2.2 2.1v1.4c0 1-.6 1.8-1.6 1.8v1c1 0 1.6.8 1.6 1.8v1.4c0 1.4.6 2.1 2.2 2.1" />
            <path d="M9.7 2.2c1.6 0 2.2.7 2.2 2.1v1.4c0 1 .6 1.8 1.6 1.8v1c-1 0-1.6.8-1.6 1.8v1.4c0 1.4-.6 2.1-2.2 2.1" />
        </>
    ),
    key: (
        <>
            <circle cx="5.3" cy="5.3" r="3.1" />
            <path d="M7.5 7.5l6 6M11.3 11.3l1.4-1.4" />
        </>
    ),
    eye: (
        <>
            <path d="M1.4 8s2.4-4.4 6.6-4.4S14.6 8 14.6 8s-2.4 4.4-6.6 4.4S1.4 8 1.4 8z" />
            <circle cx="8" cy="8" r="1.9" />
        </>
    ),
    /* Points down. Turned by `.icon--turn` where it has to point another way. */
    chevron: <path d="M4.6 6.2L8 9.6l3.4-3.4" />
};

interface IconProps {
    name: IconName;
    /**
     * Decorative by default, because every icon here sits beside the word it stands for. Pass a
     * label on the one button that has no room for text, and it becomes the button's name.
     */
    label?: string;
    className?: string;
}

export function Icon({ name, label, className }: IconProps) {
    return (
        <svg
            className={`icon${className ? ` ${className}` : ""}`}
            viewBox="0 0 16 16"
            width="1em"
            height="1em"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
            aria-hidden={label ? undefined : true}
            role={label ? "img" : undefined}
            aria-label={label}
        >
            {PATHS[name]}
        </svg>
    );
}
