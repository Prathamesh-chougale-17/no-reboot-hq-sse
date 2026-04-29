'use client';

import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';
import { useTransition } from 'react';

import { Button } from '@acme/ui';

import { authClient } from '@/lib/auth-client';

type ButtonProps = ComponentProps<typeof Button>;

export function SignOutButton({
  className,
  size = 'default',
  variant = 'secondary',
}: Partial<Pick<ButtonProps, 'className' | 'size' | 'variant'>>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      className={className}
      size={size}
      variant={variant}
      onClick={() => {
        startTransition(async () => {
          await authClient.signOut();
          router.push('/');
          router.refresh();
        });
      }}
      disabled={isPending}
    >
      {isPending ? 'Signing out...' : 'Sign out'}
    </Button>
  );
}
