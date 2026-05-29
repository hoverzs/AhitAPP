import { promises as fs } from "fs";
import path from "path";
import { createGeminiClient, logGeminiError } from "./gemini-client";
import { GEMINI_TEXT_MODEL } from "./config";
import {
  READING_PLAN_SYSTEM_PROMPT,
  READING_PLAN_USER_PROMPT,
} from "./prompts/reading-plan-prompt";
import type { GeminiReadingPlanResponse, ReadingPlan } from "./reading-plan-types";
import { normalizeGeminiPlan, getReadingPlanPath } from "./reading-plan";

export async function generateReadingPlanWithGemini(): Promise<ReadingPlan> {
  const model = createGeminiClient().getGenerativeModel({
    model: GEMINI_TEXT_MODEL,
    systemInstruction: READING_PLAN_SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
    },
  });

  let raw: string;
  try {
    const result = await model.generateContent(READING_PLAN_USER_PROMPT);
    raw = result.response.text();
  } catch (error) {
    logGeminiError(error, `generateReadingPlanWithGemini / ${GEMINI_TEXT_MODEL}`);
    throw error;
  }

  if (!raw?.trim()) {
    throw new Error("A Gemini nem adott vissza olvasási tervet.");
  }

  const parsed = JSON.parse(raw) as GeminiReadingPlanResponse;
  return normalizeGeminiPlan(parsed);
}

export async function saveReadingPlan(plan: ReadingPlan): Promise<string> {
  const filePath = getReadingPlanPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(plan, null, 2), "utf-8");
  return filePath;
}
