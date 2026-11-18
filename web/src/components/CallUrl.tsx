import { useSession } from "../session";
import { shortUrl } from "../lib/target";

interface CallUrlProps {
    method: "GET" | "POST" | "PUT" | "DELETE";
    url: string;
}

/**
 * The request a panel would make, as a method and a short url, with the full url on hover. See `shortUrl` for what
 * is left out: a full url with two guids in it wraps to three lines in a panel this wide.
 */
export function CallUrl({ method, url }: CallUrlProps) {
    const { appHost, localtestUrl } = useSession();
    return (
        <>
            <span className={`method method--${method.toLowerCase()}`}>{method}</span> <span title={url}>{shortUrl(url, appHost, localtestUrl)}</span>
        </>
    );
}
