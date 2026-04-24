import { useEffect, useRef, useState } from "react";
import { ShieldIcon } from "../components/ShieldIcon";

interface Props {
  onEnter: () => void;
}

// ─── Animated counter ─────────────────────────────────────────────────────────
function Counter({ end, suffix = "", prefix = "" }: { end: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const duration = 2000;
        const steps = 60;
        const increment = end / steps;
        let current = 0;
        const timer = setInterval(() => {
          current += increment;
          if (current >= end) { setCount(end); clearInterval(timer); }
          else setCount(Math.floor(current));
        }, duration / steps);
      }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end]);

  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

// ─── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, color }: { icon: string; title: string; desc: string; color: string }) {
  return (
    <div className="group glass glass-hover rounded-2xl p-6 flex flex-col gap-4 cursor-default">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${color} bg-current/10`}>
        <span>{icon}</span>
      </div>
      <div>
        <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
        <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────
function StepCard({ num, title, desc, icon }: { num: number; title: string; desc: string; icon: string }) {
  return (
    <div className="flex gap-5 group">
      <div className="flex flex-col items-center gap-2 shrink-0">
        <div className="w-10 h-10 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold text-sm group-hover:bg-sky-500/20 transition-colors">
          {num}
        </div>
        {num < 4 && <div className="w-px flex-1 bg-gradient-to-b from-sky-500/20 to-transparent min-h-8" />}
      </div>
      <div className="pb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{icon}</span>
          <h3 className="text-white font-semibold">{title}</h3>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ─── Sponsor badge ────────────────────────────────────────────────────────────
function SponsorBadge({ name, icon }: { name: string; icon: string }) {
  return (
    <div className="flex items-center gap-2 glass rounded-full px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors cursor-default">
      <span>{icon}</span>
      <span>{name}</span>
    </div>
  );
}

// ─── Testimonial / pain point card ───────────────────────────────────────────
function PainCard({ quote, name, loss }: { quote: string; name: string; loss: string }) {
  return (
    <div className="glass rounded-2xl p-6 flex flex-col gap-4 border-l-2 border-red-500/40">
      <p className="text-slate-300 text-sm leading-relaxed italic">"{quote}"</p>
      <div className="flex items-center justify-between">
        <span className="text-slate-500 text-xs">{name}</span>
        <span className="text-red-400 text-xs font-semibold bg-red-500/10 px-2 py-0.5 rounded-full">{loss}</span>
      </div>
    </div>
  );
}

// ─── Main landing page ────────────────────────────────────────────────────────
export function Landing({ onEnter }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 overflow-x-hidden">
      {/* Background grid + glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-100" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-sky-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-0 w-[400px] h-[400px] bg-violet-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-0 w-[400px] h-[400px] bg-sky-500/5 rounded-full blur-3xl" />
      </div>

      {/* ── Nav ── */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/80" : ""}`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldIcon className="w-8 h-8 text-sky-400" />
            <span className="text-white font-bold text-lg tracking-tight">ElderShield</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#stats" className="hover:text-white transition-colors">Impact</a>
            <a href="#tech" className="hover:text-white transition-colors">Technology</a>
          </div>
          <button
            onClick={onEnter}
            className="btn-primary px-5 py-2.5 text-sm"
          >
            Open Dashboard →
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-sm text-sky-300 mb-8 animate-fade-in">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Autonomous · Real-time · Zero manual intervention
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-black text-white leading-[1.05] tracking-tight mb-6 animate-slide-up">
            Your parents deserve
            <br />
            <span className="text-gradient">a guardian that never sleeps.</span>
          </h1>

          {/* Sub */}
          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-10 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            ElderShield autonomously monitors your family's Slack, scans every suspicious link in a real browser, and stops scams before they cause harm — powered by AI agents, not manual review.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <button
              onClick={onEnter}
              className="btn-primary px-8 py-4 text-base w-full sm:w-auto"
            >
              Open Dashboard →
            </button>
            <a
              href="#how-it-works"
              className="btn-secondary px-8 py-4 text-base w-full sm:w-auto text-center"
            >
              See how it works
            </a>
          </div>

          {/* Hero visual */}
          <div className="mt-20 relative animate-slide-up" style={{ animationDelay: "0.3s" }}>
            <div className="glass rounded-3xl p-1 shadow-2xl shadow-sky-500/10 max-w-3xl mx-auto">
              <div className="bg-slate-900 rounded-[22px] p-6 text-left">
                {/* Fake terminal */}
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500/70" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/70" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
                  <span className="ml-2 text-xs text-slate-500 font-mono">eldershield — autonomous worker</span>
                </div>
                <div className="font-mono text-sm space-y-2">
                  <p><span className="text-slate-500">[nexla]</span> <span className="text-slate-300">Fetched 8 Slack messages from inbox</span></p>
                  <p><span className="text-slate-500">[queue]</span> <span className="text-slate-300">Enqueued 6 scan jobs</span></p>
                  <p><span className="text-slate-500">[tinyfish]</span> <span className="text-slate-300">Opening https://irs-refund-claim.net in remote browser...</span></p>
                  <p><span className="text-slate-500">[memory]</span> <span className="text-sky-400">Recalled: "fake IRS refund site seen 3x this week"</span></p>
                  <p><span className="text-slate-500">[worker]</span> <span className="text-red-400 font-semibold">🚨 SCAM — irs-refund-claim.net</span></p>
                  <p><span className="text-slate-500">[worker]</span> <span className="text-emerald-400">✅ SAFE — docs.google.com</span></p>
                  <p><span className="text-slate-500">[github]</span> <span className="text-slate-300">cited.md updated (7 entries)</span></p>
                  <p><span className="text-slate-500">[senso]</span> <span className="text-slate-300">cited.md indexed for agent discovery</span></p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-slate-500">[autonomous]</span>
                    <span className="text-slate-300">Next sweep in</span>
                    <span className="text-sky-400 font-semibold">15s</span>
                    <span className="w-2 h-4 bg-sky-400 animate-pulse rounded-sm" />
                  </div>
                </div>
              </div>
            </div>
            {/* Glow under terminal */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-2/3 h-16 bg-sky-500/10 blur-2xl rounded-full" />
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section id="stats" className="py-20 px-6 relative">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: 10, suffix: "B+", label: "Lost to scams annually in the US", prefix: "$", color: "text-red-400" },
              { value: 88, suffix: "%", label: "Of elder fraud victims never report it", color: "text-amber-400" },
              { value: 3, suffix: "x", label: "More likely to be targeted if over 60", color: "text-orange-400" },
              { value: 15, suffix: "s", label: "ElderShield's autonomous sweep interval", color: "text-sky-400" },
            ].map((s) => (
              <div key={s.label} className="glass rounded-2xl p-6 text-center">
                <div className={`text-4xl font-black mb-2 ${s.color}`}>
                  <Counter end={s.value} suffix={s.suffix} prefix={s.prefix ?? ""} />
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pain points ── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Real people. Real losses.
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Every day, older adults click links that look legitimate. By the time they realize, it's too late.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <PainCard
              quote="I got a text from 'Medicare' saying my benefits would be cancelled. I clicked the link and entered my Social Security number before I realized."
              name="Margaret, 74 — Florida"
              loss="$12,400 lost"
            />
            <PainCard
              quote="My grandson sent me a link to claim a prize. It looked exactly like Amazon. They got my credit card number and charged $3,200 before I called the bank."
              name="Robert, 68 — Ohio"
              loss="$3,200 lost"
            />
            <PainCard
              quote="A 'Microsoft technician' sent me a link to fix my computer. I gave them remote access. They drained my savings account in 20 minutes."
              name="Dorothy, 71 — Texas"
              loss="$28,000 lost"
            />
          </div>
          <div className="mt-8 glass rounded-2xl p-6 text-center border border-red-500/10">
            <p className="text-slate-300 text-lg">
              The FBI's Internet Crime Complaint Center reported{" "}
              <span className="text-red-400 font-bold">$3.4 billion</span> in losses from elder fraud in 2023 alone.
              <br />
              <span className="text-slate-400 text-sm mt-1 block">Most victims never get their money back.</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Fully autonomous. Zero copy-paste.
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Connect once via OAuth. ElderShield handles everything else — 24/7, without you lifting a finger.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <StepCard
                num={1}
                icon="🔐"
                title="Connect your Slack workspace"
                desc="One-click OAuth. ElderShield connects to your family's Slack channel. No API keys to manage, no copy-pasting links."
              />
              <StepCard
                num={2}
                icon="🔗"
                title="Agent monitors every message"
                desc="Every 15 seconds, ElderShield sweeps the inbox via Nexla. It extracts every URL — even bare domains like 'pay-pail.com' — and queues them for analysis."
              />
              <StepCard
                num={3}
                icon="🐟"
                title="TinyFish opens links in a real browser"
                desc="Each URL is opened in a remote browser by TinyFish. It detects login forms, payment forms, phishing indicators, and brand impersonation — on the live web."
              />
              <StepCard
                num={4}
                icon="🧠"
                title="Redis Memory recalls past patterns"
                desc="Redis Agent Memory stores scam archetypes and household history. 'We've seen this fake bank login 3 times this week' — the agent remembers, so you don't have to."
              />
            </div>
            <div className="sticky top-24 space-y-4">
              {/* Live scan card mockup */}
              <div className="glass rounded-2xl p-5 border border-red-500/20 shadow-glow-red">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 text-lg">🚨</span>
                    <span className="text-white font-semibold">SCAM Detected</span>
                  </div>
                  <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">HIGH RISK</span>
                </div>
                <p className="text-sm text-slate-400 font-mono mb-3">irs-refund-claim.net</p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  ⚠️ SCAM DETECTED. A payment form was found. Signals: phishing_indicators, brand_mismatch, urgency_language. Memory recall: similar fake IRS site seen 3x this week. Do not provide personal information.
                </p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
                  <span className="text-[10px] text-slate-500">via TinyFish + Redis Memory</span>
                  <span className="ml-auto text-[10px] text-slate-600">2s ago</span>
                </div>
              </div>
              <div className="glass rounded-2xl p-5 border border-emerald-500/20 shadow-glow-emerald">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 text-lg">✅</span>
                    <span className="text-white font-semibold">Safe</span>
                  </div>
                  <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">VERIFIED</span>
                </div>
                <p className="text-sm text-slate-400 font-mono mb-3">docs.google.com</p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  No suspicious signals detected. Trusted domain. No login or payment forms found.
                </p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
                  <span className="text-[10px] text-slate-500">via TinyFish</span>
                  <span className="ml-auto text-[10px] text-slate-600">5s ago</span>
                </div>
              </div>
              <div className="glass rounded-2xl p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">Results published to</p>
                <p className="text-sm text-sky-400 font-mono">cited.md</p>
                <p className="text-[10px] text-slate-600 mt-1">Indexed by Senso · Monetized via x402</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Built for real-world protection
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Not a browser extension. Not a manual checklist. A fully autonomous agent that works while you sleep.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            <FeatureCard
              icon="🤖"
              title="Fully Autonomous"
              desc="Sweeps your Slack inbox every 15 seconds. No manual intervention. No copy-pasting links. Just connect and forget."
              color="text-sky-400"
            />
            <FeatureCard
              icon="🌐"
              title="Real Browser Analysis"
              desc="TinyFish opens every link in a real remote browser — not a URL parser. It sees what your parent would see."
              color="text-cyan-400"
            />
            <FeatureCard
              icon="🧠"
              title="Memory That Learns"
              desc="Redis Agent Memory builds a household-specific scam library. The more it sees, the smarter it gets."
              color="text-violet-400"
            />
            <FeatureCard
              icon="🎙️"
              title="Voice Interface"
              desc="Integrated with Vapi. Your parent can call and say 'check this link' — ElderShield responds in plain English."
              color="text-pink-400"
            />
            <FeatureCard
              icon="💳"
              title="Payment-Gated API"
              desc="Bulk inbox sweeps require an x402 payment token. Agent-native monetization built in from day one."
              color="text-amber-400"
            />
            <FeatureCard
              icon="📄"
              title="Cited & Discoverable"
              desc="Every scan result is published to cited.md, indexed by Senso, and monetizable by other AI agents via x402."
              color="text-emerald-400"
            />
          </div>
        </div>
      </section>

      {/* ── Tech stack ── */}
      <section id="tech" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Built on the best agent infrastructure
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Every component is a production-grade sponsor tool, not a mock.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            {[
              { name: "Ghost.build", icon: "👻" },
              { name: "Redis Memory", icon: "🧠" },
              { name: "TinyFish", icon: "🐟" },
              { name: "Nexla", icon: "🔗" },
              { name: "Vapi", icon: "🎙️" },
              { name: "WunderGraph", icon: "🕸️" },
              { name: "Senso", icon: "📄" },
              { name: "Akash", icon: "☁️" },
              { name: "Chainguard", icon: "🔒" },
              { name: "x402", icon: "💳" },
            ].map((s) => <SponsorBadge key={s.name} {...s} />)}
          </div>

          {/* Architecture diagram */}
          <div className="glass rounded-2xl p-8 font-mono text-sm">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-6 font-sans">Data flow</p>
            <div className="space-y-2 text-slate-400">
              <div className="flex items-center gap-3">
                <span className="text-blue-400 w-20 shrink-0">Slack</span>
                <span className="text-slate-600">──►</span>
                <span className="text-blue-400">Nexla</span>
                <span className="text-slate-600">──►</span>
                <span className="text-slate-300">inbox-sweep</span>
                <span className="text-amber-400 text-xs ml-2">(x402 gated)</span>
              </div>
              <div className="flex items-center gap-3 ml-8">
                <span className="text-slate-600">──►</span>
                <span className="text-red-400">Redis</span>
                <span className="text-slate-600">scan_jobs queue</span>
              </div>
              <div className="flex items-center gap-3 ml-16">
                <span className="text-slate-600">──►</span>
                <span className="text-slate-300">autonomous worker</span>
                <span className="text-sky-400 text-xs">(15s poll)</span>
              </div>
              <div className="flex items-center gap-3 ml-24">
                <span className="text-slate-600">──►</span>
                <span className="text-cyan-400">TinyFish</span>
                <span className="text-slate-600">remote browser</span>
              </div>
              <div className="flex items-center gap-3 ml-24">
                <span className="text-slate-600">──►</span>
                <span className="text-red-400">Redis Memory</span>
                <span className="text-slate-600">recall + promote</span>
              </div>
              <div className="flex items-center gap-3 ml-24">
                <span className="text-slate-600">──►</span>
                <span className="text-slate-300">risk classifier</span>
                <span className="text-slate-600 text-xs ml-1">(SAFE / SUSPICIOUS / SCAM)</span>
              </div>
              <div className="flex items-center gap-3 ml-24">
                <span className="text-slate-600">──►</span>
                <span className="text-violet-400">Ghost</span>
                <span className="text-slate-600">Postgres audit log</span>
              </div>
              <div className="flex items-center gap-3 ml-24">
                <span className="text-slate-600">──►</span>
                <span className="text-slate-300">GitHub</span>
                <span className="text-slate-600">cited.md</span>
                <span className="text-slate-600">──►</span>
                <span className="text-emerald-400">Senso</span>
                <span className="text-slate-600">index + monetize</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="glass rounded-3xl p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-violet-500/5" />
            <div className="relative">
              <ShieldIcon className="w-16 h-16 text-sky-400 mx-auto mb-6 animate-float" />
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Protect your family today.
              </h2>
              <p className="text-slate-400 mb-8 max-w-lg mx-auto">
                ElderShield is running right now. Open the dashboard, connect your Slack, and let the agent do the rest.
              </p>
              <button
                onClick={onEnter}
                className="btn-primary px-10 py-4 text-lg animate-glow-pulse"
              >
                Open Dashboard →
              </button>
              <p className="text-slate-600 text-xs mt-4">No credit card required · Autonomous from minute one</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800/50 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <ShieldIcon className="w-4 h-4 text-slate-600" />
            <span>ElderShield — Ship to Prod Hackathon 2026</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/lopkiloinm/eldershield" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors">GitHub</a>
            <span>·</span>
            <span>MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
