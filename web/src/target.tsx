import { createContext, useContext, useMemo, type ReactNode } from "react";
import { targetUrls, type TargetUrls } from "./lib/target";

/**
 * Where the tool is pointed, for the panels that have to say so.
 *
 * A context rather than props, because what a panel does with this is print it. Five values were
 * being threaded through `App` into four panels so that each could build the same url the same way,
 * which is a lot of plumbing for a line of text: the panels that act on the target take what they
 * act on, and the ones that only describe it read it from here.
 *
 * The raw values are here too, beside the ones with placeholders in. A url is written with a
 * placeholder where a field is empty, and a link or a title has to be the real thing or absent.
 */
export interface Target extends TargetUrls {
    /**
     * As whom. Part of the target rather than beside it, because every answer under an app is that
     * token's: what the app will tell you, and which parties you may act for, both depend on who is
     * asking. It is in every query key below the app for the same reason.
     */
    tokenId: string | null;
    /** Whether that token exists and has not expired, which is what gates every read. */
    tokenUsable: boolean;
    org: string;
    app: string;
    /** As set, empty and all, where `party` above is the one with a placeholder in it. */
    partyId: string;
    instanceGuid: string;
    /** Where LocalTest itself answers, which is the storage api rather than the app. */
    localtestUrl: string;
}

const TargetContext = createContext<Target | null>(null);

export interface TargetProviderProps {
    tokenId: string | null;
    tokenUsable: boolean;
    appHost: string;
    org: string;
    app: string;
    partyId: string;
    instanceGuid: string;
    localtestUrl: string;
    children: ReactNode;
}

export function TargetProvider({ tokenId, tokenUsable, appHost, org, app, partyId, instanceGuid, localtestUrl, children }: TargetProviderProps) {
    const value = useMemo(
        (): Target => ({
            ...targetUrls(appHost, org, app, partyId, instanceGuid),
            tokenId,
            tokenUsable,
            org,
            app,
            partyId,
            instanceGuid,
            localtestUrl
        }),
        [tokenId, tokenUsable, appHost, org, app, partyId, instanceGuid, localtestUrl]
    );
    return <TargetContext.Provider value={value}>{children}</TargetContext.Provider>;
}

/** Throws rather than handing back a blank target: a panel outside the provider is a wiring mistake. */
export function useTarget(): Target {
    const target = useContext(TargetContext);
    if (!target) throw new Error("useTarget outside a TargetProvider");
    return target;
}
