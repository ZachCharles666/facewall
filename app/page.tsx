import { InterviewCoachApp } from "@/components/InterviewCoachApp";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams?: PageSearchParams }) {
  const params = searchParams ? await searchParams : {};
  const rawTheme = Array.isArray(params.theme) ? params.theme[0] : params.theme;
  const visualTheme = rawTheme === "classic" ? "classic" : "figma";

  return <InterviewCoachApp initialVisualTheme={visualTheme} />;
}
