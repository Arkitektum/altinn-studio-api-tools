import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { appBaseUrl } from "./urls.js";
import { HttpError } from "./httpError.js";
import { createTestUserToken } from "./localtestClient.js";
import { deleteToken, listTokens, requireToken, storeToken, toPublicToken } from "./tokenStore.js";
import { fetchApplicationMetadata, fetchInstantiableParties } from "./appService.js";
import { postDataToApp } from "./runService.js";
import { readDataElement, readInstance, validateDataElement, validateInstance } from "./readService.js";
import { altinnFetch, describeFailure } from "./altinnClient.js";
import { appCatalogue } from "./appCatalogue.js";
import { listExamples, readExample } from "./examples.js";

/** Wrap an async handler so rejected promises reach the error middleware. */
const asyncHandler =
    (handler: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction): void => {
        handler(req, res).catch(next);
    };

const testUserTokenSchema = z.object({
    userId: z.string().trim().min(1, "userId is required"),
    label: z.string().trim().optional()
});

const rawTokenSchema = z.object({
    token: z.string().trim().min(10, "token looks too short to be a JWT"),
    label: z.string().trim().optional()
});

const appQuerySchema = z.object({
    tokenId: z.string().min(1),
    org: z.string().trim().min(1),
    app: z.string().trim().min(1)
});

const dataElementSchema = z.object({
    dataType: z.string().trim().min(1, "dataType is required"),
    content: z.string(),
    encoding: z.enum(["utf8", "base64"]).optional(),
    contentType: z.string().trim().optional(),
    filename: z.string().trim().optional()
});

const runSchema = z
    .object({
        tokenId: z.string().min(1, "tokenId is required"),
        org: z.string().trim().min(1, "org is required"),
        app: z.string().trim().min(1, "app is required"),
        instanceOwnerPartyId: z.string().trim().min(1, "instanceOwnerPartyId is required"),
        dataElements: z.array(dataElementSchema).min(1, "at least one data element is required"),
        mode: z.enum(["sequential", "multipart", "existing"]).optional(),
        instanceGuid: z.string().trim().optional(),
        instanceTemplate: z.record(z.string(), z.unknown()).optional(),
        validate: z.boolean().optional(),
        advanceProcess: z.boolean().optional()
    })
    .refine((value) => value.mode !== "existing" || Boolean(value.instanceGuid), {
        message: 'instanceGuid is required when mode is "existing"',
        path: ["instanceGuid"]
    });

const instanceLookupSchema = appQuerySchema.extend({
    instanceOwnerPartyId: z.string().trim().min(1),
    instanceGuid: z.string().trim().min(1)
});

export const router = Router();

router.get("/health", (_req, res) => {
    res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
});

router.get("/config", (_req, res) => {
    res.json({
        appHost: config.appHost,
        localtestUrl: config.localtestUrl,
        exampleDataDir: config.exampleDataDir
    });
});

