import type { Dispatch, SetStateAction } from "react";
import { useAppRead } from "../reads";
import { useSession } from "../session";
import { groupDataTypes, groupedDataTypeIds } from "../lib/dataTypeGroups";
import { PayloadElement } from "./PayloadElement";
import { Panel } from "./Panel";
import { SavedPayloads } from "./SavedPayloads";
import { loadingOverwrites } from "../lib/savedPayloads";
import type { DataElementInput, SavedPayload } from "../types";

interface PayloadPanelProps {
    /** Why the panel cannot be used yet, or null when it can. See lib/readiness.ts. */
    notReady: string | null;
    dataElements: DataElementInput[];
    /** Takes an updater as well as a list, since two elements can be filled in at once. */
    onChange: Dispatch<SetStateAction<DataElementInput[]>>;
    /** Data types worth offering before the app has been probed. */
    suggestedDataTypes: string[];
    /** Payloads kept for later, newest first. */
    savedPayloads: SavedPayload[];
    onSavePayload: (name: string) => void;
    onLoadPayload: (payload: SavedPayload) => void;
    onDeletePayload: (id: string) => void;
    /** What a load had to say for itself, an example that has gone missing being the one case. */
    loadNotice: string | null;
}

/**
 * What you are about to send: the data elements, and nothing that acts on them.
 *
 * It used to be all three steps in one panel, the payload then the prevalidation then the post, set
 * apart by legends inside it. Three things you do in order are three steps, and a rail that points
 * at them had two rows going to the same place. They are three panels now, and the legends are gone
 * with the split: a heading does the same work and the rail can name it.
 */
export function PayloadPanel({
    notReady,
    dataElements,
    onChange,
    suggestedDataTypes,
    savedPayloads,
    onSavePayload,
    onLoadPayload,
    onDeletePayload,
    loadNotice
}: PayloadPanelProps) {
    /* The target, so a saved payload written for another app can say which, and what the app
       declares, which is authoritative but only there once it has been read. */
    const { org, app } = useSession();
    const { metadata: appMetadata } = useAppRead();
    const metadata = appMetadata?.metadata ?? null;
    const dataTypes = metadata?.dataTypes ?? [];

    function update(index: number, patch: Partial<DataElementInput>) {
        onChange((current) => current.map((element, i) => (i === index ? { ...element, ...patch } : element)));
    }

    function setAllCollapsed(collapsed: boolean) {
        onChange((current) => current.map((element) => ({ ...element, collapsed })));
    }

    function add() {
        // Offer a data type that is not already in the list, so adding is one click. Follows the
        // picker order, which keeps it off the app-produced types.
        const used = new Set(dataElements.map((element) => element.dataType));
        const candidates = dataTypes.length > 0 ? groupedDataTypeIds(groupDataTypes(dataTypes, metadata)) : suggestedDataTypes;
        const next = candidates.find((id) => !used.has(id));
        // Collapse what is already there, so the list stays short and the new element is the one
        // in front of you.
        onChange((current) => [...current.map((element) => ({ ...element, collapsed: true })), { dataType: next ?? "", content: "" }]);
    }

    function remove(index: number) {
        onChange((current) => current.filter((_, i) => i !== index));
    }

    const allCollapsed = dataElements.length > 0 && dataElements.every((element) => element.collapsed);

    return (
        <Panel
            id="panel-payload"
            notReady={notReady}
            tone="payload"
            title="Payload"
            icon="form"
            aside={
                <span className="row" style={{ gap: 6 }}>
                    {/* The payload as a whole, which is what these two act on. */}
                    <SavedPayloads
                        payloads={savedPayloads}
                        org={org}
                        app={app}
                        overwrites={loadingOverwrites(dataElements)}
                        canSave={dataElements.length > 0}
                        onSave={onSavePayload}
                        onLoad={onLoadPayload}
                        onDelete={onDeletePayload}
                    />
                    {dataElements.length > 1 && (
                        <button type="button" className="btn btn--ghost" onClick={() => setAllCollapsed(!allCollapsed)}>
                            {allCollapsed ? "Expand all" : "Collapse all"}
                        </button>
                    )}
                    <span className="badge">{dataElements.length} element(s)</span>
                </span>
            }
        >
            {/* What the last load had to say, above the list it loaded. */}
            {loadNotice && (
                <div className="notice notice--warn" style={{ marginBottom: 14 }}>
                    {loadNotice}
                </div>
            )}

            {dataElements.map((element, index) => (
                <PayloadElement
                    key={index}
                    index={index}
                    element={element}
                    onPatch={(patch) => update(index, patch)}
                    onRemove={() => remove(index)}
                    canRemove={dataElements.length > 1}
                    suggestedDataTypes={suggestedDataTypes}
                />
            ))}

            {/* Ghost, since it is secondary to posting, but full height: it is an action of its
                own rather than one of the inline ones on an element's bar. */}
            <button type="button" className="btn btn--ghost" onClick={add}>
                + Add data element
            </button>
        </Panel>
    );
}
