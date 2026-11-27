// Runs a command while the Firebase emulators are up: node scripts/with-emulator.mjs "<command>"
import { spawn } from 'node:child_process';
import { emulatorEnv, firebaseBin } from './env.mjs';

const command = process.argv[2];
if (!command) {
  console.error('usage: node scripts/with-emulator.mjs "<command>"');
  process.exit(2);
}

const child = spawn(process.execPath, [firebaseBin, 'emulators:exec', '--project', 'demo-nf', '--only', 'auth,firestore', command], {
  stdio: 'inherit',
  env: emulatorEnv(),
});
child.on('exit', (code) => process.exit(code ?? 1));
