'use client';

import React, { useState, useRef, KeyboardEvent } from 'react';
import { X } from '@/components/icons';
import { cn } from '@/utils/cn';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function TagInput({ tags, onChange, placeholder = 'Type and press Enter...', className, disabled }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div
      className={cn(
        'flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 py-2 transition-hover',
        'focus-within:border-[var(--brand-primary)] focus-within:shadow-[0_0_0_3px_rgba(0,174,239,0.2)]',
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-lg bg-[var(--nav-hover)] px-2.5 py-1 text-[13px] font-medium text-[var(--brand-primary)]"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(tag);
            }}
            className="ml-0.5 rounded-full p-0.5 transition-hover hover:bg-[var(--brand-primary)]/10"
            disabled={disabled}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (inputValue.trim()) addTag(inputValue);
        }}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="min-w-[140px] flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--muted)]"
        disabled={disabled}
      />
    </div>
  );
}
