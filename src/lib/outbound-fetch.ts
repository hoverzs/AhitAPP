import { Agent, fetch as undiciFetch } from "undici";
import {
  getGeminiTlsRejectUnauthorized,
  logGeminiTlsModeOnce,
} from "./gemini-tls";

let sharedAgent: Agent | undefined;
let tlsModeLogged = false;

function getOutboundAgent(): Agent {
  if (!sharedAgent) {
    if (!tlsModeLogged) {
      logGeminiTlsModeOnce();
      tlsModeLogged = true;
    }

    sharedAgent = new Agent({
      connect: {
        rejectUnauthorized: getGeminiTlsRejectUnauthorized(),
      },
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 120_000,
    });
  }
  return sharedAgent;
}

type OutboundFetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
let testOverride: OutboundFetchImpl | null = null;

/** Csak tesztekhez: a kimenő HTTP hívások helyettesítése (null = vissza az igazihoz). */
export function setOutboundFetchForTesting(impl: OutboundFetchImpl | null): void {
  testOverride = impl;
}

/** Külső API hívások (Pexels stb.) — ugyanaz a TLS policy, mint a Gemini-nél. */
export async function outboundFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  if (testOverride) return testOverride(url, init);
  const headers = new Headers(init?.headers);

  const response = await undiciFetch(url, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body as string | undefined,
    dispatcher: getOutboundAgent(),
    signal: init?.signal ?? undefined,
  });

  return response as unknown as Response;
}
