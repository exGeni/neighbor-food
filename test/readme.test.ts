// A person who sees a code must find it in the README.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../src/errors';

describe('README', () => {
  const readme = readFileSync('README.md', 'utf8');
  const headings = [...readme.matchAll(/^### (NF-[A-Z-]+)\r?$/gm)].map((match) => match[1] as string);

  it('has a troubleshooting heading for every error code and no other', () => {
    expect(headings.sort()).toEqual([...ERROR_CODES].sort());
  });
});
