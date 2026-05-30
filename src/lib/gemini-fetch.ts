import {
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_TEXT_MODEL,
} from "./config";
import {
  formatGeminiErrorMessage,
  getGeminiApiHeaders,
  logGeminiError,
} from "./gemini-client";
import { GEMINI_RELAXED_SAFETY_SETTINGS } from "./gemini-safety";
import {
  extractGeminiCandidateText,
  isGeminiResponseError,
  type ExtractedGeminiText,
  type GenerateContentResponse,
} from "./gemini-response";
import {
  getGeminiTlsMode,
} from "./gemini-tls";
import { outboundFetch } from "./outbound-fetch";

export type { ExtractedGeminiText, GenerateContentResponse } from "./gemini-response";
export { GeminiResponseError, isGeminiResponseError } from "./gemini-response";

/** Csak text-only generateContent (nincs kép, base64, multimodal parts). */
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export function logGeminiKeyStatus(context: string): void {
  console.log(`[${context}] Key exists:`, !!process.env.GEMINI_API_KEY);
  console.log(`[${context}] GOOGLE_API_KEY exists:`, !!process.env.GOOGLE_API_KEY);
  const active = process.env.GOOGLE_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (active) {
    console.log(`[${context}] Active key prefix:`, active.slice(0, 3));
  }
  console.log(`[${context}] TLS mode:`, getGeminiTlsMode());
}

export async function geminiExternalFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  try {
    return await outboundFetch(url, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body,
      signal: init?.signal ?? undefined,
    });
  } catch (error) {
    logGeminiError(error, `geminiExternalFetch ${url.split("?")[0]}`);
    throw error;
  }
}

export interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}

export type ResolvedGenerationConfig = Required<
  Pick<GeminiGenerationConfig, "temperature" | "maxOutputTokens">
> &
  Pick<GeminiGenerationConfig, "responseMimeType" | "responseSchema">;

/** Mindig legyen maxOutputTokens — üres {} esetén is (korábban kimaradhatott). */
export function resolveGenerationConfig(
  partial?: GeminiGenerationConfig
): ResolvedGenerationConfig {
  const resolved: ResolvedGenerationConfig = {
    temperature: partial?.temperature ?? 0.7,
    maxOutputTokens: partial?.maxOutputTokens ?? GEMINI_MAX_OUTPUT_TOKENS,
  };

  if (partial?.responseMimeType) {
    resolved.responseMimeType = partial.responseMimeType;
  }
  if (partial?.responseSchema) {
    resolved.responseSchema = partial.responseSchema;
  }

  return resolved;
}

/** Dev: ellenőrizd, hogy a tényleges REST body tartalmazza-e a generationConfig-ot. */
export function logGenerationConfigPayload(
  context: string,
  generationConfig: ResolvedGenerationConfig
): void {
  console.log(
    `[${context}] generationConfig payload:`,
    JSON.stringify(generationConfig, null, 2)
  );
}

export function logRawGeminiResponse(
  context: string,
  data: GenerateContentResponse | null,
  rawText?: string
): void {
  if (data) {
    console.log(
      `[${context}] Raw Gemini Response:`,
      JSON.stringify(data, null, 2)
    );
  }
  if (rawText !== undefined) {
    console.log(
      `[${context}] Raw Gemini Response (HTTP body, first 4k):`,
      rawText.slice(0, 4000)
    );
  }
}

