import { copyFile } from 'node:fs/promises';

await copyFile('src/db/schema.sql', 'dist/db/schema.sql');
