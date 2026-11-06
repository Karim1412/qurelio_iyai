'use client';

import React, { useRef } from 'react';

/** Required-field teal dot (matches the mockup). */
export function ReqDot() {
  return <span className="required-dot" aria-hidden />;
}

/** Chip-style tag input scoped to the company wizard design. */
export function QwTagField({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (raw: string) => {
    const val = raw.trim().replace(/,$/, '');
    if (val.length < 1) return;
    if (tags.includes(val)) return;
    onChange([...tags, val]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input.value);
      input.value = '';
    } else if (e.key === 'Backspace' && input.value === '' && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="tag-field" onClick={() => inputRef.current?.focus()}>
      {tags.map((tag, i) => (
        <span className="tag-chip" key={`${tag}-${i}`}>
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(tags.filter((_, idx) => idx !== i));
            }}
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="tag-input-inner"
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

/** Multi-select checkbox grid scoped to the company wizard design. */
export function QwCheckGrid({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt],
    );
  };

  return (
    <div className="checkbox-grid">
      {options.map((opt) => {
        const checked = selected.includes(opt);
        return (
          <label key={opt} className={`check-option${checked ? ' checked' : ''}`}>
            <input type="checkbox" checked={checked} onChange={() => toggle(opt)} />
            <span className="check-box" />
            {opt}
          </label>
        );
      })}
    </div>
  );
}
