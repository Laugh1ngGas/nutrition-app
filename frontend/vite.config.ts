import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    // Nitro turns the framework-level fetch handler into a runnable server.
    // Only needed for production builds — dev serves through Vite directly.
    // The /api proxy means the browser only ever talks to this server's own
    // origin (works from localhost, LAN IP, or a tunnel with no rebuild).
    // "backend" is the docker-compose service name (internal Docker network).
    // On Render, free web services can't receive private-network traffic —
    // BACKEND_HOST (set via render.yaml's fromService) points this at the
    // backend's public onrender.com URL instead; unset locally, so this
    // still defaults to the docker-compose target.
    ...(command === "build"
      ? [
          nitro({
            preset: "node-server",
            routeRules: {
              "/api/**": {
                proxy: `${process.env.BACKEND_HOST ? `https://${process.env.BACKEND_HOST}` : "http://backend:3001"}/api/**`,
              },
            },
          }),
        ]
      : []),
    react(),
  ],
}));
