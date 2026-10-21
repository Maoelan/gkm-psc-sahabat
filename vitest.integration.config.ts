import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: { include: ['tests/integration/**/*.test.ts'], environment: 'node', hookTimeout: 30_000, testTimeout: 20_000 }
});
