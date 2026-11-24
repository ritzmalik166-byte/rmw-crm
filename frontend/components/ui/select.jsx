'use client';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Drop-in replacement for <select>: same props (value / defaultValue, onChange(e) with e.target.value,
 * disabled, id, name, aria-label) and the same <option> / <optgroup> children, but the open list is ours,
 * so it looks the same on every browser and OS.
 *
 * Keyboard: Enter / Space / ↑ / ↓ open; ↑ ↓ Home End move; Enter picks; Esc or Tab closes; typing jumps
 * to a matching option (or filters, when the list is long enough to show a search box).
 */

const SEARCH_THRESHOLD = 9;

const textOf = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf(node.props.children);
  return '';
};

/** Flatten <option>, <optgroup>, fragments and arrays into a list of items. */
function collect(children, group = null, out = []) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) { collect(child.props.children, group, out); return; }
    if (child.type === 'optgroup') { collect(child.props.children, child.props.label, out); return; }
    if (child.type === 'option') {
      const label = child.props.children;
      const value = child.props.value !== undefined ? String(child.props.value) : textOf(label);
      out.push({ value, label, text: textOf(label), disabled: Boolean(child.props.disabled), group });
    }
  });
  return out;
}

const triggerBase = 'flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-[linear-gradient(180deg,hsl(214_30%_98%),#fff)] px-3 text-left text-[16px] shadow-[inset_0_1px_2px_rgba(16,24,40,0.05)] transition-[border-color,box-shadow,background] hover:border-slate-300 focus-visible:border-[hsl(var(--ring))] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[hsl(var(--ring)/0.18)] disabled:cursor-not-allowed disabled:opacity-50 lg:h-8 lg:px-2.5 lg:text-[13px]';

