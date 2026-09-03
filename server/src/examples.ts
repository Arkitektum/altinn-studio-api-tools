import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { HttpError } from './httpError.js';

export type ExampleKind = 'form' | 'subform';

/** Directory name on disk for each kind. */
const KIND_DIRS: Record<ExampleKind, string> = {
  form: 'forms',
  subform: 'subforms',
};

export interface ExampleFile {
  name: string;
  /** Human-friendly label: "01_Maksimumsversjon.xml" → "Maksimumsversjon". */
  label: string;
  sizeBytes: number;
}

export interface ExampleGroup {
  dataType: string;
  kind: ExampleKind;
  files: ExampleFile[];
}

/**
 * Strips the numeric ordering prefix and the extension, so the picker reads as
 * "Maksimumsversjon" rather than "01_Maksimumsversjon.xml". Files without a prefix keep
 * their whole stem.
 */
function toLabel(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+[_-]\s*/, '')
    .trim();
}

function isXml(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.xml');
}

async function readGroups(kind: ExampleKind): Promise<ExampleGroup[]> {
  const root = path.join(config.exampleDataDir, KIND_DIRS[kind]);

  let dataTypeDirs: string[];
  try {
    const entries = await readdir(root, { withFileTypes: true });
    dataTypeDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    // A missing directory just means no examples of this kind are installed.
    return [];
  }

  const groups = await Promise.all(
    dataTypeDirs.map(async (dataType): Promise<ExampleGroup> => {
      const dir = path.join(root, dataType);
      const entries = await readdir(dir, { withFileTypes: true });
      const files = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && isXml(entry.name))
          .map(async (entry): Promise<ExampleFile> => {
            const info = await stat(path.join(dir, entry.name));
            return { name: entry.name, label: toLabel(entry.name), sizeBytes: info.size };
          }),
      );
      files.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
      return { dataType, kind, files };
    }),
  );

  return groups
    .filter((group) => group.files.length > 0)
    .sort((a, b) => a.dataType.localeCompare(b.dataType, 'nb'));
}

export async function listExamples(): Promise<ExampleGroup[]> {
  const [forms, subforms] = await Promise.all([readGroups('form'), readGroups('subform')]);
  return [...forms, ...subforms];
}

/**
 * Resolve an example file, refusing anything that escapes the example root. The data type and
 * file name arrive from the client, so `..` and absolute paths have to be rejected rather than
 * merely discouraged.
 */
export async function readExample(
  kind: ExampleKind,
  dataType: string,
  fileName: string,
): Promise<{ content: string; sizeBytes: number; name: string }> {
  if (!(kind in KIND_DIRS)) {
    throw new HttpError(400, `Unknown example kind "${kind}".`);
  }
  if (!isXml(fileName)) {
    throw new HttpError(400, 'Only .xml example files can be read.');
  }

  const root = path.resolve(config.exampleDataDir, KIND_DIRS[kind]);
  const target = path.resolve(root, dataType, fileName);
  if (target !== path.join(root, dataType, fileName) || !target.startsWith(root + path.sep)) {
    throw new HttpError(400, 'Invalid example path.');
  }

  try {
    const [content, info] = await Promise.all([readFile(target, 'utf8'), stat(target)]);
    return { content, sizeBytes: info.size, name: fileName };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new HttpError(404, `No example "${fileName}" for data type "${dataType}".`);
    }
    throw error;
  }
}
