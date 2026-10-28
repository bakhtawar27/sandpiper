import { describe, expect, it } from "vitest";
import parseAnnotatorAgentFormData from "../helpers/parseAnnotatorAgentFormData";

describe("parseAnnotatorAgentFormData", () => {
  it("reads fields, booleans, the file and a JSON list of sessions", () => {
    const formData = new FormData();
    formData.append("intent", "RUN_ANNOTATOR_AGENT");
    formData.append("teamId", " team1 ");
    formData.append("projectId", "project1");
    formData.append("modelCode", "model");
    formData.append("sessionIds", '["s1","s2"]');
    formData.append("hasFlattenedCategories", "true");
    formData.append("shouldRunVerification", "on");
    formData.append(
      "codebookFile",
      new File(["codebook text"], "codebook.txt", { type: "text/plain" }),
    );

    const parsed = parseAnnotatorAgentFormData(formData);

    expect(parsed.intent).toBe("RUN_ANNOTATOR_AGENT");
    expect(parsed.teamId).toBe("team1");
    expect(parsed.annotationType).toBe("PER_UTTERANCE");
    expect(parsed.sessionIds).toEqual(["s1", "s2"]);
    expect(parsed.hasFlattenedCategories).toBe(true);
    expect(parsed.shouldRunVerification).toBe(true);
    expect(parsed.codebookFile?.name).toBe("codebook.txt");
    expect(parsed.runName).toBeUndefined();
  });

  it("accepts repeated session fields and ignores empty files", () => {
    const formData = new FormData();
    formData.append("sessionIds", "s1");
    formData.append("sessionIds", "s2");
    formData.append("codebookFile", new File([], "empty.pdf"));

    const parsed = parseAnnotatorAgentFormData(formData);

    expect(parsed.sessionIds).toEqual(["s1", "s2"]);
    expect(parsed.codebookFile).toBeNull();
    expect(parsed.hasFlattenedCategories).toBe(false);
  });
});
