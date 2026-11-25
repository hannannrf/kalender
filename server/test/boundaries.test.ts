import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the AGENTS.md section 4 lint rule itself, so a broken rule cannot pass silently.
const eslint = new ESLint({ cwd: resolve(__dirname, '../..') });
const file = resolve(__dirname, '../src/modules/chats/service.ts');

async function errors(code: string, filePath = file) {
  const [result] = await eslint.lintText(code, { filePath });
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

  it('S07: jobs imports no module; reminders may import only jobs', async () => {
    const jobsFile = resolve(__dirname, '../src/modules/jobs/service.ts');
    const remindersFile = resolve(__dirname, '../src/modules/reminders/service.ts');
    expect(await errors("import { a } from '../events';\nexport const x = a;\n", jobsFile)).toBe(1);
    expect(await errors("import { a } from '../../shared/db';\nexport const x = a;\n", jobsFile)).toBe(0);
    expect(await errors("import { a } from '../events';\nexport const x = a;\n", remindersFile)).toBe(1);
    expect(await errors("import { a } from '../jobs';\nexport const x = a;\n", remindersFile)).toBe(0);
  });

  it('S09: identity may import only chats, events, reminders, calendar-sync and jobs', async () => {
    const identityFile = resolve(__dirname, '../src/modules/identity/service.ts');
    expect(await errors("import { a } from '../chats';\nimport { b } from '../events';\nimport { c } from '../reminders';\nimport { d } from '../jobs';\nexport const x = [a, b, c, d];\n", identityFile)).toBe(0);
    expect(await errors("import { a } from '../detection';\nexport const x = a;\n", identityFile)).toBe(1);
    expect(await errors("import { a } from '../chats/repository';\nexport const x = a;\n", identityFile)).toBeGreaterThan(0);
  });
});
