// Shared by the scripts that start emulators.
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
export const firebaseBin = join(dirname(require.resolve('firebase-tools/package.json')), 'lib', 'bin', 'firebase.js');

/**
 * The emulators need Java 21 or newer. A copy placed under .claude/tools (not committed) is used
 * when present; otherwise the Java on the PATH.
 */
export function emulatorEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  const pathName = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
  const prepend = (dir) => {
    env[pathName] = `${dir}${delimiter}${env[pathName] ?? ''}`;
  };
  // The commands run inside the emulators expect the project's tools, with or without npm.
  prepend(join(root, 'node_modules', '.bin'));
  const local = join(root, '.claude', 'tools', 'jre');
  if (existsSync(local)) {
    const home = readdirSync(local).find((name) => existsSync(join(local, name, 'bin')));
    if (home) {
      env.JAVA_HOME = join(local, home);
      prepend(join(local, home, 'bin'));
    }
  }
  const browsers = join(root, '.claude', 'tools', 'ms-playwright');
  if (existsSync(browsers)) env.PLAYWRIGHT_BROWSERS_PATH ??= browsers;
  return env;
}
