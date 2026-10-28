import type { CodebookExample } from "../codebooks.types";

type ExampleType = CodebookExample["exampleType"];

const EXAMPLE_TYPES: ExampleType[] = ["HIT", "NEAR_HIT", "NEAR_MISS", "MISS"];

export interface ExtractedCodebookExample {
  example?: unknown;
  exampleType?: unknown;
}

export interface ExtractedCodebookCode {
  code?: unknown;
  definition?: unknown;
  examples?: unknown;
}

export interface ExtractedCodebookCategory {
  name?: unknown;
  description?: unknown;
  appliesToSpeaker?: unknown;
  condition?: unknown;
  codes?: unknown;
}

export interface ExtractedCodebook {
  name?: unknown;
  intention?: unknown;
  categories?: unknown;
}

export interface NormalizedCodebookCategory {
  name: string;
  description: string;
  codes: {
    code: string;
    description: string;
    definition: string;
    examples: { example: string; exampleType: ExampleType }[];
  }[];
}

export interface NormalizedCodebook {
  name: string;
  intention: string;
  categories: NormalizedCodebookCategory[];
}

const MAX_TEXT_LENGTH = 4000;

function toCleanString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toExampleType(value: unknown): ExampleType {
  const normalized = toCleanString(value)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return (EXAMPLE_TYPES as string[]).includes(normalized)
    ? (normalized as ExampleType)
    : "HIT";
}

/**
 * Folds speaker scoping and conditional rules into the category description,
 * so the existing codebook → prompt generator passes them to the LLM without
 * a schema change.
 */
export function buildCategoryDescription(
  category: ExtractedCodebookCategory,
): string {
  const parts: string[] = [];
  const description = toCleanString(category.description);
  const speaker = toCleanString(category.appliesToSpeaker);
  const condition = toCleanString(category.condition);

  if (description) parts.push(description);
  if (speaker && !/^(all|any|both|everyone)$/i.test(speaker)) {
    parts.push(
      `Applies to: ${speaker} utterances only. Leave this field empty for other speakers.`,
    );
  }
  if (condition) {
    parts.push(
      `Only code this when: ${condition}. Otherwise leave this field empty.`,
    );
  }

  return parts.join("\n");
}

/**
 * Cleans the raw JSON an LLM returns when reading a codebook document:
 * trims text, drops empty categories/codes/examples, removes duplicate codes
 * (case-insensitive) and maps unknown example types to HIT.
 */
export default function normalizeExtractedCodebook(
  raw: ExtractedCodebook,
  fallbackName = "Imported codebook",
): NormalizedCodebook {
  const usedCategoryNames = new Set<string>();
  const categories: NormalizedCodebookCategory[] = [];

  for (const rawCategory of toArray(raw?.categories)) {
    const category = (rawCategory ?? {}) as ExtractedCodebookCategory;
    const name = toCleanString(category.name);
    if (!name || usedCategoryNames.has(name.toLowerCase())) continue;

    const usedCodes = new Set<string>();
    const codes: NormalizedCodebookCategory["codes"] = [];

    for (const rawCode of toArray(category.codes)) {
      const code = (rawCode ?? {}) as ExtractedCodebookCode;
      const label = toCleanString(code.code);
      if (!label || usedCodes.has(label.toLowerCase())) continue;
      usedCodes.add(label.toLowerCase());

      const examples = toArray(code.examples)
        .map((rawExample) => {
          const example = (rawExample ?? {}) as ExtractedCodebookExample;
          return {
            example: toCleanString(example.example),
            exampleType: toExampleType(example.exampleType),
          };
        })
        .filter((example) => example.example.length > 0);

      codes.push({
        code: label,
        description: "",
        definition: toCleanString(code.definition),
        examples,
      });
    }

    if (codes.length === 0) continue;
    usedCategoryNames.add(name.toLowerCase());

    categories.push({
      name,
      description: buildCategoryDescription(category),
      codes,
    });
  }

  return {
    name: toCleanString(raw?.name) || fallbackName,
    intention: toCleanString(raw?.intention),
    categories,
  };
}
