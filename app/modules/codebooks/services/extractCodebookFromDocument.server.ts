import LLM from "~/modules/llm/llm";
import { getTaskModelCode } from "~/modules/llm/modelRegistry";
import extractCodebookDocumentText from "../helpers/extractCodebookDocumentText.server";
import normalizeExtractedCodebook, {
  type ExtractedCodebook,
  type NormalizedCodebook,
} from "../helpers/normalizeExtractedCodebook";

const MAX_CODEBOOK_TEXT_CHARACTERS = 120_000;

export const CODEBOOK_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    intention: { type: "string" },
    categories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          appliesToSpeaker: { type: "string" },
          condition: { type: "string" },
          codes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                code: { type: "string" },
                definition: { type: "string" },
                examples: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      example: { type: "string" },
                      exampleType: {
                        type: "string",
                        enum: ["HIT", "NEAR_HIT", "NEAR_MISS", "MISS"],
                      },
                    },
                    required: ["example", "exampleType"],
                  },
                },
              },
              required: ["code", "definition", "examples"],
            },
          },
        },
        required: ["name", "description", "codes"],
      },
    },
  },
  required: ["name", "intention", "categories"],
};

export const CODEBOOK_EXTRACTION_SYSTEM_PROMPT = `You are an expert qualitative researcher who turns human-written codebooks for tutoring transcripts into structured data.
- You will be given the full text of a codebook document. The text may come from a PDF, so line breaks and spacing can be messy.
- Return every annotation dimension as a category. A category is one thing an annotator labels on an utterance (for example "Student input type" or "Tutor answer leak").
- Within each category, return every code the annotator can choose. Use the code label exactly as the codebook writes it, without numbering or bullet characters.
- "definition": the codebook's definition and decision rules for that code, kept close to the original wording. Include rules about what does and does not count.
- "examples": quotes or examples from the codebook. Use HIT for clear examples of the code, NEAR_HIT for borderline examples that still count, NEAR_MISS for borderline examples that do not count, and MISS for clear non-examples. Never invent examples; return an empty array if the codebook has none.
- "appliesToSpeaker": if the category is only coded for one speaker (for example only student turns or only tutor turns), name that speaker. Otherwise return "All".
- "condition": if the category is only coded when another category has certain codes (for example "correctness" only when the student gives an answer), describe that rule. Otherwise return "".
- Do not add an "NA" / "not applicable" code yourself; it is added automatically for speaker-scoped and conditional categories.
- "name": a short name for the codebook. "intention": one or two sentences on what the codebook measures.
- Do not summarise away detail and do not add codes that are not in the document.`;

/**
 * Reads a codebook document and returns its structure (no database access).
 * Shared by importCodebookFromDocument and the local annotator agent script.
 */
export default async function extractCodebookFromDocument({
  fileName,
  buffer,
  teamId,
  userId,
}: {
  fileName: string;
  buffer: ArrayBuffer;
  teamId?: string;
  userId: string;
}): Promise<NormalizedCodebook> {
  const documentText = await extractCodebookDocumentText({ fileName, buffer });

  if (documentText.length > MAX_CODEBOOK_TEXT_CHARACTERS) {
    throw new Error(
      `Codebook text is too long (${documentText.length} characters). The limit is ${MAX_CODEBOOK_TEXT_CHARACTERS}.`,
    );
  }

  // Errors are passed through untouched; importCodebookFromDocument turns
  // them into user-facing messages. (handleLLMError is not imported here
  // because it needs Redis, and this file must also run without a server.)
  const llm = new LLM({
    model: getTaskModelCode("codebookImport"),
    team: teamId,
    userId,
    source: "codebook-document-import",
    sourceId: teamId ?? "local",
    billingEventId: `codebook-document-import:${teamId ?? "local"}:${Date.now()}`,
    schema: CODEBOOK_EXTRACTION_SCHEMA,
  });

  llm.addSystemMessage(CODEBOOK_EXTRACTION_SYSTEM_PROMPT, {});
  llm.addUserMessage(
    `File name: {{fileName}}\n\nCodebook document:\n{{documentText}}`,
    { fileName, documentText },
  );

  const extracted: ExtractedCodebook = await llm.createChat();

  const fallbackName = fileName.replace(/\.[^.]+$/, "") || "Imported codebook";
  const normalized = normalizeExtractedCodebook(extracted, fallbackName);

  if (normalized.categories.length === 0) {
    throw new Error(
      "No categories with codes were found in the codebook document.",
    );
  }

  return normalized;
}
