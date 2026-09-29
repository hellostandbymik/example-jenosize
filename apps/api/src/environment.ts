import 'dotenv/config';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// npm workspace commands run from apps/api. Load the documented root .env too,
// while keeping injected deployment variables and existing local overrides.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), override: false });
