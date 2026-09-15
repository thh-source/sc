/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import scdaApi from "./scda-api.js";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  PCM_DB: D1Database;
  BUCKET: R2Bucket;
  PCM_FILES: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
    
async function hashToken(token: string) {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/du-an/") || url.pathname.startsWith("/files/")) {
      // Authenticate via mh_session
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(/mh_session=([^;]+)/);
      let username = "";
      if (match) {
        const tokenHash = await hashToken(match[1]);
        const now = new Date().toISOString();
        const row = await env.DB.prepare(
          "SELECT u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1"
        )
          .bind(tokenHash, now)
          .first<{username: string}>();
        if (row) username = row.username;
      }
      
      if (!username) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
          status: 401, 
          headers: { "Content-Type": "application/json" }
        });
      }

      // Proxy request to SCDA logic with the custom header
      const newRequest = new Request(request);
      newRequest.headers.set("cf-access-authenticated-user-email", username);
      
      // Override env to ensure it checks access
      const scdaEnv = { ...env, REQUIRE_ACCESS: "true" };
      
      return scdaApi.fetch(newRequest, scdaEnv, ctx);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
