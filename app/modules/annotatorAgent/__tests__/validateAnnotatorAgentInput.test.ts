import { describe, expect, it } from "vitest";
import validateAnnotatorAgentInput from "../helpers/validateAnnotatorAgentInput";

const isKnownModel = (code: string) => code === "known-model";

describe("validateAnnotatorAgentInput", () => {
  it("accepts a codebook file request", () => {
    expect(
      validateAnnotatorAgentInput(
        {
          annotationType: "PER_UTTERANCE",
          modelCode: "known-model",
          codebookFileName: "STEPS.pdf",
        },
        isKnownModel,
      ),
    ).toEqual({});
  });

  it("accepts an existing codebook with session ids", () => {
    expect(
      validateAnnotatorAgentInput(
        {
          annotationType: "PER_SESSION",
          modelCode: "known-model",
          codebookId: "abc",
          sessionIds: ["s1", "s2"],
        },
        isKnownModel,
      ),
    ).toEqual({});
  });

  it("requires exactly one codebook source", () => {
    const base = { annotationType: "PER_UTTERANCE", modelCode: "known-model" };
    expect(
      validateAnnotatorAgentInput(base, isKnownModel).codebook,
    ).toBeDefined();
    expect(
      validateAnnotatorAgentInput(
        { ...base, codebookId: "abc", codebookFileName: "a.pdf" },
        isKnownModel,
      ).codebook,
    ).toBeDefined();
  });

  it("reports bad fields", () => {
    const errors = validateAnnotatorAgentInput(
      {
        annotationType: "PER_WORD",
        modelCode: "unknown",
        codebookFileName: "codebook.png",
        sessionIds: "s1",
        hasFlattenedCategories: true,
        flattenedAnnotationField: " ",
        runName: "ab",
      },
      isKnownModel,
    );
    expect(Object.keys(errors).sort()).toEqual([
      "annotationType",
      "codebook",
      "flattenedAnnotationField",
      "modelCode",
      "runName",
      "sessionIds",
    ]);
  });
});
