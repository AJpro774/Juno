import { defineConfig } from "vite";

/** Use `/kuni/` when embedded under the Juni Netlify site; `/` for standalone. */
const base = process.env.KUNI_BASE ?? "/";

export default defineConfig({
  root: ".",
  base,
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 6500,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ["@mlc-ai/web-llm"],
  },
});
