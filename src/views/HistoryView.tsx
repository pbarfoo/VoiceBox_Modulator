import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useEffect, useState } from "react";

const SURFACE   = "rgba(255,255,255,0.03)";
const BORDER    = "rgba(255,255,255,0.07)";
const MUTED     = "rgba(255,255,255,0.28)";
const SECONDARY = "rgba(255,255,255,0.45)";

function RelativeTime({ iso }: { iso: string }) {
  const d     = new Date(iso);
  const now   = Date.now();
  const diff  = now - d.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  const label =
    mins  < 1   ? "just now" :
    mins  < 60  ? `${mins}m ago` :
    hours < 24  ? `${hours}h ago` :
    days  < 7   ? `${days}d ago` :
    d.toLocaleDateString();
  return <span title={d.toLocaleString()}>{label}</span>;
}

function EngineChip({ engine }: { engine: string }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
      style={{ background: "rgba(124,77,255,0.12)", color: "rgba(124,77,255,0.75)", border: "1px solid rgba(124,77,255,0.2)" }}
    >
      {engine}
    </span>
  );
}

export function HistoryView() {
  const history = useQuery({ queryKey: ["history"], queryFn: api.history, refetchInterval: 8000 });
  const [urls,    setUrls]    = useState<Record<string, string>>({});
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const map: Record<string, string> = {};
      for (const rec of history.data ?? []) map[rec.id] = await api.audioUrl(rec.id);
      setUrls(map);
    })();
  }, [history.data]);

  const items = history.data ?? [];

  return (
    <div className="p-8 max-w-[660px] mx-auto space-y-6">
      {/* Header */}
      <header className="pt-2">
        <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "#eeeef5" }}>
          History
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: SECONDARY }}>
          Past voice conversions — click to replay.
        </p>
      </header>

      <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

      {history.isLoading && (
        <div className="text-[13px]" style={{ color: MUTED }}>Loading…</div>
      )}

      {items.length === 0 && !history.isLoading && (
        <div
          className="rounded-xl px-5 py-10 text-center"
          style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
        >
          <div className="text-[13px]" style={{ color: MUTED }}>No conversions yet.</div>
          <div className="text-[12px] mt-1" style={{ color: "rgba(255,255,255,0.15)" }}>
            Run a conversion on the Convert tab to see it here.
          </div>
        </div>
      )}

      <div className="space-y-2">
        {[...items].reverse().map((rec) => {
          const isOpen = playing === rec.id;
          return (
            <div
              key={rec.id}
              className="rounded-xl overflow-hidden transition-all duration-150"
              style={{
                background: SURFACE,
                border: `1px solid ${isOpen ? "rgba(124,77,255,0.25)" : BORDER}`,
              }}
            >
              {/* Row header */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition"
                onClick={() => setPlaying(isOpen ? null : rec.id)}
              >
                {/* Play / Collapse icon */}
                <div
                  className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center transition"
                  style={{
                    background: isOpen ? "rgba(124,77,255,0.22)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${isOpen ? "rgba(124,77,255,0.4)" : BORDER}`,
                  }}
                >
                  {isOpen ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <rect x="2" y="2" width="2.5" height="6" rx="1" fill="#9d7bff"/>
                      <rect x="5.5" y="2" width="2.5" height="6" rx="1" fill="#9d7bff"/>
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M3 2l5 3-5 3V2Z" fill={MUTED}/>
                    </svg>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium truncate" style={{ color: "#e8e8f0" }}>
                      {rec.profile_name ?? "Uploaded sample"}
                    </span>
                    <EngineChip engine={rec.engine} />
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: MUTED }}>
                    <RelativeTime iso={rec.created_at} />
                  </div>
                </div>

                {urls[rec.id] && (
                  <a
                    href={urls[rec.id]}
                    download
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition"
                    style={{ color: MUTED }}
                    title="Download WAV"
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M6.5 1v8M3.5 6l3 3 3-3M1 11h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </a>
                )}
              </button>

              {/* Expanded player */}
              {isOpen && urls[rec.id] && (
                <div
                  className="px-4 pb-4"
                  style={{ borderTop: `1px solid rgba(255,255,255,0.05)` }}
                >
                  <div className="pt-3">
                    <audio
                      autoPlay
                      controls
                      src={urls[rec.id]}
                      className="w-full"
                    />
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-[11px]" style={{ color: MUTED }}>
                    <span>Engine: {rec.engine}</span>
                    <span>·</span>
                    <span>{new Date(rec.created_at).toLocaleString()}</span>
                    <a
                      href={urls[rec.id]}
                      download
                      className="ml-auto transition"
                      style={{ color: "#9d7bff" }}
                    >
                      Export WAV ↓
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
