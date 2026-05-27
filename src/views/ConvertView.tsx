import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Job } from "../lib/api";

// ── shared tokens ─────────────────────────────────────────────────────────────
const SURFACE  = "rgba(255,255,255,0.03)";
const SURFACE2 = "rgba(255,255,255,0.055)";
const BORDER   = "rgba(255,255,255,0.07)";
const BORDER2  = "rgba(255,255,255,0.12)";
const MUTED    = "rgba(255,255,255,0.28)";
const SECONDARY = "rgba(255,255,255,0.45)";

// ── file picker ───────────────────────────────────────────────────────────────

function FilePick({
  label,
  sublabel,
  file,
  onPick,
}: {
  label: string;
  sublabel?: string;
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <label
      className="block rounded-xl cursor-pointer transition-all duration-150"
      style={{
        background: hover ? "rgba(124,77,255,0.06)" : SURFACE,
        border: `1px dashed ${hover ? "rgba(124,77,255,0.45)" : BORDER2}`,
        padding: "20px 16px",
        textAlign: "center",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <input
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      {/* upload icon */}
      {!file && (
        <div className="flex justify-center mb-2">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: MUTED }}>
            <path d="M10 3.5a.5.5 0 0 1 .5.5v6.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L9.5 10.793V4a.5.5 0 0 1 .5-.5Z" fill="currentColor"/>
            <path d="M3.5 14a.5.5 0 0 1 .5-.5h12a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5Z" fill="currentColor"/>
          </svg>
        </div>
      )}
      <div className="text-[12px]" style={{ color: SECONDARY }}>{label}</div>
      {sublabel && <div className="text-[11px] mt-0.5" style={{ color: MUTED }}>{sublabel}</div>}
      <div className="mt-1.5 text-[13px]" style={{ color: file ? "#c9aaff" : "rgba(255,255,255,0.55)" }}>
        {file ? file.name : "Click to choose an audio file"}
      </div>
    </label>
  );
}

// ── section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] uppercase tracking-widest mb-2"
      style={{ color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em" }}
    >
      {children}
    </div>
  );
}

// ── engine gate ───────────────────────────────────────────────────────────────

function EngineGate() {
  const qc = useQueryClient();
  const engine = useQuery({
    queryKey: ["engine"],
    queryFn: api.engineStatus,
    refetchInterval: (q) =>
      q.state.data?.loaded ? 10000 : q.state.data?.loading ? 2000 : 10000,
  });

  const load = useMutation({
    mutationFn: () => api.loadEngine(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engine"] }),
  });

  if (!engine.data || engine.data.loaded) return null;

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center justify-between gap-4"
      style={{
        background: "rgba(251,191,36,0.06)",
        border: "1px solid rgba(251,191,36,0.18)",
      }}
    >
      <div className="text-[13px]">
        {engine.data.loading ? (
          <span className="flex items-center gap-2">
            <span
              className="w-3 h-3 border-2 rounded-full animate-spin shrink-0"
              style={{ borderColor: "rgba(251,191,36,0.4)", borderTopColor: "#fbbf24" }}
            />
            <span style={{ color: "rgba(251,191,36,0.75)" }}>
              Loading model — first run downloads ~1–2 GB…
            </span>
          </span>
        ) : engine.data.load_error ? (
          <span style={{ color: "#f87171" }}>{engine.data.load_error}</span>
        ) : (
          <span style={{ color: "rgba(251,191,36,0.6)" }}>
            Voice model not loaded — load it first to convert audio.
          </span>
        )}
      </div>
      {!engine.data.loading && (
        <button
          onClick={() => load.mutate()}
          disabled={load.isPending}
          className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] transition"
          style={{
            background: "rgba(251,191,36,0.12)",
            border: "1px solid rgba(251,191,36,0.25)",
            color: "rgba(251,191,36,0.9)",
          }}
        >
          Load model
        </button>
      )}
    </div>
  );
}

// ── progress tracker ──────────────────────────────────────────────────────────

const STAGES = [
  "Starting",
  "Loading audio",
  "Extracting speech",
  "Spectrograms",
  "Target voice",
  "Aligning",
  "Diffusion",
  "Synthesising",
  "Saving",
  "Complete",
];

function stageIdx(stage: string): number {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (stage.toLowerCase().includes(STAGES[i].toLowerCase().split(" ")[0])) return i;
  }
  return 0;
}

