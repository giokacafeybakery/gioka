import { idb } from "./idb";
import { checkVerifier, makeVerifier } from "./crypto";
import type { User } from "@/lib/types";

/**
 * Local credentials vault: for every account that has logged in on this device we keep a password verifier
 * (salted, iterated SHA-256 — never the password) plus the last session token and profile. That allows:
 *  - logging in without connection (the token is reused, so queued changes sync with the right account later),
 *  - opening the register offline (the cashier still has to type email + password).
 */
export interface VaultEntry { email: string; verifier: string; token: string | null; user: User; at: number }

const key = (email: string) => email.trim().toLowerCase();

export const vault = {
  async remember(email: string, password: string, token: string | null, user: User) {
    const prev = await idb.get<VaultEntry>("vault", key(email));
    // Re-deriving costs ~100 ms; only do it when the password changed or there was no entry.
    const verifier = prev && checkVerifier(password, prev.verifier) ? prev.verifier : makeVerifier(password);
    await idb.put("vault", key(email), { email: key(email), verifier, token: token ?? prev?.token ?? null, user, at: Date.now() } satisfies VaultEntry);
  },
  async verify(email: string, password: string): Promise<VaultEntry | null> {
    const e = await idb.get<VaultEntry>("vault", key(email));
    return e && checkVerifier(password, e.verifier) ? e : null;
  },
  async has(email: string) { return !!(await idb.get<VaultEntry>("vault", key(email))); },
  async forgetToken(email: string) {
    const e = await idb.get<VaultEntry>("vault", key(email));
    if (e) await idb.put("vault", key(email), { ...e, token: null });
  },
  async count() { return (await idb.keys("vault")).length; },
};
