import { ApiError } from "../api";

export function ErrorNotice({ error }: { error: unknown }) {
    if (!error) return null;
    const message = error instanceof Error ? error.message : String(error);
    const issues = error instanceof ApiError ? error.issues : [];

    return (
        <div className="notice notice--bad" role="alert">
            <div>
                {message}
                {issues.length > 0 && (
                    <ul>
                        {issues.map((issue) => (
                            <li key={`${issue.path}:${issue.message}`}>
                                <strong>{issue.path || "request"}</strong>: {issue.message}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
