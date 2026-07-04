import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended Argon2id parameters.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (plain: string) => hash(plain, OPTS);

export async function verifyPassword(passwordHash: string, plain: string) {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}
