import { useState } from 'react';
import { api } from '../api';
import { describeExpiry, isExpired, summariseClaims } from '../lib/format';
import { ErrorNotice } from './Notice';
import { Panel } from './Panel';
import type { LocaltestStatus, PublicToken, ServerConfig } from '../types';

type Mode = 'test-user' | 'raw';

/** The LocalTest users we work with. Add an entry to offer another. */
const TEST_USERS = [
  { label: 'Pengelens Partner', userId: '1001' },
  { label: 'Sophie Salt', userId: '1337' },
];

interface TokenPanelProps {
  serverConfig: ServerConfig | null;
  localtest: LocaltestStatus | null;
  tokens: PublicToken[];
  activeToken: PublicToken | null;
  onActivate: (id: string) => void;
  onTokensChanged: () => void;
  now: number;
}

export function TokenPanel({
  serverConfig,
  localtest,
  tokens,
  activeToken,
  onActivate,
  onTokensChanged,
  now,
}: TokenPanelProps) {
  const [mode, setMode] = useState<Mode>('test-user');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [userId, setUserId] = useState(TEST_USERS[0]?.userId ?? '');
  const [rawToken, setRawToken] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const token =
        mode === 'test-user'
          ? await api.createTestUserToken({
              userId,
              // Names the token after the person, rather than "Test user 1001".
              label: TEST_USERS.find((user) => user.userId === userId)?.label,
            })
          : await api.createRawToken({ token: rawToken.trim() });
      onActivate(token.id);
      onTokensChanged();
      if (mode === 'raw') setRawToken('');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteToken(id);
      onTokensChanged();
    } catch (caught) {
      setError(caught);
    }
  }

  const expired = activeToken ? isExpired(activeToken.expiresAt, now) : false;

  return (
    <Panel title="Test user">
      <div className="tabs" role="tablist">
        {(
          [
            ['test-user', 'LocalTest'],
            ['raw', 'Paste'],
          ] as [Mode, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'test-user' && localtest && !localtest.reachable && (
        <div className="notice notice--warn" style={{ marginBottom: 12 }}>
          LocalTest is not answering at {localtest.url}. Start it, or set ALTINN_LOCALTEST_URL in
          server/.env.
        </div>
      )}

      <form onSubmit={submit}>
        {mode === 'test-user' ? (
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="userId">Test user</label>
            <select
              id="userId"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            >
              {TEST_USERS.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.label} ({user.userId})
                </option>
              ))}
            </select>
            <p className="field__hint">
              GET {serverConfig?.localtestUrl ?? 'http://localhost:5101'}
              /Home/GetTestUserToken/
              <span style={{ color: 'var(--accent)' }}>{userId}</span>
              <br />
              The party id is read from the token claims and prefilled below.
            </p>
          </div>
        ) : (
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="rawToken">Bearer token (JWT)</label>
            <textarea
              id="rawToken"
              className="code"
              style={{ minHeight: 96 }}
              value={rawToken}
              onChange={(event) => setRawToken(event.target.value)}
              placeholder="eyJhbGciOi…"
              spellCheck={false}
              required
            />
            <p className="field__hint">
              Stored in server memory only, never in the browser.
            </p>
          </div>
        )}

        <button type="submit" className="btn btn--primary" style={{ width: '100%' }} disabled={busy}>
          {busy && <span className="btn__spinner" />}
          {mode === 'test-user' ? 'Get token' : 'Store token'}
        </button>
      </form>

      {error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorNotice error={error} />
        </div>
      ) : null}

      {activeToken && (
        <div className="token token--active" style={{ marginTop: 14 }}>
          <div className="token__top">
            <span className={`led ${expired ? 'led--bad' : 'led--ok'}`} />
            <span className="token__label">{activeToken.label}</span>
            <span className="spacer" />
            <span className="badge">{activeToken.kind}</span>
          </div>
          <dl className="claims">
            {summariseClaims(activeToken.claims).map((row) => (
              <div key={row.label} style={{ display: 'contents' }}>
                <dt>{row.label}</dt>
                <dd title={row.value}>{row.value}</dd>
              </div>
            ))}
            <dt>Validity</dt>
            <dd style={{ color: expired ? 'var(--bad)' : undefined }}>
              {describeExpiry(activeToken.expiresAt, now)}
            </dd>
          </dl>
        </div>
      )}

      {tokens.length > 1 && (
        <div style={{ marginTop: 14 }}>
          <span className="legend">Stored tokens</span>
          <div className="token-switch">
            {tokens.map((token) => (
              <div key={token.id} style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="token-switch__item"
                  style={{ flex: 1 }}
                  aria-current={token.id === activeToken?.id}
                  onClick={() => onActivate(token.id)}
                >
                  <span
                    className={`led ${isExpired(token.expiresAt, now) ? 'led--bad' : 'led--ok'}`}
                  />
                  {/* Same user fetched twice gives identical labels, so the time disambiguates. */}
                  <span>
                    {token.label} · {new Date(token.createdAt).toLocaleTimeString('nb')}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--tiny btn--danger"
                  onClick={() => remove(token.id)}
                  aria-label={`Delete token ${token.label}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
