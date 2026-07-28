import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminAuthError, requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  try {
    const requestHeaders = new Headers(await headers());
    await requireAdmin(
      new Request("http://passbuddy.internal/admin", { headers: requestHeaders })
    );
  } catch (error) {
    if (error instanceof AdminAuthError) notFound();
    throw error;
  }

  return <AdminDashboard />;
}
