/** Offered when the app has not been probed, or when a data type declares nothing. */
export const COMMON_CONTENT_TYPES = [
  'application/xml',
  'application/json',
  'application/pdf',
  'text/plain',
];

/**
 * The content type to select for a data type, mirroring how the server resolves an empty one:
 * prefer a declared JSON or XML type, otherwise take the first declared type. Returns undefined
 * when the app declares nothing, which leaves the choice to the server.
 */
export function preferredContentType(declared: string[]): string | undefined {
  return declared.find((type) => type.includes('json') || type.includes('xml')) ?? declared[0];
}

/**
 * Options for the content type select. A value set before the app was probed stays selectable
 * even if the app does not declare it, so switching to a probed app never silently drops it.
 */
export function contentTypeOptions(declared: string[], current: string | undefined): string[] {
  const base = declared.length > 0 ? declared : COMMON_CONTENT_TYPES;
  return current && !base.includes(current) ? [...base, current] : base;
}
