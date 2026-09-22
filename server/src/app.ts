import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { config } from "./config.js";
import { HttpError } from "./httpError.js";
import { router } from "./routes.js";

/**
 * The status an error thrown by `express.json()` deserves, or null if it came from somewhere else.
 *
 * These are raised before any handler runs — a body that is not JSON, or one past the 25mb limit — and they are
 * `http-errors`, carrying both a `type` naming what went wrong and the status that goes with it: 400 for a parse
 * failure, 413 for an oversized one. They are the client's mistakes, not the server's, so they are told apart from
 * the errors that really are ours.
 *
 * @param error - Whatever reached the error middleware.
 * @returns The status to answer with, or null when this is not a body-parser error.
 */
function requestBodyErrorStatus(error: unknown): number | null {
    if (typeof error !== "object" || error === null) {
        return null;
    }
    const { type, status } = error as { type?: unknown; status?: unknown };
    if (typeof type !== "string" || !type.startsWith("entity.")) {
        return null;
    }
    // Fall back to 400 rather than trusting a status outside the client-error range onto the response.
    return typeof status === "number" && status >= 400 && status < 500 ? status : 400;
}

/**
 * The API, wired up but not listening.
 *
 * Kept apart from starting the process so the whole surface can be exercised without binding a
 * port: the routes, the body limit, the CORS preflight, and the error mapping below. That mapping
 * is the part most worth having under test — it is what decides whether a request with a missing
 * field reads as a 400 naming the field, or as an opaque 500.
 *
 * @returns The configured Express application.
 */
export function createApp() {
    const app = express();

    app.use(express.json({ limit: "25mb" }));

    app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", config.webOrigin);
        res.header("Access-Control-Allow-Headers", "Content-Type");
        res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
        if (req.method === "OPTIONS") {
            res.sendStatus(204);
            return;
        }
        next();
    });

    app.use("/api", router);

    app.use((_req, res) => {
        res.status(404).json({ error: "Not found" });
    });

    app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
        if (error instanceof ZodError) {
            res.status(400).json({
                error: "Invalid request",
                issues: error.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message
                }))
            });
            return;
        }
        if (error instanceof HttpError) {
            res.status(error.status).json({ error: error.message, details: error.details ?? undefined });
            return;
        }
        const bodyStatus = requestBodyErrorStatus(error);
        if (bodyStatus !== null) {
            // Not logged: the request was malformed, which is the caller's business and not a fault here.
            res.status(bodyStatus).json({ error: error instanceof Error ? error.message : String(error) });
            return;
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error("[unhandled]", error);
        res.status(500).json({ error: message });
    });

    return app;
}
