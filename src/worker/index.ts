import { Hono } from "hono";
import type { Env } from "./lib/env";
import { auth } from "./routes/auth";
import { webhookRoute } from "./routes/webhooks";
import { chains, wallets } from "./routes/wallets";

const api = new Hono<{ Bindings: Env }>();

api.get("/health", (c) => c.text("ok"));

api.route("/auth", auth);
api.route("/wallets", wallets);
api.route("/chains", chains);
api.route("/webhooks", webhookRoute);

// Mount the API under /api. Static assets & SPA fallback are served by the
// Workers assets runtime (run_worker_first: ["/api/*"]); this Worker only
// sees /api/* requests.
const app = new Hono<{ Bindings: Env }>();
app.route("/api", api);

export default app;
