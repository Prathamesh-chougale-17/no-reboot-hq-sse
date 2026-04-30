import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Authentication"
      title="Create your platform account"
      description="Create your account first. Workspace setup or invitation acceptance happens immediately after."
      alternateHref="/sign-in"
      alternateLabel="Already have an account? Sign in"
    >
      <Suspense fallback={null}>
        <SignUpForm />
      </Suspense>
    </AuthShell>
  );
}
