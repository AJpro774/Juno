import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { juniKuniDevPlugin } from "./vite-kuni-plugin";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/Juno/" : "/",
  plugins: [juniKuniDevPlugin()],
  server: {
    port: 5173,
    fs: {
      allow: ["..", path.resolve(here, "../kuni")],
    },
  },
  assetsInclude: ["**/*.wasm"],
});
