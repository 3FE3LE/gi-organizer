import 'server-only';

/**
 * Whose data a request is asking for.
 *
 * Every table carries `profile_id`, and it used to be the constant `'local'`
 * for everyone: one row set, shared by whoever opened the URL. The column was
 * put there so that sharing would be a lookup rather than a migration, and
 * this is that lookup.
 *
 * It fails closed. There is no fallback profile for a request that arrives
 * without a session, because a fallback is exactly how a signed-out visitor
 * would end up reading somebody's account — the proxy already refuses those
 * requests, and this refuses them again rather than trusting it to.
 */

/**
 * The one exception, and the reasons it cannot reach production.
 *
 * The unit suite builds databases in memory and the browser suite builds one
 * in a temp file; neither has a Clerk request context, and neither should need
 * a network round trip to a real identity provider to assert that a form keeps
 * its value. So they name a profile outright.
 *
 * `VERCEL` is set by the platform on every deployment and cannot be unset from
 * the project, so this is ignored wherever the app is actually served — the
 * variable existing in the wrong place buys an attacker nothing.
 */
export function testProfileId() {
  return process.env.VERCEL ? undefined : process.env.GI_TEST_PROFILE;
}

export class NotSignedIn extends Error {
  constructor() {
    super('this request has no session');
    this.name = 'NotSignedIn';
  }
}

/**
 * Imported where it is used rather than at the top.
 *
 * A named test profile is an answer that needs no identity provider, and the
 * unit suite builds its databases in memory with no request to authenticate.
 * Loading the SDK to then not call it would make every one of those tests
 * depend on it.
 */
async function clerk() {
  return import('@clerk/nextjs/server');
}

export async function currentProfileId(): Promise<string> {
  const test = testProfileId();
  if (test) return test;

  const { auth } = await clerk();
  const { userId } = await auth();
  if (!userId) throw new NotSignedIn();

  return userId;
}

/** What to call the profile row the first time it is written. */
export async function currentProfileName(): Promise<string> {
  const test = testProfileId();
  if (test) return test;

  const { currentUser } = await clerk();
  const user = await currentUser();
  return user?.username
    ?? user?.primaryEmailAddress?.emailAddress
    ?? user?.firstName
    ?? 'sin nombre';
}
