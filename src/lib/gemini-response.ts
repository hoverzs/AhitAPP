interface GeminiSafetyRating {
  category?: string;
  probability?: string;
  blocked?: boolean;
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
    role?: string;
  };
  finishReason?: string;
  safetyRatings?: GeminiSafetyRating[];
}

export interface GenerateContentResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string; code?: number; status?: string };
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: GeminiSafetyRating[];
  };
}

export type GeminiResponseIssue =
  | "NO_CANDIDATES"
  | "NO_CONTENT"
  | "NO_PARTS"
  | "EMPTY_TEXT"
  | "MAX_TOKENS"
  | "SAFETY"
  | "RECITATION"
  | "PROMPT_BLOCKED";

/**
 * A Gemini HTTP válasza megérkezett, de a szöveg kinyerése / feldolgozása sikertelen.
 * Nem API-kulcs vagy hálózati hiba.
 */
export class GeminiResponseError extends Error {
  readonly issue: GeminiResponseIssue;
  readonly finishReason?: string;
  readonly diagnostics: string;
  readonly partialText?: string;

  constructor(params: {
    issue: GeminiResponseIssue;
    message: string;
    finishReason?: string;
    diagnostics: string;
    partialText?: string;
  }) {
    super(params.message);
    this.name = "GeminiResponseError";
    this.issue = params.issue;
    this.finishReason = params.finishReason;
    this.diagnostics = params.diagnostics;
    this.partialText = params.partialText;
  }
}

export function isGeminiResponseError(error: unknown): error is GeminiResponseError {
  return error instanceof GeminiResponseError;
}

export function buildGeminiResponseDiagnostics(
  data: GenerateContentResponse
): string {
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const textLengths = parts.map((p) => (p.text ?? "").length);
  const usage = data.usageMetadata;

  return [
    `candidates=${data.candidates?.length ?? 0}`,
    `finishReason=${candidate?.finishReason ?? "n/a"}`,
    `parts=${parts.length}`,
    `textLengths=[${textLengths.join(",")}]`,
    usage?.candidatesTokenCount != null
      ? `outputTokens≈${usage.candidatesTokenCount}`
      : null,
    data.promptFeedback?.blockReason
      ? `promptBlock=${data.promptFeedback.blockReason}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function collectTextFromParts(
  parts: Array<{ text?: string }> | undefined
): string {
  if (!parts?.length) return "";
  return parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

export interface ExtractedGeminiText {
  text: string;
  finishReason: string;
}

export function extractGeminiCandidateText(
  data: GenerateContentResponse
): ExtractedGeminiText {
  if (data.usageMetadata) {
    console.log(
      "[gemini-fetch] usageMetadata:",
      JSON.stringify(data.usageMetadata)
    );
  }

  const diagnostics = buildGeminiResponseDiagnostics(data);

  if (data.promptFeedback?.blockReason) {
    const ratings = JSON.stringify(data.promptFeedback.safetyRatings ?? []);
    throw new GeminiResponseError({
      issue: "PROMPT_BLOCKED",
      finishReason: data.promptFeedback.blockReason,
      diagnostics,
      message: `A prompt biztonsági szűrő miatt blokkolva (${data.promptFeedback.blockReason}). ${ratings}`,
    });
  }

  if (!data.candidates?.length) {
    throw new GeminiResponseError({
      issue: "NO_CANDIDATES",
      diagnostics,
      message: `A Gemini nem adott vissza candidatet (üres candidates tömb). Diagnosztika: ${diagnostics}`,
    });
  }

  const candidate = data.candidates[0];
  const finishReason = candidate.finishReason ?? "UNKNOWN";

  if (finishReason === "SAFETY") {
    const ratings = JSON.stringify(candidate.safetyRatings ?? []);
    throw new GeminiResponseError({
      issue: "SAFETY",
      finishReason,
      diagnostics,
      message: `A válasz biztonsági szűrő miatt blokkolt (finishReason: SAFETY). ${ratings}`,
    });
  }

  if (finishReason === "RECITATION") {
    throw new GeminiResponseError({
      issue: "RECITATION",
      finishReason,
      diagnostics,
      message: "A válasz RECITATION miatt leállt (idézet-szűrő).",
    });
  }

  if (!candidate.content) {
    throw new GeminiResponseError({
      issue: "NO_CONTENT",
      finishReason,
      diagnostics,
      message: `A Gemini candidatenek nincs content mezője (finishReason: ${finishReason}). Diagnosztika: ${diagnostics}`,
    });
  }

  const parts = candidate.content.parts;
  if (!parts?.length) {
    throw new GeminiResponseError({
      issue: "NO_PARTS",
      finishReason,
      diagnostics,
      message: `A Gemini contentnek nincs parts tömbje (finishReason: ${finishReason}). Diagnosztika: ${diagnostics}`,
    });
  }

  const text = collectTextFromParts(parts);

  if (!text) {
    if (finishReason === "MAX_TOKENS") {
      throw new GeminiResponseError({
        issue: "MAX_TOKENS",
        finishReason,
        diagnostics,
        message:
          "A modell válasza elérte a tokenlimitet (MAX_TOKENS), de nem érkezett használható szöveg — valószínűleg levágódott a generálás elején. Próbáld rövidebb prompttal vagy kisebb részfeladattal.",
      });
    }

    throw new GeminiResponseError({
      issue: "EMPTY_TEXT",
      finishReason,
      diagnostics,
      message: `A Gemini válasza nem tartalmazott kiolvasható szöveget. (finishReason: ${finishReason}). Diagnosztika: ${diagnostics}`,
    });
  }

  if (finishReason === "MAX_TOKENS") {
    console.warn(
      `[gemini-fetch] finishReason=MAX_TOKENS — részleges szöveg (${text.length} karakter). Diagnosztika: ${diagnostics}`
    );
  }

  return { text, finishReason };
}
