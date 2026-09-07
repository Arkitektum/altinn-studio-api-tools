import type { AppDataType, ApplicationMetadata } from "../types";

/**
 * Data types the app produces itself rather than something you post, so they only add noise to
 * the picker.
 */
export const HIDDEN_DATA_TYPE_IDS = ["Signatur", "FoedselsnummerTiltakshaver", "Valideringsrapport", "ref-data-as-pdf"];

export type DataTypeKind = "main" | "sub" | "attachment";

export interface DataTypeGroup {
    kind: DataTypeKind;
    label: string;
    dataTypes: AppDataType[];
}

/**
 * Subform ids as declared in applicationmetadata. Entries are normally plain ids, but an object
 * with an id or dataType field is accepted too, so a differently shaped app still groups.
 */
export function readSubFormDataTypes(metadata: ApplicationMetadata | null): string[] {
    const raw = metadata?.subFormDataTypes;
    if (!Array.isArray(raw)) return [];
    return raw
        .map((entry) => {
            if (typeof entry === "string") return entry;
            if (entry && typeof entry === "object") {
                const record = entry as Record<string, unknown>;
                for (const key of ["id", "dataType", "type"]) {
                    if (typeof record[key] === "string") return record[key] as string;
                }
            }
            return null;
        })
        .filter((id): id is string => Boolean(id));
}

/**
 * Splits the app's data types into main form, sub forms and attachments.
 *
 * The app's own `mainFormDataType` and `subFormDataTypes` decide the split. When an app declares
 * neither, form data types are used as a fallback: a single-instance one is the main form and any
 * other is a subform.
 *
 * `keepId` is the data type currently selected on the element. It survives the hidden list, so
 * switching apps never blanks a selection that is already there.
 */
export function groupDataTypes(dataTypes: AppDataType[], metadata: ApplicationMetadata | null, keepId?: string): DataTypeGroup[] {
    const hidden = new Set(HIDDEN_DATA_TYPE_IDS.filter((id) => id !== keepId));
    const visible = dataTypes.filter((dataType) => !hidden.has(dataType.id));

    const mainId = metadata?.mainFormDataType;
    const subIds = new Set(readSubFormDataTypes(metadata));
    const declared = Boolean(mainId) || subIds.size > 0;

    const isMain = (dataType: AppDataType): boolean => (declared ? dataType.id === mainId : Boolean(dataType.appLogic) && dataType.maxCount === 1);
    const isSub = (dataType: AppDataType): boolean => (declared ? subIds.has(dataType.id) : Boolean(dataType.appLogic) && dataType.maxCount !== 1);

    return [
        { kind: "main" as const, label: "Main form", dataTypes: visible.filter(isMain) },
        { kind: "sub" as const, label: "Sub forms", dataTypes: visible.filter((type) => !isMain(type) && isSub(type)) },
        {
            kind: "attachment" as const,
            label: "Attachments",
            dataTypes: visible.filter((type) => !isMain(type) && !isSub(type))
        }
    ].filter((group) => group.dataTypes.length > 0);
}

/** Flattens the groups back into ids, in the order they appear in the picker. */
export function groupedDataTypeIds(groups: DataTypeGroup[]): string[] {
    return groups.flatMap((group) => group.dataTypes.map((dataType) => dataType.id));
}

/** Which group a data type falls in, for styling a single element rather than the whole picker. */
export function dataTypeKindOf(dataTypes: AppDataType[], metadata: ApplicationMetadata | null, dataTypeId: string): DataTypeKind | null {
    if (!dataTypeId) return null;
    const group = groupDataTypes(dataTypes, metadata, dataTypeId).find((entry) => entry.dataTypes.some((dataType) => dataType.id === dataTypeId));
    return group?.kind ?? null;
}
