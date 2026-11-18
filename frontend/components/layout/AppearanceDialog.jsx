'use client';
import { Check, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { cn } from '@/lib/utils';
import { ACCENTS, usePrefs, setPrefs, resetPrefs } from '@/lib/preferences';

function Segmented({ value, options, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border bg-slate-50 p-0.5">
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn('rounded-md px-3 py-1.5 text-[12.5px] font-medium transition', value === v ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900')}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Row({ title, hint, children }) {
  return (
    <div className="flex flex-col gap-2 border-b py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-[13.5px] font-medium text-slate-900">{title}</p>{hint && <p className="text-[12px] text-slate-500">{hint}</p>}</div>
      {children}
    </div>
  );
}

/** "Appearance" (user menu): personal display settings, saved in this browser only. */
export function AppearanceDialog({ open, onOpenChange }) {
  const p = usePrefs();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Appearance</DialogTitle>
          <DialogDescription>Personalise how the CRM looks for you. Saved on this device; nobody else is affected.</DialogDescription>
        </DialogHeader>
        <div>
          <Row title="Accent colour" hint="Buttons, links and highlights">
            <div className="flex flex-wrap gap-2">
              {Object.entries(ACCENTS).map(([k, a]) => (
                <button key={k} type="button" title={a.label} aria-label={a.label} aria-pressed={p.accent === k} onClick={() => setPrefs({ accent: k })}
                  className={cn('flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 transition', p.accent === k && 'ring-2 ring-slate-400')}
                  style={{ background: `hsl(${a.primary})` }}>
                  {p.accent === k && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
              ))}
            </div>
          </Row>
          <Row title="Density" hint="Compact fits more leads on screen">
            <Segmented label="Density" value={p.density} onChange={(v) => setPrefs({ density: v })} options={[['comfortable', 'Comfortable'], ['compact', 'Compact']]} />
          </Row>
          <Row title="Text size">
            <Segmented label="Text size" value={p.textSize} onChange={(v) => setPrefs({ textSize: v })} options={[['s', 'Small'], ['m', 'Default'], ['l', 'Large']]} />
          </Row>
          <Row title="Corners">
            <Segmented label="Corners" value={p.corners} onChange={(v) => setPrefs({ corners: v })} options={[['square', 'Sharp'], ['rounded', 'Rounded'], ['soft', 'Soft']]} />
          </Row>
          <Row title="Pin lead counts" hint="Keep Total / New / Today visible while scrolling">
            <Switch checked={p.stickySummary !== false} onCheckedChange={(v) => setPrefs({ stickySummary: v })} aria-label="Pin lead counts" />
          </Row>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={resetPrefs}><RotateCcw />Reset to default</Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
