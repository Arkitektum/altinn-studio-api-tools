import { contentTypeOptions, preferredContentType } from '../lib/contentType';
import { groupDataTypes, groupedDataTypeIds } from '../lib/dataTypeGroups';
import { exampleOptionsFor } from '../lib/exampleOptions';
import { ExamplePicker } from './ExamplePicker';
import { Panel } from './Panel';
import type {
  AppDataType,
  ApplicationMetadata,
  DataElementInput,
  ExampleGroup,
} from '../types';

interface PayloadPanelProps {
  dataElements: DataElementInput[];
  onChange: (next: DataElementInput[]) => void;
  /** From applicationmetadata. Authoritative, but only available after probing. */
  dataTypes: AppDataType[];
  /** Drives the main form, sub form and attachment grouping. Null until the app is probed. */
  metadata: ApplicationMetadata | null;
  /** Data types worth offering before the app has been probed. */
  suggestedDataTypes: string[];
  exampleGroups: ExampleGroup[];
  advanceProcess: boolean;
  onAdvanceProcessChange: (next: boolean) => void;
}

function describeDataType(dataType: AppDataType): string {
  const bits: string[] = [];
  if (dataType.appLogic) bits.push('form data');
  if (dataType.taskId) bits.push(dataType.taskId);
  if (dataType.maxCount === 1) bits.push('max 1');
  else if (dataType.maxCount && dataType.maxCount > 1) bits.push(`max ${dataType.maxCount}`);
  else bits.push('unlimited');
  return bits.join(' · ');
}

