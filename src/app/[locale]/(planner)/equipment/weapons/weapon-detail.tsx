'use client';

import { PackageOpen, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { AssetImage } from '@/components/asset-image';
import { assetSize } from '@/lib/data/assets';
import { GameText } from '@/components/game-text';
import { buttonVariants } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { WeaponPassive } from '@/components/weapon-passive';
import { WeaponTypeIcon } from '@/components/weapon-type-icon';

import { loadWeaponDetail, type WeaponDetail } from './detail-action';

/**
 * The card's icon and name, opening into the weapon at full size.
 *
 * The card has room for one line of stats, and on a phone that line cut the
 * substat's value off — the number the player opened the card to read. The
 * dialog has the wish art, the whole level table, the passive open with its
 * slider and every copy, fetched when it opens; see `loadWeaponDetail`.
 */
export function WeaponDetailTrigger({
  weaponId,
  locale,
  name,
  refinement,
  className,
  children,
}: {
  weaponId: number;
  locale: string;
  name: string;
  /** Where the passive's slider opens: the best copy owned, else R1. */
  refinement: number;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('weapons');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<WeaponDetail | null>(null);

  const show = () => {
    setOpen(true);
    if (!detail) loadWeaponDetail({ locale, weaponId }).then(setDetail);
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={t('detailOpen', { name })}
        className={`cursor-pointer rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${className ?? ''}`}
      >
        {children}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="panel max-h-[90vh] gap-0 overflow-y-auto p-0 ring-0 sm:max-w-3xl"
        >
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-edge bg-surface px-4 py-3">
            {detail?.type && (
              <WeaponTypeIcon weapon={detail.type} label={detail.typeText} className="h-5 w-5 shrink-0" />
            )}
            <DialogTitle className="min-w-0 flex-1 truncate text-sm font-normal">{name}</DialogTitle>
            {detail && (
              <span className="font-mono text-xs text-accent">{'★'.repeat(detail.rarity)}</span>
            )}
            <DialogClose
              aria-label={t('detailClose')}
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            >
              <X size={16} aria-hidden />
            </DialogClose>
          </header>

          {detail ? <Body detail={detail} refinement={refinement} /> : <Loading />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Body({ detail, refinement }: { detail: WeaponDetail; refinement: number }) {
  const t = useTranslations('weapons');
  const max = detail.rows.at(-1);

  return (
    <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,15rem)_1fr]">
      {/* The wish art, over the rarity's colour as on the cards: a full-width
          square on a phone, a column as tall as its row from `sm`, the weapon
          drawn as large as fits in either. Falls back to the inventory icon for the
          few weapons the host has no art for. */}
      <figure
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-edge sm:aspect-auto sm:min-h-96"
        style={{
          background: detail.rarity >= 4
            ? `linear-gradient(to top, color-mix(in oklab, var(${detail.rarity >= 5 ? '--rarity-5' : '--rarity-4'}) 35%, transparent), transparent)`
            : undefined,
        }}
      >
        {detail.art ? (
          <WishArt src={detail.art} fallback={detail.icon} alt={detail.name} />
        ) : (
          <AssetImage src={detail.icon} kind="weapon" alt={detail.name} className="h-3/4 w-3/4 sm:h-40 sm:w-40" sizes="(min-width: 640px) 160px, 90vw" />
        )}
      </figure>

      <div className="min-w-0 space-y-4">
        {/* The figure the card had no room for, first and large. */}
        {max && (
          <dl className="grid grid-cols-2 gap-2">
            <Stat label={detail.atkLabel} value={String(max.atk)} />
            {detail.subLabel && max.sub && <Stat label={detail.subLabel} value={max.sub} />}
          </dl>
        )}

        {detail.passive && (
          <div className="card-2 px-3 py-2.5">
            <WeaponPassive passive={detail.passive} refinement={refinement} fold={false} />
          </div>
        )}

        <section>
          <h3 className="mb-1.5 font-mono text-2xs uppercase tracking-wide text-muted">{t('statsHeading')}</h3>
          <table className="tabular w-full font-mono text-xs">
            <thead className="text-2xs uppercase tracking-wide text-muted">
              <tr className="border-b border-edge">
                <th scope="col" className="py-1 text-left font-normal">{t('levelColumn')}</th>
                <th scope="col" className="py-1 text-right font-normal">{detail.atkLabel}</th>
                {detail.subLabel && <th scope="col" className="py-1 text-right font-normal">{detail.subLabel}</th>}
              </tr>
            </thead>
            <tbody>
              {detail.rows.map((row) => (
                <tr key={row.level} className={`border-b border-edge/40 last:border-b-0 ${row === max ? 'text-accent' : ''}`}>
                  <td className="py-1">{row.level}</td>
                  <td className="py-1 text-right">{row.atk}</td>
                  {detail.subLabel && <td className="py-1 text-right">{row.sub}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="mb-1.5 font-mono text-2xs uppercase tracking-wide text-muted">{t('copiesHeading')}</h3>
          {detail.copies.length === 0 ? (
            <p className="text-xs text-muted">{t('noCopies')}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {detail.copies.map((copy) => (
                <li key={copy.id} className="flex h-8 items-center gap-1.5 rounded-full border border-edge pl-0.5 pr-2.5 font-mono text-2xs tabular">
                  {copy.holder ? (
                    <AssetImage src={copy.holderIcon} kind="avatar" alt="" className="h-7 w-7 rounded-full bg-surface-2" sizes="28px" />
                  ) : (
                    <PackageOpen size={14} aria-hidden className="ml-1.5 text-muted" />
                  )}
                  <span className="max-w-32 truncate font-sans text-xs">{copy.holder ?? t('free')}</span>
                  <span className="text-muted">R{copy.refinement} · {copy.level}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {detail.description && (
          <GameText text={detail.description} className="text-xs italic leading-relaxed text-muted" />
        )}
      </div>
    </div>
  );
}

/**
 * The wish art, trimmed to the weapon.
 *
 * The art is a 1:2 canvas with the weapon somewhere inside it and the rest
 * transparent — a polearm corner to corner, a catalyst a small square in the
 * middle. Fitted whole, a catalyst came out a third of the size its frame had
 * room for. So once it loads, its opaque pixels are measured on a small canvas
 * and the image is placed so that box, not the canvas, fills the frame with a
 * margin: the square on a phone, the tall column beside the stats from `sm`.
 * The frame's shape is watched, since the column is as tall as its row. Until
 * the measure lands the art is drawn whole.
 */
function WishArt({ src, fallback, alt }: { src: string; fallback: string | null; alt: string }) {
  // The weapon's box, in units of the image's width.
  const [bounds, setBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  // The frame's height over its width.
  const [frame, setFrame] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const { width, height } = assetSize('weaponGacha');

  useEffect(() => {
    const box = imageRef.current?.parentElement;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      if (w > 0) setFrame(h / w);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  if (failed) {
    return <AssetImage src={fallback} kind="weapon" alt={alt} className="h-3/4 w-3/4 sm:h-40 sm:w-40" sizes="(min-width: 640px) 160px, 90vw" />;
  }

  const measure = (image: HTMLImageElement) => {
    const ratio = image.naturalHeight / image.naturalWidth;
    const columns = 64;
    const rows = Math.round(columns * ratio);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = columns;
      canvas.height = rows;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, columns, rows);
      const { data } = context.getImageData(0, 0, columns, rows);
      let [minX, minY, maxX, maxY] = [columns, rows, -1, -1];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
          if (data[(y * columns + x) * 4 + 3] < 24) continue;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
      if (maxX < 0) return;
      setBounds({
        x: minX / columns,
        y: (minY / rows) * ratio,
        width: (maxX - minX + 1) / columns,
        height: ((maxY - minY + 1) / rows) * ratio,
      });
    } catch {
      // A canvas the browser will not read back: the art stays whole.
    }
  };

  /*
   * In units of the frame's width, with the image `scale` wide: the weapon's
   * box scaled to fit the frame either way, then centred. `top` is a share of
   * the frame's height, which is what a percentage `top` is.
   */
  let fit: { left: number; top: number; width: number } | null = null;
  if (bounds && frame) {
    const scale = 0.88 * Math.min(1 / bounds.width, frame / bounds.height);
    fit = {
      left: (1 - bounds.width * scale) / 2 - bounds.x * scale,
      top: ((frame - bounds.height * scale) / 2 - bounds.y * scale) / frame,
      width: scale,
    };
  }

  return (
    <Image
      ref={imageRef}
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes="(min-width: 640px) 480px, 180vw"
      onLoad={(event) => measure(event.currentTarget)}
      onError={() => setFailed(true)}
      style={fit ? {
        '--art-left': `${fit.left * 100}%`,
        '--art-top': `${fit.top * 100}%`,
        '--art-width': `${fit.width * 100}%`,
      } as React.CSSProperties : undefined}
      className={fit
        ? 'absolute top-(--art-top) left-(--art-left) h-auto w-(--art-width) max-w-none'
        : 'absolute inset-0 m-auto h-full w-auto'}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-2 px-3 py-2">
      <dt className="truncate font-mono text-2xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="tabular font-mono text-lg text-text">{value}</dd>
    </div>
  );
}

function Loading() {
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,15rem)_1fr]">
      <Bone className="aspect-square w-full sm:aspect-auto sm:h-80" />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Bone className="h-14" />
          <Bone className="h-14" />
        </div>
        <Bone className="h-24" />
        <Bone className="h-40" />
      </div>
    </div>
  );
}

/** `Skeleton`'s block; that module reads server translations, so not imported. */
function Bone({ className }: { className: string }) {
  return <span aria-hidden className={`block animate-pulse rounded bg-surface-2 motion-reduce:animate-none ${className}`} />;
}
