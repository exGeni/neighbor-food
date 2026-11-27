import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { checkConfig } from './config/firebase-config.ts';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

function buildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}

/** Only this page's own files and, for real entrances, the database addresses. */
const policy = (emulated: boolean): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => {
    const connect = [
      "'self'",
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://firestore.googleapis.com',
      ...(emulated ? ['http://127.0.0.1:9099', 'http://127.0.0.1:8080'] : []),
    ];
    const content = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "font-src 'self'",
      "img-src 'self' data:",
      `connect-src ${connect.join(' ')}`,
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content }, injectTo: 'head-prepend' }];
  },
});

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, here('.'), 'VITE_'), ...process.env };
  const emulated = env.VITE_FIREBASE_EMULATOR === '1';
  // Stops the build before anything unexpected could be published.
  const project = checkConfig(env.VITE_FIREBASE_CONFIG);
  console.log(
    emulated
      ? 'database: local emulator (demo-nf)'
      : project
        ? `database: configured (${project})`
        : 'database: none, demo only (set variable FIREBASE_CONFIG)',
  );

  return {
    root: here('./src'),
    publicDir: here('./public'),
    envDir: here('.'),
    base: process.env.BASE_PATH || '/neighbor-food/',
    define: { __BUILD_ID__: JSON.stringify(buildId()) },
    plugins: [policy(emulated)],
    build: {
      outDir: here(`./${env.OUT_DIR || 'dist'}`),
      emptyOutDir: true,
      // Fonts and icons stay files: the policy allows no data: fonts.
      assetsInlineLimit: 0,
      manifest: true,
    },
  };
});
