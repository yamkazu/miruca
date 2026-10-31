// Bundles the API into dist/api, the folder CDK uploads as the Lambda Web Function's code.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('dist/api', { recursive: true });
await build({
  entryPoints: ['apps/api/src/server.ts'],
  outfile: 'dist/api/index.js',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  minify: true,
  sourcemap: true,
  logLevel: 'info',
});
// Lambda Web Functions load index.js from the package root by default.
await writeFile('dist/api/package.json', JSON.stringify({ name: 'miruca-api', private: true, main: 'index.js' }, null, 2) + '\n');
