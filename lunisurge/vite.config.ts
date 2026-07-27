import { defineConfig } from "vite";

/** Use `/luni/` when embedded under the Juni site; `/` for standalone. */
const base = process.env.LUNI_BASE ?? "/";

export default defineConfig({
  root: ".",
  base,
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    port: 5175,
    strictPort: true,
  },
});