function JobProgress({ job }: { job: Job }) {
  const pct      = Math.round(job.progress * 100);
  const isDone   = job.status === "done";
  const isFailed = job.status === "failed";
  const current  = stageIdx(job.stage);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span
          className="text-[12px]"
          style={{
            color: isFailed ? "#f87171" : isDone ? "#34d399" : "rgba(255,255,255,0.65)",
          }}
        >
          {isFailed ? (job.error ?? "Conversion failed") : job.stage}
        </span>
        <span className="text-[11px] font-mono tabular-nums" style={{ color: MUTED }}>
          {pct}%
        </span>
      </div>

      {/* Bar */}
      <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: isFailed
              ? "#f87171"
              : isDone
              ? "linear-gradient(90deg,#34d399,#6ee7b7)"
              : "linear-gradient(90deg,#7c4dff,#b06bff)",
            boxShadow: isDone ? "0 0 8px rgba(52,211,153,0.5)" : isFailed ? "none" : "0 0 8px rgba(124,77,255,0.5)",
          }}
        />
      </div>

      {/* Step segments */}
      <div className="flex gap-1">
        {STAGES.map((s, i) => {
          const done   = isDone || i < current;
          const active = !isDone && !isFailed && i === current;
          return (
            <div
              key={s}
              title={s}
              className="flex-1 h-[3px] rounded-full transition-all duration-300"
              style={{
                background: isFailed && i >= current
                  ? "rgba(248,113,113,0.2)"
                  : done
                  ? "rgba(124,77,255,0.7)"
                  : active
                  ? "#7c4dff"
                  : "rgba(255,255,255,0.07)",
                boxShadow: active ? "0 0 6px rgba(124,77,255,0.7)" : "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── quality presets ───────────────────────────────────────────────────────────

const QUALITY_PRESETS = [
  { id: "fast",     label: "Fast",     steps: 10, hint: "Quick · more artefacts" },
  { id: "balanced", label: "Balanced", steps: 25, hint: "Recommended" },
  { id: "high",     label: "High",     steps: 50, hint: "Best quality · slower" },
] as const;
type QualityId = (typeof QUALITY_PRESETS)[number]["id"];

// ── main view ─────────────────────────────────────────────────────────────────

export function ConvertView() {
  const qc = useQueryClient();
  const engine   = useQuery({ queryKey: ["engine"],   queryFn: api.engineStatus, refetchInterval: 5000 });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.profiles });

  const [source,       setSource]       = useState<File | null>(null);
  const [target,       setTarget]       = useState<File | null>(null);
  const [profileId,    setProfileId]    = useState<string>("");
  const [quality,      setQuality]      = useState<QualityId>("balanced");
  const [job,       setJob]       = useState<Job | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  const startConvert = useMutation({
    mutationFn: async () => {
      if (!source) throw new Error("Choose a source recording first");
      const preset = QUALITY_PRESETS.find((p) => p.id === quality)!;
      const form = new FormData();
      form.append("source", source);
      form.append("diffusion_steps", String(preset.steps));
      if (profileId) form.append("profile_id", profileId);
      else if (target) form.append("target", target);
      else throw new Error("Choose a target sample or pick a saved voice");
      return api.startConvert(form);
    },
    onSuccess: (initialJob) => {
      setJob(initialJob);
      setResultUrl(null);
      pollRef.current = setInterval(async () => {
        try {
          const updated = await api.jobStatus(initialJob.id);
          setJob(updated);
          if (updated.status === "done") {
            stopPolling();
            if (updated.result) {
              setResultUrl(await api.audioUrl(updated.result.id));
              qc.invalidateQueries({ queryKey: ["history"] });
            }
          } else if (updated.status === "failed") {
            stopPolling();
          }
        } catch { /* keep polling on transient errors */ }
      }, 600);
    },
  });

  const isRunning   = job?.status === "queued" || job?.status === "running";
  const engineReady = engine.data?.loaded ?? false;

  function reset() { stopPolling(); setJob(null); setResultUrl(null); }

  return (
    <div className="p-8 max-w-[600px] mx-auto space-y-6">
      {/* Header */}
      <header className="pt-2 space-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "#eeeef5" }}>
          Voice Conversion
        </h1>
        <p className="text-[13px]" style={{ color: SECONDARY }}>
          Swap a speaker's voice while keeping their exact words and delivery.
        </p>
      </header>

      <EngineGate />

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

      {/* Source */}
      <div>
        <SectionLabel>Source audio</SectionLabel>
        <FilePick
          label="Source recording"
          sublabel="The audio you want to re-voice"
          file={source}
          onPick={(f) => { setSource(f); reset(); }}
        />
      </div>

      {/* Target */}
      <div>
        <SectionLabel>Target voice</SectionLabel>
        {profiles.data && profiles.data.length > 0 && (
          <select
            value={profileId}
            onChange={(e) => { setProfileId(e.target.value); reset(); }}
            className="w-full rounded-lg px-3 py-2 text-[13px] mb-2 transition"
            style={{
              background: SURFACE2,
              border: `1px solid ${BORDER}`,
              color: profileId ? "#e8e8f0" : SECONDARY,
            }}
          >
            <option value="">— or upload a sample below —</option>
            {profiles.data.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        {!profileId && (
          <FilePick
            label="Target sample"
            sublabel="1–30s clean recording of the target speaker"
            file={target}
            onPick={(f) => { setTarget(f); reset(); }}
          />
        )}
      </div>

      {/* Quality */}
      <div>
        <SectionLabel>Quality preset</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {QUALITY_PRESETS.map((p) => {
            const active = quality === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setQuality(p.id)}
                className="rounded-lg px-3 py-2.5 text-left text-[12px] transition-all duration-100"
                style={{
                  background: active ? "rgba(124,77,255,0.14)" : SURFACE,
                  border: `1px solid ${active ? "rgba(124,77,255,0.4)" : BORDER}`,
                  color: active ? "#c9aaff" : SECONDARY,
                }}
              >
                <div className="font-medium text-[13px]">{p.label}</div>
                <div className="mt-0.5" style={{ color: active ? "rgba(201,170,255,0.6)" : MUTED }}>{p.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Convert button */}
      <button
        onClick={() => { reset(); startConvert.mutate(); }}
        disabled={isRunning || !engineReady}
        className="w-full rounded-xl py-3 text-[14px] font-medium transition-all duration-150"
        style={{
          background: isRunning || !engineReady
            ? "rgba(124,77,255,0.25)"
            : "linear-gradient(135deg,#7c4dff 0%,#9d6fff 100%)",
          color: isRunning || !engineReady ? "rgba(255,255,255,0.35)" : "#fff",
          boxShadow: isRunning || !engineReady ? "none" : "0 2px 16px rgba(124,77,255,0.35)",
          cursor: isRunning || !engineReady ? "not-allowed" : "pointer",
        }}
      >
        {isRunning ? "Converting…" : "Convert"}
      </button>

      {/* Mutation-level error */}
      {startConvert.isError && (
        <div
          className="rounded-xl px-4 py-3 text-[13px]"
          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#fca5a5" }}
        >
          {(startConvert.error as Error).message}
        </div>
      )}

      {/* Active job */}
      {job && (job.status === "queued" || job.status === "running") && (
        <div
          className="rounded-xl px-5 py-4"
          style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
        >
          <div className="text-[11px] uppercase tracking-widest mb-3" style={{ color: MUTED }}>
            Processing
          </div>
          <JobProgress job={job} />
        </div>
      )}

      {/* Failed */}
      {job?.status === "failed" && (
        <div
          className="rounded-xl px-5 py-4 space-y-3"
          style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.18)" }}
        >
          <div className="text-[12px] font-medium" style={{ color: "#f87171" }}>
            Conversion failed
          </div>
          <JobProgress job={job} />
        </div>
      )}

      {/* Result */}
      {job?.status === "done" && resultUrl && (
        <div
          className="rounded-xl px-5 py-4 space-y-4"
          style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "#34d399", boxShadow: "0 0 6px #34d399" }}
            />
            <span className="text-[12px]" style={{ color: "rgba(52,211,153,0.75)" }}>
              Conversion complete
            </span>
          </div>
          <JobProgress job={job} />
          <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />
          <audio controls src={resultUrl} className="w-full" />
          <a
            href={resultUrl}
            download
            className="inline-flex items-center gap-1.5 text-[12px] transition"
            style={{ color: "#9d7bff" }}
          >
            Export WAV
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3 5.5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
