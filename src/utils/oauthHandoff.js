export function createOAuthVerifier() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function oauthChallenge(verifier) {
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new globalThis.TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
