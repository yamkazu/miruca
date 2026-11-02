import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { apiBuildOptions } from '../bundle.mjs';

it('keeps the local-only login out of the production bundle', async () => {
  const { metafile } = await build({ ...apiBuildOptions, write: false, metafile: true, logLevel: 'silent' });
  const inputs = Object.keys(metafile.inputs);
  expect(inputs).toContain('apps/api/src/app.ts');
  expect(inputs.filter((p) => p.startsWith('apps/api/src/local/'))).toEqual([]);
});
