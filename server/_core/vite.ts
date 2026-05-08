import express, { type Express, type Request } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { getMandateByToken } from "../db";

function stripOgImage(html: string): string {
  return html
    .replace(/<meta property="og:image"[^>]*>\s*/g, "")
    .replace(/<meta property="og:image:width"[^>]*>\s*/g, "")
    .replace(/<meta property="og:image:height"[^>]*>\s*/g, "")
    .replace(/<meta name="twitter:image"[^>]*>\s*/g, "")
    .replace(/<meta name="twitter:card"[^>]*>/g, `<meta name="twitter:card" content="summary" />`);
}

function injectMeta(html: string, title: string, description: string): string {
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta property="og:title"[^>]*content=")[^"]*(")/g, `$1${title}$2`)
    .replace(/(<meta property="og:description"[^>]*content=")[^"]*(")/g, `$1${description}$2`)
    .replace(/(<meta name="twitter:title"[^>]*content=")[^"]*(")/g, `$1${title}$2`)
    .replace(/(<meta name="twitter:description"[^>]*content=")[^"]*(")/g, `$1${description}$2`);
  out = stripOgImage(out);
  return out;
}

async function getMetaForRequest(req: Request): Promise<{ title: string; description: string } | null> {
  const match = req.path.match(/^\/billing\/([^/]+)$/);
  if (match) {
    try {
      const mandate = await getMandateByToken(match[1]);
      if (mandate) {
        return {
          title: `Set up billing — ${mandate.clientName}`,
          description: "Enter your card once to set up automatic billing with Gro Digital.",
        };
      }
    } catch {}
    return {
      title: "Set up billing — Gro Digital",
      description: "Enter your card once to set up automatic billing with Gro Digital.",
    };
  }
  return null;
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const meta = await getMetaForRequest(req);
      if (meta) template = injectMeta(template, meta.title, meta.description);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    const meta = await getMetaForRequest(req).catch(() => null);
    if (meta) {
      const html = await fs.promises.readFile(indexPath, "utf-8").catch(() => null);
      if (html) {
        res.set("Content-Type", "text/html").send(injectMeta(html, meta.title, meta.description));
        return;
      }
    }
    res.sendFile(indexPath);
  });
}
