import { createHash, randomBytes } from "crypto";

// Opaque tokens: the raw value goes in the email / cookie; only its sha256
// hash is stored, so a DB leak cannot be replayed as a credential.
export function newOpaqueToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: sha256(raw) };
}

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
