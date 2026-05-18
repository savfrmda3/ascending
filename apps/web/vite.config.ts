import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(process.cwd(), "../.."), "");
  const appEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...rootEnv, ...appEnv };

  return {
    plugins: [react()],
    define: {
      __BACKEND_URL__: JSON.stringify(env.BACKEND_URL ?? env.VITE_BACKEND_URL ?? "")
    },
    server: {
      port: 5173
    }
  };
});
