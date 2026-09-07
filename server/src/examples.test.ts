import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listExamples, readExample } from './examples.js';
import { HttpError } from './httpError.js';

describe('example data catalogue', () => {
  it('groups the shipped xml files by data type', async () => {
    const groups = await listExamples();

    const et = groups.find((group) => group.key === 'ET');
    assert.ok(et, 'expected an ET group');
    assert.equal(et.kind, 'form');
    assert.equal(et.files[0]?.contentType, 'application/xml');
    assert.equal(et.files[0]?.encoding, 'utf8');
    assert.ok(et.files.length >= 4, `expected several ET examples, got ${et.files.length}`);

    // The numeric ordering prefix is stripped for display but kept for sorting and lookup.
    const first = et.files[0];
    assert.equal(first?.name, '01_Maksimumsversjon.xml');
    assert.equal(first?.label, 'Maksimumsversjon');
    assert.ok((first?.sizeBytes ?? 0) > 0);

    const subform = groups.find((group) => group.key === 'GjennomfoeringsplanDataV7');
    assert.ok(subform, 'expected the subform group');
    assert.equal(subform.kind, 'subform');
  });

  it('handles data types whose file names contain spaces and Norwegian characters', async () => {
    const groups = await listExamples();
    const mb = groups.find((group) => group.key === 'MB');
    assert.ok(mb);
    const withSpaces = mb.files.find((file) => file.name.includes(' '));
    assert.ok(withSpaces, 'expected at least one MB example with spaces in the name');

    const loaded = await readExample('form', 'MB', withSpaces.name);
    assert.ok(loaded.content.length > 0);
  });

  it('reads an example verbatim, preserving the xml declaration', async () => {
    const loaded = await readExample('form', 'ET', '02_Minimumsversjon.xml');
    assert.match(loaded.content, /^<\?xml version="1\.0"/);
    assert.match(loaded.content, /<ettrinn[\s>]/);
    // sizeBytes is UTF-8 on disk, and the string is shorter because of æøå.
    assert.equal(Buffer.byteLength(loaded.content, 'utf8'), loaded.sizeBytes);
    assert.ok(loaded.content.length < loaded.sizeBytes, 'expected multi-byte characters');
  });

  it('404s for a file that does not exist', async () => {
    await assert.rejects(
      () => readExample('form', 'ET', 'nope.xml'),
      (error: unknown) => error instanceof HttpError && error.status === 404,
    );
  });

  it('refuses path traversal out of the example root', async () => {
    for (const [dataType, name] of [
      ['..', '../../package.json'],
      ['ET/../../..', 'passwd.xml'],
      ['../subforms', 'x.xml'],
    ] as [string, string][]) {
      await assert.rejects(
        () => readExample('form', dataType, name),
        (error: unknown) => error instanceof HttpError && error.status === 400,
        `expected ${dataType}/${name} to be rejected`,
      );
    }
  });

  it('refuses non-xml files', async () => {
    await assert.rejects(
      () => readExample('form', 'ET', 'secrets.env'),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
  });
});

describe('attachment examples', () => {
  it('groups the dummy attachments by the content type their extension implies', async () => {
    const groups = await listExamples();
    const attachments = groups.filter((group) => group.kind === 'attachment');

    const byKey = new Map(attachments.map((group) => [group.key, group]));
    for (const contentType of [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'text/plain',
      'text/csv',
      'application/json',
      'application/xml',
      'image/svg+xml',
    ]) {
      assert.ok(byKey.has(contentType), `expected a dummy for ${contentType}`);
    }
  });

  it('reads a binary attachment as base64 that decodes to the file on disk', async () => {
    const loaded = await readExample('attachment', '', 'dummy.png');

    assert.equal(loaded.encoding, 'base64');
    assert.equal(loaded.contentType, 'image/png');
    const bytes = Buffer.from(loaded.content, 'base64');
    assert.equal(bytes.length, loaded.sizeBytes);
    // PNG signature, so what we hand over really is a PNG.
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('reads the pdf dummy as base64 with a pdf header', async () => {
    const loaded = await readExample('attachment', '', 'dummy.pdf');
    assert.equal(loaded.encoding, 'base64');
    assert.equal(loaded.contentType, 'application/pdf');
    const bytes = Buffer.from(loaded.content, 'base64');
    assert.ok(bytes.subarray(0, 8).toString('latin1').startsWith('%PDF-'));
    assert.ok(bytes.toString('latin1').trimEnd().endsWith('%%EOF'));
  });

  it('reads a text attachment as utf8', async () => {
    const loaded = await readExample('attachment', '', 'dummy.txt');
    assert.equal(loaded.encoding, 'utf8');
    assert.equal(loaded.contentType, 'text/plain');
    assert.match(loaded.content, /Dummy vedlegg/);
  });

  it('does not use the group as a path for attachments', async () => {
    const viaEmpty = await readExample('attachment', '', 'dummy.txt');
    const viaGarbage = await readExample('attachment', 'whatever', 'dummy.txt');
    assert.equal(viaEmpty.content, viaGarbage.content);
    // An unsupported content type falls back to the file's canonical one.
    assert.equal(viaGarbage.contentType, 'text/plain');
  });

  it('posts a file as the aliased content type the app asked for', async () => {
    const canonical = await readExample('attachment', 'application/xml', 'dummy.xml');
    const alias = await readExample('attachment', 'text/xml', 'dummy.xml');

    assert.equal(canonical.contentType, 'application/xml');
    assert.equal(alias.contentType, 'text/xml');
    // Same bytes either way, only the declared content type differs.
    assert.equal(canonical.content, alias.content);
  });

  it('offers one group per content type alias', async () => {
    const groups = await listExamples();
    const keys = groups.filter((group) => group.kind === 'attachment').map((group) => group.key);

    for (const alias of ['application/xml', 'text/xml', 'application/zip', 'application/x-zip-compressed']) {
      assert.ok(keys.includes(alias), `expected a group for ${alias}`);
    }
    // The same dummy backs both spellings.
    const byKey = new Map(groups.map((group) => [group.key, group]));
    assert.equal(byKey.get('application/xml')?.files[0]?.name, 'dummy.xml');
    assert.equal(byKey.get('text/xml')?.files[0]?.name, 'dummy.xml');
  });

  it('covers every format it ships a dummy for', async () => {
    const groups = await listExamples();
    const keys = new Set(
      groups.filter((group) => group.kind === 'attachment').map((group) => group.key),
    );

    for (const contentType of [
      'application/pdf',
      'application/rtf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/zip',
      'application/octet-stream',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/bmp',
      'image/webp',
      'image/tiff',
      'image/svg+xml',
      'text/plain',
      'text/csv',
      'text/html',
      'text/markdown',
      'application/json',
      'application/xml',
      'application/gml+xml',
      'application/geo+json',
    ]) {
      assert.ok(keys.has(contentType), `expected a dummy for ${contentType}`);
    }
  });

  it('hands over office packages as real zip archives', async () => {
    for (const [name, marker] of [
      ['dummy.docx', 'word/document.xml'],
      ['dummy.xlsx', 'xl/workbook.xml'],
      ['dummy.odt', 'content.xml'],
    ] as [string, string][]) {
      const loaded = await readExample('attachment', '', name);
      const bytes = Buffer.from(loaded.content, 'base64');
      // Local file header of a zip, then the part name should appear in the listing.
      assert.deepEqual([...bytes.subarray(0, 2)], [0x50, 0x4b], `${name} is not a zip`);
      assert.ok(bytes.toString('latin1').includes(marker), `${name} is missing ${marker}`);
    }
  });

  it('still refuses to escape the example root', async () => {
    // The group is ignored for attachments, so the file name is the only way in.
    for (const name of [
      '../forms/ET/01_Maksimumsversjon.xml',
      '../../package.json',
      '/etc/hosts.txt',
    ]) {
      await assert.rejects(
        () => readExample('attachment', '', name),
        (error: unknown) => error instanceof HttpError && error.status === 400,
        `expected ${name} to be rejected`,
      );
    }
  });

  it('refuses an extension it has no format for', async () => {
    await assert.rejects(
      () => readExample('attachment', '', 'dummy.exe'),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
  });
});

describe('geodata attachments', () => {
  it('keeps the byte order mark on the gml, since it is part of the file', async () => {
    const loaded = await readExample('attachment', 'application/gml+xml', 'dummy.gml');

    assert.equal(loaded.encoding, 'utf8');
    assert.equal(loaded.contentType, 'application/gml+xml');
    assert.equal(loaded.content.charCodeAt(0), 0xfeff, 'expected a leading BOM');
    assert.match(loaded.content, /<gml:FeatureCollection/);
    // sizeBytes is the UTF-8 length on disk, which exceeds the character count.
    assert.equal(Buffer.byteLength(loaded.content, 'utf8'), loaded.sizeBytes);
    assert.ok(loaded.content.length < loaded.sizeBytes, 'expected multi-byte characters');
  });

  it('serves the geojson under both the current and the older content type', async () => {
    const current = await readExample('attachment', 'application/geo+json', 'dummy.geojson');
    const older = await readExample('attachment', 'application/vnd.geo+json', 'dummy.geojson');

    assert.equal(current.contentType, 'application/geo+json');
    assert.equal(older.contentType, 'application/vnd.geo+json');
    assert.equal(current.content, older.content);

    const parsed: unknown = JSON.parse(current.content);
    assert.equal((parsed as { type: string }).type, 'FeatureCollection');
  });

  it('does not offer the geodata files as plain xml or json', async () => {
    const groups = await listExamples();
    const byKey = new Map(groups.filter((group) => group.kind === 'attachment').map((g) => [g.key, g]));

    // A 949 kB GML would otherwise become the default for every xml attachment.
    assert.deepEqual(byKey.get('application/xml')?.files.map((f) => f.name), ['dummy.xml']);
    assert.deepEqual(byKey.get('application/json')?.files.map((f) => f.name), ['dummy.json']);
  });
});
