import { isIP } from "node:net";

/**
 * Whether a request's Host header names this server, rather than some other name that happens to resolve to it.
 *
 * Binding loopback keeps other machines out, but not a web page in your own browser: a page on a domain whose DNS the
 * page's owner controls can point that domain at 127.0.0.1 once loaded, and then reach the api same-origin, which CORS
 * does nothing about. That request still carries the page's own name in its Host header, so answering only to names
 * that are ours is what closes it. An IP address is always ours to accept, since no page can make a browser send one in
 * place of its own name, and that keeps `HOST=0.0.0.0` usable by address with no configuration.
 *
 * @param hostHeader - The Host header as received, port included.
 * @param allowedNames - Further host names to accept, lowercase, for reaching the api by a name (a container, a machine).
 * @returns True when the request may be answered.
 */
export function isAllowedHost(hostHeader: string | undefined, allowedNames: readonly string[] = []): boolean {
    if (!hostHeader) return false;
    const name = hostName(hostHeader.trim().toLowerCase());
    return name === "localhost" || name.endsWith(".localhost") || isIP(name) !== 0 || allowedNames.includes(name);
}

/** The name part of a Host header: without its port, and an IPv6 address without its brackets. */
function hostName(host: string): string {
    if (host.startsWith("[")) {
        const end = host.indexOf("]");
        return end === -1 ? "" : host.slice(1, end);
    }
    const colon = host.indexOf(":");
    return colon === -1 ? host : host.slice(0, colon);
}
