import "server-only";

import { callBetterAuth } from "@/lib/auth/betterAuthHandler";
import { getAuthProfile } from "@/lib/auth/profile";

export class AdminAuthError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? "AUTH_REQUIRED" : "FORBIDDEN");
  }
}

export async function requireAdmin(request: Request) {
  const authResponse = await callBetterAuth(request, "/get-session");
  const session = authResponse.ok
    ? ((await authResponse.json()) as { user?: { id?: string } } | null)
    : null;
  if (!session?.user?.id) throw new AdminAuthError(401);

  const profile = await getAuthProfile(session.user.id);
  if (!profile || profile.status !== "active") throw new AdminAuthError(403);
  if (profile.role !== "admin") throw new AdminAuthError(403);
  return profile;
}
