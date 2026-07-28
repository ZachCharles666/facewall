export interface InterviewSessionRow {
  id: string;
  user_id: string;
  school_id: string;
  status: string;
  version: number;
  schema_version: number;
  resume_text: string;
  jd_text: string;
  interviewer_style_id: string;
  candidate_profile: unknown | null;
  questions: unknown | null;
  report: unknown | null;
  generation_source: string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface InterviewSessionRecord {
  id: string;
  userId: string;
  schoolId: string;
  status: string;
  version: number;
  schemaVersion: number;
  resumeText: string;
  jdText: string;
  interviewerStyleId: string;
  candidateProfile: unknown | null;
  questions: unknown | null;
  report: unknown | null;
  generationSource: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIso(value: Date | string | null) {
  return value === null ? null : iso(value);
}

export function mapInterviewSessionRow(row: InterviewSessionRow): InterviewSessionRecord {
  if (row.schema_version < 1) throw new Error("UNSUPPORTED_SCHEMA_VERSION");
  return {
    id: row.id,
    userId: row.user_id,
    schoolId: row.school_id,
    status: row.status,
    version: row.version,
    schemaVersion: row.schema_version,
    resumeText: row.resume_text,
    jdText: row.jd_text,
    interviewerStyleId: row.interviewer_style_id,
    candidateProfile: row.candidate_profile,
    questions: row.questions,
    report: row.report,
    generationSource: row.generation_source,
    startedAt: nullableIso(row.started_at),
    completedAt: nullableIso(row.completed_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}
