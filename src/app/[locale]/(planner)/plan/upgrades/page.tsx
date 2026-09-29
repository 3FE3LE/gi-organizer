import { redirect } from 'next/navigation';

// Like every page under the plan's tabs, which read the URL: prerendered, the
// tabs' search params have no request to come from, and the build fails.
export const dynamic = 'force-dynamic';

/**
 * Where the upgrade queue used to be. It is gone — see `../ready/page.tsx` —
 * and a bookmark to it lands on what replaced it rather than on a 404.
 */
export default async function UpgradesMoved({ params }: PageProps<'/[locale]/plan/upgrades'>) {
  const { locale } = await params;
  redirect(`/${locale}/plan/ready`);
}
