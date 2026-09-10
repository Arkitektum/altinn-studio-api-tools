import { useState } from "react";
import { payloadNamed } from "../lib/savedPayloads";
import { Modal } from "./Modal";
import type { SavedPayload } from "../types";

interface SavedPayloadsProps {
    payloads: SavedPayload[];
    /** The target, so a payload written for another app can say which. */
    org: string;
    app: string;
    /** Whether loading would throw away content that is in the list now. */
    overwrites: boolean;
    /** Nothing to save from an empty list. */
    canSave: boolean;
    onSave: (name: string) => void;
    onLoad: (payload: SavedPayload) => void;
    onDelete: (id: string) => void;
}

/**
 * Open and Save, in the payload panel's header, each opening a window over the tool.
 *
 * Two buttons rather than a section of the panel, because this is not part of a payload: it is
 * what you do before writing one and after finishing it. Windows rather than a fold, because
 * opening one replaces everything in the panel behind it, and a list you are about to do that
 * with deserves the foreground while you pick from it.
 */
export function SavedPayloads({ payloads, org, app, overwrites, canSave, onSave, onLoad, onDelete }: SavedPayloadsProps) {
    const [dialog, setDialog] = useState<"open" | "save" | null>(null);
    const [name, setName] = useState("");
    /** Which row is armed, and for what. One at a time, the way the instance rows arm. */
    const [confirming, setConfirming] = useState<{ id: string; action: "load" | "delete" } | null>(null);

    const replacing = payloadNamed(payloads, name);

    function close() {
        setDialog(null);
        setConfirming(null);
    }

    return (
        <>
            <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setDialog("open")}
                disabled={payloads.length === 0}
                title={payloads.length === 0 ? "Nothing saved yet" : "Load a payload saved earlier"}
            >
                Open{payloads.length > 0 ? ` (${payloads.length})` : ""}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setDialog("save")} disabled={!canSave}>
                Save
            </button>

            {dialog === "open" && (
                <Modal title="Open a saved payload" className="modal--form" onClose={close} bodyClassName="modal__form">
                    <p className="field__hint">
                        Loading one replaces every element in the panel behind this window. An element saved as a reference to an example is read from
                        that file as it stands now, so a payload saved before the file was corrected loads the corrected one.
                    </p>

                    <div className="picklist">
                        {payloads.map((payload) => {
                            const armed = confirming?.id === payload.id;
                            const elsewhere = payload.org !== org || payload.app !== app;
                            return (
                                <div key={payload.id} style={{ display: "flex", gap: 6 }}>
                                    <button
                                        type="button"
                                        className="picklist__item"
                                        style={{ flex: 1 }}
                                        onClick={() => {
                                            // Loading throws away whatever is in the list, so it asks
                                            // first, and only when there is something to lose.
                                            if (overwrites && !(armed && confirming?.action === "load")) {
                                                setConfirming({ id: payload.id, action: "load" });
                                                return;
                                            }
                                            onLoad(payload);
                                            close();
                                        }}
                                        title={`${payload.elements.length} element(s), saved for ${payload.org}/${payload.app}`}
                                    >
                                        <span className="led led--ok" aria-hidden="true" />
                                        <span>
                                            {armed && confirming?.action === "load" ? `Replace the payload with "${payload.name}"?` : payload.name}
                                            {" · "}
                                            {payload.elements.length} element(s)
                                            {elsewhere ? ` · for ${payload.org}/${payload.app}` : ""}
                                            {" · "}
                                            {new Date(payload.savedAt).toLocaleString("nb")}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn btn--delete${armed && confirming?.action === "delete" ? " btn--armed" : ""}`}
                                        onClick={() => {
                                            if (!(armed && confirming?.action === "delete")) {
                                                setConfirming({ id: payload.id, action: "delete" });
                                                return;
                                            }
                                            setConfirming(null);
                                            onDelete(payload.id);
                                        }}
                                        aria-label={`Delete saved payload ${payload.name}`}
                                    >
                                        {armed && confirming?.action === "delete" ? "Confirm" : "Delete"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </Modal>
            )}

            {dialog === "save" && (
                <Modal title="Save this payload" className="modal--form" onClose={close} bodyClassName="modal__form">
                    <p className="field__hint">
                        The whole list of elements, under a name, for later. An element still holding an unedited example is kept as a reference to
                        that file, so a payload saved today loads the corrected file tomorrow. An element you have edited, typed or picked off disk
                        has no file to point at, so its text is kept instead.
                    </p>

                    <form
                        className="row"
                        onSubmit={(event) => {
                            event.preventDefault();
                            onSave(name);
                            setName("");
                            close();
                        }}
                    >
                        <input
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Name it"
                            aria-label="Name for the saved payload"
                            // The window opened to be typed in, so it is.
                            autoFocus
                            style={{ flex: 1 }}
                        />
                        <button
                            type="submit"
                            className={`btn ${replacing ? "btn--armed btn--delete" : "btn--primary"}`}
                            disabled={!name.trim()}
                            // Saving over a name is the one destructive thing here, and it says so
                            // rather than asking: what it replaces is one click from being saved
                            // again under another name.
                            title={replacing ? `Replaces the payload saved as "${replacing.name}"` : undefined}
                        >
                            {replacing ? "Replace" : "Save"}
                        </button>
                    </form>

                    <p className="field__hint">
                        {payloads.length === 0
                            ? "Nothing saved yet. They are kept in this browser, so they survive a reload and go no further."
                            : `${payloads.length} saved already, in this browser only. Reusing one of their names replaces it.`}
                    </p>
                </Modal>
            )}
        </>
    );
}
