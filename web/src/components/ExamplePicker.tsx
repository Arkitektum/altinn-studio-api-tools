import { useState } from 'react';
import { api, ApiError } from '../api';
import type { ExampleGroup } from '../types';

interface ExamplePickerProps {
  /** Example groups for the data type this element is posting. */
  group: ExampleGroup | undefined;
  dataType: string;
  onLoad: (content: string, fileName: string) => void;
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} kB`;
}

/**
 * Loads a shipped example XML into a data element. This is a separate control rather than an
 * automatic load on data type change, so it never overwrites something you just typed.
 */
export function ExamplePicker({ group, dataType, onLoad }: ExamplePickerProps) {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!dataType) {
    return <p className="field__hint">Pick a data type to see its example files.</p>;
  }

  if (!group || group.files.length === 0) {
    return (
      <p className="field__hint">
        No example data on disk for <strong>{dataType}</strong>.
      </p>
    );
  }

  async function load(name: string) {
    if (!name || !group) return;
    setBusy(true);
    setError(null);
    try {
      const file = await api.getExampleFile({ kind: group.kind, dataType, name });
      onLoad(file.content, file.name);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const chosen = group.files.find((file) => file.name === selected);

  return (
    <div className="example">
      <div className="example__row">
        <select
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
            void load(event.target.value);
          }}
          aria-label={`Example data for ${dataType}`}
          disabled={busy}
        >
          <option value="">
            Load example ({group.files.length} for {dataType})
          </option>
          {group.files.map((file) => (
            <option key={file.name} value={file.name}>
              {file.label} · {formatSize(file.sizeBytes)}
            </option>
          ))}
        </select>
        {selected && (
          <button
            type="button"
            className="btn btn--ghost btn--tiny"
            onClick={() => void load(selected)}
            disabled={busy}
            title="Re-load the file, discarding your edits"
          >
            {busy ? <span className="btn__spinner" /> : '↻'}
          </button>
        )}
      </div>
      {error && (
        <div className="notice notice--bad" style={{ marginTop: 7 }}>
          {error}
        </div>
      )}
      {chosen && !error && group.kind === 'subform' && (
        <p className="field__hint">subform data</p>
      )}
    </div>
  );
}
