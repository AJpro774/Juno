import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { juniKuniDevPlugin } from "./vite-kuni-plugin";
import { juniLuniDevPlugin } from "./vite-luni-plugin";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/Juno/" : "/",
  plugins: [juniKuniDevPlugin(), juniLuniDevPlugin()],
  server: {
    port: 5173,
    fs: {
      allow: [
        "..",
        path.resolve(here, "../kuni"),
        path.resolve(here, "../lunisurge"),
      ],
    },
  },
  assetsInclude: ["**/*.wasm"],
});
