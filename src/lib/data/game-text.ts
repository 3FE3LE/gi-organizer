/**
 * The game's own description markup, read into structure instead of stripped.
 *
 * Talents, constellations and weapon passives come from the game with their
 * emphasis marked up: `<color=#FFD780FF>` on the names of attacks and the
 * terms that matter, an element's colour on its damage, `<i>` on the flavour
 * line, blank lines between the parts of one talent. The catalog kept a plain
 * copy with all of it removed, and that copy is what the pages drew — so
 * "Ataque Normal", "Ataque Cargado" and "Ataque Descendente" ran together as
 * three sentences of one paragraph, and the one number worth finding sat in
 * a wall of the same grey as everything around it.
 *
 * What comes out is blocks, each a list of lines made of runs. A paragraph
 * whose first line is nothing but a highlighted name is that part's heading;
 * a paragraph entirely in italics is flavour; one whose every line opens on
 * the game's `·` is a list. Everything else the markup
 * carries is resolved here, never shown:
 *
 *   - a leading `#`, the game's flag that the string is a template;
 *   - `{NON_BREAK_SPACE}`, which keeps "12 s" on one line;
 *   - `{LINK#…}` and `{/LINK}`, glossary links with no glossary to open;
 *   - `{F#…}{M#…}`, the Traveler's grammatical gender;
 *   - `{LAYOUT_MOBILE#…}{LAYOUT_PC#…}{LAYOUT_PS#…}`, one phrase per device —
 *     kept as two runs so the page can show the touch one on a touch screen;
 *   - `{TIMEZONE}`, the server's clock, which the caller names.
 */

/** What a run is emphasised as. The colours are the game's; the page picks shades. */
export type Tone =
  | 'highlight'
  | 'pyro' | 'hydro' | 'anemo' | 'electro' | 'dendro' | 'cryo' | 'geo';

export type Run = {
  text: string;
  tone: Tone | null;
  italic: boolean;
  /** Set on a phrase that differs by device; absent where it does not. */
  layout?: 'pointer' | 'touch';
};

export type Block = {
  kind: 'heading' | 'paragraph' | 'flavor' | 'list';
  lines: Run[][];
};

const TONES: Record<string, Tone> = {
  FFD780: 'highlight',
  FF9999: 'pyro',
  '80C0FF': 'hydro',
  '80FFD7': 'anemo',
  FFACFF: 'electro',
  '99FF88': 'dendro',
  '99FFFF': 'cryo',
  FFE699: 'geo',
};

export type GameTextOptions = {
  /** The Traveler's body, for `{F#…}{M#…}`. Aether's unless said. */
  gender?: 'F' | 'M';
  /** What `{TIMEZONE}` reads as. */
  timezone?: string;
};

const TOKEN = /<color=#([0-9a-f]{6})[0-9a-f]{0,2}>|<\/color>|<i>|<\/i>|\{LAYOUT_(MOBILE|PC|PS)#([^}]*)\}|\n/gi;

/** Everything that is not structure, resolved to text or nothing. */
function resolve(raw: string, options: GameTextOptions) {
  const gender = options.gender ?? 'M';

  return raw
    .replace(/^#/, '')
    .replace(/\{NON_BREAK_SPACE\}/g, ' ')
    .replace(/\{LINK#[^}]*\}|\{\/LINK\}/g, '')
    .replace(/\{F#([^}]*)\}\{M#([^}]*)\}/g, (_, female: string, male: string) =>
      (gender === 'F' ? female : male))
    .replace(/\{TIMEZONE\}/g, options.timezone ?? '')
    // Windows line ends and the literal `\n` some strings carry escaped.
    .replace(/\r\n?/g, '\n')
    .replace(/\\n/g, '\n');
}

/** The text as lines of runs, before paragraphs are found. */
function tokenize(text: string): Run[][] {
  const lines: Run[][] = [[]];
  const colors: (Tone | null)[] = [];
  let italic = 0;
  let at = 0;

  const push = (value: string, layout?: Run['layout']) => {
    if (!value) return;
    const run: Run = { text: value, tone: colors.at(-1) ?? null, italic: italic > 0 };
    if (layout) run.layout = layout;
    lines.at(-1)!.push(run);
  };

  for (const match of text.matchAll(TOKEN)) {
    push(text.slice(at, match.index));
    at = match.index + match[0].length;

    const token = match[0];
    if (token === '\n') lines.push([]);
    else if (token.toLowerCase() === '</color>') colors.pop();
    else if (token.toLowerCase() === '<i>') italic += 1;
    else if (token.toLowerCase() === '</i>') italic = Math.max(0, italic - 1);
    else if (match[1]) colors.push(TONES[match[1].toUpperCase()] ?? 'highlight');
    else if (match[2]) {
      const device = match[2].toUpperCase();
      // The console's wording is the PC's in every string that has both.
      if (device === 'PC') push(match[3], 'pointer');
      else if (device === 'MOBILE') push(match[3], 'touch');
    }
  }
  push(text.slice(at));

  return lines;
}

const isBlank = (line: Run[]) => line.every((run) => run.text.trim() === '');
const textOf = (line: Run[]) => line.filter((run) => run.layout !== 'touch').map((run) => run.text).join('');

/** A line that is only a highlighted name, short enough to be a title. */
function isHeading(line: Run[]) {
  const visible = line.filter((run) => run.text.trim() !== '');
  return visible.length > 0
    && visible.every((run) => run.tone === 'highlight' && !run.italic)
    && textOf(line).trim().length <= 48
    && !/[.:;]$/.test(textOf(line).trim());
}

const BULLET = /^\s*[·•]\s*/;

/** Every line opening on the game's bullet. */
const isList = (lines: Run[][]) => lines.every((line) => BULLET.test(line[0]?.text ?? ''));

/** A paragraph, or a list with its bullets taken off — the page draws its own. */
function body(lines: Run[][]): Block {
  if (!isList(lines)) return { kind: 'paragraph', lines };
  return {
    kind: 'list',
    lines: lines.map(([head, ...tail]) => [{ ...head, text: head.text.replace(BULLET, '') }, ...tail]),
  };
}

export function parseGameText(raw: string | null | undefined, options: GameTextOptions = {}): Block[] {
  if (!raw) return [];

  const blocks: Block[] = [];
  let current: Run[][] = [];

  const flush = () => {
    if (current.length === 0) return;
    const [first, ...rest] = current;

    if (rest.length > 0 && isHeading(first)) {
      blocks.push({ kind: 'heading', lines: [first] });
      blocks.push(body(rest));
    } else if (isList(current)) {
      blocks.push(body(current));
    } else {
      const flavor = current.every((line) => line.every((run) => run.italic || run.text.trim() === ''));
      blocks.push({ kind: flavor ? 'flavor' : 'paragraph', lines: current });
    }
    current = [];
  };

  for (const line of tokenize(resolve(raw, options))) {
    if (isBlank(line)) flush();
    else current.push(line);
  }
  flush();

  return blocks;
}
