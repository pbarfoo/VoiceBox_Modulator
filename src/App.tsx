import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api";
import { useUI, type Tab } from "./store";
import { ConvertView } from "./views/ConvertView";
import { ProfilesView } from "./views/ProfilesView";
import { HistoryView } from "./views/HistoryView";

// ── nav items ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "convert",
    label: "Convert",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="shrink-0">
        <path d="M7.5 1a6.5 6.5 0 1 0 0 13A6.5 6.5 0 0 0 7.5 1ZM0 7.5a7.5 7.5 0 1 1 15 0 7.5 7.5 0 0 1-15 0Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
        <path d="M6 5.5a.5.5 0 0 1 .8-.4l3 2a.5.5 0 0 1 0 .8l-3 2A.5.5 0 0 1 6 9.5v-4Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: "profiles",
    label: "Voices",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="shrink-0">
        <path d="M7.5 0a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM5 3.5a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0ZM1.5 12a6 6 0 0 1 12 0 .5.5 0 0 1-1 0 5 5 0 0 0-10 0 .5.5 0 0 1-1 0Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
      </svg>
    ),
  },
  {
    id: "history",
    label: "History",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="shrink-0">
        <path d="M7.5 1a6.5 6.5 0 1 0 0 13A6.5 6.5 0 0 0 7.5 1ZM0 7.5a7.5 7.5 0 1 1 15 0 7.5 7.5 0 0 1-15 0ZM7.5 4a.5.5 0 0 1 .5.5V7h2a.5.5 0 0 1 0 1H7a.5.5 0 0 1-.5-.5v-3A.5.5 0 0 1 7.5 4Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
      </svg>
    ),
  },
];

// ── logo mark ─────────────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <rect width="26" height="26" rx="7" fill="url(#logo-grad)" />
      <rect x="4.5"  y="10" width="2.5" height="6"  rx="1.25" fill="white" fillOpacity="0.85"/>
      <rect x="8.5"  y="7"  width="2.5" height="12" rx="1.25" fill="white" fillOpacity="0.9"/>
      <rect x="12.5" y="4.5"  width="2.5" height="17" rx="1.25" fill="white"/>
      <rect x="16.5" y="8"  width="2.5" height="10"  rx="1.25" fill="white" fillOpacity="0.9"/>
      <rect x="20.5" y="11" width="2.5" height="4"  rx="1.25" fill="white" fillOpacity="0.7"/>
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="26" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c4dff"/>
          <stop offset="1" stopColor="#b06bff"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── engine status ─────────────────────────────────────────────────────────────

function EngineStatus() {
  const engine = useQuery({
    queryKey: ["engine"],
    queryFn: api.engineStatus,
    refetchInterval: 4000,
  });

  const d = engine.data;
  const isLoaded  = d?.loaded;
  const isLoading = d?.loading;
  const dotColor  = isLoaded ? "#34d399" : isLoading ? "#fbbf24" : "rgba(255,255,255,0.18)";
  const label = isLoading ? "Loading model…" : isLoaded ? "Engine ready" : "Engine idle";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-500"
          style={{
            backgroundColor: dotColor,
            boxShadow: (isLoaded || isLoading) ? `0 0 7px ${dotColor}` : "none",
          }}
        />
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.32)" }}>
          {label}
        </span>
      </div>
      {d?.device && (
        <div className="text-[10px] pl-3.5 font-mono" style={{ color: "rgba(255,255,255,0.18)" }}>
          {d.device.toUpperCase()}
        </div>
      )}
    </div>
  );
}

// ── sidebar ───────────────────────────────────────────────────────────────────

function Sidebar() {
  const { tab, setTab } = useUI();

  return (
    <aside
      className="w-52 shrink-0 flex flex-col"
      style={{
        background: "linear-gradient(180deg, #0f0f1a 0%, #0b0b13 100%)",
        borderRight: "1px solid rgba(255,255,255,0.055)",
      }}
    >
      {/* Branding */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div className="min-w-0">
            <div
              className="text-[13px] font-semibold leading-tight tracking-tight"
              style={{ color: "#e8e8f4" }}
            >
              Voice to Voice
            </div>
            <div
              className="text-[10px] leading-snug mt-0.5 truncate"
              style={{ color: "rgba(255,255,255,0.28)" }}
            >
              A simple voice modulator
            </div>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="mx-3 mb-2" style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />

      {/* Nav */}
      <nav className="flex-1 px-2 py-1 space-y-0.5">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-all duration-100 group"
              style={{
                background: active ? "rgba(124,77,255,0.16)" : "transparent",
                color: active ? "#c9aaff" : "rgba(255,255,255,0.38)",
                fontWeight: active ? 500 : 400,
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.045)";
                if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.38)";
              }}
            >
              <span style={{ color: active ? "#a07bff" : "rgba(255,255,255,0.28)" }}>
                {t.icon}
              </span>
              <span className="flex-1 text-left">{t.label}</span>
              {active && (
                <span
                  className="w-1 h-1 rounded-full"
                  style={{ background: "#9d7bff", boxShadow: "0 0 5px #9d7bff" }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Engine status card */}
      <div className="mx-3 mb-4 mt-2">
        <div
          className="px-3 py-2.5 rounded-lg"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <EngineStatus />
        </div>
      </div>
    </aside>
  );
}

// ── boot gate ─────────────────────────────────────────────────────────────────

function BootGate({ children }: { children: React.ReactNode }) {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: (q) => (q.state.data ? false : 1000),
    retry: true,
  });

  if (health.isSuccess) return <>{children}</>;

  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <div
        className="w-7 h-7 rounded-full border-2 animate-spin"
        style={{ borderColor: "rgba(124,77,255,0.3)", borderTopColor: "#7c4dff" }}
      />
      <div className="text-[13px]" style={{ color: "rgba(255,255,255,0.25)" }}>
        Starting voice engine…
      </div>
    </div>
  );
}

// ── root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { tab } = useUI();
  return (
    <div className="h-full flex overflow-hidden" style={{ background: "#090910" }}>
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <BootGate>
          {tab === "convert"  && <ConvertView />}
          {tab === "profiles" && <ProfilesView />}
          {tab === "history"  && <HistoryView />}
        </BootGate>
      </main>
    </div>
  );
}
