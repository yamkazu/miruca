// Bundles the API into dist/api, the folder CDK uploads as the Lambda Web Function's code.

import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

/** Only the production entry point: the local-only login under apps/api/src/local never reaches Lambda. */
export const apiBuildOptions = {
  entryPoints: ['apps/api/src/server.ts'],
  outfile: 'dist/api/index.js',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  minify: true,
  sourcemap: true,
  logLevel: 'info',
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir('dist/api', { recursive: true });
  await build(apiBuildOptions);
  // Lambda Web Functions load index.js from the package root by default.
  await writeFile('dist/api/package.json', `${JSON.stringify({ name: 'miruca-api', private: true, main: 'index.js' }, null, 2)}\n`);
}
