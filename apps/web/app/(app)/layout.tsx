import { AppFrame, getVisibleHeaderNavItems } from "@/components/app-frame";
import { getCurrentUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();

  return (
    <AppFrame
      currentUser={currentUser}
      navItems={getVisibleHeaderNavItems(currentUser)}
    >
      {children}
    </AppFrame>
  );
}
