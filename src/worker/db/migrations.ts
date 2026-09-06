import { fileURLToPath } from 'node:url';

/** Absolute path of the SQL migrations folder. Node-only (scripts and tests), never bundled into the Worker. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../migrations', import.meta.url));
