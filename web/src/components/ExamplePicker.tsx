import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { ExampleGroup } from '../types';

interface ExamplePickerProps {
  /** Example group for the data type this element is posting. */
  group: ExampleGroup | undefined;
  dataType: string;
  /** Suppresses the automatic load, so restored or hand-written content is never overwritten. */
  hasContent: boolean;
  onLoad: (content: string, fileName: string) => void;
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} kB`;
}

/**
 * Loads a shipped example XML into a data element.
 *
 * The parent keys this component on the data type, so a mount means the data type just changed.
 * That is when the first example is loaded automatically, giving every element something valid
 * to post without a second click.
 */
export function ExamplePicker({ group, dataType, hasContent, onLoad }: ExamplePickerProps) {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoLoaded = useRef(false);

  const files = group?.files ?? [];
  const first = files[0];

  const load = useCallback(
    async (name: string) => {
      if (!name || !group) return;
      setBusy(true);
      setError(null);
      try {
        const file = await api.getExampleFile({ kind: group.kind, dataType, name });
        setSelected(name);
        onLoad(file.content, file.name);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    },
    [group, dataType, onLoad],
  );

  useEffect(() => {
    // Mount only. Reacting to later content changes would pull the example back in every time
    // the operator cleared or edited the field.
    if (autoLoaded.current || !first || hasContent) return;
    autoLoaded.current = true;
    void load(first.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!dataType) {
    return <p className="field__hint">Pick a data type to see its example files.</p>;
  }

  if (files.length === 0) {
    return (
      <p className="field__hint">
        No example data on disk for <strong>{dataType}</strong>.
      </p>
    );
  }

  const chosen = files.find((file) => file.name === selected);

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
            Load example ({files.length} for {dataType})
          </option>
          {files.map((file) => (
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
      {chosen && !error && group?.kind === 'subform' && (
        <p className="field__hint">subform data</p>
      )}
    </div>
  );
}
