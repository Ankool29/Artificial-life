import { build } from "vite";
if (!process.argv[2]) throw new Error("Supply a temporary output directory");
await build({
  configFile: false,
  logLevel: "silent",
  build: {
    ssr: "scripts/ecological-memory-probe.mjs",
    outDir: process.argv[2],
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "probe.mjs" } },
  },
});
