import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the AGENTS.md section 4 lint rule itself, so a broken rule cannot pass silently.
const eslint = new ESLint({ cwd: resolve(__dirname, '../..') });
const file = resolve(__dirname, '../src/modules/chats/service.ts');

async function errors(code: string) {
  const [result] = await eslint.lintText(code, { filePath: file });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports').length;
}

describe('module boundary lint rule', () => {
  it('allows importing another module through its index', async () => {
    expect(await errors("import { a } from '../events';\nimport { b } from '../events/index';\nexport const x = [a, b];\n")).toBe(0);
  });

  it('allows shared and own-module imports', async () => {
    expect(await errors("import { a } from '../../shared/db';\nimport { b } from './domain/rules';\nexport const x = [a, b];\n")).toBe(0);
  });

  it('rejects importing identity from another module', async () => {
    expect(await errors("import { a } from '../identity';\nexport const x = a;\n")).toBe(1);
  });

  it('rejects importing a file inside another module', async () => {
    expect(await errors("import { a } from '../events/service';\nexport const x = a;\n")).toBe(1);
  });
});