export function isRetriableGeminiResponseError(error: unknown): boolean {
  if (isGeminiResponseError(error)) {
    return (
      error.issue === "MAX_TOKENS" ||
      error.issue === "EMPTY_TEXT" ||
      error.issue === "NO_CONTENT" ||
      error.issue === "NO_PARTS"
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes("tokenlimit") ||
    lower.includes("max_tokens") ||
    lower.includes("levágódott") ||
    lower.includes("üres szöveget") ||
    lower.includes("json parse") ||
    lower.includes("hiányzó mezők")
  );
}

function parseGenerateContentHttpBody(
  context: string,
  rawText: string,
  httpOk: boolean
): GenerateContentResponse {
  if (!httpOk) {
    throw new Error(`Gemini API HTTP hiba: ${rawText.slice(0, 400)}`);
  }

  let data: GenerateContentResponse;
  try {
    data = JSON.parse(rawText) as GenerateContentResponse;
  } catch (parseError) {
    logRawGeminiResponse(context, null, rawText);
    logGeminiError(parseError, `${context} / JSON parse HTTP body`);
    throw new Error("A Gemini válasz nem értelmezhető JSON-ként.");
  }

  logRawGeminiResponse(context, data);

  if (data.error?.message) {
    throw new Error(`Gemini API: ${data.error.message}`);
  }

  if (data.promptFeedback?.blockReason) {
    const ratings = JSON.stringify(data.promptFeedback.safetyRatings ?? []);
    throw new Error(
      `A prompt blokkolva: ${data.promptFeedback.blockReason}. ${ratings}`
    );
  }

  return data;
}

function logGeminiTextRequest(
  context: string,
  model: string,
  systemInstruction: string,
  userPrompt: string
): void {
  const systemChars = systemInstruction.length;
  const userChars = userPrompt.length;
  console.log(
    `[${context}] Gemini text-only request:`,
    JSON.stringify({
      model,
      systemPromptChars: systemChars,
      userPromptChars: userChars,
      totalPromptChars: systemChars + userChars,
    })
  );
}

function logGeminiTextResponseStructure(
  context: string,
  data: GenerateContentResponse,
  extracted?: ExtractedGeminiText
): void {
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const hasText = parts.some((p) => Boolean(p.text?.trim()));

  console.log(
    `[${context}] Gemini response structure:`,
    JSON.stringify({
      hasCandidates: Boolean(data.candidates?.length),
      finishReason: candidate?.finishReason ?? extracted?.finishReason ?? null,
      hasContent: Boolean(candidate?.content),
      partsCount: parts.length,
      hasTextField: hasText,
      extractedTextChars: extracted?.text.length ?? 0,
    })
  );
}

async function geminiGenerateContentRestOnce(params: {
  model: string;
  systemInstruction: string;
  userPrompt: string;
  generationConfig?: GeminiGenerationConfig;
  logContext: string;
  attempt: number;
}): Promise<ExtractedGeminiText> {
  const { logContext: context, attempt } = params;
  const url = `${GEMINI_API_BASE}/models/${params.model}:generateContent`;

  logGeminiTextRequest(
    context,
    params.model,
    params.systemInstruction,
    params.userPrompt
  );

  const generationConfig = resolveGenerationConfig(params.generationConfig);
  logGenerationConfigPayload(context, generationConfig);

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: params.userPrompt }],
      },
    ],
    safetySettings: GEMINI_RELAXED_SAFETY_SETTINGS,
    generationConfig,
  };

  if (params.systemInstruction.trim()) {
    body.systemInstruction = {
      parts: [{ text: params.systemInstruction }],
    };
  }

  console.log(
    `[${context}] Calling Gemini REST: ${params.model} (attempt ${attempt})`,
    `maxOutputTokens=${generationConfig.maxOutputTokens}`,
    generationConfig.responseMimeType
      ? `mime=${generationConfig.responseMimeType}`
      : "mime=default"
  );

  const response = await geminiExternalFetch(url, {
    method: "POST",
    headers: getGeminiApiHeaders(),
    body: JSON.stringify(body),
  });

  const rawText = await response.text();

  if (!response.ok) {
    logRawGeminiResponse(context, null, rawText);
    const apiError = new Error(
      `Gemini API HTTP ${response.status}: ${rawText.slice(0, 400)}`
    );
    logGeminiError(apiError, `${context} / HTTP ${response.status}`);
    throw apiError;
  }

  const data = parseGenerateContentHttpBody(context, rawText, true);
  const extracted = extractGeminiCandidateText(data);
  logGeminiTextResponseStructure(context, data, extracted);
  return extracted;
}

/**
 * REST generateContent — undici, enyhített safety, opcionális újrapróbálás.
 */
export async function geminiGenerateContentRest(params: {
  model: string;
  systemInstruction: string;
  userPrompt: string;
  generationConfig?: GeminiGenerationConfig;
  logContext?: string;
  maxAttempts?: number;
}): Promise<string> {
  const result = await geminiGenerateContentRestDetailed(params);
  return result.text;
}

