import { InterviewCoachApp } from "@/components/InterviewCoachApp";
import { AuthGate } from "@/components/auth/AuthGate";
import {
  isInternalBetaAuthEnabled,
  readInterviewPersistenceMode
} from "@/lib/config/internalBeta";
import type { VisualTheme } from "@/lib/types";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams?: PageSearchParams }) {
  const params = searchParams ? await searchParams : {};
  const rawTheme = Array.isArray(params.theme) ? params.theme[0] : params.theme;
  const visualTheme: VisualTheme = rawTheme === "classic" ? "classic" : rawTheme === "juju" ? "juju" : "figma";

  return (
    <AuthGate enabled={isInternalBetaAuthEnabled()} visualTheme={visualTheme}>
      <InterviewCoachApp
        initialPersistenceMode={readInterviewPersistenceMode()}
        initialVisualTheme={visualTheme}
      />
    </AuthGate>
  );
}
