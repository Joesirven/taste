import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DEFAULT_SKILL_DESCRIPTION } from "../src/config";
import { assertSkillFidelity } from "../src/eval/skill-fidelity";
import {
  parseSkillGenerationOutput,
  parseSkillReviewOutput,
  reviewAndCorrectSkill,
} from "../src/pipeline";

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/frost-overlay",
);

function loadFixture(name: string): string {
  return readFileSync(path.join(fixtureDir, name), "utf8");
}

describe("parseSkillGenerationOutput", () => {
  it("extracts a generated description and skill body from tagged output", () => {
    const parsed = parseSkillGenerationOutput(`
<skill-description>
"Saturated DIY poster rules with crude display type and rough print texture."
</skill-description>

<skill-body>
# bar-part-time

## Core directive
Use loud color and visible print wear.
</skill-body>
`);

    expect(parsed.description).toBe(
      "Saturated DIY poster rules with crude display type and rough print texture.",
    );
    expect(parsed.usedFallbackDescription).toBe(false);
    expect(parsed.body).toContain("# bar-part-time");
    expect(parsed.body).toContain("Use loud color");
    expect(parsed.body).not.toContain("<skill-body>");
  });

  it("falls back to a generic description when the generated description is unsafe", () => {
    const parsed = parseSkillGenerationOutput(`
<skill-description>
---
</skill-description>

<skill-body>
# taste
</skill-body>
`);

    expect(parsed.description).toBe(DEFAULT_SKILL_DESCRIPTION);
    expect(parsed.usedFallbackDescription).toBe(true);
    expect(parsed.body).toBe("# taste");
  });

  it("keeps untagged markdown as the body if a model misses the body tag", () => {
    const parsed = parseSkillGenerationOutput(`
<skill-description>Sharp black-and-white rules for dense typographic posters.</skill-description>

# taste

## Visual grammar
Use extreme value contrast.
`);

    expect(parsed.description).toBe("Sharp black-and-white rules for dense typographic posters.");
    expect(parsed.body).toContain("# taste");
    expect(parsed.body).toContain("Use extreme value contrast.");
    expect(parsed.body).not.toContain("<skill-description>");
  });
});

describe("parseSkillReviewOutput", () => {
  it("extracts changelog and corrected body", () => {
    const parsed = parseSkillReviewOutput(`
<review-changelog>
Added matte frost recipe.
</review-changelog>
<skill-body>
# corrected
</skill-body>
`);
    expect(parsed.changelog).toBe("Added matte frost recipe.");
    expect(parsed.body).toBe("# corrected");
  });
});

describe("reviewAndCorrectSkill", () => {
  it("no-ops when the draft already passes frost fidelity", async () => {
    const good = loadFixture("good-skill-excerpt.md");
    const notes = loadFixture("note-excerpts.md");
    let called = false;

    const result = await reviewAndCorrectSkill({
      model: "openai/gpt-5.5",
      draftSkill: good,
      synthesizedNotes: notes,
      frostOverlayEvidenced: true,
      generateText: async () => {
        called = true;
        return {
          text: "",
          model: "openai/gpt-5.5",
          usage: { inputTokens: null, outputTokens: null, totalTokens: null },
        };
      },
    });

    expect(called).toBe(false);
    expect(result.corrected).toBe(false);
    expect(result.text).toBe(good);
  });

  it("applies a stubbed correction that passes fidelity predicates", async () => {
    const bad = loadFixture("bad-skill-excerpt.md");
    const good = loadFixture("good-skill-excerpt.md");
    const notes = loadFixture("note-excerpts.md");

    const result = await reviewAndCorrectSkill({
      model: "openai/gpt-5.5",
      draftSkill: `---\nname: "frost"\ndescription: "test"\n---\n${bad}`,
      synthesizedNotes: notes,
      frostOverlayEvidenced: true,
      generateText: async () => ({
        text: `
<review-changelog>
Split glossy ban from matte frost overlays.
</review-changelog>
<skill-body>
${good}
</skill-body>
`,
        model: "openai/gpt-5.5",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      }),
    });

    expect(result.corrected).toBe(true);
    expect(result.changelog).toMatch(/matte frost/i);
    expect(result.fidelityReasons.length).toBeGreaterThan(0);
    expect(assertSkillFidelity(result.text, { frostOverlayEvidenced: true }).ok).toBe(true);
    expect(result.text).toContain('name: "frost"');
    expect(result.text).toContain("matte frosted overlays");
  });
});
