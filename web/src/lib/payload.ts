import type { DataElementInput } from "../types";

/**
 * Where a loaded data element goes in the payload list.
 *
 * An element standing empty is reused, so loading into a fresh payload does not leave a blank
 * card next to the loaded one. Otherwise the element is appended and the rest collapse, which is
 * how adding an element behaves too, so the loaded one is the card in front of you.
 */
export function placeLoaded(elements: DataElementInput[], loaded: DataElementInput): DataElementInput[] {
    const empty = elements.findIndex((element) => !element.content.trim() && (element.dataType === loaded.dataType || !element.dataType));
    if (empty >= 0) return elements.map((element, index) => (index === empty ? loaded : element));
    return [...elements.map((element) => ({ ...element, collapsed: true })), loaded];
}
