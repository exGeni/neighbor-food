// What the build accepts as FIREBASE_CONFIG: the public web-app config and nothing else.
// Messages never repeat a value.

const ALLOWED = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId', 'databaseURL'];
const REQUIRED = ['apiKey', 'projectId', 'appId'];
const SECRET_FIELDS = ['private_key', 'private_key_id', 'client_email', 'client_secret', 'client_id', 'refresh_token', 'type'];

export class ConfigError extends Error {
  constructor(code: 'NF-BUILD-CONFIG-JSON' | 'NF-BUILD-CONFIG-FIELD' | 'NF-BUILD-CONFIG-SECRET', detail: string) {
    super(`${code}: ${detail} See the README, "${code}".`);
    this.name = 'ConfigError';
  }
}

/** Returns the project id, or null for a copy without a database. */
export function checkConfig(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  if (/PRIVATE KEY|"service_account"/.test(raw)) {
    throw new ConfigError('NF-BUILD-CONFIG-SECRET', 'this is a server key. Never publish it; delete it in the console and use the web app config.');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // The parser's own message quotes the text, so it is not passed on.
    throw new ConfigError('NF-BUILD-CONFIG-JSON', 'FIREBASE_CONFIG is not one JSON object.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConfigError('NF-BUILD-CONFIG-JSON', 'FIREBASE_CONFIG is not one JSON object.');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([name]) => SECRET_FIELDS.includes(name))) {
    throw new ConfigError('NF-BUILD-CONFIG-SECRET', 'it has fields of a server credential. Use the web app config.');
  }
  const unknown = entries.filter(([name]) => !ALLOWED.includes(name)).length;
  if (unknown > 0) throw new ConfigError('NF-BUILD-CONFIG-FIELD', `${unknown} field(s) are not part of a web app config. Allowed: ${ALLOWED.join(', ')}.`);
  const config = value as Record<string, unknown>;
  const missing = REQUIRED.filter((name) => typeof config[name] !== 'string' || !(config[name] as string).trim());
  if (missing.length > 0) throw new ConfigError('NF-BUILD-CONFIG-FIELD', `missing: ${missing.join(', ')}.`);
  if (entries.some(([, item]) => typeof item !== 'string')) throw new ConfigError('NF-BUILD-CONFIG-FIELD', 'every field must be a string.');
  return config.projectId as string;
}
