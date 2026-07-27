/**
 * Serve the sibling LuniSurge app under /luni/ from the Juni Vite dev server
 * so Juni ↔ Kuni ↔ Luni share one origin (instant navigation, one `npm run dev`).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createServer as createViteServer,
  type Plugin,
  type ViteDevServer,
} from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const luniRoot = path.resolve(here, "../lunisurge");

export function juniLuniDevPlugin(): Plugin {
  let luni: ViteDevServer | undefined;

  return {
    name: "juni-luni-dev",
    async configureServer(juniServer) {
      luni = await createViteServer({
        configFile: path.join(luniRoot, "vite.config.ts"),
        root: luniRoot,
        base: "/luni/",
        appType: "spa",
        server: {
          middlewareMode: true,
          fs: { allow: [luniRoot, path.resolve(here, "..")] },
          hmr: juniServer.httpServer
            ? { server: juniServer.httpServer }
            : true,
        },
      });

      juniServer.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/luni")) {
          next();
          return;
        }
        // Normalize /luni → /luni/ so Vite base matching works
        if (url === "/luni" || url.startsWith("/luni?")) {
          const q = url.includes("?") ? url.slice(url.indexOf("?")) : "";
          res.statusCode = 302;
          res.setHeader("Location", `/luni/${q}`);
          res.end();
          return;
        }
        luni!.middlewares(req, res, next);
      });

      const prevClose = juniServer.close.bind(juniServer);
      juniServer.close = async () => {
        await luni?.close();
        luni = undefined;
        return prevClose();
      };
    },
  };
}
