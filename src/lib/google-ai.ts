import { promises as fs } from "fs";
import path from "path";
import {
  formatGeminiErrorMessage,
  getGeminiApiHeaders,
  logGeminiError,
} from "./gemini-client";
import { geminiExternalFetch, logGeminiKeyStatus } from "./gemini-fetch";
import { createGeminiClient } from "./gemini-client";
import { GEMINI_TEXT_MODEL, IMAGEN_MODEL } from "./config";
import { ENABLE_IMAGE_GENERATION } from "./features";
import {
  DEVOTIONAL_SYSTEM_PROMPT,
  buildImagePrompt,
  buildUserPrompt,
} from "./prompts";
import type { GeneratedDevotionalContent } from "./types";

/** Legacy SDK — csak szöveg (text-only generateContent). */
export async function generateDevotionalText(
  dayNumber: number,
  verseText: string
): Promise<GeneratedDevotionalContent> {
  const model = createGeminiClient().getGenerativeModel({
    model: GEMINI_TEXT_MODEL,
    systemInstruction: DEVOTIONAL_SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.75,
      maxOutputTokens: 4096,
    },
  });

  try {
    const result = await model.generateContent(buildUserPrompt(verseText, dayNumber));
    const raw = result.response.text();

    if (!raw?.trim()) {
      throw new Error("A Gemini válasza nem tartalmazott kiolvasható szöveget.");
    }

    const parsed = JSON.parse(raw) as GeneratedDevotionalContent;
    if (!parsed.title?.trim() || !parsed.content?.trim()) {
      throw new Error("Érvénytelen válasz formátum a Gemini-tól.");
    }

    return {
      title: parsed.title.trim(),
      content: parsed.content.trim(),
    };
  } catch (error) {
    logGeminiError(error, `generateDevotionalText / ${GEMINI_TEXT_MODEL}`);
    throw new Error(formatGeminiErrorMessage(error), { cause: error });
  }
}

interface ImagenPrediction {
  bytesBase64Encoded?: string;
  mimeType?: string;
}

interface ImagenResponse {
  predictions?: ImagenPrediction[];
}

/**
 * Imagen képgenerálás — ENABLE_IMAGE_GENERATION=true szükséges.
 * Jelenleg kikapcsolva: üres imageUrl, nincs API hívás.
 */
export async function generateAndSaveImage(
  dayNumber: number,
  verseText: string,
  imagePromptSubject: string
): Promise<string> {
  if (!ENABLE_IMAGE_GENERATION) {
    console.log(
      "[generateAndSaveImage] Kihagyva (ENABLE_IMAGE_GENERATION=false)."
    );
    return "";
  }

  const prompt = buildImagePrompt(imagePromptSubject, verseText);
  logGeminiKeyStatus("generateAndSaveImage");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict`;

  let response: Response;

  try {
    response = await geminiExternalFetch(url, {
      method: "POST",
      headers: getGeminiApiHeaders(),
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: "16:9" },
      }),
    });
  } catch (error) {
    logGeminiError(error, `generateAndSaveImage / fetch / ${IMAGEN_MODEL}`);
    throw new Error(formatGeminiErrorMessage(error), { cause: error });
  }

  if (!response.ok) {
    const errText = await response.text();
    const apiError = new Error(
      `Képgenerálás sikertelen (${response.status}): ${errText.slice(0, 200)}`
    );
    logGeminiError(apiError, `generateAndSaveImage / ${response.status}`);
    throw apiError;
  }

  const data = (await response.json()) as ImagenResponse;
  const base64 = data.predictions?.[0]?.bytesBase64Encoded;

  if (!base64) {
    throw new Error("Az Imagen nem adott vissza képet.");
  }

  const buffer = Buffer.from(base64, "base64");
  const imagesDir = path.join(process.cwd(), "public", "images", "devotionals");
  await fs.mkdir(imagesDir, { recursive: true });

  const filename = `day-${dayNumber}.png`;
  const filePath = path.join(imagesDir, filename);
  await fs.writeFile(filePath, buffer);

  return `/images/devotionals/${filename}`;
}
