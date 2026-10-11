import { z } from 'zod';

/**
 * An identifier compared by the server: any case accepted, kept in the canonical lower case
 * PostgreSQL returns, so the spelling of a uuid never changes which row or action it names.
 */
export const idSchema = () => z.uuid().toLowerCase();
