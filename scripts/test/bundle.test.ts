import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { apiBuildOptions } from '../bundle.mjs';

it('bundles the production entry point for Lambda', () => {
  expect(apiBuildOptions.entryPoints).toEqual(['apps/api/src/server.ts']);
});

it('keeps the local entry point and the local-only login out of the production bundle', async () => {
  const { metafile } = await build({ ...apiBuildOptions, write: false, metafile: true, logLevel: 'silent' });
  const inputs = Object.keys(metafile.inputs);
  expect(inputs).toContain('apps/api/src/app.ts');
  expect(inputs).not.toContain('apps/api/src/local/server.ts');
  expect(inputs).not.toContain('apps/api/src/local/dev-login.ts');
  expect(inputs.filter((p) => p.startsWith('apps/api/src/local/'))).toEqual([]);
});
