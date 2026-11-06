import { cn } from '@/utils/cn';

/** Wordmark: "Qurel" + "i" in primary blue, "o" in accent gold, matches brand assets. */
export function QurelioLogo({
  className,
  height = 32,
  withSlogan = false,
}: {
  className?: string;
  height?: number;
  withSlogan?: boolean;
}) {
  const size = height * 0.65;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline" style={{ fontFamily: 'var(--font-public-sans), sans-serif' }}>
        <span
          className="font-bold tracking-tight drop-shadow-[0_0_20px_rgba(0,174,239,0.35)]"
          style={{ fontSize: size, color: 'var(--brand-primary)', lineHeight: 1 }}
        >
          Qurel
        </span>
        <span
          className="font-bold tracking-tight drop-shadow-[0_0_18px_rgba(0,174,239,0.3)]"
          style={{ fontSize: size, color: 'var(--brand-primary)', lineHeight: 1 }}
        >
          i
        </span>
        <span
          className="font-bold tracking-tight drop-shadow-[0_0_24px_rgba(255,193,7,0.45)]"
          style={{ fontSize: size, color: 'var(--brand-accent)', lineHeight: 1 }}
        >
          o
        </span>
      </div>
      {withSlogan && (
        <p
          className="max-w-[220px] text-[11px] font-normal leading-snug"
          style={{ color: 'var(--brand-slogan)' }}
        >
          Empowering tomorrow&apos;s systems, today.
        </p>
      )}
    </div>
  );
}
