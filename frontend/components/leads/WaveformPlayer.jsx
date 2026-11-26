'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Pause, Play, RotateCcw, RotateCw, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const BARS = 110;
const SPEEDS = [1, 1.25, 1.5, 2];
const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/** Reduces decoded audio to BARS peak values between 0 and 1. */
function peaksFrom(buffer) {
  const data = buffer.getChannelData(0);
  const size = Math.floor(data.length / BARS) || 1;
  const out = [];
  for (let i = 0; i < BARS; i++) {
    let max = 0;
    const start = i * size;
    for (let j = start; j < start + size && j < data.length; j += 16) {
      const v = Math.abs(data[j]);
      if (v > max) max = v;
    }
    out.push(max);
  }
  const top = Math.max(...out, 0.01);
  return out.map((v) => Math.max(0.06, Math.pow(v / top, 0.8)));
}

// Used when the file can't be decoded in the browser: a gentle, stable pattern so the player still looks right.
const fallbackPeaks = () => Array.from({ length: BARS }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)));

/**
 * Audio player that draws the recording as spikes (bars). Played bars fill with colour, the bars at the playhead
 * pulse with the live volume, and clicking / dragging the spikes seeks.
 */
export function WaveformPlayer({ src, initialDuration, fileName = 'call-recording', shareTitle = 'Call recording', shareText = '', shareUrl }) {
  const audioRef = useRef(null);
  const trackRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(0);
  const [peaks, setPeaks] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(initialDuration || 0);
  const [level, setLevel] = useState(0);
  const [live, setLive] = useState([0, 0, 0, 0, 0]);
  const [hover, setHover] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(''); // '' | 'download' | 'share'
  const blobRef = useRef(null);

  // The file is fetched with the user's session; reuse it for download / share.
  const getFile = async () => {
    if (!blobRef.current) {
      const res = await fetch(src, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      blobRef.current = await res.blob();
    }
    const blob = blobRef.current;
    const ext = /wav/.test(blob.type) ? 'wav' : /ogg/.test(blob.type) ? 'ogg' : /mp4|m4a|aac/.test(blob.type) ? 'm4a' : 'mp3';
    const name = `${fileName.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'call-recording'}.${ext}`;
    return { blob, name, file: new File([blob], name, { type: blob.type || 'audio/mpeg' }) };
  };

  const download = async () => {
    setBusy('download');
    try {
      const { blob, name } = await getFile();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success('Recording downloaded');
    } catch { toast.error('Could not download the recording'); }
    setBusy('');
  };

  const share = async () => {
    setBusy('share');
    try {
      const { file } = await getFile();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: shareTitle, text: shareText });
      } else if (shareUrl) {
        await navigator.clipboard.writeText([shareTitle, shareText, shareUrl].filter(Boolean).join('\n'));
        toast.success('Sharing files is not supported in this browser. Link copied: only CRM users with access can open it.');
      } else {
        toast.error('Sharing is not supported in this browser. Use Download instead.');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') toast.error('Could not share the recording');
    }
    setBusy('');
  };

  // Fetch and decode the file once to draw its real shape.
  useEffect(() => {
    let cancelled = false;
    setPeaks(null); setState('loading'); setTime(0); setPlaying(false);
    (async () => {
      try {
        const res = await fetch(src, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const audio = await ctx.decodeAudioData(buf);
        ctx.close?.();
        if (cancelled) return;
        setPeaks(peaksFrom(audio));
        setDur((d) => d || audio.duration);
        setState('ready');
      } catch {
        if (cancelled) return;
        setPeaks(fallbackPeaks());
        setState('ready'); // still playable through the <audio> element
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  // Animation loop while playing: playhead position and live volume.
  const tick = useCallback(() => {
    const a = audioRef.current;
    if (a) setTime(a.currentTime);
    const an = analyserRef.current;
    if (an) {
      const arr = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(arr);
      const bands = [0, 1, 2, 3, 4].map((b) => {
        const from = Math.floor((b / 5) * arr.length * 0.6);
        const to = Math.floor(((b + 1) / 5) * arr.length * 0.6);
        let sum = 0;
        for (let i = from; i < to; i++) sum += arr[i];
        return sum / Math.max(1, to - from) / 255;
      });
      setLive(bands);
      setLevel(bands.reduce((x, y) => x + y, 0) / bands.length);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); ctxRef.current?.close?.(); }, []);

  const ensureAnalyser = () => {
    if (analyserRef.current || !audioRef.current) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(audioRef.current);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.75;
      source.connect(an);
      an.connect(ctx.destination);
      ctxRef.current = ctx;
      analyserRef.current = an;
    } catch { /* live pulse is optional */ }
  };

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      ensureAnalyser();
      await ctxRef.current?.resume?.();
      try { await a.play(); } catch { return; }
    } else a.pause();
  };

  const seekTo = (fraction) => {
    const a = audioRef.current;
    const d = a?.duration || dur;
    if (!a || !d) return;
    a.currentTime = Math.min(d, Math.max(0, fraction * d));
    setTime(a.currentTime);
  };
  const skip = (secs) => { const a = audioRef.current; if (a) { a.currentTime = Math.max(0, Math.min((a.duration || dur), a.currentTime + secs)); setTime(a.currentTime); } };
  const fractionAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    seekTo(fractionAt(e.clientX));
  };
  const onPointerMove = (e) => {
    setHover(fractionAt(e.clientX));
    if (e.buttons === 1) seekTo(fractionAt(e.clientX));
  };
  const onKey = (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); skip(5); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-5); }
  };
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const progress = dur ? Math.min(1, time / dur) : 0;
  const head = progress * BARS;

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration); }}
        onPlay={() => { setPlaying(true); cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(tick); }}
        onPause={() => { setPlaying(false); cancelAnimationFrame(rafRef.current); setLevel(0); setLive([0, 0, 0, 0, 0]); }}
        onEnded={() => { setPlaying(false); cancelAnimationFrame(rafRef.current); setLevel(0); setLive([0, 0, 0, 0, 0]); }}
        onTimeUpdate={(e) => { if (!playing) setTime(e.currentTarget.currentTime); }}
        onError={() => setState('error')}
        className="hidden"
      />

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          disabled={state === 'error'}
          aria-label={playing ? 'Pause recording' : 'Play recording'}
          className={cn(
            'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50',
          )}
        >
          {playing && <span className="absolute inset-0 animate-ping rounded-full bg-[hsl(var(--primary))] opacity-20" />}
          {state === 'loading' && !playing ? <Loader2 className="h-5 w-5 animate-spin" /> : playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>

        {/* Spikes */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek in recording"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${fmt(time)} of ${fmt(dur)}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          className="relative flex h-16 min-w-0 flex-1 cursor-pointer touch-none select-none items-center gap-[2px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]/40"
        >
          {(peaks || Array.from({ length: BARS }, () => 0.08)).map((p, i) => {
            const played = i < head;
            const near = Math.abs(i - head) < 3;
            const pulse = playing && near ? 1 + level * 1.4 * (1 - Math.abs(i - head) / 3) : 1;
            const hovered = hover != null && i < hover * BARS && !played;
            return (
              <span
                key={i}
                className={cn(
                  'flex-1 rounded-full transition-[height,background-color] duration-100',
                  state === 'loading' && !peaks ? 'animate-pulse bg-slate-200' : played ? 'bg-[hsl(var(--primary))]' : hovered ? 'bg-[hsl(var(--primary))]/40' : 'bg-slate-300',
                )}
                style={{ height: `${Math.min(100, p * 100 * pulse)}%`, minHeight: 3 }}
              />
            );
          })}
          {dur > 0 && (
            <span
              className="pointer-events-none absolute inset-y-0 w-[2px] rounded-full bg-[hsl(var(--primary))] shadow-[0_0_8px_hsl(var(--primary))]"
              style={{ left: `calc(${progress * 100}% - 1px)` }}
            />
          )}
          {hover != null && dur > 0 && (
            <span
              className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-slate-900 px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-white"
              style={{ left: `${hover * 100}%` }}
            >
              {fmt(hover * dur)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-16 text-[12px] text-slate-500">
        <div className="flex items-center gap-3">
          <span className="tabular-nums"><span className="font-semibold text-slate-800">{fmt(time)}</span> / {fmt(dur)}</span>
          {/* Live equaliser */}
          <span className="flex h-4 items-end gap-[2px]" aria-hidden>
            {live.map((v, i) => (
              <span key={i} className="w-[3px] rounded-full bg-emerald-500 transition-[height] duration-75" style={{ height: `${playing ? 20 + v * 80 : 20}%` }} />
            ))}
          </span>
          <span className={cn('font-medium', playing ? 'text-emerald-600' : 'text-slate-400')}>{playing ? 'Playing' : state === 'error' ? 'Recording unavailable' : 'Paused'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => skip(-10)} className="rounded-md p-1.5 hover:bg-slate-100" aria-label="Back 10 seconds"><RotateCcw className="h-4 w-4" /></button>
          <button type="button" onClick={() => skip(10)} className="rounded-md p-1.5 hover:bg-slate-100" aria-label="Forward 10 seconds"><RotateCw className="h-4 w-4" /></button>
          <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />
          <button type="button" onClick={download} disabled={!!busy || state === 'error'} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50" aria-label="Download recording">
            {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span className="hidden sm:inline">Download</span>
          </button>
          <button type="button" onClick={share} disabled={!!busy || state === 'error'} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50" aria-label="Share recording">
            {busy === 'share' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}<span className="hidden sm:inline">Share</span>
          </button>
          <button type="button" onClick={cycleSpeed} className="rounded-md px-2 py-1 font-semibold tabular-nums text-slate-700 hover:bg-slate-100" aria-label="Playback speed">{speed}×</button>
        </div>
      </div>
    </div>
  );
}
