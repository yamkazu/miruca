import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['apps/**/test/**/*.test.ts', 'infra/test/**/*.test.ts', 'scripts/test/**/*.test.ts'] } });
