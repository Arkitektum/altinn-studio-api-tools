import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { config } from "./config.js";
import { HttpError } from "./httpError.js";
import { router } from "./routes.js";

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
    const message = error instanceof Error ? error.message : String(error);
    console.error("[unhandled]", error);
    res.status(500).json({ error: message });
});

app.listen(config.port, config.host, () => {
    console.log(`altinn-studio-api-tools api  →  http://localhost:${config.port}/api`);
    console.log(`  apps      ${config.appHost}/{org}/{app}`);
    console.log(`  localtest ${config.localtestUrl}`);
    // Worth saying out loud, since it is the one setting that decides who else can use the tokens
    // this process is holding.
    console.log(`  bound to  ${config.host}${config.host === "127.0.0.1" ? " (this machine only)" : " (reachable from the network)"}`);
});
