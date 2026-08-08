/**
 * 13+ age gate.
 *
 * SWAP! prohibits users under 13. The pilot uses a privacy-minimal gate: the user
 * confirms they are 13 or older, and we persist ONLY a local boolean attestation —
 * no date of birth, no new server-side personal data, and no parent-consent flow
 * (that policy is deferred for review with the school + counsel). Under-13 users are
 * blocked before any account is created.
 */
import type { KeyValueStore } from "../data/storage";
import { JsonStore, StorageKeys } from "../data/storage";

/** Read the local 13+ attestation. */
export async function hasConfirmed13Plus(kv: KeyValueStore): Promise<boolean> {
  return (await new JsonStore(kv).read<boolean>(StorageKeys.ageAttested13Plus, false)) === true;
}

/** Record the 13+ attestation locally. `confirmed` must be true to store it. */
export async function confirm13Plus(kv: KeyValueStore, confirmed: boolean): Promise<void> {
  if (!confirmed) return; // never store a false/again-under-13 attestation
  await new JsonStore(kv).write(StorageKeys.ageAttested13Plus, true);
}

/** Clear the attestation (e.g. on account deletion / sign-out reset). */
export async function clearAgeAttestation(kv: KeyValueStore): Promise<void> {
  await new JsonStore(kv).write(StorageKeys.ageAttested13Plus, false);
}
