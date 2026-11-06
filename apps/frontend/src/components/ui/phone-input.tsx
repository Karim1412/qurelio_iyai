'use client';

import * as React from 'react';
import PhoneInput, { type Value } from 'react-phone-number-input';
import type { CountryCode } from 'libphonenumber-js/min';
import { cn } from '@/utils/cn';
import 'react-phone-number-input/style.css';

export type QurelioPhoneValue = Value;

export interface QurelioPhoneInputProps {
  id?: string;
  name?: string;
  /** E.164 or any string from the API; forwarded to react-phone-number-input. */
  value?: React.ComponentProps<typeof PhoneInput>['value'];
  onChange: (value?: Value) => void;
  onBlur?: () => void;
  disabled?: boolean;
  error?: boolean;
  /** ISO 3166-1 alpha-2; default US to match common signup flows. */
  defaultCountry?: CountryCode;
}

/**
 * International phone field: country selector + formatted input (E.164 when complete).
 */
export function QurelioPhoneInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  disabled,
  error,
  defaultCountry = 'US',
}: QurelioPhoneInputProps) {
  return (
    <div
      className={cn(
        'flex min-h-10 w-full items-center rounded-xl border bg-[var(--surface)] px-3',
        'border-[var(--input-border)] transition-[border-color,box-shadow]',
        error && 'border-red-500 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]',
        !error &&
          'focus-within:border-[var(--brand-primary)] focus-within:shadow-[0_0_0_3px_rgba(77,146,196,0.2)]',
      )}
    >
      <PhoneInput
        id={id}
        name={name}
        international
        defaultCountry={defaultCountry}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        autoComplete="tel"
        limitMaxLength
        className="qurelio-phone-input !flex !min-h-0 !w-full min-w-0 flex-1 items-center border-0 bg-transparent"
        numberInputProps={{
          className:
            '!min-h-0 !min-w-0 !flex-1 !rounded-none !border-0 !bg-transparent py-2 pl-1 pr-0 text-sm text-[var(--text-primary)] outline-none ring-0 placeholder:text-[var(--muted)] focus:ring-0',
          'aria-invalid': error,
        }}
      />
    </div>
  );
}
