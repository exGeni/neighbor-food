// Builds the site against the local emulators and runs the browser tests on it.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { emulatorEnv, root } from './env.mjs';

const require = createRequire(import.meta.url);
const bin = (pkg, file) => join(dirname(require.resolve(`${pkg}/package.json`)), file);
const env = emulatorEnv({ VITE_FIREBASE_EMULATOR: '1', OUT_DIR: 'dist-e2e' });

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run([bin('vite', 'bin/vite.js'), 'build']);
run([bin('@playwright/test', 'cli.js'), 'test', ...process.argv.slice(2)]);
