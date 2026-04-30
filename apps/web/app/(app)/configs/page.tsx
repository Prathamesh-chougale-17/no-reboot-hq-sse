import { redirect } from "next/navigation";

import { ConfigWorkspace } from "@/components/config-workspace";
import { getRequiredUser } from "@/lib/auth";

export default async function ConfigsPage() {
  const viewer = await getRequiredUser("/configs");

  if (!viewer.organization) {
    redirect("/onboarding?redirectTo=/configs" as never);
  }

  return <ConfigWorkspace viewer={viewer} />;
}
