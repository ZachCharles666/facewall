import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth/server";

export const runtime = "nodejs";

const publicReadPaths = new Set(["/api/auth/get-session"]);

const handler = async (request: Request) => {
  const path = new URL(request.url).pathname;
  if (request.method !== "GET" || !publicReadPaths.has(path)) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return await getAuth().handler(request);
};

export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(handler);
