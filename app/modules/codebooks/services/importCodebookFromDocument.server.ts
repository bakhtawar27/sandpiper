import handleLLMError from "~/modules/llm/helpers/handleLLMError";
import { CodebookService } from "../codebook";
import { CodebookVersionService } from "../codebookVersion";
import type { Codebook, CodebookVersion } from "../codebooks.types";
import extractCodebookFromDocument from "./extractCodebookFromDocument.server";

export interface ImportCodebookFromDocumentResult {
  codebook: Codebook;
  codebookVersion: CodebookVersion;
}

/**
 * Reads a codebook document and saves it as a new codebook (version 1,
 * production) in the team.
 */
export default async function importCodebookFromDocument({
  fileName,
  buffer,
  name,
  teamId,
  userId,
}: {
  fileName: string;
  buffer: ArrayBuffer;
  name?: string;
  teamId: string;
  userId: string;
}): Promise<ImportCodebookFromDocumentResult> {
  let normalized;
  try {
    normalized = await extractCodebookFromDocument({
      fileName,
      buffer,
      teamId,
      userId,
    });
  } catch (error) {
    throw new Error(handleLLMError(error), { cause: error });
  }

  const codebook = await CodebookService.create({
    name: name?.trim() || normalized.name,
    description: normalized.intention,
    team: teamId,
    productionVersion: 1,
    createdBy: userId,
  });

  const codebookVersion = await CodebookVersionService.create({
    name: `imported from ${fileName}`,
    codebook: codebook._id,
    version: 1,
    hasBeenSaved: true,
    // Subdocument _ids are created by mongoose.
    categories:
      normalized.categories as unknown as CodebookVersion["categories"],
  });

  return { codebook, codebookVersion };
}
