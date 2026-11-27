// The whole app on this computer: emulators, a test organiser code, the dev server.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { emulatorEnv, firebaseBin, root } from './env.mjs';

const require = createRequire(import.meta.url);
const viteBin = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');

const command = `node "${join(root, 'scripts', 'seed-emulator.mjs')}" && node "${viteBin}"`;
const child = spawn(process.execPath, [firebaseBin, 'emulators:exec', '--project', 'demo-nf', '--only', 'auth,firestore', command], {
  cwd: root,
  stdio: 'inherit',
  env: emulatorEnv({ VITE_FIREBASE_EMULATOR: '1' }),
});
child.on('exit', (code) => process.exit(code ?? 1));
