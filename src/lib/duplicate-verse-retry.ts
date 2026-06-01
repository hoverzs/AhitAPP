import {
  extractVerseReference,
  isVerseReferenceUsed,
  type DevotionalMemory,
} from "./devotional-memory";

/** Automatikus újrapróbák, ha a választott igehely már szerepelt. */
export const DUPLICATE_VERSE_MAX_ATTEMPTS = 3;

export const DUPLICATE_VERSE_EXHAUSTED_MESSAGE =
  "Nem sikerült új, még nem használt igerészt választani. Kérlek próbáld újra.";

export class DuplicateVerseExhaustedError extends Error {
  readonly rejectedReferences: string[];

  constructor(rejectedReferences: string[]) {
    super(DUPLICATE_VERSE_EXHAUSTED_MESSAGE);
    this.name = "DuplicateVerseExhaustedError";
    this.rejectedReferences = rejectedReferences;
  }
}

export function isDuplicateVerseExhaustedError(
  error: unknown
): error is DuplicateVerseExhaustedError {
  return error instanceof DuplicateVerseExhaustedError;
}

/** Korábban használt igehelyek — explicit lista a promptban. */
export function buildUsedVerseReferencesPromptBlock(
  memory: DevotionalMemory
): string {
  if (memory.usedVerseReferences.length === 0) {
    return "Még nincs korábbi igehely az adatbázisban — válassz erős, friss alapigét.";
  }

  const lines = memory.usedVerseReferences.map((ref) => `- ${ref}`).join("\n");
  return `KORÁBBAN MÁR HASZNÁLT IGEHELYEK (TILOS újra választani — se szó szerint, se ugyanaz a könyv:fejezet:vers):
${lines}

A scripture mezőben szereplő hivatkozás legyen ettől a listától eltérő.`;
}

/** Egyedi retry instrukció a legutóbb elutasított igehelyre. */
export function buildDuplicateVerseRetryPromptBlock(reference: string): string {
  return `

FONTOS — DUPLIKÁTUM:
A(z) „${reference}” igehely már szerepelt korábban ebben az áhítatsorozatban.
Válassz MÁSIK, még nem használt bibliai igét.
A passage ${reference} has already been used. Choose a different Bible passage that has not appeared before.
Tartsd meg ugyanazt a nap számát, tematikus irányt, kategória logikát és stílust — csak az alapige legyen új.`;
}

export function buildDuplicateVerseRejectionsBlock(
  rejectedReferences: string[]
): string {
  if (rejectedReferences.length === 0) return "";
  return rejectedReferences
    .map((ref) => buildDuplicateVerseRetryPromptBlock(ref))
    .join("");
}

export function isForbiddenVerseReference(
  reference: string,
  memory: DevotionalMemory,
  rejectedThisRun: string[] = []
): boolean {
  const ref = extractVerseReference(reference);
  if (!ref) return false;
  if (isVerseReferenceUsed(ref, memory.usedVerseReferences)) return true;
  if (isVerseReferenceUsed(ref, rejectedThisRun)) return true;
  return false;
}

export function logDuplicateVerseAttempt(
  context: string,
  meta: {
    attempt: number;
    maxAttempts: number;
    reference: string;
    phase: "metadata" | "assembled";
  }
): void {
  console.warn(
    `[duplicate-verse] ${context} — attempt ${meta.attempt}/${meta.maxAttempts} — duplicate at ${meta.phase}: ${meta.reference}`
  );
}

export function assertVerseReferenceAllowed(
  reference: string,
  memory: DevotionalMemory,
  context: string
): void {
  const ref = extractVerseReference(reference);
  if (!ref || !isVerseReferenceUsed(ref, memory.usedVerseReferences)) {
    return;
  }
  console.error(
    `[duplicate-verse] ${context} — blocked save: ${ref} already in database`
  );
  throw new DuplicateVerseExhaustedError([ref]);
}
