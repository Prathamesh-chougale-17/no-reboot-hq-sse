import { cn } from '../lib/utils';
import { Loader2Icon } from 'lucide-react';

type SpinnerProps = {
  className?: string;
};

function Spinner({ className }: SpinnerProps) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
    />
  );
}

export { Spinner };
