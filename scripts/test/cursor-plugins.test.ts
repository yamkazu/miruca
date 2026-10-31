import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const skillNames = ['ponytail', 'ponytail-review', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help'] as const;

describe('Cursor plugin setup (npx-centered, not vendored)', () => {
  it('does not vendor ponytail skill bodies in .cursor/skills', () => {
    expect(existsSync('.cursor/skills/ponytail-review/SKILL.md')).toBe(false);
    expect(existsSync('.cursor/skills/ponytail/SKILL.md')).toBe(false);
  });

  it('documents setup as the install path', () => {
    const pointer = readFileSync('.cursor/PONYTAIL.md', 'utf8');
    expect(pointer).toMatch(/setup:cursor-plugins/);
    expect(pointer).toMatch(/DietrichGebert\/ponytail/);
    const docs = readFileSync('docs/cursor-plugins.md', 'utf8');
    expect(docs).toMatch(/npx skills add DietrichGebert\/ponytail/);
    expect(docs).toMatch(/\/ponytail-review/);
  });

  it('enables pstack at project scope via .cursor/settings.json', () => {
    const settings = JSON.parse(readFileSync('.cursor/settings.json', 'utf8')) as {
      plugins?: Record<string, { enabled?: boolean }>;
    };
    expect(settings.plugins?.pstack?.enabled).toBe(true);
  });

  it('ships an executable setup script that installs skills and the rule', () => {
    const script = 'scripts/setup-cursor-plugins.sh';
    expect(existsSync(script)).toBe(true);
    if ((statSync(script).mode & 0o111) === 0) {
      chmodSync(script, 0o755);
    }

    const install = spawnSync('bash', [script], { encoding: 'utf8', env: process.env });
    expect(install.status, install.stderr || install.stdout).toBe(0);

    for (const name of skillNames) {
      const path = `.agents/skills/${name}/SKILL.md`;
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path, 'utf8')).toMatch(new RegExp(`^name:\\s*${name}\\b`, 'm'));
    }
    expect(existsSync('.cursor/rules/ponytail.mdc')).toBe(true);
    expect(readFileSync('.cursor/rules/ponytail.mdc', 'utf8')).toMatch(/alwaysApply:\s*true/);

    const check = spawnSync('bash', [script, '--check-only'], { encoding: 'utf8' });
    expect(check.status, check.stderr || check.stdout).toBe(0);
    expect(check.stdout).toMatch(/ponytail-review/);
  }, 120_000);
});
