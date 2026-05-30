/** Napi dinamikus tervezés + teljes áhítat szöveg */
export const GEMINI_PLANNER_MODEL = "gemini-2.5-flash";

/** Kisebb/fallback szöveghívások, ping teszt */
export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";

/** 1. lépés — metadata JSON (rövid) */
export const GEMINI_METADATA_MAX_OUTPUT_TOKENS = 512;

/** 2. lépés — áhítat markdown (plain text) */
export const GEMINI_BODY_MAX_OUTPUT_TOKENS = 2048;

export const GEMINI_BODY_RETRY_MAX_OUTPUT_TOKENS = 1536;

/** Planner temperature */
export const GEMINI_PLANNER_TEMPERATURE = 0.65;

export const GEMINI_PLANNER_RETRY_TEMPERATURE = 0.55;

/** @deprecated — egylépcsős */
export const GEMINI_PLANNER_MAX_OUTPUT_TOKENS = GEMINI_METADATA_MAX_OUTPUT_TOKENS;
export const GEMINI_PLANNER_RETRY_MAX_OUTPUT_TOKENS = GEMINI_BODY_RETRY_MAX_OUTPUT_TOKENS;

export const GEMINI_MAX_OUTPUT_TOKENS = 1200;

/** Csak ENABLE_IMAGE_GENERATION=true esetén — lásd src/lib/features.ts */
export const IMAGEN_MODEL = "imagen-3.0-generate-002";
