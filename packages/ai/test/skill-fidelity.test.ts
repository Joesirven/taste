import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assertSkillFidelity,
  notesEvidenceFrostOverlay,
} from "../src/eval/skill-fidelity";

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/frost-overlay",
);

function loadFixture(name: string): string {
  return readFileSync(path.join(fixtureDir, name), "utf8");
}

describe("assertSkillFidelity", () => {
  it("fails the known-bad frost skill excerpt when frost overlays are evidenced", () => {
    const skill = loadFixture("bad-skill-excerpt.md");
    const result = assertSkillFidelity(skill, { frostOverlayEvidenced: true });

    expect(result.ok).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.some((reason) => /undifferentiated|positive matte|circle-overlap/i.test(reason))).toBe(
      true,
    );
  });

  it("passes a good skill excerpt that splits glossy bans from matte frost", () => {
    const skill = loadFixture("good-skill-excerpt.md");
    const result = assertSkillFidelity(skill, { frostOverlayEvidenced: true });

    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("no-ops when frost overlays are not evidenced", () => {
    const skill = [
      "# editorial",
      "Use large serif headlines and generous margins.",
      "Avoid glassmorphism and transparent glass cards.",
    ].join("\n");

    const result = assertSkillFidelity(skill, { frostOverlayEvidenced: false });
    expect(result.ok).toBe(true);
  });

  it("fails safely on empty skill text", () => {
    const result = assertSkillFidelity("   ", { frostOverlayEvidenced: true });
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toMatch(/empty/i);
  });
});

describe("notesEvidenceFrostOverlay", () => {
  it("detects frosted overlay-over-imagery language in note fixtures", () => {
    const notes = loadFixture("note-excerpts.md");
    expect(notesEvidenceFrostOverlay(notes)).toBe(true);
  });

  it("returns false for empty notes", () => {
    expect(notesEvidenceFrostOverlay("")).toBe(false);
  });
});
