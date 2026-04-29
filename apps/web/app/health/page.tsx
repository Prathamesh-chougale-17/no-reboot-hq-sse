import { HealthDashboard } from '@/components/health-dashboard';
import { getRequiredRoleUser } from '@/lib/auth';
import { publicEnv } from '@/lib/env';

export default async function HealthPage() {
  await getRequiredRoleUser(['owner', 'admin'], '/health');

  return <HealthDashboard environment={publicEnv.NEXT_PUBLIC_APP_ENV} apiAccessPath="/api/v1" />;
}
