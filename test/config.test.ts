import { describe, expect, it } from 'vitest';
import { checkConfig } from '../config/firebase-config';

const web = { apiKey: 'AIza-public', projectId: 'my-hall', appId: '1:2:web:3', authDomain: 'my-hall.firebaseapp.com', messagingSenderId: '2', storageBucket: 'x' };
const message = (raw: string): string => {
  try {
    checkConfig(raw);
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

describe('build config check', () => {
  it('accepts the web app config and an empty one', () => {
    expect(checkConfig(JSON.stringify(web))).toBe('my-hall');
    expect(checkConfig(undefined)).toBeNull();
    expect(checkConfig('  ')).toBeNull();
  });
  it('names the problem by code', () => {
    expect(message('{ apiKey: 1 }')).toContain('NF-BUILD-CONFIG-JSON');
    expect(message('[]')).toContain('NF-BUILD-CONFIG-JSON');
    expect(message(JSON.stringify({ ...web, appId: undefined }))).toContain('NF-BUILD-CONFIG-FIELD');
    expect(message(JSON.stringify({ ...web, extra: 'x' }))).toContain('NF-BUILD-CONFIG-FIELD');
    expect(message(JSON.stringify({ ...web, apiKey: 5 }))).toContain('NF-BUILD-CONFIG-FIELD');
  });
  it('refuses a server credential', () => {
    expect(message(JSON.stringify({ type: 'service_account', private_key: 'x' }))).toContain('NF-BUILD-CONFIG-SECRET');
    expect(message(JSON.stringify({ ...web, client_email: 'a@b' }))).toContain('NF-BUILD-CONFIG-SECRET');
    expect(message('-----BEGIN PRIVATE KEY-----')).toContain('NF-BUILD-CONFIG-SECRET');
  });
  it('never repeats a value', () => {
    const secret = 'SECRET-VALUE-123';
    for (const raw of [`{"apiKey": ${secret}`, JSON.stringify({ [secret]: secret }), JSON.stringify({ ...web, client_secret: secret })]) {
      expect(message(raw)).not.toContain(secret);
    }
  });
});
