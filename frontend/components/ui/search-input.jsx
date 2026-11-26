'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Search field with the icon, a clear button and a "/" shortcut hint.
 *   <SearchInput value={q} onChange={setQ} placeholder="Search…" shortcut />
 * `onChange` receives the string, not the event.
 */
export const SearchInput = forwardRef(function SearchInput(
  { value, onChange, placeholder = 'Search…', shortcut = false, className, inputClassName, 'aria-label': ariaLabel, ...props },
  ref,
) {
  const inputRef = useRef(null);
  useImperativeHandle(ref, () => inputRef.current);

  // Press "/" anywhere (outside a text field) to jump to the search box.
  useEffect(() => {
    if (!shortcut) return undefined;
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  return (
    <div
      className={cn(
        'group relative flex h-11 items-center rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all lg:h-9',
        'hover:border-slate-300 focus-within:border-[hsl(var(--primary))] focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]',
        className,
      )}
    >
      <Search className="pointer-events-none ml-3 h-4 w-4 shrink-0 text-slate-400 transition-colors group-focus-within:text-[hsl(var(--primary))]" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.preventDefault(); onChange(''); } }}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          'h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13.5px] text-slate-900 outline-none placeholder:text-slate-400',
          '[&::-webkit-search-cancel-button]:hidden',
          inputClassName,
        )}
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => { onChange(''); inputRef.current?.focus(); }}
          className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : shortcut ? (
        <kbd className="mr-2.5 hidden h-5 shrink-0 items-center rounded border border-slate-200 bg-slate-50 px-1.5 font-sans text-[11px] font-medium text-slate-400 sm:inline-flex" aria-hidden>/</kbd>
      ) : null}
    </div>
  );
});