/** Ugyanaz mint geminiGenerateContentRest, de finishReason-nel (planner MAX_TOKENS kezeléshez). */
export async function geminiGenerateContentRestDetailed(params: {
  model: string;
  systemInstruction: string;
  userPrompt: string;
  generationConfig?: GeminiGenerationConfig;
  logContext?: string;
  maxAttempts?: number;
}): Promise<ExtractedGeminiText> {
  const context = params.logContext ?? "geminiGenerateContentRest";
  const maxAttempts = params.maxAttempts ?? 2;
  logGeminiKeyStatus(context);

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let generationConfig = resolveGenerationConfig(params.generationConfig);

    let userPrompt = params.userPrompt;

    if (attempt > 1) {
      const base = resolveGenerationConfig(params.generationConfig);
      generationConfig = resolveGenerationConfig({
        ...base,
        temperature: 0.5,
        maxOutputTokens: base.maxOutputTokens,
        responseMimeType: base.responseMimeType,
        responseSchema: base.responseSchema,
      });
      if (base.responseMimeType === "application/json") {
        userPrompt = `${params.userPrompt}\n\nReturn compact JSON only. Shorter content field.`;
      }
      console.warn(`[${context}] Retrying generateContent (attempt ${attempt}).`);
    }

    try {
      return await geminiGenerateContentRestOnce({
        model: params.model,
        systemInstruction: params.systemInstruction,
        userPrompt,
        generationConfig,
        logContext: context,
        attempt,
      });
    } catch (error) {
      lastError = error;

      if (isGeminiResponseError(error)) {
        throw error;
      }

      if (attempt < maxAttempts && isRetriableGeminiResponseError(error)) {
        logGeminiError(error, `${context} / attempt ${attempt} — will retry`);
        continue;
      }

      throw new Error(formatGeminiErrorMessage(error), { cause: error });
    }
  }

  if (isGeminiResponseError(lastError)) {
    throw lastError;
  }

  throw new Error(formatGeminiErrorMessage(lastError), { cause: lastError });
}

/** Csonka JSON zárása MAX_TOKENS után (egyszerű heurisztika). */
export function repairTruncatedJsonObject(raw: string): string {
  let s = raw.trim();
  const start = s.indexOf("{");
  if (start < 0) return s;
  s = s.slice(start);

  s = s.replace(/,\s*"[^"]*":\s*"[^"]*$/, "");
  s = s.replace(/,\s*"[^"]*":\s*$/, "");
  s = s.replace(/,\s*$/, "");

  const openBraces = (s.match(/{/g) ?? []).length;
  const closeBraces = (s.match(/}/g) ?? []).length;
  if (closeBraces < openBraces) {
    s += "}".repeat(openBraces - closeBraces);
  }

  return s;
}

/** JSON kinyerése modell-válaszból (markdown kerítés / extra szöveg esetén). */
export function parseJsonFromModelText<T>(
  raw: string,
  options?: { allowTruncatedRepair?: boolean }
): T {
  const trimmed = raw.replace(/```json|```/gi, "").trim();
  const attempts = [trimmed];

  if (options?.allowTruncatedRepair) {
    attempts.push(repairTruncatedJsonObject(trimmed));
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    attempts.push(fenced[1].trim());
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    attempts.push(trimmed.slice(start, end + 1));
  }

  let lastError: unknown;
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `JSON parse failed: ${lastError.message}`
      : "A modell válasza nem értelmezhető JSON-ként."
  );
}

export async function pingGeminiApi(): Promise<{
  ok: boolean;
  model: string;
  sample?: string;
}> {
  const model = GEMINI_TEXT_MODEL;
  logGeminiKeyStatus("pingGeminiApi");

  const text = await geminiGenerateContentRest({
    model,
    systemInstruction: "",
    userPrompt: "Írj egy rövid magyar mondatot: működik a kapcsolat.",
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 64,
    },
    logContext: "pingGeminiApi",
    maxAttempts: 1,
  });

  return { ok: true, model, sample: text.trim().slice(0, 80) };
}
