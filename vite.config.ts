import nodeAdapter from "@sveltejs/adapter-node";
import vercelAdapter from "@sveltejs/adapter-vercel";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const vercel =
    process.env.VERCEL === "1" || process.env.DEPLOY_TARGET === "vercel";
  const configuredOrigin =
    process.env.PUBLIC_BASE_URL ||
    loadEnv(mode, process.cwd(), "PUBLIC_").PUBLIC_BASE_URL;
  const publicBaseUrl =
    process.env.VERCEL === "1"
      ? process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : configuredOrigin ||
          (process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : undefined)
      : configuredOrigin;
  return {
    plugins: [
      sveltekit({
        paths: publicBaseUrl
          ? { origin: new URL(publicBaseUrl).origin }
          : undefined,
        csp: {
          mode: "auto",
          directives: {
            "default-src": ["self"],
            "base-uri": ["self"],
            "connect-src": ["self"],
            "font-src": ["self"],
            "form-action": ["self"],
            "frame-ancestors": ["none"],
            "img-src": ["self", "data:"],
            "object-src": ["none"],
            "script-src": ["self"],
            "style-src": ["self"],
          },
        },
        compilerOptions: {
          // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
          runes: ({ filename }) =>
            filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
        },

        adapter: vercel
          ? vercelAdapter({ runtime: "nodejs24.x", maxDuration: 60 })
          : nodeAdapter(),
      }),
    ],
  };
});
