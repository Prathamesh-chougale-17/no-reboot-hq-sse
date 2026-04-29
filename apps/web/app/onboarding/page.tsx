import { redirect } from 'next/navigation';

import { OnboardingWorkspace } from '@/components/onboarding-workspace';
import { getRequiredUser } from '@/lib/auth';

const getSafeRedirectTo = (value: string | undefined) =>
  value && value.startsWith('/') && !value.startsWith('//') ? value : '/users';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ redirectTo?: string }>;
}) {
  const viewer = await getRequiredUser('/onboarding');
  const resolvedSearchParams = await (searchParams ?? Promise.resolve(undefined));
  const redirectTo = getSafeRedirectTo(resolvedSearchParams?.redirectTo);

  if (viewer.organization) {
    redirect(redirectTo as never);
  }

  return <OnboardingWorkspace redirectTo={redirectTo} />;
}
