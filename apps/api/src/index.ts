import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";
import { config, isSimulatedLlm } from "./config.js";
import { api, openai } from "./routes.js";
import { startEngine } from "./engine.js";
import { chainStatus } from "./chain.js";
import { AuthError } from "./auth.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    exposedHeaders: ["x-eclipseal-signature", "x-eclipseal-attestation", "x-ecls-quota-limit", "x-ecls-quota-remaining"],
  }),
);
app.use(express.json({ limit: "256kb" }));

const limiter = (limit: number) =>
  rateLimit({ windowMs: 60_000, limit, standardHeaders: "draft-8", legacyHeaders: false });

app.use("/api/waitlist", limiter(6));
app.use("/api/auth", limiter(30));
app.use("/v1/chat", limiter(40));
app.use("/api", limiter(600), api);
app.use("/v1", limiter(120), openai);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next;
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: "Malformed JSON body" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal error" });
});

startEngine();
void chainStatus();

const onListen = () => {
  console.log(`eclipseal-api listening on http://${config.host ?? "localhost"}:${config.port}`);
  console.log(`  attestation: simulated (Ed25519 dev attestor)`);
  console.log(`  llm gateway: ${isSimulatedLlm ? "simulated" : `upstream ${config.upstreamLlm.baseUrl}`}`);
  console.log(`  chain rpc:   ${config.chain.rpcUrl}`);
};
if (config.host) app.listen(config.port, config.host, onListen);
else app.listen(config.port, onListen);
