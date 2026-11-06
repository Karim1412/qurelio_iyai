'use client';

import { usePathname } from 'next/navigation';
import { PlaceholderRoutePage } from '@/components/ui/placeholder-route-page';

const TRAINING_COPY: Record<string, { title: string; description: string }> = {
  '/training/my': {
    title: 'Page not found',
    description:
      "My training isn't available yet. Use the navigation to continue, or return to the dashboard.",
  },
  '/training/organization': {
    title: 'Page not found',
    description:
      "Organization training isn't available yet. Use the navigation to continue, or return to the dashboard.",
  },
  '/training/rules': {
    title: 'Page not found',
    description:
      "Training rules aren't available yet. Use the navigation to continue, or return to the dashboard.",
  },
};

export default function TrainingPlaceholderPage() {
  const pathname = usePathname() ?? '/training/my';
  const copy = TRAINING_COPY[pathname] ?? {
    title: 'Page not found',
    description: "This page doesn't exist yet or has no content. Use the navigation to continue.",
  };

  return (
    <PlaceholderRoutePage
      title={copy.title}
      description={copy.description}
    />
  );
}
