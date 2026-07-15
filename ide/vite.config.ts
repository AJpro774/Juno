import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/Juno/" : "/",
  server: {
    port: 5173,
    fs: {
      allow: [".."],
    },
  },
  assetsInclude: ["**/*.wasm"],
});
