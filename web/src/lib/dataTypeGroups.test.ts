import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupDataTypes, groupedDataTypeIds, readSubFormDataTypes } from './dataTypeGroups';
import type { AppDataType, ApplicationMetadata } from '../types';

const form = (id: string, maxCount = 1): AppDataType => ({
  id,
  maxCount,
  appLogic: { classRef: `Dibk.${id}` },
});
const attachment = (id: string): AppDataType => ({ id, maxCount: 0 });

const ET_TYPES: AppDataType[] = [
  form('ET'),
  form('GjennomfoeringsplanDataV7', 0),
  form('DispensasjonssoeknadDataV1', 0),
  attachment('vedlegg'),
  attachment('Signatur'),
  attachment('FoedselsnummerTiltakshaver'),
  attachment('Valideringsrapport'),
  attachment('ref-data-as-pdf'),
];

const metadata = (overrides: Partial<ApplicationMetadata>): ApplicationMetadata => ({
  id: 'dibk/et-v4',
  org: 'dibk',
  dataTypes: ET_TYPES,
  ...overrides,
});

const DECLARED = metadata({
  mainFormDataType: 'ET',
  subFormDataTypes: ['GjennomfoeringsplanDataV7', 'DispensasjonssoeknadDataV1'],
});

describe('groupDataTypes', () => {
  it('groups by the app declarations and drops the app-produced types', () => {
    const groups = groupDataTypes(ET_TYPES, DECLARED);

    assert.deepEqual(
      groups.map((group) => [group.label, group.dataTypes.map((type) => type.id)]),
      [
        ['Main form', ['ET']],
        ['Sub forms', ['GjennomfoeringsplanDataV7', 'DispensasjonssoeknadDataV1']],
        ['Attachments', ['vedlegg']],
      ],
    );

    // Signatur, FoedselsnummerTiltakshaver, Valideringsrapport and ref-data-as-pdf are gone.
    assert.deepEqual(groupedDataTypeIds(groups), [
      'ET',
      'GjennomfoeringsplanDataV7',
      'DispensasjonssoeknadDataV1',
      'vedlegg',
    ]);
  });

  it('keeps a hidden type that is already selected, so the select does not blank', () => {
    const groups = groupDataTypes(ET_TYPES, DECLARED, 'Valideringsrapport');
    assert.ok(groupedDataTypeIds(groups).includes('Valideringsrapport'));
    assert.ok(!groupedDataTypeIds(groups).includes('Signatur'));
  });

  it('omits a group that would be empty', () => {
    const groups = groupDataTypes([form('ET'), attachment('Signatur')], DECLARED);
    assert.deepEqual(
      groups.map((group) => group.label),
      ['Main form'],
    );
  });

  it('falls back to app logic when the app declares neither field', () => {
    const groups = groupDataTypes(ET_TYPES, metadata({}));
    assert.deepEqual(
      groups.map((group) => [group.label, group.dataTypes.map((type) => type.id)]),
      [
        ['Main form', ['ET']],
        ['Sub forms', ['GjennomfoeringsplanDataV7', 'DispensasjonssoeknadDataV1']],
        ['Attachments', ['vedlegg']],
      ],
    );
  });

  it('groups everything as attachments when there is no metadata at all', () => {
    const groups = groupDataTypes([attachment('vedlegg'), attachment('annet')], null);
    assert.deepEqual(
      groups.map((group) => [group.label, group.dataTypes.map((type) => type.id)]),
      [['Attachments', ['vedlegg', 'annet']]],
    );
  });

  it('does not put a declared subform in attachments even without app logic', () => {
    const groups = groupDataTypes(
      [form('ET'), attachment('Skjemavedlegg')],
      metadata({ mainFormDataType: 'ET', subFormDataTypes: ['Skjemavedlegg'] }),
    );
    assert.deepEqual(
      groups.map((group) => [group.label, group.dataTypes.map((type) => type.id)]),
      [
        ['Main form', ['ET']],
        ['Sub forms', ['Skjemavedlegg']],
      ],
    );
  });
});

describe('readSubFormDataTypes', () => {
  it('reads plain ids', () => {
    assert.deepEqual(readSubFormDataTypes(metadata({ subFormDataTypes: ['a', 'b'] })), ['a', 'b']);
  });

  it('reads objects that carry the id under a few common keys', () => {
    const subFormDataTypes = [{ id: 'a' }, { dataType: 'b' }, { type: 'c' }, { nope: 'd' }, 42];
    assert.deepEqual(readSubFormDataTypes(metadata({ subFormDataTypes })), ['a', 'b', 'c']);
  });

  it('returns nothing when the field is absent or not an array', () => {
    assert.deepEqual(readSubFormDataTypes(metadata({})), []);
    assert.deepEqual(
      readSubFormDataTypes(metadata({ subFormDataTypes: 'ET' as unknown as unknown[] })),
      [],
    );
    assert.deepEqual(readSubFormDataTypes(null), []);
  });
});
