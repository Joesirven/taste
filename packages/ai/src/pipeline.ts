import {
  buildSkillFrontmatter,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_SKILL_DESCRIPTION,
  normalizeSkillDescription,
  normalizeSkillName,
} from "./config";
import {
  assertSkillFidelity,
  notesEvidenceFrostOverlay,
} from "./eval/skill-fidelity";
import {
  buildAnalysisPrompt,
  buildChunkPrompt,
  buildRuleSetPrompt,
  buildSkillPrompt,
  buildSkillReviewPrompt,
  buildSynthesisPrompt,
} from "./prompts";
import { generateProviderText, generateProviderVisionText } from "./providers";
import type {
  AiProviderCredentials,
  ChunkSpec,
  RawAnalysisInput,
  RuleChunkResult,
  SynthesizeImageNoteInput,
  TextGenerationResult,
} from "./types";

export async function analyzeImage(
  input: RawAnalysisInput,
): Promise<TextGenerationResult> {
  return generateProviderVisionText({
    credentials: input.credentials,
    model: input.model,
    prompt: buildAnalysisPrompt(input.image),
    image: input.imageInput,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.analysis,
    abortSignal: input.abortSignal,
  });
}

export async function synthesizeImageNote(
  input: SynthesizeImageNoteInput,
): Promise<TextGenerationResult> {
  return generateProviderVisionText({
    credentials: input.credentials,
    model: input.model,
    prompt: buildSynthesisPrompt({
      image: input.image,
      analyses: input.analyses,
    }),
    image: input.imageInput,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.synthesizedNote,
    abortSignal: input.abortSignal,
  });
}

export async function extractRuleChunk(input: {
  credentials?: AiProviderCredentials | undefined;
  model: string;
  chunk: ChunkSpec;
  abortSignal?: AbortSignal | undefined;
}): Promise<TextGenerationResult> {
  return generateProviderText({
    credentials: input.credentials,
    model: input.model,
    prompt: buildChunkPrompt(input.chunk),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.ruleChunk,
    abortSignal: input.abortSignal,
  });
}

export async function synthesizeRuleSet(input: {
  credentials?: AiProviderCredentials | undefined;
  model: string;
  chunkResults: RuleChunkResult[];
  abortSignal?: AbortSignal | undefined;
}): Promise<TextGenerationResult> {
  return generateProviderText({
    credentials: input.credentials,
    model: input.model,
    prompt: buildRuleSetPrompt(input.chunkResults),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.ruleSet,
    abortSignal: input.abortSignal,
  });
}

export async function generateSkill(input: {
  credentials?: AiProviderCredentials | undefined;
  model: string;
  ruleSet: string;
  skillName?: string | null | undefined;
  abortSignal?: AbortSignal | undefined;
}): Promise<TextGenerationResult> {
  const skillName = normalizeSkillName(input.skillName);
  const result = await generateProviderText({
    credentials: input.credentials,
    model: input.model,
    prompt: buildSkillPrompt(input.ruleSet, skillName),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.skill,
    abortSignal: input.abortSignal,
  });
  const parsed = parseSkillGenerationOutput(result.text);
  return {
    ...result,
    text: `${buildSkillFrontmatter({
      skillName,
      description: parsed.description,
    })}${parsed.body}`,
  };
}

export type ReviewAndCorrectSkillInput = {
  credentials?: AiProviderCredentials | undefined;
  model: string;
  draftSkill: string;
  synthesizedNotes: string;
  frostOverlayEvidenced?: boolean | undefined;
  abortSignal?: AbortSignal | undefined;
  /** Test seam — defaults to generateProviderText. */
  generateText?: typeof generateProviderText;
};

export type ReviewAndCorrectSkillResult = TextGenerationResult & {
  corrected: boolean;
  changelog: string | null;
  fidelityReasons: string[];
};

/**
 * Compare draft skill to synthesized notes; correct when frost-overlay fidelity fails.
 * Returns the draft unchanged when fidelity already passes or notes do not evidence frost overlays.
 */
export async function reviewAndCorrectSkill(
  input: ReviewAndCorrectSkillInput,
): Promise<ReviewAndCorrectSkillResult> {
  const frostOverlayEvidenced =
    input.frostOverlayEvidenced ?? notesEvidenceFrostOverlay(input.synthesizedNotes);
  const fidelity = assertSkillFidelity(input.draftSkill, { frostOverlayEvidenced });

  if (fidelity.ok) {
    return {
      text: input.draftSkill,
      model: input.model,
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
      corrected: false,
      changelog: null,
      fidelityReasons: [],
    };
  }

  const generateText = input.generateText ?? generateProviderText;
  const result = await generateText({
    credentials: input.credentials,
    model: input.model,
    prompt: buildSkillReviewPrompt({
      draftSkill: input.draftSkill,
      synthesizedNotes: boundNotes(input.synthesizedNotes),
      fidelityReasons: fidelity.reasons,
    }),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS.skillReview,
    abortSignal: input.abortSignal,
  });

  const parsed = parseSkillReviewOutput(result.text);
  const correctedBody = parsed.body?.trim() ? parsed.body.trim() : input.draftSkill;
  const frontmatterMatch = input.draftSkill.match(/^---\n[\s\S]*?\n---\n*/);
  const text = frontmatterMatch
    ? `${frontmatterMatch[0]}${stripFrontmatter(correctedBody)}`
    : correctedBody;

  return {
    ...result,
    text,
    corrected: text.trim() !== input.draftSkill.trim(),
    changelog: parsed.changelog,
    fidelityReasons: fidelity.reasons,
  };
}

export function parseSkillGenerationOutput(markdown: string): {
  description: string;
  body: string;
  usedFallbackDescription: boolean;
} {
  const text = stripFrontmatter(markdown.trim());
  const description = normalizeSkillDescription(extractTaggedBlock(text, "skill-description"));
  const bodyBlock = extractTaggedBlock(text, "skill-body");
  const bodySource = bodyBlock ?? removeTaggedBlock(text, "skill-description");
  const body = stripFrontmatter(bodySource)
    .replace(/^<skill-body>\s*/i, "")
    .replace(/\s*<\/skill-body>\s*$/i, "")
    .trim();

  return {
    description: description ?? DEFAULT_SKILL_DESCRIPTION,
    body,
    usedFallbackDescription: description === null,
  };
}

export function parseSkillReviewOutput(markdown: string): {
  changelog: string | null;
  body: string | null;
} {
  const text = markdown.trim();
  return {
    changelog: extractTaggedBlock(text, "review-changelog"),
    body: extractTaggedBlock(text, "skill-body"),
  };
}

const NOTES_BOUND_CHARS = 24_000;

function boundNotes(notes: string): string {
  if (notes.length <= NOTES_BOUND_CHARS) return notes;
  return `${notes.slice(0, NOTES_BOUND_CHARS)}\n\n[notes truncated for review context]`;
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
}

function extractTaggedBlock(markdown: string, tag: string): string | null {
  const match = markdown.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function removeTaggedBlock(markdown: string, tag: string): string {
  return markdown.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "gi"), "").trim();
}
