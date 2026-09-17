import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { queryKeys } from "./queries";
import { isExpired } from "./lib/format";
import { targetUrls, type TargetUrls } from "./lib/target";
import { PROBE_DELAY_MS, SELECTION_DELAY_MS, useSettled } from "./lib/useDebounced";
import { useLocalStorage } from "./lib/useLocalStorage";
import type { CatalogueApp, ExampleGroup, LocaltestStatus, PublicToken, RemoteFormSource, ServerConfig } from "./types";

/** Stood in for a query that has not answered yet, and the same array every time it is. */
const NO_APPS: CatalogueApp[] = [];
const NO_GROUPS: ExampleGroup[] = [];
const NO_TOKENS: PublicToken[] = [];

/**
 * Who the tool is, where it is pointed, and what the server behind it says.
 *
 * All three together because they are one thing in practice: every answer under an app is that
 * token's, which is why the token is in every query key below the app, and nothing can be aimed
 * anywhere without knowing where the app is served. Panels that only print the url they would call
 * read the narrow `Target` half through `useTarget`.
 *
 * It owns its state rather than being handed it. A provider that took the session as a prop could
 * only be rendered by something holding it, and that something then cannot use a hook that reads
 * the session: `App` hit exactly that, having rendered the provider it wanted to consume.
 */
export interface Session extends TargetUrls {
    /** As whom, and whether that token exists and has not expired. */
    tokenId: string | null;
    tokenUsable: boolean;
    activeToken: PublicToken | null;
    tokens: PublicToken[];
    /** Which token to prefer. Null means whichever the server lists first. */
    setPreferredTokenId: (id: string) => void;

    org: string;
    app: string;
    /** As set, empty and all, where `party` from the urls is the one with a placeholder in it. */
    partyId: string;
    instanceGuid: string;
    setOrg: Dispatch<SetStateAction<string>>;
    setApp: Dispatch<SetStateAction<string>>;
    setPartyId: Dispatch<SetStateAction<string>>;
    setInstanceGuid: Dispatch<SetStateAction<string>>;

    /**
     * Whether each field has stopped changing, so a read aimed at it can go.
     *
     * Here rather than in each reader. It is one fact about the session, and a hook of its own per
     * caller gets it wrong: a panel mounting part way through a word starts its own timer with the
     * value it finds, treats a half-typed name as settled, and reads an app that does not exist.
     */
    targetSettled: boolean;
    partySettled: boolean;
    instanceSettled: boolean;

    /** Where the local Altinn apps are served, which the masthead names. */
    appHost: string;
    /** What the server says of itself, read once. */
    serverConfig: ServerConfig | null;
    localtest: LocaltestStatus | null;
    localtestUrl: string;
    catalogue: CatalogueApp[];
    exampleGroups: ExampleGroup[];
    /** Where the main form examples came from, so a picker with none can say why. */
    exampleSource: RemoteFormSource | null;
    /** The three reads that have to answer before anything works. */
    bootError: unknown;
}

