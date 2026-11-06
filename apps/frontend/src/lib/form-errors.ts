import toast from 'react-hot-toast';
import type { FieldErrors, FieldValues } from 'react-hook-form';

/** Surfaces the first nested field error (including Zod refine paths) in a toast. */
export function toastFirstFieldError<T extends FieldValues>(errors: FieldErrors<T>) {
  const walk = (e: FieldErrors): string | undefined => {
    for (const val of Object.values(e)) {
      if (!val || typeof val !== 'object') continue;
      if ('message' in val && typeof (val as { message?: unknown }).message === 'string') {
        return (val as { message: string }).message;
      }
      const nested = walk(val as FieldErrors);
      if (nested) return nested;
    }
    return undefined;
  };
  toast.error(walk(errors as FieldErrors) ?? 'Please fix the highlighted fields.');
}