/** Is LocalTest actually up? Drives the status dot in the header. */
router.get(
    "/localtest/status",
    asyncHandler(async (_req, res) => {
        try {
            const response = await fetch(`${config.localtestUrl}/`, {
                signal: AbortSignal.timeout(3_000)
            });
            res.json({ reachable: response.ok, status: response.status, url: config.localtestUrl });
        } catch (error) {
            res.json({
                reachable: false,
                status: null,
                url: config.localtestUrl,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    })
);

// ---------------------------------------------------------------- catalogue & examples

router.get("/catalogue", (_req, res) => {
    res.json(appCatalogue);
});

router.get(
    "/examples",
    asyncHandler(async (_req, res) => {
        res.json({ dir: config.exampleDataDir, groups: await listExamples() });
    })
);

const exampleFileSchema = z.object({
    kind: z.enum(["form", "subform", "attachment"]),
    // Data type for forms and subforms. Attachments are flat, so it may be empty.
    group: z.string().trim().default(""),
    name: z.string().trim().min(1)
});

router.get(
    "/examples/file",
    asyncHandler(async (req, res) => {
        const query = exampleFileSchema.parse(req.query);
        res.json(await readExample(query.kind, query.group, query.name));
    })
);

// ---------------------------------------------------------------- tokens

router.post(
    "/tokens/test-user",
    asyncHandler(async (req, res) => {
        const input = testUserTokenSchema.parse(req.body);
        const token = await createTestUserToken(input.userId, input.label);
        res.status(201).json(toPublicToken(token));
    })
);

router.post("/tokens/raw", (req, res) => {
    const input = rawTokenSchema.parse(req.body);
    const token = storeToken({
        kind: "raw",
        label: input.label?.trim() || "Pasted token",
        token: input.token
    });
    res.status(201).json(toPublicToken(token));
});

router.get("/tokens", (_req, res) => {
    res.json(listTokens());
});

router.delete("/tokens/:id", (req, res) => {
    const removed = deleteToken(req.params.id);
    res.status(removed ? 204 : 404).end();
});

// ---------------------------------------------------------------- app introspection

router.get(
    "/app/metadata",
    asyncHandler(async (req, res) => {
        const query = appQuerySchema.parse(req.query);
        const token = requireToken(query.tokenId);
        const metadata = await fetchApplicationMetadata(token.token, query.org, query.app);
        res.json({ baseUrl: appBaseUrl(query.org, query.app), metadata });
    })
);

router.get(
    "/app/parties",
    asyncHandler(async (req, res) => {
        const query = appQuerySchema.parse(req.query);
        const token = requireToken(query.tokenId);
        res.json(await fetchInstantiableParties(token.token, query.org, query.app));
    })
);

// ---------------------------------------------------------------- posting data

router.post(
    "/runs",
    asyncHandler(async (req, res) => {
        const input = runSchema.parse(req.body);
        const token = requireToken(input.tokenId);
        const { tokenId: _ignored, ...runRequest } = input;
        const result = await postDataToApp(token.token, runRequest);
        // A failed run still returns 200 with ok:false, so the UI can render the whole step log
        // instead of collapsing it into a single error.
        res.status(200).json(result);
    })
);

// ---------------------------------------------------------------- reading data

router.get(
    "/instances",
    asyncHandler(async (req, res) => {
        const query = instanceLookupSchema.parse(req.query);
        const token = requireToken(query.tokenId);
        // 200 with ok:false on an Altinn error, matching /api/runs, so the caller keeps the log.
        res.json(await readInstance(token.token, query));
    })
);

const readDataElementSchema = instanceLookupSchema.extend({
    dataGuid: z.string().trim().min(1, "dataGuid is required")
});

router.get(
    "/instances/data-element",
    asyncHandler(async (req, res) => {
        const query = readDataElementSchema.parse(req.query);
        const token = requireToken(query.tokenId);
        res.json(await readDataElement(token.token, query));
    })
);

router.get(
    "/instances/validate",
    asyncHandler(async (req, res) => {
        const query = instanceLookupSchema.parse(req.query);
        const token = requireToken(query.tokenId);
        res.json(await validateInstance(token.token, query));
    })
);

router.get(
    "/instances/data-element/validate",
    asyncHandler(async (req, res) => {
        const query = readDataElementSchema.parse(req.query);
        const token = requireToken(query.tokenId);
        res.json(await validateDataElement(token.token, query));
    })
);

router.put(
    "/instances/process/next",
    asyncHandler(async (req, res) => {
        const input = instanceLookupSchema.parse(req.body);
        const token = requireToken(input.tokenId);
        const url = `${appBaseUrl(input.org, input.app)}/instances/${input.instanceOwnerPartyId}/${input.instanceGuid}/process/next`;
        const response = await altinnFetch({
            url,
            method: "PUT",
            token: token.token,
            body: "{}",
            contentType: "application/json"
        });
        if (!response.ok) {
            throw new HttpError(response.status, `Could not advance the process: ${describeFailure(response)}`, { url });
        }
        res.json(response.body);
    })
);
