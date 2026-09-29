import { redirect } from 'next/navigation';

/**
 * Where the upgrade queue used to be. It is gone — see `../ready/page.tsx` —
 * and a bookmark to it lands on what replaced it rather than on a 404.
 */
export default async function UpgradesMoved({ params }: PageProps<'/[locale]/plan/upgrades'>) {
  const { locale } = await params;
  redirect(`/${locale}/plan/ready`);
}
