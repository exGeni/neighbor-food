// Helpers for tests that talk to the local emulators.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

export const PROJECT = 'demo-nf';
export const HOST = '127.0.0.1';

export async function environment(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: HOST, port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  });
}

/** What the organiser does by hand in the console. */
export async function setOwnerCode(env: RulesTestEnvironment, code: string): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore() as never, 'config', 'owner'), { code });
  });
}
