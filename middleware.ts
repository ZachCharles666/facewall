import { NextRequest, NextResponse } from "next/server";

const HEALTH_PATH = "/api/health";
const PROMPT_ADMIN_PATH = "/api/prompts/active";
const BASIC_AUTH_THEMES = new Set(["classic", "figma"]);

function requiresPreviewBasicAuth(request: NextRequest) {
  if (request.nextUrl.pathname === PROMPT_ADMIN_PATH) return true;
  if (request.nextUrl.pathname !== "/") return false;
  return BASIC_AUTH_THEMES.has(request.nextUrl.searchParams.get("theme") ?? "");
}

function secureEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function unauthorized() {
  return new NextResponse("Preview authentication required.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="PassBuddy Preview", charset="UTF-8"'
    }
  });
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === HEALTH_PATH) return NextResponse.next();
  if (process.env.PREVIEW_BASIC_AUTH_ENABLED !== "true") return NextResponse.next();
  if (!requiresPreviewBasicAuth(request)) return NextResponse.next();

  const expectedUsername = process.env.PREVIEW_BASIC_AUTH_USERNAME;
  const expectedPassword = process.env.PREVIEW_BASIC_AUTH_PASSWORD;
  if (!expectedUsername || !expectedPassword) {
    return new NextResponse("Preview authentication is unavailable.", {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return unauthorized();

  try {
    const decoded = atob(authorization.slice(6));
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) return unauthorized();
    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    if (
      !secureEqual(username, expectedUsername) ||
      !secureEqual(password, expectedPassword)
    ) {
      return unauthorized();
    }
  } catch {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*"
};
