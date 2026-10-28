export type CsvRow = Record<string, string>;

export interface LocalUtterance {
  _id: string;
  role: string;
  content: string;
}

export interface LocalSession {
  sessionId: string;
  rows: CsvRow[];
  transcript: LocalUtterance[];
  leadRole: string;
}

export interface LocalAnnotation {
  _id: string;
  reasoning?: string;
  [field: string]: unknown;
}

const ROLE_COLUMNS = ["role", "speaker", "sender"];
const CONTENT_COLUMNS = ["content", "text", "message", "utterance"];
const ORDER_COLUMNS = ["sequence_id", "turn", "order", "index"];

const SHORT_ROLE_NAMES: Record<string, string> = {
  S: "Student",
  T: "Tutor",
};

function findColumn(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((header) => header.toLowerCase().trim());
  for (const candidate of candidates) {
    const index = lower.indexOf(candidate);
    if (index !== -1) return headers[index];
  }
  return null;
}

export function detectColumns(headers: string[]) {
  return {
    session: findColumn(headers, ["session_id", "session", "chat_id"]),
    role: findColumn(headers, ROLE_COLUMNS),
    content: findColumn(headers, CONTENT_COLUMNS),
    order: findColumn(headers, ORDER_COLUMNS),
  };
}

/** Expands single-letter speaker codes (S/T) to readable roles. */
export function normalizeRole(role: string): string {
  const trimmed = (role ?? "").trim();
  return SHORT_ROLE_NAMES[trimmed.toUpperCase()] ?? trimmed;
}

/**
 * Groups CSV rows (one row per utterance) into sessions shaped like the
 * transcripts Sandpiper sends to the annotation prompt.
 */
export function buildSessionsFromCsvRows(
  rows: CsvRow[],
  { maxSessions }: { maxSessions: number },
): LocalSession[] {
  if (rows.length === 0) return [];

  const columns = detectColumns(Object.keys(rows[0]));
  if (!columns.session || !columns.role || !columns.content) {
    throw new Error(
      `The CSV needs session, speaker and text columns (e.g. session_id, speaker or role, content or text). Found: ${Object.keys(rows[0]).join(", ")}`,
    );
  }

  const bySession = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const sessionId = (row[columns.session] ?? "").trim();
    if (!sessionId) continue;
    if (!bySession.has(sessionId)) {
      if (bySession.size >= maxSessions) continue;
      bySession.set(sessionId, []);
    }
    bySession.get(sessionId)!.push(row);
  }

  const sessions: LocalSession[] = [];
  for (const [sessionId, sessionRows] of bySession) {
    const ordered = columns.order
      ? [...sessionRows].sort(
          (a, b) => Number(a[columns.order!]) - Number(b[columns.order!]),
        )
      : sessionRows;

    const transcript = ordered.map((row, index) => ({
      _id: String(index),
      role: normalizeRole(row[columns.role!]),
      content: row[columns.content!] ?? "",
    }));

    const roles = new Set(transcript.map((utterance) => utterance.role));
    const leadRole = roles.has("Tutor")
      ? "Tutor"
      : (transcript[0]?.role ?? "Tutor");

    sessions.push({ sessionId, rows: ordered, transcript, leadRole });
  }

  return sessions;
}

/**
 * Adds one column per annotation field (plus reasoning) to each utterance's
 * original CSV row. Several annotations on one utterance are joined with " | ".
 */
export function mergeAnnotationsIntoRows(
  session: LocalSession,
  annotations: LocalAnnotation[],
  fieldKeys: string[],
): CsvRow[] {
  return session.rows.map((row, index) => {
    const matching = annotations.filter(
      (annotation) => String(annotation._id) === String(index),
    );
    const merged: CsvRow = { ...row };
    for (const fieldKey of [...fieldKeys, "reasoning"]) {
      merged[`ai_${fieldKey}`] = matching
        .map((annotation) => annotation[fieldKey])
        .filter((value) => value !== undefined && value !== "")
        .map(String)
        .join(" | ");
    }
    return merged;
  });
}

function escapeCsvValue(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
  const lines = [headers.map(escapeCsvValue).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvValue(row[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}
