import 'server-only';

import * as z from 'zod/mini';
import { en } from 'zod/locales';

/**
 * The words behind a rejected payload, loaded where they are read.
 *
 * `zod/mini` carries no messages, so a failed check says only "Invalid input".
 * The server actions word the first issue for the player (`firstIssue`), and
 * they did so with Zod's English ones; this loads those, on the server only,
 * so the client bundle the mini API was chosen for stays without them.
 * Imported for its effect by each action that parses a form.
 */
z.config(en());
