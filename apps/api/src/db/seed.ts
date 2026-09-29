// Use the same seed entrypoint as npm run db:seed.
await import(new URL('../../src/db/seed.mjs',import.meta.url).href);
export {};
