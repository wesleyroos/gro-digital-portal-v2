import "dotenv/config";
import { installLogInterceptor } from "../logger";
installLogInterceptor();
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerCampaignAgentRoutes } from "../marketing-agent";
import { registerCampaignAutoAgentRoutes } from "../campaign-auto-agent";
import { registerCampaignJarvisRoutes } from "../campaign-jarvis";
import { registerInstagramOAuthRoutes } from "../instagram-oauth";
import { registerFacebookOAuthRoutes } from "../facebook-oauth";
import { registerLinkedinOAuthRoutes } from "../linkedin-oauth";
import { startScheduler, runRecurringInvoiceTick, runMandateBillingTick, runScheduledInvoiceSendTick } from "../scheduler";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { markOverdueInvoices } from "../db";
import { registerPdfRoutes } from "../pdf-routes";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.removeHeader("X-Powered-By");
    next();
  });

  app.use(express.json({
    limit: "10mb",
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
  }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  registerCampaignAgentRoutes(app);
  registerCampaignAutoAgentRoutes(app);
  registerCampaignJarvisRoutes(app);
  registerInstagramOAuthRoutes(app);
  registerFacebookOAuthRoutes(app);
  registerLinkedinOAuthRoutes(app);
  registerPdfRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    startScheduler();
  });
}

startServer().catch(console.error);

// Overdue invoice automation — runs on startup then every hour
markOverdueInvoices().catch(console.error);
setInterval(() => markOverdueInvoices().catch(console.error), 60 * 60 * 1000);

// Recurring invoice automation — runs on startup then every hour
runRecurringInvoiceTick().catch(console.error);
setInterval(() => runRecurringInvoiceTick().catch(console.error), 60 * 60 * 1000);

// Mandate billing — runs on startup then every hour
runMandateBillingTick().catch(console.error);
setInterval(() => runMandateBillingTick().catch(console.error), 60 * 60 * 1000);

// Scheduled invoice sends — runs on startup then every hour
runScheduledInvoiceSendTick().catch(console.error);
setInterval(() => runScheduledInvoiceSendTick().catch(console.error), 60 * 60 * 1000);
