import type { RunAnnotationType } from "~/modules/runs/runs.types";

export interface AnnotatorAgentCodebookFile {
  fileName: string;
  buffer: ArrayBuffer;
}

export interface RunAnnotatorAgentInput {
  teamId: string;
  projectId: string;
  userId: string;
  /** Upload a codebook document (PDF, DOCX, TXT, MD, CSV, JSON)... */
  codebookFile?: AnnotatorAgentCodebookFile;
  /** ...or reuse an existing codebook (production version unless set). */
  codebookId?: string;
  codebookVersionId?: string;
  codebookName?: string;
  annotationType: RunAnnotationType;
  modelCode: string;
  /** Defaults to every converted session in the project. */
  sessionIds?: string[];
  hasFlattenedCategories?: boolean;
  flattenedAnnotationField?: string;
  shouldRunVerification?: boolean;
  runName?: string;
}

export type AnnotatorAgentStep =
  | "IMPORT_CODEBOOK"
  | "GENERATE_PROMPT"
  | "SELECT_SESSIONS"
  | "CHECK_CREDITS"
  | "START_RUN";

export interface RunAnnotatorAgentResult {
  codebookId: string;
  codebookVersionId: string;
  promptId: string;
  promptVersion: number;
  runId: string;
  sessionCount: number;
  estimatedCost: number;
  steps: AnnotatorAgentStep[];
}
