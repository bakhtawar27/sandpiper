import LLM from "~/modules/llm/llm";
import { getTaskModelCode } from "~/modules/llm/modelRegistry";

/**
 * Asks an LLM to write the annotation prompt for a codebook summary
 * (see buildCodebookSummary). Shared by createPromptFromCodebook and the
 * local annotator agent script.
 */
export default async function generatePromptTextFromCodebook({
  summary,
  flattenedAnnotationField,
  teamId,
  userId,
  sourceId,
  billingEventId,
}: {
  summary: string;
  flattenedAnnotationField?: string;
  teamId?: string;
  userId: string;
  sourceId: string;
  billingEventId: string;
}): Promise<string> {
  const schema = {
    type: "object",
    properties: {
      prompt: { type: "string" },
    },
    required: ["prompt"],
  };

  const llm = new LLM({
    model: getTaskModelCode("codebookImport"),
    team: teamId,
    userId,
    source: "codebook-prompt-generation",
    sourceId,
    billingEventId,
    schema,
  });

  const flatteningInstruction = flattenedAnnotationField
    ? `\n    - IMPORTANT: All categories have been flattened into a single annotation field called "${flattenedAnnotationField}". The prompt should instruct the LLM to use this single field for its annotation, choosing from the combined codes of all categories. Do not reference individual category field names.`
    : "";

  llm.addSystemMessage(
    `You are an expert at writing LLM annotation prompts for analysing tutoring transcripts.
    - You will be given a codebook summary containing categories, codes, definitions, and examples.
    - Your task is to write a clear, detailed prompt that an LLM can use to annotate transcripts according to the codebook.
    - The prompt should instruct the LLM to classify each annotation field using the codes defined in the codebook.
    - Include the code definitions and examples from the codebook so the LLM understands each code.
    - Do not include any JSON schema or output format instructions — those are handled separately.${flatteningInstruction}`,
    {},
  );

  llm.addUserMessage(`Codebook summary:\n{{summary}}`, {
    summary,
  });

  const response = await llm.createChat();
  return response.prompt;
}
