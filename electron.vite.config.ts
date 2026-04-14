import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: "electron/main.ts",
      },
      rollupOptions: {
        external: ["node-pty"],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: "electron/preload.ts",
      },
    },
  },
  renderer: {
    root: ".",
    build: {
      rollupOptions: {
        input: "index.html",
      },
    },
    resolve: {
      alias: {
        "@": "src",
      },
    },
    plugins: [react()],
  },
});
