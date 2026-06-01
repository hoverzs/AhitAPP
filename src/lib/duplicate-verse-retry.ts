import {
  extractVerseReference,
  findVerseReferenceMatch,
  isVerseReferenceUsed,
  normalizeReference,
  type DevotionalMemory,
} from "./devotional-memory";

/** Automatikus újrapróbák, ha a választott igehely már szerepelt. */
export const DUPLICATE_VERSE_MAX_ATTEMPTS = 3;

export const DUPLICATE_VERSE_EXHAUSTED_MESSAGE =
  "Több már használt igehelyet is elutasítottunk, de most nem sikerült elég gyorsan friss alapigét találni.";

export class DuplicateVerseExhaustedError extends Error {
  readonly rejectedReferences: string[];

  constructor(rejectedReferences: string[]) {
    super(DUPLICATE_VERSE_EXHAUSTED_MESSAGE);
    this.name = "DuplicateVerseExhaustedError";
    this.rejectedReferences = rejectedReferences;
    console.warn("[duplicate-verse] exhausted rejected references:", rejectedReferences);
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
  return `KORÁBBAN MÁR HASZNÁLT IGEHELYEK (TILOS újra választani — azonos könyv-fejezet-vers hivatkozásként):
${lines}

A scripture mezőben szereplő hivatkozás legyen ettől a listától eltérő.
Prefer less obvious but biblically meaningful passages when appropriate. Avoid overusing the most common devotional verses, but do not force obscure passages at the expense of theological clarity, relevance, or natural flow.`;
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

function getBookChapter(reference: string): string {
  const match = reference.match(/^(.+?\d+):\d+/);
  return match ? normalizeReference(match[1]) : "";
}

function getPartialReferenceMatches(
  normalizedCandidate: string,
  references: string[]
): string[] {
  if (!normalizedCandidate) return [];
  return references.filter((reference) => {
    const normalizedReference = normalizeReference(reference);
    return (
      normalizedReference !== normalizedCandidate &&
      (normalizedReference.includes(normalizedCandidate) ||
        normalizedCandidate.includes(normalizedReference))
    );
  });
}

function getSameChapterMatches(
  extractedReference: string,
  references: string[]
): string[] {
  const candidateChapter = getBookChapter(extractedReference);
  if (!candidateChapter) return [];
  return references.filter((reference) => {
    const referenceChapter = getBookChapter(reference);
    return (
      referenceChapter === candidateChapter &&
      normalizeReference(reference) !== normalizeReference(extractedReference)
    );
  });
}

export function getDuplicateVerseDebugSnapshot(
  reference: string,
  memory: DevotionalMemory,
  rejectedThisRun: string[] = []
): Record<string, unknown> {
  const extractedReference = extractVerseReference(reference);
  const normalizedCandidate = normalizeReference(extractedReference);
  const storedMatch = findVerseReferenceMatch(
    extractedReference,
    memory.usedVerseReferences
  );
  const rejectedMatch = findVerseReferenceMatch(
    extractedReference,
    rejectedThisRun
  );
  const rejectedReferencesAlreadyInUsedList = rejectedThisRun.filter((ref) =>
    isVerseReferenceUsed(ref, memory.usedVerseReferences)
  );

  return {
    candidateReference: reference,
    extractedReference,
    normalizedCandidate,
    storedMatch: storedMatch ?? null,
    rejectedThisRunMatch: rejectedMatch ?? null,
    rejectedBecause: storedMatch
      ? "matched_usedVerseReferences_exact_normalized_reference"
      : rejectedMatch
        ? "matched_rejectedThisRun_exact_normalized_reference"
        : null,
    sameChapterMatchesOnly: getSameChapterMatches(
      extractedReference,
      memory.usedVerseReferences
    ),
    partialNormalizedMatchesOnly: getPartialReferenceMatches(
      normalizedCandidate,
      memory.usedVerseReferences
    ),
    rejectedThisRun,
    rejectedReferencesAlreadyInUsedList,
    matchingMode: "exact normalized reference equality",
    normalizationSteps: [
      "lowercase",
      "collapse whitespace",
      "remove periods",
      "trim",
    ],
  };
}

export function logDuplicateVerseDebug(
  phase: string,
  reference: string,
  memory: DevotionalMemory,
  rejectedThisRun: string[] = []
): void {
  console.warn(
    `[duplicate-verse:debug] ${phase} ${JSON.stringify(
      getDuplicateVerseDebugSnapshot(reference, memory, rejectedThisRun)
    )}`
  );
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
  logDuplicateVerseDebug(`candidate phase=${context}`, ref, memory);
  if (!ref || !isVerseReferenceUsed(ref, memory.usedVerseReferences)) {
    return;
  }
  console.error(
    `[duplicate-verse] ${context} — blocked save: ${ref} already in database`
  );
  throw new DuplicateVerseExhaustedError([ref]);
}
