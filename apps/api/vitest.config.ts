import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/**/*.test.ts'], env: { JWT_SECRET: 'unit-test-only-jwt-signing-key-2026-09' } } });
