export function LiveView() {
  return (
    <div className="p-8 max-w-2xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Live</h1>
        <p className="text-white/50 text-sm mt-1">
          Real-time microphone voice conversion. Speak, and hear yourself in a target voice.
        </p>
      </header>
      <div className="bg-panel border border-edge rounded-xl p-6 text-white/50 text-sm">
        Real-time streaming arrives in Phase 3 — it runs seed-vc's low-latency path through the
        backend's audio devices and needs the macOS microphone permission. Coming soon.
      </div>
    </div>
  );
}