export function PayloadPanel({
  dataElements,
  onChange,
  dataTypes,
  metadata,
  suggestedDataTypes,
  exampleGroups,
  advanceProcess,
  onAdvanceProcessChange,
}: PayloadPanelProps) {
  function update(index: number, patch: Partial<DataElementInput>) {
    onChange(dataElements.map((element, i) => (i === index ? { ...element, ...patch } : element)));
  }

  /**
   * Content and content type both belong to the data type that was selected, so a change drops
   * them. The example picker remounts on the new data type and loads its first example, so an
   * element with examples ends up populated rather than empty.
   */
  function changeDataType(index: number, dataType: string) {
    if (!dataElements[index]) return;

    const declared = dataTypes.find((type) => type.id === dataType)?.allowedContentTypes ?? [];
    update(index, {
      dataType,
      contentType: preferredContentType(declared),
      content: '',
      encoding: undefined,
      filename: undefined,
      exampleName: undefined,
    });
  }

  function add() {
    // Offer a data type that is not already in the list, so adding is one click. Follows the
    // picker order, which keeps it off the app-produced types.
    const used = new Set(dataElements.map((element) => element.dataType));
    const candidates =
      dataTypes.length > 0
        ? groupedDataTypeIds(groupDataTypes(dataTypes, metadata))
        : suggestedDataTypes;
    const next = candidates.find((id) => !used.has(id));
    onChange([...dataElements, { dataType: next ?? '', content: '' }]);
  }

  function remove(index: number) {
    onChange(dataElements.filter((_, i) => i !== index));
  }

  function formatJson(index: number) {
    const element = dataElements[index];
    if (!element) return;
    try {
      update(index, { content: JSON.stringify(JSON.parse(element.content), null, 2) });
    } catch {
      /* leave invalid JSON alone, since the user may be mid-edit or posting XML */
    }
  }

  return (
    <Panel
      title="Payload"
      aside={<span className="badge">{dataElements.length} element(s)</span>}
    >
      {dataElements.map((element, index) => {
        const known = dataTypes.find((type) => type.id === element.dataType);
        return (
          <div className="element" key={index}>
            <div className="element__bar">
              <span className="element__ord">{index + 1}</span>
              {element.dataType && <span className="badge">{element.dataType}</span>}
              <span className="spacer" />
              {/* Only useful for JSON payloads, since the shipped examples are all XML. */}
              {/^\s*[[{]/.test(element.content) && (
                <button
                  type="button"
                  className="btn btn--ghost btn--tiny"
                  onClick={() => formatJson(index)}
                >
                  Format JSON
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--tiny"
                onClick={() =>
                  update(index, {
                    content: '',
                    encoding: undefined,
                    filename: undefined,
                    exampleName: undefined,
                  })
                }
                disabled={!element.content}
              >
                Clear
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--tiny btn--danger"
                onClick={() => remove(index)}
                disabled={dataElements.length === 1}
              >
                Remove
              </button>
            </div>

            <div className="element__body">
              <div className="element__type">
                <div className="field">
                  <label htmlFor={`dataType-${index}`}>Data type</label>
                  {dataTypes.length > 0 ? (
                    <select
                      id={`dataType-${index}`}
                      value={element.dataType}
                      onChange={(event) => changeDataType(index, event.target.value)}
                    >
                      <option value="">Select data type</option>
                      {groupDataTypes(dataTypes, metadata, element.dataType).map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.dataTypes.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.id} ({describeDataType(type)})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input
                        id={`dataType-${index}`}
                        type="text"
                        list={`dataTypeOptions-${index}`}
                        value={element.dataType}
                        onChange={(event) => update(index, { dataType: event.target.value.trim() })}
                        // Typed input settles on blur. Reacting per keystroke would clear the
                        // content while the name is still half typed.
                        onBlur={(event) => changeDataType(index, event.target.value.trim())}
                        placeholder="ET"
                        autoComplete="off"
                      />
                      {/* Suggestions before probing. The app's metadata wins once available. */}
                      <datalist id={`dataTypeOptions-${index}`}>
                        {suggestedDataTypes.map((id) => (
                          <option key={id} value={id} />
                        ))}
                      </datalist>
                    </>
                  )}
                </div>
                <div className="field">
                  <label htmlFor={`contentType-${index}`}>Content type</label>
                  <select
                    id={`contentType-${index}`}
                    value={element.contentType ?? ''}
                    onChange={(event) =>
                      update(index, { contentType: event.target.value || undefined })
                    }
                  >
                    <option value="">Auto</option>
                    {contentTypeOptions(
                      known?.allowedContentTypes ?? [],
                      element.contentType,
                    ).map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  {!element.contentType && (
                    <p className="field__hint">
                      The server picks from the types the app allows, or detects it from the
                      payload.
                    </p>
                  )}
                </div>
              </div>

              <div className="field">
                <label>Example data</label>
                <ExamplePicker
                  // Remount on a data type change, both to clear the previous type's selection
                  // and to trigger the automatic load of the new type's first example.
                  key={element.dataType}
                  dataType={element.dataType}
                  hasContent={Boolean(element.content)}
                  options={exampleOptionsFor(
                    exampleGroups,
                    element.dataType,
                    known?.allowedContentTypes ?? [],
                  )}
                  onLoad={(file, option) =>
                    update(index, {
                      content: file.content,
                      encoding: file.encoding,
                      // The file knows what it is, so take its content type rather than guessing.
                      contentType: file.contentType,
                      // Altinn stores this as the data element filename for attachments.
                      ...(option.kind === 'attachment' ? { filename: file.name } : {}),
                      exampleName: file.name,
                    })
                  }
                />
              </div>

              <div className="field">
                <label htmlFor={`content-${index}`}>Content</label>
                {element.encoding === 'base64' ? (
                  // Base64 bytes are not worth showing, and editing them as text would corrupt
                  // the file. The picker and Clear are the only ways to change it.
                  <div className="binary">
                    <span className="badge">{element.contentType ?? 'binary'}</span>
                    <span>{element.filename ?? 'binary file'}</span>
                  </div>
                ) : (
                  <textarea
                    id={`content-${index}`}
                    className="code"
                    value={element.content}
                    onChange={(event) =>
                      update(index, { content: event.target.value, exampleName: undefined })
                    }
                    placeholder={'<ettrinn xmlns="…">\n  …\n</ettrinn>'}
                    spellCheck={false}
                  />
                )}
                <p className="field__hint">
                  {element.content ? (
                    <>
                      {element.encoding === 'base64'
                        ? `${Math.ceil((element.content.length * 3) / 4).toLocaleString('nb')} bytes`
                        : `${element.content.length.toLocaleString('nb')} characters`}
                      {element.exampleName ? (
                        <>
                          {' · from '}
                          <span style={{ color: 'var(--accent)' }}>{element.exampleName}</span>
                        </>
                      ) : (
                        ' · edited'
                      )}
                    </>
                  ) : (
                    'Load an example above, or paste XML/JSON.'
                  )}
                </p>
              </div>

              {known && (
                <div className="element__meta">
                  {known.appLogic?.classRef && (
                    <span className="badge" title={known.appLogic.classRef}>
                      {known.appLogic.classRef.split('.').pop()}
                    </span>
                  )}
                  {/* The allowed content types are the options in the select above. */}
                  <span>{describeDataType(known)}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <button type="button" className="btn btn--ghost btn--tiny" onClick={add}>
        + Add data element
      </button>

      <div style={{ marginTop: 18 }}>
        <span className="legend">After upload</span>

        <p className="field__hint" style={{ marginBottom: 10 }}>
          The instance is read back and validated automatically after every post.
        </p>

        <label className="check">
          <input
            type="checkbox"
            checked={advanceProcess}
            onChange={(event) => onAdvanceProcessChange(event.target.checked)}
          />
          <span className="check__body">
            <span className="check__title">Advance process to next task</span>
            <span className="check__note">
              PUT /process/next. Submits the step, and fails if validation does not pass.
            </span>
          </span>
        </label>
      </div>
    </Panel>
  );
}
