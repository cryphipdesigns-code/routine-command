import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/routine-command/" : "/",
  plugins: [viteSingleFile()],
  server: {
    port: 4175,
  },
  preview: {
    port: 4175,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
}));
