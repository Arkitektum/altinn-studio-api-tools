import { preferredContentType } from "./contentType";
import type { AppDataType, DataElementInput } from "../types";

/**
 * The payload with what the app has declared filled into it.
 *
 * Two things, both of which only an answer from the app can supply. The form data type, when the
 * payload is still the one empty element it starts as, so posting is one field closer to ready. And
 * a content type on any element that has a data type but no content type, which covers a type
 * chosen from the catalogue before the app was ever read.
 *
 * Only ever fills a gap. An element with a content type already keeps it, whether that came from a
 * file picked off disk or from a previous app, because what is there was put there by something
 * that knew more than this does.
 *
 * The same list comes back when there is nothing to add, which is what lets this run again on every
 * answer without the run counting as a change.
 */
export function withAppDefaults(elements: DataElementInput[], dataTypes: AppDataType[]): DataElementInput[] {
    let next = elements;

    const formType = dataTypes.find((type) => type.appLogic);
    if (formType && next.length === 1 && !next[0]?.dataType) {
        next = [{ dataType: formType.id, content: "" }];
    }

    next = next.map((element) => {
        if (!element.dataType || element.contentType) return element;
        const contentType = preferredContentType(dataTypes.find((type) => type.id === element.dataType)?.allowedContentTypes ?? []);
        return contentType ? { ...element, contentType } : element;
    });

    return next.some((element, index) => element !== elements[index]) ? next : elements;
}
