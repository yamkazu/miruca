// Bundles the API (Lambda Web Function) and the collector (Lambda) into dist/.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const common = { bundle: true, platform: 'node', target: 'node22', format: 'esm', sourcemap: true, minify: true, logLevel: 'info',
  // Some CJS deps call require(); give ESM bundles a working require.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } };

await mkdir('dist/api', { recursive: true });
await build({ ...common, entryPoints: ['apps/api/src/server.ts'], outfile: 'dist/api/index.mjs' });
// Web Functions start index.js by default; keep the ESM bundle and point to it.
await writeFile('dist/api/index.js', "import('./index.mjs');\n");
await writeFile('dist/api/package.json', JSON.stringify({ name: 'miruca-api', private: true, main: 'index.js' }, null, 2));

await build({ ...common, entryPoints: ['apps/collector/src/handler.ts'], outfile: 'dist/collector/index.mjs', external: ['@aws-sdk/*'] });
