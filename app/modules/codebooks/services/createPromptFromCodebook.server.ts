import type { AnnotationTypeOptions } from "~/modules/annotations/helpers/annotationTypes";
import handleLLMError from "~/modules/llm/helpers/handleLLMError";
import { PromptService } from "~/modules/prompts/prompt";
import { PromptVersionService } from "~/modules/prompts/promptVersion";
import { CodebookService } from "../codebook";
import { CodebookVersionService } from "../codebookVersion";
import {
  buildAnnotationSchemaFromCategories,
  buildCodebookSummary,
} from "../helpers/buildCodebookSummary";
import generatePromptTextFromCodebook from "./generatePromptTextFromCodebook.server";

export default async function createPromptFromCodebook({
  codebookId,
  codebookVersionId,
  annotationType,
  categoryIds,
  hasFlattenedCategories,
  flattenedAnnotationField,
  userId,
  teamId,
}: {
  codebookId: string;
  codebookVersionId: string;
  annotationType: AnnotationTypeOptions;
  categoryIds?: string[];
  hasFlattenedCategories?: boolean;
  flattenedAnnotationField?: string;
  userId: string;
  teamId: string;
}) {
  const codebook = await CodebookService.findById(codebookId);
  if (!codebook) {
    throw new Error("Codebook not found");
  }

  const codebookVersion = await CodebookVersionService.findOne({
    _id: codebookVersionId,
    codebook: codebookId,
  });
  if (!codebookVersion) {
    throw new Error("Codebook version not found");
  }

  const categories =
    categoryIds && categoryIds.length > 0
      ? codebookVersion.categories.filter((c) => categoryIds.includes(c._id))
      : codebookVersion.categories;

  const summary = buildCodebookSummary({
    codebookName: codebook.name,
    codebookDescription: codebook.description,
    categories,
  });

  const annotationSchema = buildAnnotationSchemaFromCategories(
    categories,
    hasFlattenedCategories
      ? { flattenedFieldKey: flattenedAnnotationField }
      : undefined,
  );

  let userPrompt: string;

  try {
    userPrompt = await generatePromptTextFromCodebook({
      summary,
      flattenedAnnotationField: hasFlattenedCategories
        ? flattenedAnnotationField
        : undefined,
      teamId,
      userId,
      sourceId: codebookId,
      billingEventId: `codebook-prompt-generation:${codebookVersionId}`,
    });
  } catch (error) {
    const errorMessage = handleLLMError(error);
    throw new Error(errorMessage, { cause: error });
  }

  const prompt = await PromptService.create({
    name: codebook.name,
    annotationType,
    team: teamId,
    productionVersion: 1,
    createdBy: userId,
  });

  await PromptVersionService.create({
    name: "initial",
    prompt: prompt._id,
    version: 1,
    userPrompt,
    annotationSchema,
    codebook: codebookId,
    codebookVersion: codebookVersionId,
  });

  return prompt;
}
