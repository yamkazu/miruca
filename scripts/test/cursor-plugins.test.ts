import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const skillNames = ['ponytail', 'ponytail-review', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help'] as const;

describe('Cursor ponytail wiring', () => {
  it('commits the always-on ponytail rule', () => {
    expect(existsSync('.cursor/rules/ponytail.mdc')).toBe(true);
    const rule = readFileSync('.cursor/rules/ponytail.mdc', 'utf8');
    expect(rule).toMatch(/alwaysApply:\s*true/);
  });

  it('commits ponytail skills including review', () => {
    for (const name of skillNames) {
      const path = `.cursor/skills/${name}/SKILL.md`;
      expect(existsSync(path), path).toBe(true);
      const body = readFileSync(path, 'utf8');
      expect(body).toMatch(new RegExp(`^name:\\s*${name}\\b`, 'm'));
    }
  });

  it('ships an executable setup:cursor-plugins script that passes --check-only', () => {
    const script = 'scripts/setup-cursor-plugins.sh';
    expect(existsSync(script)).toBe(true);
    const mode = statSync(script).mode;
    // Ensure the file is executable for the owner (git may drop +x on some checkouts).
    if ((mode & 0o111) === 0) {
      chmodSync(script, 0o755);
    }
    const result = spawnSync('bash', [script, '--check-only'], { encoding: 'utf8' });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toMatch(/ponytail-review/);
  });
});
