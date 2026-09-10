import { useEffect, useState } from "react";
import { api } from "../api";
import { describeExpiry, isExpired, summariseClaims } from "../lib/format";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { LocaltestStatus, LocaltestUser, LocaltestUsers, PublicToken, ServerConfig } from "../types";

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

/**
 * The same thing in a few words, for the panel head. Where the list came from is worth saying but
 * not worth three lines of the panel, so the sentence above becomes the badge's title.
 */
function badgeSource(users: LocaltestUsers | null): string {
    if (!users || users.source === "none") return "fallback list";
    return `${users.users.length} users`;
}

interface TokenPanelProps {
    /** Anchor for the chain strip to scroll to. */
    id: string;
    serverConfig: ServerConfig | null;
    localtest: LocaltestStatus | null;
    tokens: PublicToken[];
    activeToken: PublicToken | null;
    onActivate: (id: string) => void;
    onTokensChanged: () => void;
    now: number;
}

export function TokenPanel({ id, serverConfig, localtest, tokens, activeToken, onActivate, onTokensChanged, now }: TokenPanelProps) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [renewing, setRenewing] = useState(false);
    const [available, setAvailable] = useState<LocaltestUsers | null>(null);
    const [picked, setPicked] = useState("");
    /** A user id typed by hand, for a user LocalTest did not offer. */
    const [typedId, setTypedId] = useState("");

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
            const token = await api.createTestUserToken({
                userId,
                // Names the token after the person, rather than "Test user 1001".
                label: offered.find((user) => user.userId === userId)?.label
            });
            onActivate(token.id);
            onTokensChanged();
        } catch (caught) {
            setError(caught);
        } finally {
            setBusy(false);
        }
    }

    async function remove(tokenId: string) {
        try {
            await api.deleteToken(tokenId);
            onTokensChanged();
        } catch (caught) {
            setError(caught);
        }
    }

    /**
     * Fetches another token for the same user and activates it, so an expiry mid-session costs a
     * click rather than a trip back through the picker.
     */
    async function renew(token: PublicToken) {
        if (!token.userId) return;
        setRenewing(true);
        setError(null);
        try {
            const fresh = await api.createTestUserToken({ userId: token.userId, label: token.label });
            onActivate(fresh.id);
            try {
                // The old one is spent, and keeping it would fill the list with dead tokens for
                // the same person. It may already be gone: the server prunes expired tokens.
                await api.deleteToken(token.id);
            } catch {
                /* already pruned, which is the same outcome */
            }
            onTokensChanged();
        } catch (caught) {
            setError(caught);
        } finally {
            setRenewing(false);
        }
    }

    const expired = activeToken ? isExpired(activeToken.expiresAt, now) : false;

    return (
        <Panel
            id={id}
            title="Test user"
            aside={
                <span className="badge" title={describeSource(available)}>
                    {badgeSource(available)}
                </span>
            }
        >
            {localtest && !localtest.reachable && (
                <div className="notice notice--warn" style={{ marginBottom: 12 }}>
                    LocalTest is not answering at {localtest.url}. Start it, or set ALTINN_LOCALTEST_URL in server/.env.
                </div>
            )}

            <form onSubmit={submit}>
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
                    {/*
                     * Shortened to {localtest} rather than the resolved host, the way the compare
                     * panel does it: the full URL wrapped over two lines here, and the run log
                     * prints it in full for every request anyway.
                     */}
                    <p className="field__hint">
                        <span className="method method--get">GET</span>{" "}
                        <span title={serverConfig?.localtestUrl ?? "http://localhost:5101"}>{"{localtest}"}</span>
                        /Home/GetTestUserToken/
                        <span style={{ color: "var(--accent)" }}>{userId || "{userId}"}</span>
                        <br />
                        The party id comes from the token claims.
                    </p>
                </div>

                <button type="submit" className="btn btn--primary" style={{ width: "100%" }} disabled={busy || !userId}>
                    {busy && <span className="btn__spinner" />}
                    Get token
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
                        {/* The Expires row below says it in words, so this repeats it in colour. */}
                        <span className={`led ${expired ? "led--bad" : "led--ok"}`} aria-hidden="true" />
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
                        {/*
                         * Not a claim, which is why it sits outside the summary: a LocalTest token
                         * carries no personal number, so the server looks it up from the party the
                         * token belongs to. Shown unformatted, since it is usually on its way into
                         * a form field.
                         *
                         * Labelled as the claim summary labels the `pid` claim, which holds the same
                         * number when a token has one, and skipped when it does: one number, one row,
                         * under one name.
                         */}
                        {activeToken.ssn && !activeToken.claims["pid"] && (
                            <>
                                <dt>Person no.</dt>
                                <dd title={activeToken.ssn}>{activeToken.ssn}</dd>
                            </>
                        )}
                        <dt>Validity</dt>
                        <dd style={{ color: expired ? "var(--bad)" : undefined }}>{describeExpiry(activeToken.expiresAt, now)}</dd>
                    </dl>

                    {/* Only a LocalTest token can be minted again. A pasted one came from elsewhere. */}
                    {activeToken.kind === "test-user" && activeToken.userId && (
                        <div className="row" style={{ marginTop: 10 }}>
                            <button
                                type="button"
                                // Accented once it has expired, since renewing is then the thing to press.
                                className={`btn ${expired ? "btn--primary" : "btn--post"}`}
                                onClick={() => void renew(activeToken)}
                                disabled={renewing || busy}
                            >
                                {renewing && <span className="btn__spinner" />}
                                {renewing ? "Renewing…" : "Renew"}
                            </button>
                            <span className="field__hint" style={{ margin: 0 }}>
                                Another token for user {activeToken.userId}, replacing this one.
                            </span>
                        </div>
                    )}
                </div>
            )}

            {tokens.length > 1 && (
                <div style={{ marginTop: 14 }}>
                    <span className="legend">Stored tokens</span>
                    <div className="picklist">
                        {tokens.map((token) => (
                            <div key={token.id} style={{ display: "flex", gap: 6 }}>
                                <button
                                    type="button"
                                    className="picklist__item"
                                    style={{ flex: 1 }}
                                    aria-current={token.id === activeToken?.id}
                                    onClick={() => onActivate(token.id)}
                                >
                                    <span className={`led ${isExpired(token.expiresAt, now) ? "led--bad" : "led--ok"}`} aria-hidden="true" />
                                    {/* Same user fetched twice gives identical labels, so the time disambiguates. */}
                                    <span>
                                        {token.label} · {new Date(token.createdAt).toLocaleTimeString("nb")}
                                        {/* Nothing in this row says it otherwise. The dot is the only sign. */}
                                        {isExpired(token.expiresAt, now) && <span className="sr-only"> expired</span>}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    className="btn btn--delete"
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