export const Select = React.forwardRef(function Select(
  { value, defaultValue, onChange, children, className, disabled, id, name, required, placeholder, 'aria-label': ariaLabel, title, onBlur, ...rest },
  ref,
) {
  const items = React.useMemo(() => collect(children), [children]);
  const controlled = value !== undefined;
  const [inner, setInner] = React.useState(defaultValue !== undefined ? String(defaultValue) : items[0]?.value ?? '');
  const current = controlled ? (value == null ? '' : String(value)) : inner;
  const selected = items.find((i) => i.value === current) ?? items[0];
  const isPlaceholder = !selected || selected.value === '';

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(-1);
  const [pos, setPos] = React.useState(null);
  const [container, setContainer] = React.useState(null);
  const triggerRef = React.useRef(null);
  const listRef = React.useRef(null);
  const popRef = React.useRef(null);
  const searchRef = React.useRef(null);
  const typeahead = React.useRef({ text: '', t: 0 });
  const listId = React.useId();
  React.useImperativeHandle(ref, () => triggerRef.current);

  const searchable = items.length >= SEARCH_THRESHOLD;
  const q = query.trim().toLowerCase();
  const visible = q ? items.filter((i) => i.text.toLowerCase().includes(q)) : items;

  const place = React.useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vh = window.innerHeight;
    const below = vh - r.bottom - 8;
    const above = r.top - 8;
    const want = Math.min(320, (searchable ? 52 : 0) + visible.length * 38 + 12);
    const up = below < Math.min(want, 220) && above > below;
    const maxH = Math.max(140, Math.min(320, up ? above - 6 : below - 6));
    const width = Math.max(r.width, 180);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    // Inside a dialog the list is portalled into the dialog (focus trap / outside-click rules), which is
    // transformed and scrolls, so coordinates are made relative to it. Elsewhere it's fixed to the viewport.
    const dlg = t.closest('[role="dialog"]');
    if (dlg) {
      const c = dlg.getBoundingClientRect();
      setPos({ position: 'absolute', left: left - c.left + dlg.scrollLeft, width, maxHeight: maxH,
        ...(up ? { top: r.top - c.top + dlg.scrollTop - 4, transform: 'translateY(-100%)' } : { top: r.bottom - c.top + dlg.scrollTop + 4 }) });
    } else {
      setPos({ position: 'fixed', left, width, maxHeight: maxH, ...(up ? { bottom: vh - r.top + 4 } : { top: r.bottom + 4 }) });
    }
    setContainer(dlg || document.body);
  }, [searchable, visible.length]);

  const openList = () => {
    if (disabled) return;
    setQuery('');
    setActive(Math.max(0, items.findIndex((i) => i.value === selected?.value)));
    place();
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const pick = (item) => {
    if (!item || item.disabled) return;
    if (!controlled) setInner(item.value);
    if (item.value !== current) {
      const target = { value: item.value, name, id };
      onChange?.({ target, currentTarget: target, preventDefault() {}, stopPropagation() {} });
    }
    close();
  };

  // Keep the list attached to the trigger while the page scrolls or resizes; close on outside press.
  React.useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      close(false);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;
    (searchable ? searchRef.current : listRef.current)?.focus({ preventScroll: true });
  }, [open, searchable]);

  React.useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  React.useEffect(() => { if (open) setActive(visible.length ? 0 : -1); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (dir) => {
    if (!visible.length) return;
    let i = active;
    for (let n = 0; n < visible.length; n += 1) {
      i = (i + dir + visible.length) % visible.length;
      if (!visible[i].disabled) break;
    }
    setActive(i);
  };

  const onListKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(visible.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(visible[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { close(false); }
    else if (!searchable && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      const ta = typeahead.current;
      ta.text = Date.now() - ta.t > 700 ? e.key.toLowerCase() : ta.text + e.key.toLowerCase();
      ta.t = Date.now();
      const i = visible.findIndex((it) => !it.disabled && it.text.toLowerCase().startsWith(ta.text));
      if (i >= 0) setActive(i);
    }
  };

  const onTriggerKey = (e) => {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openList(); }
  };

  let lastGroup = null;
  const list = open && pos && container && createPortal(
    <div
      ref={popRef}
      style={{ ...pos, pointerEvents: 'auto' }}
      className="z-[200] flex max-w-[min(360px,calc(100vw-16px))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_-8px_rgb(15_23_42/0.22),0_2px_6px_rgb(15_23_42/0.06)] animate-in fade-in-0 zoom-in-95 duration-100"
    >
      {searchable && (
        <div className="border-b border-slate-100 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onListKey}
              placeholder="Search…" aria-label="Search options" aria-controls={listId}
              aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-[14px] outline-none focus:border-[hsl(var(--ring))] focus:bg-white lg:h-8 lg:text-[13px]"
            />
          </div>
        </div>
      )}
      <ul
        ref={listRef} id={listId} role="listbox" tabIndex={-1} aria-label={ariaLabel || title}
        aria-activedescendant={!searchable && active >= 0 ? `${listId}-${active}` : undefined}
        onKeyDown={searchable ? undefined : onListKey}
        className="overflow-y-auto overscroll-contain p-1 outline-none"
      >
        {!visible.length && <li className="px-3 py-6 text-center text-[13px] text-slate-500">No matches</li>}
        {visible.map((it, i) => {
          const header = it.group && it.group !== lastGroup;
          lastGroup = it.group;
          const isSel = it.value === selected?.value;
          return (
            <React.Fragment key={`${it.group || ''}:${it.value}:${i}`}>
              {header && <li role="presentation" className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{it.group}</li>}
              <li
                id={`${listId}-${i}`} data-index={i} role="option" aria-selected={isSel} aria-disabled={it.disabled || undefined}
                onMouseMove={() => !it.disabled && active !== i && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(it)}
                className={cn(
                  'flex min-h-[40px] cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-[14.5px] lg:min-h-[34px] lg:py-1.5 lg:text-[13.5px]',
                  i === active && 'bg-slate-100',
                  it.value === '' ? 'text-slate-500' : isSel ? 'font-semibold text-[hsl(var(--primary))]' : 'text-slate-800',
                  it.disabled && 'cursor-not-allowed opacity-40',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {isSel && it.value !== '' && <Check className="h-4 w-4 shrink-0" aria-hidden />}
              </li>
            </React.Fragment>
          );
        })}
      </ul>
    </div>,
    container,
  );

  return (
    <>
      <button
        ref={triggerRef} type="button" id={id} disabled={disabled} title={title}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={ariaLabel}
        aria-required={required || undefined}
        onClick={() => (open ? close() : openList())} onKeyDown={onTriggerKey} onBlur={onBlur}
        className={cn(triggerBase, open && 'border-[hsl(var(--ring))] bg-white ring-[3px] ring-[hsl(var(--ring)/0.18)]', className)}
        {...rest}
      >
        <span className={cn('min-w-0 flex-1 truncate', isPlaceholder && 'text-slate-500')}>{selected?.label ?? placeholder ?? ''}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150', open && 'rotate-180')} aria-hidden />
      </button>
      {name && <input type="hidden" name={name} value={current} />}
      {list}
    </>
  );
});
