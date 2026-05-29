import type { Devotional, DevotionalVersionSnapshot } from "./types";

const MAX_VERSION_HISTORY = 10;

export function appendVersionSnapshot(
  devotional: Devotional,
  reason: DevotionalVersionSnapshot["reason"] = "regenerate",
  meta?: { instruction?: string }
): DevotionalVersionSnapshot[] {
  const snapshot: DevotionalVersionSnapshot = {
    savedAt: new Date().toISOString(),
    reason,
    ...(meta?.instruction?.trim() ? { instruction: meta.instruction.trim() } : {}),
    title: devotional.title,
    verse: devotional.verse,
    content: devotional.content,
    prayer: devotional.prayer,
    reflectionQuestion: devotional.reflectionQuestion,
    facebookCopy: devotional.facebookCopy,
    status: devotional.status,
    promptVersion: devotional.promptVersion,
  };

  const history = [...(devotional.versionHistory ?? []), snapshot];
  return history.slice(-MAX_VERSION_HISTORY);
}
