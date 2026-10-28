export interface ParsedAnnotatorAgentFormData {
  intent: string;
  teamId: string;
  projectId: string;
  codebookFile: File | null;
  codebookId: string;
  codebookVersionId: string;
  codebookName: string;
  annotationType: string;
  modelCode: string;
  sessionIds: unknown;
  hasFlattenedCategories: boolean;
  flattenedAnnotationField: string;
  shouldRunVerification: boolean;
  runName: string | undefined;
}

const getString = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

const getBoolean = (formData: FormData, key: string): boolean =>
  ["true", "1", "on", "yes"].includes(getString(formData, key).toLowerCase());

/**
 * Reads the multipart form sent to /api/annotatorAgent. `sessionIds` may be a
 * JSON array string or repeated form fields; it is validated later.
 */
export default function parseAnnotatorAgentFormData(
  formData: FormData,
): ParsedAnnotatorAgentFormData {
  const file = formData.get("codebookFile");
  const codebookFile =
    file && typeof file !== "string" && file.size > 0 ? file : null;

  let sessionIds: unknown = undefined;
  const sessionValues = formData
    .getAll("sessionIds")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  if (sessionValues.length === 1 && sessionValues[0].startsWith("[")) {
    try {
      sessionIds = JSON.parse(sessionValues[0]);
    } catch {
      sessionIds = sessionValues[0];
    }
  } else if (sessionValues.length > 0) {
    sessionIds = sessionValues;
  }

  const runName = getString(formData, "runName");

  return {
    intent: getString(formData, "intent"),
    teamId: getString(formData, "teamId"),
    projectId: getString(formData, "projectId"),
    codebookFile,
    codebookId: getString(formData, "codebookId"),
    codebookVersionId: getString(formData, "codebookVersionId"),
    codebookName: getString(formData, "codebookName"),
    annotationType: getString(formData, "annotationType") || "PER_UTTERANCE",
    modelCode: getString(formData, "modelCode"),
    sessionIds,
    hasFlattenedCategories: getBoolean(formData, "hasFlattenedCategories"),
    flattenedAnnotationField: getString(formData, "flattenedAnnotationField"),
    shouldRunVerification: getBoolean(formData, "shouldRunVerification"),
    runName: runName || undefined,
  };
}
