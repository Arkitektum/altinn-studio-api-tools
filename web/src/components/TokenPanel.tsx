import { useEffect, useState } from "react";
import { api } from "../api";
import { describeExpiry, isExpired, summariseClaims } from "../lib/format";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { LocaltestStatus, LocaltestUser, LocaltestUsers, PublicToken, ServerConfig } from "../types";

type Mode = "test-user" | "raw";

/** Offered when LocalTest tells us nothing about its users. The two we work with. */
const FALLBACK_USERS: LocaltestUser[] = [
    { userId: "1001", label: "Pengelens Partner" },
    { userId: "1337", label: "Sophie Salt" }
];

/** The value that stands for "not one of these", revealing the text field. */
const OTHER = "other";

function describeSource(users: LocaltestUsers | null): string {
    if (!users || users.source === "none") return "LocalTest offered no list, so these are the two we work with. Any other id can be typed.";
    return `${users.users.length} test users from LocalTest${users.source === "page" ? ", read off its front page" : ""}.`;
}

interface TokenPanelProps {
    serverConfig: ServerConfig | null;
    localtest: LocaltestStatus | null;
    tokens: PublicToken[];
    activeToken: PublicToken | null;
    onActivate: (id: string) => void;
    onTokensChanged: () => void;
    now: number;
}

export function TokenPanel({ serverConfig, localtest, tokens, activeToken, onActivate, onTokensChanged, now }: TokenPanelProps) {
    const [mode, setMode] = useState<Mode>("test-user");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [available, setAvailable] = useState<LocaltestUsers | null>(null);
    const [picked, setPicked] = useState("");
    /** A user id typed by hand, for a user LocalTest did not offer. */
    const [typedId, setTypedId] = useState("");
    const [rawToken, setRawToken] = useState("");

    // Asked for once. A LocalTest that starts later is covered by the reload the operator does
    // anyway to get the status dot green.
    useEffect(() => {
        void (async () => {
            try {
                setAvailable(await api.getLocaltestUsers());
            } catch {
                /* the fallback pair is offered, and any id can still be typed */
                setAvailable({ source: "none", users: [] });
            }
        })();
    }, []);

    const offered = available && available.users.length > 0 ? available.users : FALLBACK_USERS;
    const typing = picked === OTHER;
    const userId = typing ? typedId.trim() : picked;

    /**
     * Land on the first offered user, and keep the selection valid when the real list replaces
     * the fallback pair. A selection that is not among the options renders as no selection at all.
     */
    useEffect(() => {
        setPicked((current) => (current === OTHER || offered.some((user) => user.userId === current) ? current : (offered[0]?.userId ?? "")));
    }, [offered]);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const token =
                mode === "test-user"
                    ? await api.createTestUserToken({
                          userId,
                          // Names the token after the person, rather than "Test user 1001".
                          label: offered.find((user) => user.userId === userId)?.label
                      })
                    : await api.createRawToken({ token: rawToken.trim() });
            onActivate(token.id);
            onTokensChanged();
            if (mode === "raw") setRawToken("");
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
                        ["test-user", "LocalTest"],
                        ["raw", "Paste"]
                    ] as [Mode, string][]
                ).map(([value, label]) => (
                    <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)}>
                        {label}
                    </button>
                ))}
            </div>

            {mode === "test-user" && localtest && !localtest.reachable && (
                <div className="notice notice--warn" style={{ marginBottom: 12 }}>
                    LocalTest is not answering at {localtest.url}. Start it, or set ALTINN_LOCALTEST_URL in server/.env.
                </div>
            )}

            <form onSubmit={submit}>
                {mode === "test-user" ? (
                    <div className="field" style={{ marginBottom: 12 }}>
                        <label htmlFor="userId">Test user</label>
                        <select id="userId" value={picked} onChange={(event) => setPicked(event.target.value)}>
                            {offered.map((user) => (
                                <option key={user.userId} value={user.userId}>
                                    {user.label} ({user.userId})
                                </option>
                            ))}
                            {/* LocalTest mints a token for any id it knows, listed or not. */}
                            <option value={OTHER}>Other user id…</option>
                        </select>
                        {typing && (
                            <input
                                type="text"
                                value={typedId}
                                onChange={(event) => setTypedId(event.target.value.trim())}
                                placeholder="1001"
                                autoComplete="off"
                                aria-label="Test user id"
                                style={{ marginTop: 6 }}
                            />
                        )}
                        <p className="field__hint">
                            GET {serverConfig?.localtestUrl ?? "http://localhost:5101"}
                            /Home/GetTestUserToken/
                            <span style={{ color: "var(--accent)" }}>{userId || "{userId}"}</span>
                            <br />
                            {describeSource(available)}
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
                        <p className="field__hint">Stored in server memory only, never in the browser.</p>
                    </div>
                )}

                <button type="submit" className="btn btn--primary" style={{ width: "100%" }} disabled={busy || (mode === "test-user" && !userId)}>
                    {busy && <span className="btn__spinner" />}
                    {mode === "test-user" ? "Get token" : "Store token"}
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
                        <span className={`led ${expired ? "led--bad" : "led--ok"}`} />
                        <span className="token__label">{activeToken.label}</span>
                        <span className="spacer" />
                        <span className="badge">{activeToken.kind}</span>
                    </div>
                    <dl className="claims">
                        {summariseClaims(activeToken.claims).map((row) => (
                            <div key={row.label} style={{ display: "contents" }}>
                                <dt>{row.label}</dt>
                                <dd title={row.value}>{row.value}</dd>
                            </div>
                        ))}
                        <dt>Validity</dt>
                        <dd style={{ color: expired ? "var(--bad)" : undefined }}>{describeExpiry(activeToken.expiresAt, now)}</dd>
                    </dl>
                </div>
            )}

            {tokens.length > 1 && (
                <div style={{ marginTop: 14 }}>
                    <span className="legend">Stored tokens</span>
                    <div className="token-switch">
                        {tokens.map((token) => (
                            <div key={token.id} style={{ display: "flex", gap: 6 }}>
                                <button
                                    type="button"
                                    className="token-switch__item"
                                    style={{ flex: 1 }}
                                    aria-current={token.id === activeToken?.id}
                                    onClick={() => onActivate(token.id)}
                                >
                                    <span className={`led ${isExpired(token.expiresAt, now) ? "led--bad" : "led--ok"}`} />
                                    {/* Same user fetched twice gives identical labels, so the time disambiguates. */}
                                    <span>
                                        {token.label} · {new Date(token.createdAt).toLocaleTimeString("nb")}
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
