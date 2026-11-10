import { describe, expect, it } from "vitest";
import { entities, tokenize } from "./similarity";

describe("tokenize", () => {
  it("drops every form of a filler word, not just the listed one", () => {
    expect(tokenize("Release notes: updated and released")).toEqual(["note"]);
  });
  it("keeps a hyphenated version with its name", () => {
    expect(tokenize("OpenAI releases GPT-5")).toEqual(["openai", "gpt5"]);
    expect(entities("OpenAI releases GPT-5").has("gpt5")).toBe(true);
  });
});

describe("stem", () => {
  it("gives every form of a word one stem", async () => {
    const { stem } = await import("./similarity");
    for (const group of [
      ["release", "releases", "released"],
      ["update", "updates", "updated"],
      ["launch", "launches", "launched"],
      ["note", "notes"],
      ["company", "companies"],
    ]) {
      expect(new Set(group.map(stem)).size).toBe(1);
    }
  });
  it("keeps different words apart", async () => {
    const { stem } = await import("./similarity");
    expect(stem("connecting")).not.toBe(stem("connectivity"));
    expect(stem("news")).toBe("news");
  });
});