/** The half of the session a panel needs to print the url it would call. */
export type Target = Pick<Session, keyof TargetUrls | "tokenId" | "tokenUsable" | "org" | "app" | "partyId" | "instanceGuid" | "localtestUrl">;

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
    /*
     * What the server has to say for itself, asked once. Neither is keyed on anything the operator
     * can move: the settings come from the server's environment and the catalogue is a fixture.
     */
    const configQuery = useQuery({ queryKey: queryKeys.config(), queryFn: api.getConfig });
    const catalogueQuery = useQuery({ queryKey: queryKeys.catalogue(), queryFn: api.getCatalogue });
    /* Its own, because it is allowed to fail. The status dot stays grey and nothing else cares. */
    const localtestQuery = useQuery({ queryKey: queryKeys.localtestStatus(), queryFn: api.getLocaltestStatus });

    /*
     * The tokens the server is holding. Minting, renewing and deleting one all invalidate this from
     * the panel that does them, so the list is never something a caller has to remember to refresh.
     */
    const tokensQuery = useQuery({ queryKey: queryKeys.tokens(), queryFn: api.listTokens });
    const tokens = tokensQuery.data ?? NO_TOKENS;

    const [preferredTokenId, setPreferredTokenId] = useState<string | null>(null);

    /**
     * The token in use: the one picked, or the first the server has.
     *
     * Derived rather than stored, which is what lets a preference for a token that has gone fall
     * back on its own. The server prunes expired tokens and a restart loses all of them, so the
     * list moving under the selection is the normal case rather than the odd one.
     */
    const activeToken = useMemo(() => tokens.find((token) => token.id === preferredTokenId) ?? tokens[0] ?? null, [tokens, preferredTokenId]);

    /*
     * Whether the token has expired, on a timer that fires when it does.
     *
     * This used to be a tick every second, compared against the expiry on each one. That re-rendered
     * the whole tool sixty times a minute to answer a question whose answer changes once an hour.
     * The countdown someone is actually watching is a line in the test user panel, and it ticks
     * there, where a re-render is one panel.
     */
    const expiresAt = activeToken?.expiresAt ?? null;
    const [expired, setExpired] = useState(() => isExpired(expiresAt, Date.now()));
    useEffect(() => {
        const remaining = expiresAt ? Date.parse(expiresAt) - Date.now() : NaN;
        setExpired(isExpired(expiresAt, Date.now()));
        if (!Number.isFinite(remaining) || remaining <= 0) return;
        const timer = window.setTimeout(() => setExpired(true), remaining);
        return () => window.clearTimeout(timer);
    }, [expiresAt]);

    const [org, setOrg] = useLocalStorage("org", "");
    const [app, setApp] = useLocalStorage("app", "");
    const [partyId, setPartyId] = useLocalStorage("partyId", "");
    const [instanceGuid, setInstanceGuid] = useLocalStorage("instanceGuid", "");

    const targetSettled = useSettled(`${org}/${app}`, PROBE_DELAY_MS);
    const partySettled = useSettled(partyId, SELECTION_DELAY_MS);
    const instanceSettled = useSettled(instanceGuid, SELECTION_DELAY_MS);

    /*
     * What there is to load into a data element, which is no longer a fixture: the subforms and
     * the attachment dummies are still files on the server, but the main form examples come from
     * the testmotor, keyed by app id. So this is keyed on the app as typed and gated on the typing
     * having stopped, the same as the app probe above it, and for the same reason.
     *
     * No token is involved. An app that has not been probed, or cannot be, still has examples.
     */
    const examplesQuery = useQuery({
        queryKey: queryKeys.examples(app),
        queryFn: () => api.getExamples(app),
        enabled: targetSettled
    });

    const appHost = configQuery.data?.appHost ?? "http://local.altinn.cloud:8000";
    const localtestUrl = localtestQuery.data?.url ?? configQuery.data?.localtestUrl ?? "http://localhost:5101";

    const value = useMemo(
        (): Session => ({
            ...targetUrls(appHost, org, app, partyId, instanceGuid),
            tokenId: activeToken?.id ?? null,
            tokenUsable: Boolean(activeToken) && !expired,
            activeToken,
            tokens,
            setPreferredTokenId,
            org,
            app,
            partyId,
            instanceGuid,
            setOrg,
            setApp,
            setPartyId,
            setInstanceGuid,
            targetSettled,
            partySettled,
            instanceSettled,
            appHost,
            serverConfig: configQuery.data ?? null,
            localtest: localtestQuery.data ?? null,
            localtestUrl,
            catalogue: catalogueQuery.data ?? NO_APPS,
            exampleGroups: examplesQuery.data?.groups ?? NO_GROUPS,
            exampleSource: examplesQuery.data?.remote ?? null,
            bootError: configQuery.error ?? catalogueQuery.error ?? examplesQuery.error ?? null
        }),
        [
            appHost,
            org,
            app,
            partyId,
            instanceGuid,
            activeToken,
            expired,
            tokens,
            setOrg,
            setApp,
            setPartyId,
            setInstanceGuid,
            targetSettled,
            partySettled,
            instanceSettled,
            localtestUrl,
            configQuery.data,
            configQuery.error,
            localtestQuery.data,
            catalogueQuery.data,
            catalogueQuery.error,
            examplesQuery.data,
            examplesQuery.error
        ]
    );

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Throws rather than handing back a blank one: a component outside it is a wiring mistake. */
export function useSession(): Session {
    const session = useContext(SessionContext);
    if (!session) throw new Error("useSession outside a SessionProvider");
    return session;
}

/** The same thing, narrowed, for a panel that only prints where the tool is pointed. */
export function useTarget(): Target {
    return useSession();
}
