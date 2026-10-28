/**
 * Try the Annotator Agent on your laptop with only the AI keys in .env
 * (no database, login, Redis or workers).
 *
 *   yarn agent:local --codebook ~/Desktop/Steps/STEPS-Final-Codebook.pdf \
 *     --data ~/Desktop/Steps/Unannotated_Dataset.csv --sessions 2
 *
 * Steps (each writes files to --out, default tmp/annotator-agent):
 *   1. codebook.json / codebook.md  the codes read from your document
 *   2. prompt.md / schema.json      the generated annotation prompt
 *   3. annotated.csv                your rows plus ai_<field> columns
 *
 * Review loop: edit codebook.json, then rerun with --codebook-json to skip
 * step 1; edit prompt.md, then rerun with --prompt to skip step 2.
 */
import { parse } from "csv-parse/sync";
import fse from "fs-extra";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  buildSessionsFromCsvRows,
  type CsvRow,
  type LocalAnnotation,
  mergeAnnotationsIntoRows,
  toCsv,
} from "~/modules/annotatorAgent/helpers/localAnnotationHelpers";
import type { CodebookCategory } from "~/modules/codebooks/codebooks.types";
import {
  buildAnnotationSchemaFromCategories,
  buildCodebookSummary,
} from "~/modules/codebooks/helpers/buildCodebookSummary";
import type { NormalizedCodebook } from "~/modules/codebooks/helpers/normalizeExtractedCodebook";
import extractCodebookFromDocument from "~/modules/codebooks/services/extractCodebookFromDocument.server";
import generatePromptTextFromCodebook from "~/modules/codebooks/services/generatePromptTextFromCodebook.server";
import buildAnnotationSchema from "~/modules/llm/helpers/buildAnnotationSchema";
import LLM from "~/modules/llm/llm";
import { findModelByCode } from "~/modules/llm/modelRegistry";

const DEFAULT_MODEL = "nto.gemini-2.5-flash";
const USER_ID = "local-annotator-agent";

const expandHome = (filePath: string) =>
  filePath.startsWith("~/")
    ? path.join(os.homedir(), filePath.slice(2))
    : filePath;

