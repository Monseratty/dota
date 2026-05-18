const metrics = [
  { label: "Replay Pipeline", value: "Ready" },
  { label: "Agent Handoff", value: "Typed" },
  { label: "UI System", value: "Premium" }
];

export default function Page() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <section className="relative isolate flex min-h-screen items-center px-6 py-20 sm:px-10 lg:px-16">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_30%,rgba(139,92,246,0.32),transparent_34%),radial-gradient(circle_at_80%_70%,rgba(14,165,233,0.18),transparent_30%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px]" />

        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="mb-5 inline-flex rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-medium text-violet-100">
              AI-first replay intelligence
            </p>
            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-balance sm:text-7xl">
              Build, inspect, and ship Dota analytics with production-grade agents.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              A clean Next.js workspace for experiments, premium UI generation, and future AI review flows without touching the production replay parser.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <a className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-100" href="/matches">
                Open replay app
              </a>
              <a className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-violet-300/60 hover:bg-violet-400/10" href="https://github.com/Monseratty/dota">
                View repository
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-violet-950/40 backdrop-blur">
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-6">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Agent Console</p>
                  <h2 className="text-2xl font-semibold">Dota Replay Stack</h2>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm text-emerald-200">online</span>
              </div>
              <div className="grid gap-3">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-sm text-slate-400">{metric.label}</p>
                    <p className="mt-1 text-2xl font-semibold">{metric.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl border border-violet-400/20 bg-violet-400/10 p-4 text-sm leading-6 text-violet-100">
                Use this app as a sandbox for Next.js, shadcn/ui, Tailwind, Framer Motion, and AI-assisted product experiments.
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
