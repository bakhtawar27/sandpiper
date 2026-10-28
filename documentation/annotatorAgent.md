---
title: "Annotator Agent"
tags: ["codebooks", "prompts", "runs", "agent"]
category: "Analysis"
isPublished: false
---

# Annotator Agent

## Overview

The **Annotator Agent** takes a codebook document and a project's sessions and starts an annotation run, with no manual prompt writing. One request does four steps:

1. **Import the codebook.** The document (PDF, DOCX, TXT, MD, CSV or JSON) is read and an LLM extracts its categories, codes, definitions and examples into a new **Codebook** (version 1, marked production). Speaker rules ("student turns only") and conditional rules ("only code correctness when the student gives an answer") are kept in each category's description.
2. **Generate the prompt.** The existing codebook → prompt generator writes the annotation prompt and builds the **Schema**: one field per category, its codes as allowed values.
3. **Check credits.** Sessions are selected, the cost is estimated, and the request stops if the team balance is too low. The codebook and prompt are kept, so a run can be started later.
4. **Start the run.** A normal **Run** is created and started, so progress, results, exports, **Run Sets** and **Evaluations** work as usual.

You can also use an existing codebook (`codebookId`) and skip step 1.

## How to use

### Import a codebook from a file (UI)

1. Open **Codebooks** in the sidebar (requires the `HAS_CODEBOOKS` feature flag).
2. Click **"Import from file"**, choose the document, and optionally give it a name.
3. When the import finishes, the codebook editor opens. Review the codes before generating a prompt; LLM extraction can miss or merge codes.

### Run the whole agent (API)

`POST /api/annotatorAgent` as `multipart/form-data`. The request uses your logged-in session cookie (API keys are not supported yet).

| Field                                                | Required    | Notes                                                                 |
| ---------------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| `intent`                                             | yes         | `RUN_ANNOTATOR_AGENT` (or `IMPORT_CODEBOOK` to only import)           |
| `teamId`                                             | yes         |                                                                       |
| `projectId`                                          | yes         | The project must already contain the uploaded dataset as sessions     |
| `codebookFile` or `codebookId`                       | one of them | Uploading a file requires team admin rights, like creating a codebook |
| `codebookVersionId`                                  | no          | Defaults to the codebook's production version                         |
| `modelCode`                                          | yes         | A model code from `app/config/ai_gateway.json`                        |
| `annotationType`                                     | no          | `PER_UTTERANCE` (default) or `PER_SESSION`                            |
| `sessionIds`                                         | no          | JSON array or repeated fields; defaults to all converted sessions     |
| `hasFlattenedCategories`, `flattenedAnnotationField` | no          | Put all codes in one field                                            |
| `shouldRunVerification`                              | no          | `true` to add the verification pass                                   |
| `runName`, `codebookName`                            | no          |                                                                       |

The response contains `codebookId`, `promptId`, `runId`, `runUrl`, `sessionCount`, `estimatedCost` and the completed `steps`. Errors return the failed step, e.g. `{ "errors": { "CHECK_CREDITS": "Insufficient credits…" } }` with status 402.

Example:

```bash
curl -X POST https://<sandpiper-host>/api/annotatorAgent \
  -H "Cookie: <your session cookie>" \
  -F intent=RUN_ANNOTATOR_AGENT \
  -F teamId=<team id> -F projectId=<project id> \
  -F modelCode=<model code> \
  -F codebookFile=@STEPS-Final-Codebook.pdf
```

## Code

| Piece                                                 | File                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Text extraction (PDF via `unpdf`, DOCX via `mammoth`) | `app/modules/codebooks/helpers/extractCodebookDocumentText.server.ts`                      |
| Cleaning LLM output                                   | `app/modules/codebooks/helpers/normalizeExtractedCodebook.ts`                              |
| Codebook import service                               | `app/modules/codebooks/services/importCodebookFromDocument.server.ts`                      |
| Agent orchestration                                   | `app/modules/annotatorAgent/services/runAnnotatorAgent.server.ts`                          |
| API route                                             | `app/modules/annotatorAgent/containers/annotatorAgent.route.tsx`                           |
| Import dialog                                         | `app/modules/codebooks/components/importCodebookDialog.tsx`, `hooks/useImportCodebook.tsx` |

LLM usage is billed to the team under the new cost source `codebook-document-import`, using the `codebookImport` task model.

## Not built yet

- Refinement loop: evaluate against human labels and rewrite the prompt.
- Flagging borderline utterances for expert review.
- API keys, so the agent can be called without logging in.
- Structured `speaker` / `dependsOn` schema fields (today these rules live in the category description).

## Related Concepts

- **[Codebooks](codebooks)**
- **[Prompts](prompts)**
- **[Runs](runs)**
- **[Evaluations](evaluations)**
