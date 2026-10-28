import { TeamBillingService } from "~/modules/billing/teamBilling";
import { CodebookService } from "~/modules/codebooks/codebook";
import { CodebookVersionService } from "~/modules/codebooks/codebookVersion";
import type {
  Codebook,
  CodebookVersion,
} from "~/modules/codebooks/codebooks.types";
import { ProjectService } from "~/modules/projects/project";
import { RunService } from "~/modules/runs/run";
import { SessionService } from "~/modules/sessions/session";
import type {
  AnnotatorAgentStep,
  RunAnnotatorAgentInput,
  RunAnnotatorAgentResult,
} from "../annotatorAgent.types";

export class AnnotatorAgentError extends Error {
  status: number;
  step: AnnotatorAgentStep;

  constructor(message: string, step: AnnotatorAgentStep, status = 400) {
    super(message);
    this.name = "AnnotatorAgentError";
    this.step = step;
    this.status = status;
  }
}

const getId = (value: { _id: string } | string): string =>
  typeof value === "string" ? value : value._id;

async function resolveCodebook(
  input: RunAnnotatorAgentInput,
): Promise<{ codebook: Codebook; codebookVersion: CodebookVersion }> {
  if (input.codebookFile) {
    try {
      return await CodebookService.importFromDocument({
        fileName: input.codebookFile.fileName,
        buffer: input.codebookFile.buffer,
        name: input.codebookName,
        teamId: input.teamId,
        userId: input.userId,
      });
    } catch (error) {
      throw new AnnotatorAgentError(
        error instanceof Error ? error.message : "Codebook import failed",
        "IMPORT_CODEBOOK",
        422,
      );
    }
  }

  const codebook = await CodebookService.findOne({
    _id: input.codebookId,
    team: input.teamId,
    deletedAt: { $exists: false },
  });
  if (!codebook) {
    throw new AnnotatorAgentError("Codebook not found", "IMPORT_CODEBOOK", 404);
  }

  const codebookVersion = await CodebookVersionService.findOne(
    input.codebookVersionId
      ? { _id: input.codebookVersionId, codebook: codebook._id }
      : { codebook: codebook._id, version: codebook.productionVersion },
  );
  if (!codebookVersion) {
    throw new AnnotatorAgentError(
      "Codebook version not found",
      "IMPORT_CODEBOOK",
      404,
    );
  }

  return { codebook, codebookVersion };
}

/**
 * The Annotator Agent: codebook (document or existing) → generated prompt →
 * annotation run over the project's sessions. One call does all of it.
 *
 * Authorization is the caller's job (see annotatorAgent.route.tsx).
 */
export default async function runAnnotatorAgent(
  input: RunAnnotatorAgentInput,
): Promise<RunAnnotatorAgentResult> {
  const steps: AnnotatorAgentStep[] = [];

  const project = await ProjectService.findOne({
    _id: input.projectId,
    team: input.teamId,
  });
  if (!project) {
    throw new AnnotatorAgentError("Project not found", "SELECT_SESSIONS", 404);
  }

  // Pick sessions before spending credits on the codebook and prompt LLM calls.
  const projectSessions = await SessionService.find({
    match: {
      project: input.projectId,
      hasConverted: true,
      hasErrored: { $ne: true },
      ...(input.sessionIds?.length ? { _id: { $in: input.sessionIds } } : {}),
    },
    select: "_id",
  });
  const sessionIds = projectSessions.map((session) => session._id);
  if (sessionIds.length === 0) {
    throw new AnnotatorAgentError(
      "No converted sessions found in this project. Upload the dataset first.",
      "SELECT_SESSIONS",
      400,
    );
  }
  steps.push("SELECT_SESSIONS");

  // 1. Codebook
  const { codebook, codebookVersion } = await resolveCodebook(input);
  steps.push("IMPORT_CODEBOOK");

  // 2. Prompt + annotation schema from the codebook
  let promptId: string;
  try {
    const prompt = await CodebookService.createPromptFromCodebook({
      codebookId: codebook._id,
      codebookVersionId: codebookVersion._id,
      annotationType: input.annotationType,
      hasFlattenedCategories: !!input.hasFlattenedCategories,
      flattenedAnnotationField: input.flattenedAnnotationField,
      userId: input.userId,
      teamId: input.teamId,
    });
    promptId = prompt._id;
  } catch (error) {
    throw new AnnotatorAgentError(
      error instanceof Error ? error.message : "Prompt generation failed",
      "GENERATE_PROMPT",
      422,
    );
  }
  const promptVersion = 1;
  steps.push("GENERATE_PROMPT");

  // 3. Credits
  const teamId = getId(project.team);
  const [balance, estimate] = await Promise.all([
    TeamBillingService.getBalance(teamId),
    TeamBillingService.estimateCost({
      teamId,
      projectId: input.projectId,
      sessionIds,
      definitions: [
        {
          key: `${promptId}:${promptVersion}:${input.modelCode}`,
          modelCode: input.modelCode,
          prompt: {
            promptId,
            promptName: codebook.name,
            version: promptVersion,
          },
        },
      ],
      shouldRunVerification: !!input.shouldRunVerification,
    }),
  ]);
  if (estimate.estimatedCost > balance) {
    throw new AnnotatorAgentError(
      "Insufficient credits to start the annotation run. The codebook and prompt were saved; top up and start a run from the prompt.",
      "CHECK_CREDITS",
      402,
    );
  }
  steps.push("CHECK_CREDITS");

  // 4. Run
  const run = await RunService.create({
    project: input.projectId,
    name: input.runName?.trim() || `${codebook.name} (annotator agent)`,
    sessions: sessionIds,
    annotationType: input.annotationType,
    prompt: promptId,
    promptVersion,
    modelCode: input.modelCode,
    shouldRunVerification: !!input.shouldRunVerification,
    createdBy: input.userId,
  });
  await RunService.start(run, undefined, input.userId);
  steps.push("START_RUN");

  return {
    codebookId: codebook._id,
    codebookVersionId: codebookVersion._id,
    promptId,
    promptVersion,
    runId: run._id,
    sessionCount: sessionIds.length,
    estimatedCost: estimate.estimatedCost,
    steps,
  };
}
