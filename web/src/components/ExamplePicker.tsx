import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { useSession } from "../session";
import type { ExampleContent, ExampleGroup } from "../types";
import { Icon } from "./Icon";

/** One selectable example, flattened out of the group it came from. */
export interface ExampleOption {
    kind: ExampleGroup["kind"];
    /** Data type for forms and subforms, content type for attachments. */
    group: string;
    name: string;
    label: string;
    sizeBytes: number;
    contentType: string;
}

interface ExamplePickerProps {
    dataType: string;
    options: ExampleOption[];
    /** Suppresses the automatic load, so restored or hand-written content is never overwritten. */
    hasContent: boolean;
    /**
     * And so does this, for an element out of a saved payload. Empty there means the payload said
     * empty, either deliberately or because the example it pointed at has gone.
     */
    autoLoad: boolean;
    onLoad: (file: ExampleContent, option: ExampleOption) => void;
}

function formatSize(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} kB`;
}

function describe(option: ExampleOption): string {
    // Attachment dummies are all called the same thing, so the content type is what tells them
    // apart. Form examples have meaningful names already.
    const parts = option.kind === "attachment" ? [option.contentType] : [option.label, option.contentType];
    return `${parts.join(" · ")} · ${formatSize(option.sizeBytes)}`;
}

/**
 * Loads a shipped example into a data element.
 *
 * The parent keys this component on the data type, so a mount means the data type just changed.
 * That is when the first example is loaded automatically, or as soon as it arrives if it has not
 * yet, giving every element something valid to post without a second click.
 */
export function ExamplePicker({ dataType, options, hasContent, autoLoad, onLoad }: ExamplePickerProps) {
    // Read rather than passed in: the main form examples belong to an app, and the session is
    // already where every panel reads which app that is.
    const { app, exampleSource } = useSession();
    const [selected, setSelected] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const autoLoaded = useRef(false);

    const first = options[0];

    const load = useCallback(
        async (name: string) => {
            const option = options.find((entry) => entry.name === name);
            if (!option) return;
            setBusy(true);
            setError(null);
            try {
                const file = await api.getExampleFile({
                    kind: option.kind,
                    group: option.group,
                    name: option.name,
                    app
                });
                setSelected(name);
                onLoad(file, option);
            } catch (caught) {
                setError(caught instanceof ApiError ? caught.message : String(caught));
            } finally {
                setBusy(false);
            }
        },
        [options, onLoad, app]
    );

    useEffect(() => {
        // On mount, and again when the first example arrives, since the examples are often still
        // on their way when the data type changes. Never on content changes, which would pull the
        // example back in every time the operator cleared or edited the field, and only ever once.
        if (autoLoaded.current || !first || hasContent || !autoLoad) return;
        autoLoaded.current = true;
        void load(first.name);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [first?.name]);

    if (!dataType) {
        return <p className="field__hint">Pick a data type to see its example files.</p>;
    }

    if (options.length === 0) {
        // The form and subform examples come from the testmotor, so "there are none" and "it could
        // not be read" are different answers and the second one is the one worth reading. Only this
        // data type's own failure is told: an attachment whose content type has no dummy has nothing
        // to do with a subform that could not be downloaded.
        const reason = exampleSource?.errors?.[dataType];
        if (reason) {
            return (
                <div className="notice notice--bad">
                    No example data for <strong>{dataType}</strong>: the testmotor at {exampleSource?.url} could not be read. {reason}
                </div>
            );
        }
        return (
            <p className="field__hint">
                No example data for <strong>{dataType}</strong>.
            </p>
        );
    }

    const chosen = options.find((option) => option.name === selected);

    return (
        <div className="example">
            <div className={`example__row${hasContent ? "" : " example__row--empty"}`}>
                <select
                    value={selected}
                    onChange={(event) => {
                        setSelected(event.target.value);
                        void load(event.target.value);
                    }}
                    aria-label={`Example data for ${dataType}`}
                    disabled={busy}
                >
                    <option value="">
                        Load example ({options.length} for {dataType})
                    </option>
                    {options.map((option) => (
                        <option key={option.name} value={option.name}>
                            {describe(option)}
                        </option>
                    ))}
                </select>
                {selected && (
                    <button
                        type="button"
                        className="btn btn--get"
                        onClick={() => void load(selected)}
                        disabled={busy}
                        title="Re-load the file, discarding your edits"
                    >
                        {busy ? <span className="btn__spinner" /> : <Icon name="refresh" label="Re-load this example" />}
                    </button>
                )}
            </div>
            {error && <div className="notice notice--bad above-s">{error}</div>}
            {chosen && !error && chosen.kind === "subform" && <p className="field__hint">subform data</p>}
        </div>
    );
}
