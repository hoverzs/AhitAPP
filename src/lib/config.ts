/** Napi dinamikus tervezés + teljes áhítat szöveg */
export const GEMINI_PLANNER_MODEL = "gemini-2.5-flash";

/** Kisebb/fallback szöveghívások, ping teszt */
export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";

/** Planner — kompakt JSON, production-stabil */
export const GEMINI_PLANNER_MAX_OUTPUT_TOKENS = 1200;

/** Retry — még rövidebb válasz */
export const GEMINI_PLANNER_RETRY_MAX_OUTPUT_TOKENS = 1000;

/** Planner temperature */
export const GEMINI_PLANNER_TEMPERATURE = 0.65;

/** Planner retry temperature */
export const GEMINI_PLANNER_RETRY_TEMPERATURE = 0.55;

export const GEMINI_MAX_OUTPUT_TOKENS = 1200;

/** Csak ENABLE_IMAGE_GENERATION=true esetén — lásd src/lib/features.ts */
export const IMAGEN_MODEL = "imagen-3.0-generate-002";
