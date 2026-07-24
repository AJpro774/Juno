/**
 * Serve the sibling Kuni app under /kuni/ from the Juni Vite dev server
 * so Juni ↔ Kuni share one origin (instant navigation, one `npm run dev`).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createServer as createViteServer,
  type Plugin,
  type ViteDevServer,
} from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const kuniRoot = path.resolve(here, "../kuni");

export function juniKuniDevPlugin(): Plugin {
  let kuni: ViteDevServer | undefined;

  return {
    name: "juni-kuni-dev",
    async configureServer(juniServer) {
      kuni = await createViteServer({
        configFile: path.join(kuniRoot, "vite.config.ts"),
        root: kuniRoot,
        base: "/kuni/",
        appType: "spa",
        server: {
          middlewareMode: true,
          fs: { allow: [kuniRoot, path.resolve(here, "..")] },
          hmr: juniServer.httpServer
            ? { server: juniServer.httpServer }
            : true,
        },
      });

      juniServer.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/kuni")) {
          next();
          return;
        }
        // Normalize /kuni → /kuni/ so Vite base matching works
        if (url === "/kuni" || url.startsWith("/kuni?")) {
          const q = url.includes("?") ? url.slice(url.indexOf("?")) : "";
          res.statusCode = 302;
          res.setHeader("Location", `/kuni/${q}`);
          res.end();
          return;
        }
        kuni!.middlewares(req, res, next);
      });

      const prevClose = juniServer.close.bind(juniServer);
      juniServer.close = async () => {
        await kuni?.close();
        kuni = undefined;
        return prevClose();
      };
    },
  };
}
