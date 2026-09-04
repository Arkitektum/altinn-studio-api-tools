import { contentTypeOptions, preferredContentType } from '../lib/contentType';
import { ExamplePicker } from './ExamplePicker';
import { Panel } from './Panel';
import type { AppDataType, DataElementInput, ExampleGroup } from '../types';

interface PayloadPanelProps {
  dataElements: DataElementInput[];
  onChange: (next: DataElementInput[]) => void;
  /** From applicationmetadata. Authoritative, but only available after probing. */
  dataTypes: AppDataType[];
  /** Data types worth offering before the app has been probed. */
  suggestedDataTypes: string[];
  exampleGroups: ExampleGroup[];
  validate: boolean;
  onValidateChange: (next: boolean) => void;
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
  suggestedDataTypes,
  exampleGroups,
  validate,
  onValidateChange,
  advanceProcess,
  onAdvanceProcessChange,
}: PayloadPanelProps) {
  function update(index: number, patch: Partial<DataElementInput>) {
    onChange(dataElements.map((element, i) => (i === index ? { ...element, ...patch } : element)));
  }

  function hasExamples(dataType: string): boolean {
    return exampleGroups.some(
      (group) => group.dataType === dataType && group.files.length > 0,
    );
  }

  /**
   * Content belongs to one data type, so whatever is in the editor goes stale as soon as the
   * type changes. If the new type has example files the picker can replace it, but if it has
   * none there is nothing to replace it with, so drop it rather than leave the wrong payload
   * sitting under the new type.
   *
   * The content type is re-derived from what the new type declares, for the same reason.
   */
  function changeDataType(index: number, dataType: string) {
    const element = dataElements[index];
    if (!element) return;

    const declared = dataTypes.find((type) => type.id === dataType)?.allowedContentTypes ?? [];
    const patch: Partial<DataElementInput> = {
      dataType,
      contentType: preferredContentType(declared),
    };
    if (element.content && !hasExamples(dataType)) {
      patch.content = '';
      patch.exampleName = undefined;
    }
    update(index, patch);
  }

  function add() {
    // Offer a data type that is not already in the list, so adding is one click.
    const used = new Set(dataElements.map((element) => element.dataType));
    const candidates = dataTypes.length > 0 ? dataTypes.map((type) => type.id) : suggestedDataTypes;
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
                onClick={() => update(index, { content: '', exampleName: undefined })}
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
                      {dataTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.id} ({describeDataType(type)})
                        </option>
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
                  // Remount on a data type change so the picker does not keep showing a file
                  // that belonged to the previous type.
                  key={element.dataType}
                  dataType={element.dataType}
                  group={exampleGroups.find((entry) => entry.dataType === element.dataType)}
                  onLoad={(content, fileName) =>
                    update(index, {
                      content,
                      // These examples are all XML, so be explicit rather than relying on detection.
                      contentType: element.contentType ?? 'application/xml',
                      exampleName: fileName,
                    })
                  }
                />
              </div>

              <div className="field">
                <label htmlFor={`content-${index}`}>Content</label>
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
                <p className="field__hint">
                  {element.content ? (
                    <>
                      {element.content.length.toLocaleString('nb')} characters
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

        <label className="check">
          <input
            type="checkbox"
            checked={validate}
            onChange={(event) => onValidateChange(event.target.checked)}
          />
          <span className="check__body">
            <span className="check__title">Validate</span>
            <span className="check__note">
              GET /instances/…/validate and report the issues in the log.
            </span>
          </span>
        </label>

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
