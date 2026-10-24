import { revalidateTag } from "next/cache";

/** A nyilvános áhítatlista Next data cache címkéje. */
export const PUBLIC_DEVOTIONALS_CACHE_TAG = "public-devotionals";

/**
 * Íráskor érvényteleníti a nyilvános gyorsítótárat. Next kontextuson kívül
 * (pl. tsx script) nincs mit érvényteleníteni, ezért a hiba nem végzetes.
 */
export function invalidatePublicDevotionalsCache(): void {
  try {
    revalidateTag(PUBLIC_DEVOTIONALS_CACHE_TAG);
  } catch {
    // nincs Next futtatókörnyezet
  }
}
