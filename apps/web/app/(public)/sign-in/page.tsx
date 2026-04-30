import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="Authentication"
      title="Sign in to your workspace"
      description="Use your account session to access your workspace, operational dashboards, and member management APIs."
      alternateHref="/sign-up"
      alternateLabel="Need an account? Create one"
    >
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
