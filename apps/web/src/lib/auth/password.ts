import { hash, verify } from "@node-rs/argon2";

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// A valid hash of a random string, verified against when the user doesn't exist
// so login timing doesn't reveal which emails are registered.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hash("dummy-password-for-timing");
  return dummyHash;
}
