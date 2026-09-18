/**
 * The stored theme, applied before the first paint.
 *
 * Reading the preference on the server would mean reading a cookie in the root
 * layout, and a root layout that reads a request API cannot be prerendered —
 * that would turn 485 statically generated character pages into 485 renders on
 * demand to decide a colour. So the choice lives in `localStorage` and this
 * runs synchronously as the first thing in the document: the attribute is on
 * `<html>` before the browser has anything to paint, which is what makes the
 * swap invisible rather than a flash of the wrong theme.
 *
 * Nothing is set when the choice is "system": the stylesheet already follows
 * `prefers-color-scheme` when no attribute is present, so the absence of the
 * attribute *is* the system setting.
 */
const APPLY_THEME = `(function(){try{var t=localStorage.getItem('gi-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: APPLY_THEME }} />;
}
