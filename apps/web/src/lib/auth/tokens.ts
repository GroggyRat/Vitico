import { createHash, randomBytes } from "node:crypto";

/** Random URL-safe token for cookies and emailed links. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Tokens are stored hashed so a database leak doesn't expose live sessions or links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
