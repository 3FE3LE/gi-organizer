import { Fragment } from 'react';

import { elementColor } from '@/lib/data/elements';
import { parseGameText, type GameTextOptions, type Run, type Tone } from '@/lib/data/game-text';

/**
 * A description from the game, drawn with the structure it came with.
 *
 * Read-only rich text: headings for the parts of a talent, paragraphs for what
 * the game separated, the game's `·` lines as a list, the flavour line set
 * apart, and whatever the game emphasised, emphasised here too. See
 * `@/lib/data/game-text` for what the markup is and what becomes of each
 * piece of it.
 *
 * An element's colour is mixed into the text colour rather than used as it
 * comes: the game's cryo is a pale cyan made for a dark screen, unreadable on
 * the light theme's parchment. Mixed with the ink, it darkens on light and
 * lightens on dark, and stays recognisably the element on both.
 *
 * Plain text renders too, as its paragraphs — the artifact effects have no
 * markup, and one component for every description keeps them looking alike.
 */
export function GameText({
  text,
  options,
  values = false,
  className = '',
}: {
  text: string | null | undefined;
  options?: GameTextOptions;
  /**
   * The colours mark numbers rather than elements — a weapon passive's, which
   * are the values a refinement changes — so each reads as a value.
   */
  values?: boolean;
  className?: string;
}) {
  const blocks = parseGameText(text, options);
  if (blocks.length === 0) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((block, index) => {
        const lines = block.lines.map((line, at) => (
          <Fragment key={at}>
            {at > 0 && <br />}
            {line.map((run, position) => <RunView key={position} run={run} values={values} />)}
          </Fragment>
        ));

        if (block.kind === 'heading') {
          return <p key={index} className="pt-1 font-medium text-text first:pt-0">{lines}</p>;
        }
        if (block.kind === 'list') {
          return (
            <ul key={index} className="space-y-1 pl-3.5">
              {block.lines.map((line, at) => (
                <li key={at} className="relative before:absolute before:-left-3 before:text-muted before:content-['·']">
                  {line.map((run, position) => <RunView key={position} run={run} values={values} />)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'flavor') {
          return <p key={index} className="italic opacity-80">{lines}</p>;
        }
        return <p key={index}>{lines}</p>;
      })}
    </div>
  );
}

const ELEMENT_OF: Record<Exclude<Tone, 'highlight'>, string> = {
  pyro: 'ELEMENT_PYRO',
  hydro: 'ELEMENT_HYDRO',
  anemo: 'ELEMENT_ANEMO',
  electro: 'ELEMENT_ELECTRO',
  dendro: 'ELEMENT_DENDRO',
  cryo: 'ELEMENT_CRYO',
  geo: 'ELEMENT_GEO',
};

function RunView({ run, values }: { run: Run; values: boolean }) {
  const device = run.layout === 'touch' ? 'game-text-touch' : run.layout === 'pointer' ? 'game-text-pointer' : '';
  const italic = run.italic ? 'italic' : '';

  if (!run.tone) {
    return device || italic ? <span className={`${device} ${italic}`}>{run.text}</span> : run.text;
  }

  if (values || run.tone === 'highlight') {
    return (
      <span className={`${values ? 'tabular' : ''} font-medium text-text ${device} ${italic}`}>
        {run.text}
      </span>
    );
  }

  return (
    <span
      className={`font-medium ${device} ${italic}`}
      style={{ color: `color-mix(in oklab, ${elementColor(ELEMENT_OF[run.tone])} 62%, var(--text))` }}
    >
      {run.text}
    </span>
  );
}
