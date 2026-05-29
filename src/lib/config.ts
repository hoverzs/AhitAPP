/** Napi dinamikus tervezés + teljes áhítat szöveg */
export const GEMINI_PLANNER_MODEL = "gemini-2.5-flash";

/** Kisebb/fallback szöveghívások, ping teszt */
export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";

/** Általános generálás — minimum a modell ne vágja le a választ */
export const GEMINI_MAX_OUTPUT_TOKENS = 8192;

/** Planner generateContent maxOutputTokens (gemini-planner.ts) */
export const GEMINI_PLANNER_MAX_OUTPUT_TOKENS = 4096;

/** Csak ENABLE_IMAGE_GENERATION=true esetén — lásd src/lib/features.ts */
export const IMAGEN_MODEL = "imagen-3.0-generate-002";
