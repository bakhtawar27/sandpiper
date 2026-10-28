import { isSupportedCodebookFile } from "~/modules/codebooks/helpers/codebookFileTypes";

export interface AnnotatorAgentRawInput {
  annotationType?: unknown;
  modelCode?: unknown;
  codebookId?: unknown;
  codebookFileName?: unknown;
  sessionIds?: unknown;
  hasFlattenedCategories?: unknown;
  flattenedAnnotationField?: unknown;
  runName?: unknown;
}

/**
 * Checks the request before any LLM call is made. Pure, so it is unit tested
 * without a database. `isKnownModel` is injected to keep it pure.
 */
export default function validateAnnotatorAgentInput(
  input: AnnotatorAgentRawInput,
  isKnownModel: (modelCode: string) => boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (
    typeof input.annotationType !== "string" ||
    !["PER_UTTERANCE", "PER_SESSION"].includes(input.annotationType)
  ) {
    errors.annotationType =
      "Annotation type must be PER_UTTERANCE or PER_SESSION";
  }

  if (typeof input.modelCode !== "string" || !isKnownModel(input.modelCode)) {
    errors.modelCode = "Invalid model";
  }

  const hasCodebookId =
    typeof input.codebookId === "string" && input.codebookId.length > 0;
  const hasCodebookFile =
    typeof input.codebookFileName === "string" &&
    input.codebookFileName.length > 0;

  if (hasCodebookId === hasCodebookFile) {
    errors.codebook = "Provide either a codebook file or a codebookId";
  } else if (
    hasCodebookFile &&
    !isSupportedCodebookFile(input.codebookFileName as string)
  ) {
    errors.codebook =
      "Codebook file must be .pdf, .docx, .txt, .md, .csv or .json";
  }

  if (
    input.sessionIds !== undefined &&
    (!Array.isArray(input.sessionIds) ||
      !input.sessionIds.every((id) => typeof id === "string"))
  ) {
    errors.sessionIds = "sessionIds must be a list of session ids";
  }

  if (
    input.hasFlattenedCategories === true &&
    (typeof input.flattenedAnnotationField !== "string" ||
      !input.flattenedAnnotationField.trim())
  ) {
    errors.flattenedAnnotationField =
      "A field name is required when categories are flattened";
  }

  if (
    input.runName !== undefined &&
    (typeof input.runName !== "string" || input.runName.trim().length < 3)
  ) {
    errors.runName = "Run name must be at least 3 characters";
  }

  return errors;
}
