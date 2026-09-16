import { redirect } from 'next/navigation';

import { DEFAULT_LOCALE } from '@/lib/data/locales';

export default function Home() {
  redirect(`/${DEFAULT_LOCALE}/characters`);
}
