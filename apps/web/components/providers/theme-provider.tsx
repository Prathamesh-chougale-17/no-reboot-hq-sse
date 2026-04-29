'use client';

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeProps: ThemeProviderProps = {
    attribute: 'class',
    defaultTheme: 'system',
    enableSystem: true,
    disableTransitionOnChange: true,
  };

  return <NextThemesProvider {...themeProps}>{children}</NextThemesProvider>;
}
