import { GameIcon } from '@/components/game-icon';
import { type Catalog, propLabel, resolveCosts } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';
import { formatPropValue, statRowProp } from '@/lib/data/props';
import { getCharacterDetailStrings } from '@/lib/data/registry';
import { STAT_LEVEL_KEYS } from '@/lib/data/stats';
import type { CharacterView } from '@/lib/data/types';

/**
 * Everything the game says about a character: the stat table, what ascending
 * and levelling talents costs, and the talent and constellation text.
 *
 * Reference material, so it lives in one component rather than one page — the
 * catalogue route shows it for a character you do not own, and the build screen
 * shows the same thing as a tab for one you do.
 */
export async function CharacterSheet({
  catalog,
  character,
  locale,
}: {
  catalog: Catalog;
  character: CharacterView;
  locale: Locale;
}) {
  const detail = await getCharacterDetailStrings(locale, character.id);
  const ascension = resolveCosts(catalog, character.costs);
  const talentCosts = resolveCosts(catalog, character.talentCosts);

  // `level` and `ascension` are already the row label; `+` marks the phase.
  const statKeys = Object.keys(character.stats['90'] ?? {}).filter(
    (key) => key !== 'level' && key !== 'ascension',
  );

  return (
    <div className="space-y-10">
      <Section title="Stats por nivel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-md border-collapse font-mono text-xs">
            <thead>
              <tr className="text-muted">
                <th className="border-b border-edge px-2 py-1 text-left">Nivel</th>
                {statKeys.map((key) => (
                  <th key={key} className="border-b border-edge px-2 py-1 text-right">
                    {propLabel(catalog, statRowProp(key, character.substatType))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAT_LEVEL_KEYS.map((level) => (
                <tr key={level} className="hover:bg-surface">
                  <td className="border-b border-edge/50 px-2 py-1">{level}</td>
                  {statKeys.map((key) => (
                    <td key={key} className="border-b border-edge/50 px-2 py-1 text-right">
                      {/* `genshin-db` reports the ascension bonus as a ratio. */}
                      {formatPropValue(
                        statRowProp(key, character.substatType),
                        character.stats[level]?.[key] ?? 0,
                        'ratio',
                        locale,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Materiales de ascenso">
        <CostList costs={ascension} />
      </Section>

      <Section title="Materiales de talentos">
        <CostList costs={talentCosts} />
      </Section>

      {detail.talents && (
        <Section title="Talentos">
          <ul className="space-y-3">
            {[...detail.talents.combat, ...detail.talents.passive].map((talent) => (
              <li key={talent.name} className="rounded border border-edge bg-surface p-3">
                <p className="text-sm">{talent.name}</p>
                {talent.description && (
                  <p className="mt-1 whitespace-pre-line text-xs text-muted">
                    {talent.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {detail.constellation && (
        <Section title={detail.constellation.name}>
          <ol className="space-y-3">
            {detail.constellation.levels.map((level, index) => (
              <li key={level.name} className="rounded border border-edge bg-surface p-3">
                <p className="text-sm">
                  <span className="font-mono text-muted">C{index + 1}</span> {level.name}
                </p>
                {level.description && (
                  <p className="mt-1 whitespace-pre-line text-xs text-muted">
                    {level.description}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function CostList({ costs }: { costs: ReturnType<typeof resolveCosts> }) {
  if (costs.length === 0) return <p className="text-sm text-muted">Sin datos.</p>;

  return (
    <ul className="space-y-2">
      {costs.map(({ phase, items }) => (
        <li
          key={phase}
          className="flex flex-wrap items-center gap-3 rounded border border-edge bg-surface px-3 py-2"
        >
          <span className="w-20 font-mono text-xs text-muted">{phase}</span>
          {items.map((item) => (
            <span key={item.id} className="flex items-center gap-1 font-mono text-xs">
              <GameIcon
                filename={item.icon}
                kind="material"
                className="h-6 w-6"
                sizes="24px"
              />
              <span className="text-muted">{item.name}</span>
              <span>×{item.count}</span>
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}
