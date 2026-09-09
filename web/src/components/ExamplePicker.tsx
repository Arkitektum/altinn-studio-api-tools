import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { ExampleContent, ExampleGroup } from "../types";

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
 * That is when the first example is loaded automatically, giving every element something valid
 * to post without a second click.
 */
export function ExamplePicker({ dataType, options, hasContent, onLoad }: ExamplePickerProps) {
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
                    name: option.name
                });
                setSelected(name);
                onLoad(file, option);
            } catch (caught) {
                setError(caught instanceof ApiError ? caught.message : String(caught));
            } finally {
                setBusy(false);
            }
        },
        [options, onLoad]
    );

    useEffect(() => {
        // Mount only. Reacting to later content changes would pull the example back in every time
        // the operator cleared or edited the field.
        if (autoLoaded.current || !first || hasContent) return;
        autoLoaded.current = true;
        void load(first.name);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!dataType) {
        return <p className="field__hint">Pick a data type to see its example files.</p>;
    }

    if (options.length === 0) {
        return (
            <p className="field__hint">
                No example data on disk for <strong>{dataType}</strong>.
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
                        {busy ? <span className="btn__spinner" /> : "↻"}
                    </button>
                )}
            </div>
            {error && (
                <div className="notice notice--bad" style={{ marginTop: 7 }}>
                    {error}
                </div>
            )}
            {chosen && !error && chosen.kind === "subform" && <p className="field__hint">subform data</p>}
        </div>
    );
}
