import "server-only";

import { callBetterAuth } from "@/lib/auth/betterAuthHandler";
import { getAuthProfile, type AuthProfile } from "@/lib/auth/profile";

export class UserAuthError extends Error {
  constructor(
    public readonly code: "AUTH_REQUIRED" | "ACCOUNT_UNAVAILABLE",
    public readonly status: 401 | 403
  ) {
    super(code);
  }
}

export async function requireActiveUser(request: Request): Promise<AuthProfile> {
  const authResponse = await callBetterAuth(request, "/get-session");
  const session = authResponse.ok
    ? ((await authResponse.json()) as { user?: { id?: string } } | null)
    : null;
  if (!session?.user?.id) throw new UserAuthError("AUTH_REQUIRED", 401);

  const profile = await getAuthProfile(session.user.id);
  if (!profile || profile.status !== "active") {
    throw new UserAuthError("ACCOUNT_UNAVAILABLE", 403);
  }
  return profile;
}
