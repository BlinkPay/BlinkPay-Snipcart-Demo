import { defineConfig } from "astro/config";

// Tailwind runs through PostCSS (postcss.config.js)
export default defineConfig({
  output: "static",
});
