import { redirect } from 'next/navigation';

export default async function LocaleHome({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  redirect(`/${locale}/characters`);
}
