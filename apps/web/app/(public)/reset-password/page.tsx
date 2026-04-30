import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Recovery"
      title="Choose a new password"
      description="This completes the password reset flow issued by Better Auth."
      alternateHref="/sign-in"
      alternateLabel="Return to sign in"
    >
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
