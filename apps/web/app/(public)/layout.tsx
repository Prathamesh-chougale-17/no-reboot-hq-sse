import { AppFrame, getVisibleHeaderNavItems } from "@/components/app-frame";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppFrame currentUser={null} navItems={getVisibleHeaderNavItems(null)}>
      {children}
    </AppFrame>
  );
}
