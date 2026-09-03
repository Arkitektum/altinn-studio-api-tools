import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listExamples, readExample } from './examples.js';
import { HttpError } from './httpError.js';

describe('example data catalogue', () => {
  it('groups the shipped xml files by data type', async () => {
    const groups = await listExamples();

    const et = groups.find((group) => group.dataType === 'ET');
    assert.ok(et, 'expected an ET group');
    assert.equal(et.kind, 'form');
    assert.ok(et.files.length >= 4, `expected several ET examples, got ${et.files.length}`);

    // The numeric ordering prefix is stripped for display but kept for sorting and lookup.
    const first = et.files[0];
    assert.equal(first?.name, '01_Maksimumsversjon.xml');
    assert.equal(first?.label, 'Maksimumsversjon');
    assert.ok((first?.sizeBytes ?? 0) > 0);

    const subform = groups.find((group) => group.dataType === 'GjennomfoeringsplanDataV7');
    assert.ok(subform, 'expected the subform group');
    assert.equal(subform.kind, 'subform');
  });

  it('handles data types whose file names contain spaces and Norwegian characters', async () => {
    const groups = await listExamples();
    const mb = groups.find((group) => group.dataType === 'MB');
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