function readFileAsArrayBuffer(filePath: string): ArrayBuffer {
  const buffer = fse.readFileSync(filePath);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function codebookToMarkdown(codebook: NormalizedCodebook): string {
  const lines = [`# ${codebook.name}`, "", codebook.intention, ""];
  for (const category of codebook.categories) {
    lines.push(`## ${category.name}`, "", category.description, "");
    for (const code of category.codes) {
      lines.push(`- **${code.code}**: ${code.definition}`);
      for (const example of code.examples) {
        lines.push(`  - ${example.exampleType}: "${example.example}"`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function confirm(question: string): Promise<boolean> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await readline.question(`${question} [y/N] `);
  readline.close();
  return answer.trim().toLowerCase().startsWith("y");
}

async function main() {
  const { values } = parseArgs({
    options: {
      codebook: { type: "string" },
      "codebook-json": { type: "string" },
      prompt: { type: "string" },
      data: { type: "string" },
      sessions: { type: "string", default: "2" },
      model: { type: "string", default: DEFAULT_MODEL },
      out: { type: "string", default: "tmp/annotator-agent" },
      yes: { type: "boolean", default: false },
    },
  });

  if (!values.codebook && !values["codebook-json"]) {
    throw new Error(
      "Pass --codebook <file.pdf|docx|txt|md> or --codebook-json <codebook.json>",
    );
  }
  if (!process.env.LLM_PROVIDER) {
    throw new Error(
      "LLM_PROVIDER is not set. Run this from the sandpiper folder with your .env.",
    );
  }

  const outDir = path.resolve(expandHome(values.out!));
  await fse.ensureDir(outDir);

  // 1. Codebook
  let codebook: NormalizedCodebook;
  if (values["codebook-json"]) {
    codebook = await fse.readJSON(expandHome(values["codebook-json"]));
    console.log(`1/3 Using reviewed codebook ${values["codebook-json"]}`);
  } else {
    const codebookPath = expandHome(values.codebook!);
    console.log(`1/3 Reading codebook ${codebookPath} (about a minute)...`);
    codebook = await extractCodebookFromDocument({
      fileName: path.basename(codebookPath),
      buffer: readFileAsArrayBuffer(codebookPath),
      userId: USER_ID,
    });
    await fse.writeJSON(path.join(outDir, "codebook.json"), codebook, {
      spaces: 2,
    });
    await fse.writeFile(
      path.join(outDir, "codebook.md"),
      codebookToMarkdown(codebook),
    );
  }
  const codeCount = codebook.categories.reduce(
    (total, category) => total + category.codes.length,
    0,
  );
  console.log(
    `    ${codebook.categories.length} categories, ${codeCount} codes${values["codebook-json"] ? "" : ` → ${path.join(outDir, "codebook.md")}`}`,
  );

  // 2. Prompt + schema
  const categories = codebook.categories as unknown as CodebookCategory[];
  const annotationSchema = buildAnnotationSchemaFromCategories(categories);
  let promptText: string;
  if (values.prompt) {
    promptText = await fse.readFile(expandHome(values.prompt), "utf-8");
    console.log(`2/3 Using reviewed prompt ${values.prompt}`);
  } else {
    console.log("2/3 Generating the annotation prompt...");
    promptText = await generatePromptTextFromCodebook({
      summary: buildCodebookSummary({
        codebookName: codebook.name,
        codebookDescription: codebook.intention,
        categories,
      }),
      userId: USER_ID,
      sourceId: "local",
      billingEventId: `local-prompt:${Date.now()}`,
    });
    await fse.writeFile(path.join(outDir, "prompt.md"), promptText);
    console.log(`    → ${path.join(outDir, "prompt.md")}`);
  }
  await fse.writeJSON(path.join(outDir, "schema.json"), annotationSchema, {
    spaces: 2,
  });

  if (!values.data) {
    console.log(
      "\nDone. Review codebook.md and prompt.md, then rerun with --data <file.csv> to annotate.",
    );
    return;
  }

  // 3. Annotate a sample
  if (!findModelByCode(values.model!)) {
    throw new Error(
      `Unknown model "${values.model}". See app/config/ai_gateway.json.`,
    );
  }
  const maxSessions = Math.max(1, Number(values.sessions) || 2);
  const rows = parse(await fse.readFile(expandHome(values.data), "utf-8"), {
    columns: true,
    skip_empty_lines: true,
  }) as CsvRow[];
  const sessions = buildSessionsFromCsvRows(rows, { maxSessions });
  const utteranceCount = sessions.reduce(
    (total, session) => total + session.transcript.length,
    0,
  );

  if (
    !values.yes &&
    !(await confirm(
      `\nReview the files above. Annotate ${sessions.length} sessions (${utteranceCount} utterances) with ${values.model}?`,
    ))
  ) {
    console.log("Stopped before annotating. Nothing was sent to the model.");
    return;
  }

  const systemPrompt = await fse.readFile(
    path.resolve("workers/prompts/annotatePerUtterance.prompt.md"),
    "utf-8",
  );
  const exampleAnnotation: Record<string, string> = {};
  for (const item of annotationSchema) {
    exampleAnnotation[item.fieldKey] = String(item.value ?? "");
  }
  const promptSchema = { annotations: [exampleAnnotation] };
  const responseSchema = buildAnnotationSchema(promptSchema, annotationSchema);
  const fieldKeys = annotationSchema
    .filter((item) => !item.isSystem)
    .map((item) => item.fieldKey);

  const outputRows: CsvRow[] = [];
  for (const [index, session] of sessions.entries()) {
    console.log(
      `3/3 Annotating session ${index + 1}/${sessions.length} (${session.sessionId}, ${session.transcript.length} utterances)...`,
    );
    const llm = new LLM({
      model: values.model!,
      userId: USER_ID,
      schema: responseSchema,
      source: "annotation:per-utterance",
      sourceId: session.sessionId,
      billingEventId: `local-annotation:${session.sessionId}:${Date.now()}`,
      timeout: 600_000,
    });
    llm.addSystemMessage(systemPrompt, {
      annotationSchema: JSON.stringify(promptSchema),
      leadRole: session.leadRole,
    });
    llm.addUserMessage(`${promptText}\n\nConversation: {{conversation}}`, {
      conversation: JSON.stringify({
        transcript: session.transcript,
        leadRole: session.leadRole,
      }),
    });

    const response = await llm.createChat();
    const annotations: LocalAnnotation[] = response?.annotations ?? [];
    outputRows.push(
      ...mergeAnnotationsIntoRows(session, annotations, fieldKeys),
    );
  }

  const outputPath = path.join(outDir, "annotated.csv");
  await fse.writeFile(outputPath, toCsv(outputRows));
  console.log(`\nDone → ${outputPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\nError: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
