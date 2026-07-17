import { describe, expect, it } from "vitest";

import {
  buildAnalysisPrompt,
  buildChunkPrompt,
  buildRuleSetPrompt,
  buildSkillPrompt,
  buildSkillReviewPrompt,
  buildSynthesisPrompt,
} from "../src/prompts";

const image = {
  id: "img_0001",
  basename: "reference.png",
  width: 800,
  height: 600,
};

const hardCodedBiasPhrases = [
  "restrained neutral",
  "pale neutral",
  "neutral sans",
  "soft shadows",
  "minimal borders",
  "beige luxury",
  "terracotta",
  "generic equal-card",
  "content neutrality",
  "anti-collapse",
  "Make sans-serif",
  "Serif display type",
];

describe("buildSynthesisPrompt", () => {
  it("anonymizes source model labels and raw artifact frontmatter", () => {
    const prompt = buildSynthesisPrompt({
      image,
      analyses: [
        {
          model: "openai/gpt-5.5",
          text: [
            "---",
            'model: "openai/gpt-5.5"',
            'proxyProvider: "openai"',
            "---",
            "",
            "Strong grid analysis from gpt-5.5.",
          ].join("\n"),
        },
        {
          model: "anthropic/claude-opus-4-1",
          text: [
            "---",
            'model: "anthropic/claude-opus-4-1"',
            'proxyProvider: "anthropic"',
            "---",
            "",
            "Strong spacing analysis from Claude Opus 4 1.",
          ].join("\n"),
        },
      ],
    });

    expect(prompt).toContain("Analysis 1:");
    expect(prompt).toContain("Analysis 2:");
    expect(prompt).toContain("Strong grid analysis from [redacted].");
    expect(prompt).toContain("Strong spacing analysis from [redacted].");
    expect(prompt).not.toContain("openai/gpt-5.5");
    expect(prompt).not.toContain("gpt-5.5");
    expect(prompt).not.toContain("anthropic/claude-opus-4-1");
    expect(prompt).not.toContain("claude-opus-4-1");
    expect(prompt).not.toContain("Claude Opus 4 1");
    expect(prompt).not.toContain("proxyProvider");
  });

  it("requires preserving minority frosted-overlay material recipes", () => {
    const prompt = buildSynthesisPrompt({
      image,
      analyses: [{ text: "Matte frost over photo." }],
    });

    expect(prompt).toContain("Material / depth adjudication");
    expect(prompt).toContain("frosted or translucent overlays");
    expect(prompt).toContain("avoid glassmorphism");
    expect(prompt).toContain("Prefer the analysis that cites the substrate");
  });
});

describe("taste-agnostic prompt defaults", () => {
  it("does not frame arbitrary references as UI screenshots", () => {
    const prompt = buildAnalysisPrompt(image);

    expect(prompt).toContain("visual reference image");
    expect(prompt).not.toContain("UI/interface");
    expect(prompt).not.toContain("screenshot");
    expect(prompt).not.toContain("UI chrome");
  });

  it("requires a material recipe for overlays on imagery", () => {
    const prompt = buildAnalysisPrompt(image);

    expect(prompt).toContain("Material recipe");
    expect(prompt).toContain("Gloss vs matte");
    expect(prompt).toContain("glossy reflective glass");
    expect(prompt).toContain("matte frosted overlays");
  });

  it("allows evidence-backed aesthetic categories instead of banning them", () => {
    const prompt = buildChunkPrompt({
      id: "chunk_01",
      notes: [
        {
          imageId: "img_0001",
          file: "img_0001.md",
          text: "Oversized serif lettering, atmospheric crops, editorial layout, and fashion imagery.",
        },
      ],
    });

    expect(prompt).toContain("DO preserve descriptive aesthetic labels");
    expect(prompt).toContain("editorial");
    expect(prompt).toContain("atmospheric");
    expect(prompt).toContain("fashion");
    expect(prompt).toContain("serif");
    expect(prompt).not.toContain("fashion/luxury/serif");
    expect(prompt).not.toContain("serif/beige");
  });

  it("splits glossy glass bans from matte frost in chunk prompts", () => {
    const prompt = buildChunkPrompt({
      id: "chunk_01",
      notes: [
        {
          imageId: "img_0001",
          file: "img_0001.md",
          text: "Frosted chips over photography.",
        },
      ],
    });

    expect(prompt).toContain("Material ban split");
    expect(prompt).toContain("glossy reflective glassmorphism");
    expect(prompt).toContain("positive matte frosted-overlay");
    expect(prompt).not.toContain("remove transparent glass cards → pale overlap only");
  });

  it("does not inject Jaytel's neutral UI taste into rule or skill prompts", () => {
    const ruleSetPrompt = buildRuleSetPrompt([
      {
        id: "chunk_01",
        files: ["img_0001.md"],
        text: "Use saturated color, crude display type, visible print grain, and dense flyer hierarchy.",
      },
    ]);
    const skillPrompt = buildSkillPrompt(
      "Use saturated color, crude display type, visible print grain, and dense flyer hierarchy.",
      "bar-part-time",
    );
    const combined = `${ruleSetPrompt}\n${skillPrompt}`;

    for (const phrase of hardCodedBiasPhrases) {
      expect(combined).not.toContain(phrase);
    }
    expect(combined).toContain("Default to the concrete choices best supported by the chunk evidence.");
    expect(combined).toContain("Derive typography, color, texture, density");
    expect(combined).toContain("Split material bans");
    expect(combined).toContain("Material collapse guardrail");
  });
});

describe("buildSkillPrompt", () => {
  it("passes the requested skill name into the final skill prompt", () => {
    const prompt = buildSkillPrompt("Keep buttons square.", "Product UI");

    expect(prompt).toContain(
      'Use this exact plain-text skill title when a title is needed: "Product UI"',
    );
    expect(prompt).toContain("# Product UI");
    expect(prompt).toContain("<skill-description>");
    expect(prompt).toContain("<skill-body>");
  });
});

describe("buildSkillReviewPrompt", () => {
  it("asks for philosophy-not-CSS fidelity and tagged correction output", () => {
    const prompt = buildSkillReviewPrompt({
      draftSkill: "bad draft",
      synthesizedNotes: "frosted overlays over photography",
      fidelityReasons: ["Missing positive matte recipe"],
    });

    expect(prompt).toContain("not dumping brand CSS");
    expect(prompt).toContain("Missing positive matte recipe");
    expect(prompt).toContain("<review-changelog>");
    expect(prompt).toContain("<skill-body>");
    expect(prompt).toContain("frosted overlays over photography");
  });
});
