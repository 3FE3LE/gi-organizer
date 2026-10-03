/**
 * The app's mark, drawn once: "GIO" for GI Organizer, the I in the middle
 * crowned like the S of the game's own logo — a four-pointed star on its top
 * serif, and two crescents that rise from it and arc down over the G and the O.
 *
 * Everything that draws the mark reads it from here: the header
 * (`components/logo-mark.tsx`), the link card (`opengraph-image.tsx`) and the
 * installed app's PNGs (`scripts/make-icons.mts`). Paths only, no JSX, so the
 * icon script can import it under plain Node.
 *
 * On a 512 grid. The G and the O are strokes of `LOGO_STROKE_WIDTH`, round
 * capped; the I, the crescents and the star are fills. The I is a capital,
 * flat serifs top and bottom, and stands 1.25 times as tall as the letters
 * beside it, sharing their baseline.
 */

/** The G (an open ring closed by a bar into its middle) and the O. */
export const LOGO_STROKES = [
  'M 194.6 282.4 A 56 56 0 1 0 211 322 L 169 322',
  'M 301 322 A 56 56 0 1 0 413 322 A 56 56 0 1 0 301 322 Z',
].join(' ');

export const LOGO_STROKE_WIDTH = 30;

export const LOGO_FILLS = [
  // I: stem and serifs as one outline, the serifs' corners just softened.
  'M 233 215.5 H 279 A 5 5 0 0 1 284 220.5 V 230.5 A 5 5 0 0 1 279 235.5 H 271 V 373 H 279 A 5 5 0 0 1 284 378 V 388 A 5 5 0 0 1 279 393 H 233 A 5 5 0 0 1 228 388 V 378 A 5 5 0 0 1 233 373 H 241 V 235.5 H 233 A 5 5 0 0 1 228 230.5 V 220.5 A 5 5 0 0 1 233 215.5 Z',
  // Crescents: two arcs of different radii between the same two points, so
  // each tapers to nothing at the serif and at the letter's outer side.
  'M 244 214 A 104 104 0 0 0 52 326 A 118 118 0 0 1 244 214 Z',
  'M 268 214 A 104 104 0 0 1 460 326 A 118 118 0 0 0 268 214 Z',
  // The star.
  'M 256 114 Q 256 162 280 162 Q 256 162 256 210 Q 256 162 232 162 Q 256 162 256 114 Z',
].join(' ');

/**
 * Scales the mark about its own centre (256, 254) onto the middle of the
 * canvas. At 1.03 it fills the rounded square to about 30px of its sides.
 */
export function logoTransform(scale: number) {
  return `translate(256 256) scale(${scale}) translate(-256 -254)`;
}

export const LOGO_SCALE = 1.03;
