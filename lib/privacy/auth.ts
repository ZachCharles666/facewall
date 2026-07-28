import "server-only";

import { callBetterAuth } from "@/lib/auth/betterAuthHandler";
import { getAuthProfile } from "@/lib/auth/profile";
import { PrivacyError } from "@/lib/privacy/consent";

export async function getOptionalPrivacyUser(request: Request) {
  const response = await callBetterAuth(request, "/get-session");
  const session = response.ok
    ? ((await response.json()) as { user?: { id?: string } } | null)
    : null;
  if (!session?.user?.id) return null;
  return getAuthProfile(session.user.id);
}

export async function requirePrivacyUser(
  request: Request,
  allowedStatuses: string[] = ["active"]
) {
  const profile = await getOptionalPrivacyUser(request);
  if (!profile) throw new PrivacyError("AUTH_REQUIRED", 401);
  if (!allowedStatuses.includes(profile.status)) {
    throw new PrivacyError("ACCOUNT_UNAVAILABLE", 403);
  }
  return profile;
}
