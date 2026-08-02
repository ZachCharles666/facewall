import "server-only";

import { readAuthConfig } from "@/lib/config/internalBeta";
import { getAuth } from "@/lib/auth/server";

export async function callBetterAuth(
  request: Request,
  path: string,
  body?: Record<string, unknown>
) {
  const { baseUrl } = readAuthConfig();
  const headers = new Headers();
  headers.set("content-type", "application/json");
  for (const name of ["cookie", "origin", "user-agent", "x-forwarded-for", "x-real-ip"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  return getAuth().handler(
    new Request(new URL(`/api/auth${path}`, baseUrl), {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined
    })
  );
}

export function withAuthCookie(response: Response, authResponse: Response) {
  const authHeaders = authResponse.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies = authHeaders.getSetCookie?.() || [];
  if (cookies.length > 0) {
    for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  } else {
    const cookie = authResponse.headers.get("set-cookie");
    if (cookie) response.headers.set("set-cookie", cookie);
  }
  return response;
}
