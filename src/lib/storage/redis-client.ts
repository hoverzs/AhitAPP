import { Redis } from "@upstash/redis";
import { StorageBackendError } from "./errors";

/**
 * Upstash kliens, amelynek minden parancsa tárolóhibaként (StorageBackendError)
 * dobja a hibát. Így a Redis-kimaradás (pl. csomagkorlát) sehol nem keverhető
 * össze más hibával, például a Gemini-hívások hibáival.
 */
export function createRedisClient(url: string, token: string): Redis {
  const client = new Redis({ url, token });

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        try {
          const result = value.apply(target, args);
          if (result && typeof (result as Promise<unknown>).then === "function") {
            return (result as Promise<unknown>).catch((error: unknown) => {
              throw new StorageBackendError(error);
            });
          }
          return result;
        } catch (error) {
          throw new StorageBackendError(error);
        }
      };
    },
  });
}
