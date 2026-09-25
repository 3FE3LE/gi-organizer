/**
 * The transition type a swipe along the roster navigates with.
 *
 * Its own module, not an export of `swipe-navigate.tsx`: that file is a client
 * module, and a server component importing a plain value from one gets a
 * client reference instead of the string. Every `<ViewTransition>` on the build
 * page maps this type to `none`, and `globals.css` cancels any animation left.
 */
export const SWIPE_TYPE = 'swipe';
