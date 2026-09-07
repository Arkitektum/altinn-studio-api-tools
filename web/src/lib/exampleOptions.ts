import type { ExampleGroup } from '../types';
import type { ExampleOption } from '../components/ExamplePicker';

/**
 * The examples offered for one data element.
 *
 * Form and subform examples are keyed by data type, so they match on the id. Attachment dummies
 * are keyed by content type instead, because one dummy PDF serves every attachment data type
 * that accepts a PDF. They are offered in the order the data type declares its content types,
 * so the app's own preference decides which one loads automatically.
 */
export function exampleOptionsFor(
  groups: ExampleGroup[],
  dataType: string,
  allowedContentTypes: string[],
): ExampleOption[] {
  if (!dataType) return [];

  const toOptions = (group: ExampleGroup): ExampleOption[] =>
    group.files.map((file) => ({
      kind: group.kind,
      group: group.key,
      name: file.name,
      label: file.label,
      sizeBytes: file.sizeBytes,
      contentType: file.contentType,
    }));

  const byDataType = groups
    .filter((group) => group.kind !== 'attachment' && group.key === dataType)
    .flatMap(toOptions);
  if (byDataType.length > 0) return byDataType;

  return allowedContentTypes.flatMap((contentType) =>
    groups
      .filter((group) => group.kind === 'attachment' && group.key === contentType)
      .flatMap(toOptions),
  );
}
