import crypto from "crypto";
import { promisify } from "util";

const pbkdf2Async = promisify(crypto.pbkdf2);

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = "sha256";

export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await pbkdf2Async(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST
  );
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  try {
    if (password.length > MAX_PASSWORD_LENGTH) {
      return false;
    }
    const parts = hashed.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") {
      return false;
    }
    const iterations = parseInt(parts[1], 10);
    if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 1_000_000) {
      return false;
    }
    const salt = parts[2];
    const storedHex = parts[3];
    const storedBuf = Buffer.from(storedHex, "hex");
    if (storedBuf.length === 0) {
      return false;
    }

    const calculatedBuf = await pbkdf2Async(
      password,
      salt,
      iterations,
      storedBuf.length,
      PBKDF2_DIGEST
    );
    if (calculatedBuf.length !== storedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(calculatedBuf, storedBuf);
  } catch {
    return false;
  }
}

export function hashResetCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function verifyResetCodeHash(code: string, storedHash: string): boolean {
  try {
    const calculatedHex = hashResetCode(code);
    const storedBuf = Buffer.from(storedHash, "hex");
    const calculatedBuf = Buffer.from(calculatedHex, "hex");
    if (storedBuf.length === 0 || storedBuf.length !== calculatedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(storedBuf, calculatedBuf);
  } catch {
    return false;
  }
}
