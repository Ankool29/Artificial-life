import { defineConfig } from "vite";

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves this repository under its name; keep local dev at /.
  base: command === "build" || isPreview ? "/Artificial-life/" : "./",
}));
