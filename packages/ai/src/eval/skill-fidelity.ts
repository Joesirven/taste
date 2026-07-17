export type SkillFidelityContext = {
  /**
   * When true, the reference notes/corpus evidence matte frosted overlays
   * over imagery. Predicates then require positive overlay constraints and
   * reject undifferentiated glassmorphism collapse.
   */
  frostOverlayEvidenced: boolean;
};

export type SkillFidelityResult = {
  ok: boolean;
  reasons: string[];
};

const EMPTY_REASON = "Skill text is empty or missing.";

/** Relative material-recipe cues (philosophy constraints, not brand CSS). */
const POSITIVE_OVERLAY_CUES = [
  /frosted?\s+(?:overlay|chip|panel|surface|material)/i,
  /matte\s+frost/i,
  /frost(?:ed)?\s+overlays?\s+over\s+(?:photograph|photo|imagery|image|substrate)/i,
  /overlay(?:s)?\s+over\s+(?:photograph|photo|imagery|image|rich\s+substrate)/i,
  /backdrop(?:-|\s)?filter/i,
  /soft\s+blur\s+band/i,
  /blur\s+band/i,
  /translucent\s+(?:fill|overlay)\s+over/i,
];

const GLOSSY_BAN_CUES = [
  /glossy\s+(?:reflective\s+)?glass/i,
  /reflective\s+glassmorphism/i,
  /specular\s+(?:highlight|glass)/i,
  /ban\s+glossy/i,
  /prohibit\s+glossy/i,
  /do not use\s+glossy/i,
  /avoid\s+glossy\s+reflective/i,
  /chrome,\s*metallic/i,
  /heavy\s+drop\s+shadows?.{0,40}gloss/i,
];

const UNDIFFERENTIATED_GLASS_BAN = [
  /if the result starts looking like glassmorphism/i,
  /remove transparent glass cards/i,
  /avoid .{0,40}glass effects/i,
  /do not use .{0,40}glass effects/i,
  /avoid glassmorphism/i,
  /do not use glassmorphism/i,
  /-\s*Glassmorphism\./i,
  /do not make transparent glass cards/i,
  /do not use frosted panels/i,
  /remove .{0,30}frosted .{0,20}panels/i,
];

const CIRCLE_ONLY_REDEFINITION = [
  /for frosted pale systems,\s*use oversized translucent circles/i,
  /frosted as .{0,40}pale .{0,20}circles/i,
  /interpret frosted as .{0,40}overlap/i,
];

/**
 * Detect whether notes evidence frosted/translucent overlays over imagery.
 * Used by the review stage when the caller does not pass an explicit flag.
 */
export function notesEvidenceFrostOverlay(notes: string): boolean {
  if (!notes.trim()) return false;
  return (
    /frost(?:ed)?/i.test(notes) ||
    /glass(?:y|morphism)?/i.test(notes) ||
    /backdrop(?:-|\s)?filter/i.test(notes) ||
    /translucent .{0,40}(?:over|on) .{0,40}(?:photo|image|imagery|photograph)/i.test(notes) ||
    /(?:chip|panel|overlay).{0,40}(?:frost|blur|translucent)/i.test(notes)
  );
}

export function assertSkillFidelity(
  skill: string,
  context: SkillFidelityContext,
): SkillFidelityResult {
  const text = skill.trim();
  if (!text) {
    return { ok: false, reasons: [EMPTY_REASON] };
  }

  if (!context.frostOverlayEvidenced) {
    return { ok: true, reasons: [] };
  }

  const reasons: string[] = [];
  const hasPositive = POSITIVE_OVERLAY_CUES.some((re) => re.test(text));
  const hasGlossyBan = GLOSSY_BAN_CUES.some((re) => re.test(text));
  const hasUndifferentiatedBan = UNDIFFERENTIATED_GLASS_BAN.some((re) => re.test(text));
  const hasCircleOnlyRedefinition = CIRCLE_ONLY_REDEFINITION.some((re) => re.test(text));

  if (!hasPositive) {
    reasons.push(
      "Frost overlays are evidenced, but the skill lacks a positive matte frosted-overlay-over-imagery recipe (blur/fill/border or equivalent relative constraints).",
    );
  }

  if (hasUndifferentiatedBan && !hasPositive) {
    reasons.push(
      "Skill issues an undifferentiated glassmorphism/glass-effect ban without a positive matte overlay-over-substrate recipe.",
    );
  }

  if (hasCircleOnlyRedefinition && !hasPositive) {
    reasons.push(
      "Skill redefines frosted systems as pale circle-overlap translucency without requiring frosted overlays over photography/imagery when that mode is evidenced.",
    );
  }

  if (hasPositive && !hasGlossyBan && hasUndifferentiatedBan) {
    reasons.push(
      "Skill still collapses glossy and matte frost: keep a glossy/reflective glassmorphism ban separate from matte frosted overlays.",
    );
  }

  if (hasPositive && !hasGlossyBan) {
    // Soft requirement: positive recipe without any glossy distinction is weak but
    // still useful — require at least one glossy/reflective cue when frost is evidenced.
    reasons.push(
      "Skill should ban glossy reflective glassmorphism separately from allowing matte frosted overlays.",
    );
  }

  return { ok: reasons.length === 0, reasons };
}
