// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readZip, skillZip, writeZip } from './skill-zip.mjs';

const skillDir = resolve(import.meta.dirname, '../../agent-skill/cosa-si-mangia');

describe('skill zip (W17)', () => {
  it('puts the skill folder at the top, with SKILL.md readable back as written', () => {
    const entries = readZip(skillZip(skillDir));
    expect(entries.map((entry) => entry.name)).toEqual(['cosa-si-mangia/SKILL.md']);
    expect(entries[0]!.data.toString('utf8')).toBe(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'));
  });

  it('writes a zip that unzip lists and tests', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'skill-zip-')), 'skill.zip');
    writeFileSync(file, writeZip([{ name: 'a/b.txt', data: Buffer.from('ciao à tutti\n'.repeat(50)) }]));
    expect(execFileSync('unzip', ['-l', file], { encoding: 'utf8' })).toContain('a/b.txt');
    expect(execFileSync('unzip', ['-t', file], { encoding: 'utf8' })).toContain('No errors detected');
  });
});
