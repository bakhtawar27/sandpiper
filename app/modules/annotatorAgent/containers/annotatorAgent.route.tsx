import { data } from "react-router";
import requireAuth from "~/modules/authentication/helpers/requireAuth";
import CodebookAuthorization from "~/modules/codebooks/authorization";
import { CodebookService } from "~/modules/codebooks/codebook";
import { codebookUrl } from "~/modules/codebooks/helpers/codebookUrls";
import { findModelByCode } from "~/modules/llm/modelRegistry";
import ProjectAuthorization from "~/modules/projects/authorization";
import { projectRunUrl } from "~/modules/projects/helpers/projectUrls";
import { ProjectService } from "~/modules/projects/project";
import type { RunAnnotationType } from "~/modules/runs/runs.types";
import parseAnnotatorAgentFormData from "../helpers/parseAnnotatorAgentFormData";
import validateAnnotatorAgentInput from "../helpers/validateAnnotatorAgentInput";
import runAnnotatorAgent, {
  AnnotatorAgentError,
} from "../services/runAnnotatorAgent.server";
import type { Route } from "./+types/annotatorAgent.route";

/**
 * POST /api/annotatorAgent (multipart/form-data)
 *
 * intent=IMPORT_CODEBOOK      teamId, codebookFile, codebookName?
 * intent=RUN_ANNOTATOR_AGENT  teamId, projectId, codebookFile | codebookId,
 *                             modelCode, annotationType?, sessionIds?, ...
 */
export async function action({ request }: Route.ActionArgs) {
  const user = await requireAuth({ request });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return data(
      { errors: { general: "Send the request as multipart/form-data" } },
      { status: 400 },
    );
  }

  const input = parseAnnotatorAgentFormData(formData);

  if (!input.teamId) {
    return data({ errors: { teamId: "teamId is required" } }, { status: 400 });
  }

  if (
    input.codebookFile &&
    !CodebookAuthorization.canCreate(user, input.teamId)
  ) {
    return data(
      {
        errors: {
          general:
            "You do not have permission to create codebooks in this team.",
        },
      },
      { status: 403 },
    );
  }

  switch (input.intent) {
    case "IMPORT_CODEBOOK": {
      if (!input.codebookFile) {
        return data(
          { errors: { codebook: "A codebook file is required" } },
          { status: 400 },
        );
      }

      try {
        const { codebook, codebookVersion } =
          await CodebookService.importFromDocument({
            fileName: input.codebookFile.name,
            buffer: await input.codebookFile.arrayBuffer(),
            name: input.codebookName,
            teamId: input.teamId,
            userId: user._id,
          });

        return data({
          intent: "IMPORT_CODEBOOK",
          data: {
            codebookId: codebook._id,
            codebookVersionId: codebookVersion._id,
            categoryCount: codebookVersion.categories.length,
            codeCount: codebookVersion.categories.reduce(
              (total, category) => total + category.codes.length,
              0,
            ),
            url: codebookUrl(
              input.teamId,
              codebook._id,
              codebookVersion.version,
            ),
          },
        });
      } catch (error) {
        return data(
          {
            errors: {
              codebook:
                error instanceof Error
                  ? error.message
                  : "Codebook import failed",
            },
          },
          { status: 422 },
        );
      }
    }

    case "RUN_ANNOTATOR_AGENT": {
      const errors = validateAnnotatorAgentInput(
        {
          annotationType: input.annotationType,
          modelCode: input.modelCode,
          codebookId: input.codebookId,
          codebookFileName: input.codebookFile?.name,
          sessionIds: input.sessionIds,
          hasFlattenedCategories: input.hasFlattenedCategories,
          flattenedAnnotationField: input.flattenedAnnotationField,
          runName: input.runName,
        },
        (modelCode) => !!findModelByCode(modelCode),
      );
      if (!input.projectId) errors.projectId = "projectId is required";
      if (Object.keys(errors).length > 0) {
        return data({ errors }, { status: 400 });
      }

      const project = await ProjectService.findOne({
        _id: input.projectId,
        team: input.teamId,
      });
      if (!project) {
        return data(
          { errors: { project: "Project not found" } },
          { status: 404 },
        );
      }
      if (!ProjectAuthorization.Runs.canManage(user, project)) {
        return data({ errors: { project: "Access denied" } }, { status: 403 });
      }

      try {
        const result = await runAnnotatorAgent({
          teamId: input.teamId,
          projectId: input.projectId,
          userId: user._id,
          codebookFile: input.codebookFile
            ? {
                fileName: input.codebookFile.name,
                buffer: await input.codebookFile.arrayBuffer(),
              }
            : undefined,
          codebookId: input.codebookId || undefined,
          codebookVersionId: input.codebookVersionId || undefined,
          codebookName: input.codebookName || undefined,
          annotationType: input.annotationType as RunAnnotationType,
          modelCode: input.modelCode,
          sessionIds: input.sessionIds as string[] | undefined,
          hasFlattenedCategories: input.hasFlattenedCategories,
          flattenedAnnotationField: input.flattenedAnnotationField,
          shouldRunVerification: input.shouldRunVerification,
          runName: input.runName,
        });

        return data({
          intent: "RUN_ANNOTATOR_AGENT",
          data: {
            ...result,
            runUrl: projectRunUrl(input.teamId, input.projectId, result.runId),
            codebookUrl: codebookUrl(input.teamId, result.codebookId),
          },
        });
      } catch (error) {
        if (error instanceof AnnotatorAgentError) {
          return data(
            { errors: { [error.step]: error.message } },
            { status: error.status },
          );
        }
        throw error;
      }
    }

    default:
      return data({ errors: { general: "Invalid intent" } }, { status: 400 });
  }
}
