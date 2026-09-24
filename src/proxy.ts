import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Everything is private except the door.
 *
 * This is one player's account — what they own, what it is worth, what they
 * are farming — and it was reachable by anyone who had the URL. Protecting
 * named routes and leaving the rest open is the wrong default for that: it
 * makes every new page a thing somebody has to remember to close, and the one
 * they forget is the one that leaks.
 *
 * `proxy.ts` rather than `middleware.ts`: the file convention was renamed in
 * Next.js 16, and the old name is deprecated.
 */
const isPublic = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  // The landing and what crawlers and link previews fetch for it — the only
  // things a person who has not signed in, or a search engine, should see.
  /^\/$/,
  /^\/(es|en|ja|zh-Hans)\/?$/,
  /^\/(es|en|ja|zh-Hans)\/opengraph-image/,
  '/robots.txt',
  '/sitemap.xml',
]);

/**
 * The browser suite serves a throwaway database and names its own profile, so
 * it has nobody to sign in as. Read here rather than imported, because a proxy
 * runs ahead of the app and is not meant to share its modules.
 *
 * `VERCEL` is set by the platform on every deployment and cannot be unset from
 * the project, so this is dead code wherever the app is actually served.
 */
const openForTests = !process.env.VERCEL && Boolean(process.env.GI_TEST_PROFILE);

export default clerkMiddleware(async (auth, request) => {
  if (openForTests || isPublic(request)) return;
  await auth.protect();
});

export const config = {
  matcher: [
    // Everything but Next's own internals and static files.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // The import and export endpoints carry the same data the pages do.
    '/(api|trpc)(.*)',
  ],
};
