import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

const SURFACE  = "rgba(255,255,255,0.03)";
const SURFACE2 = "rgba(255,255,255,0.055)";
const BORDER   = "rgba(255,255,255,0.07)";
const MUTED    = "rgba(255,255,255,0.28)";
const SECONDARY = "rgba(255,255,255,0.45)";

// Deterministic hue from a string
function strHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
}

function VoiceAvatar({ name }: { name: string }) {
  const hue = strHue(name);
  return (
    <div
      className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-[13px] font-semibold"
      style={{
        background: `linear-gradient(135deg, hsl(${hue},60%,35%), hsl(${(hue+40)%360},70%,50%))`,
        color: "#fff",
        boxShadow: `0 0 12px hsla(${hue},60%,50%,0.25)`,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function ProfilesView() {
  const qc = useQueryClient();
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.profiles });
  const [name,   setName]   = useState("");
  const [sample, setSample] = useState<File | null>(null);
  const [expanded, setExpanded] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      if (!sample)      throw new Error("Choose a reference audio sample");
      const form = new FormData();
      form.append("name", name.trim());
      form.append("sample", sample);
      return api.createProfile(form);
    },
    onSuccess: () => {
      setName("");
      setSample(null);
      setExpanded(false);
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteProfile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  return (
    <div className="p-8 max-w-[600px] mx-auto space-y-6">
      {/* Header */}
      <header className="pt-2 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "#eeeef5" }}>
            Voices
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: SECONDARY }}>
            Saved target voices for quick conversion.
          </p>
        </div>
        <button
          onClick={() => setExpanded((x) => !x)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition"
          style={{
            background: expanded ? "rgba(124,77,255,0.16)" : SURFACE2,
            border: `1px solid ${expanded ? "rgba(124,77,255,0.35)" : BORDER}`,
            color: expanded ? "#c9aaff" : SECONDARY,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          Add voice
        </button>
      </header>

      <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

      {/* Add form */}
      {expanded && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
        >
          <div className="text-[11px] uppercase tracking-widest" style={{ color: MUTED }}>
            New voice profile
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Voice name (e.g. Morgan Freeman)"
            className="w-full rounded-lg px-3 py-2 text-[13px] transition"
            style={{
              background: SURFACE2,
              border: `1px solid ${BORDER}`,
              color: "#e8e8f0",
            }}
          />
          <label
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition"
            style={{ background: SURFACE2, border: `1px solid ${BORDER}` }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ color: MUTED, shrink: 0 }}>
              <path d="M7.5 1.5a.5.5 0 0 1 .5.5v5.793l1.646-1.647a.5.5 0 0 1 .708.708l-2.5 2.5a.5.5 0 0 1-.708 0l-2.5-2.5a.5.5 0 1 1 .708-.708L7 7.793V2a.5.5 0 0 1 .5-.5ZM2 11.5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1h-10a.5.5 0 0 1-.5-.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-[12px]" style={{ color: SECONDARY }}>Reference audio</div>
              <div className="text-[13px] truncate mt-0.5" style={{ color: sample ? "#c9aaff" : MUTED }}>
                {sample ? sample.name : "Choose a 1–30s audio file"}
              </div>
            </div>
            <input type="file" accept="audio/*" className="hidden"
              onChange={(e) => setSample(e.target.files?.[0] ?? null)} />
          </label>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="rounded-lg px-4 py-2 text-[13px] font-medium transition"
              style={{
                background: "linear-gradient(135deg,#7c4dff,#9d6fff)",
                color: "#fff",
                boxShadow: "0 2px 12px rgba(124,77,255,0.3)",
                opacity: create.isPending ? 0.6 : 1,
              }}
            >
              {create.isPending ? "Saving…" : "Save voice"}
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="rounded-lg px-3 py-2 text-[13px] transition"
              style={{ color: MUTED }}
            >
              Cancel
            </button>
          </div>
          {create.isError && (
            <div className="text-[12px]" style={{ color: "#f87171" }}>
              {(create.error as Error).message}
            </div>
          )}
        </div>
      )}

      {/* Voice list */}
      <div className="space-y-2">
        {profiles.isLoading && (
          <div className="text-[13px]" style={{ color: MUTED }}>Loading…</div>
        )}
        {profiles.data?.length === 0 && (
          <div
            className="rounded-xl px-5 py-8 text-center"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
          >
            <div className="text-[13px]" style={{ color: MUTED }}>No saved voices yet.</div>
            <div className="text-[12px] mt-1" style={{ color: "rgba(255,255,255,0.15)" }}>
              Add a voice above to use it in conversions.
            </div>
          </div>
        )}
        {profiles.data?.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-xl px-4 py-3 group transition"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
            onMouseEnter={(e) => (e.currentTarget.style.border = `1px solid ${BORDER}`)}
          >
            <VoiceAvatar name={p.name} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium truncate" style={{ color: "#e8e8f0" }}>
                {p.name}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: MUTED }}>
                {p.language.toUpperCase()} · Added {new Date(p.created_at).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={() => remove.mutate(p.id)}
              className="opacity-0 group-hover:opacity-100 rounded-lg p-1.5 transition"
              style={{ color: "rgba(248,113,113,0.6)" }}
              title="Remove voice"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
