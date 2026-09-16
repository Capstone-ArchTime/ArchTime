import { Icon } from "@iconify/react";
import { useEffect, useMemo, useRef, useState } from "react";

type RevealId = "architecture" | "console" | "modules" | "hardware" | "subscribe";

const homePageStyles = `
  @import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap");

  html {
    scroll-behavior: smooth;
  }

  body {
    margin: 0;
    overflow-x: hidden;
    background-color: #080b0e;
    color: #e2e8f0;
    font-family: "Space Grotesk", sans-serif;
  }

  .font-sans {
    font-family: "Space Grotesk", sans-serif;
  }

  .font-mono {
    font-family: "JetBrains Mono", monospace;
  }

  ::-webkit-scrollbar {
    width: 6px;
  }

  ::-webkit-scrollbar-track {
    background: #080b0e;
  }

  ::-webkit-scrollbar-thumb {
    background: #222c37;
    border-radius: 999px;
  }

  .terminal-grid {
    background-size: 40px 40px;
    background-image: linear-gradient(to right, rgba(34, 44, 55, 0.15) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(34, 44, 55, 0.15) 1px, transparent 1px);
  }

  .ambient-lamp {
    background: radial-gradient(circle at 50% 50%, rgba(255, 176, 58, 0.08) 0%, rgba(56, 189, 248, 0.02) 45%, transparent 70%);
  }

  .keycap-glow {
    box-shadow: 0 0 30px rgba(0, 240, 255, 0.15), inset 0 0 15px rgba(0, 240, 255, 0.05);
  }

  .keycap-glow:hover {
    box-shadow: 0 0 45px rgba(255, 176, 58, 0.25), inset 0 0 20px rgba(255, 176, 58, 0.1);
  }

  .code-reveal {
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .code-reveal.active {
    opacity: 1;
    transform: translateY(0);
  }

  .cursor-blink::after {
    content: "|";
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    from,
    to {
      color: transparent;
    }
    50% {
      color: #38bdf8;
    }
  }

  .isometric-card {
    transition: transform 0.4s ease, box-shadow 0.4s ease, border-color 0.4s ease;
  }

  .isometric-card:hover {
    transform: translateY(-6px) scale(1.01);
    border-color: rgba(255, 176, 58, 0.3);
  }

  .particle {
    position: absolute;
    border-radius: 9999px;
    background: #00f0ff;
    box-shadow: 0 0 10px rgba(0, 240, 255, 0.65), 0 0 18px rgba(0, 240, 255, 0.35);
    pointer-events: none;
    animation-name: driftDown;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
  }

  @keyframes driftDown {
    0% {
      transform: translateY(-10vh) translateX(0) scale(0.85);
      opacity: 0;
    }
    12% {
      opacity: 0.85;
    }
    88% {
      opacity: 0.7;
    }
    100% {
      transform: translateY(115vh) translateX(24px) scale(1.05);
      opacity: 0;
    }
  }
`;

export default function HomePage() {
  const [revealed, setRevealed] = useState<Set<RevealId>>(new Set());
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const typewriterRef = useRef<HTMLSpanElement | null>(null);

  const particles = useMemo(
    () => [
      { left: "14%", size: 3, duration: "4.5s", delay: "0s" },
      { left: "39%", size: 2, duration: "3.8s", delay: "1.2s" },
      { left: "67%", size: 4, duration: "5.2s", delay: "2.4s" },
      { left: "83%", size: 2.5, duration: "4.2s", delay: "0.7s" },
      { left: "58%", size: 2, duration: "4.9s", delay: "3.1s" },
    ],
    []
  );

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;

      if (heroVideoRef.current) {
        heroVideoRef.current.style.transform = `translateY(${y * 0.3}px)`;
      }
      const nav = document.getElementById("top-nav");
      if (nav) {
        if (y > 60) {
          nav.classList.remove("h-20", "border-transparent");
          nav.classList.add("h-16", "bg-[#080b0e]/90", "backdrop-blur-md", "border-[#222c37]");
        } else {
          nav.classList.remove("h-16", "bg-[#080b0e]/90", "backdrop-blur-md", "border-[#222c37]");
          nav.classList.add("h-20", "border-transparent");
        }
      }
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setRevealed((prev) => {
          const next = new Set(prev);
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const id = entry.target.getAttribute("data-reveal-id") as RevealId | null;
              if (id) next.add(id);
              observer.unobserve(entry.target);
            }
          });
          return next;
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    document.querySelectorAll("[data-reveal-id]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sequences = ["compile_all --speed=max", "run mock_compiler.exe", "status --all --verbose"];
    let sequenceIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    let timeout: number | undefined;

    const tick = () => {
      const el = typewriterRef.current;
      if (!el) return;

      const current = sequences[sequenceIndex];

      if (!deleting) {
        characterIndex += 1;
        el.textContent = current.slice(0, characterIndex);
        if (characterIndex >= current.length) {
          deleting = true;
          timeout = window.setTimeout(tick, 1600);
          return;
        }
        timeout = window.setTimeout(tick, 90);
      } else {
        characterIndex -= 1;
        el.textContent = current.slice(0, Math.max(characterIndex, 0));
        if (characterIndex <= 0) {
          deleting = false;
          sequenceIndex = (sequenceIndex + 1) % sequences.length;
        }
        timeout = window.setTimeout(tick, deleting ? 40 : 120);
      }
    };

    timeout = window.setTimeout(tick, 900);
    return () => {
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  const revealClass = (id: RevealId) => (revealed.has(id) ? "code-reveal active" : "code-reveal");

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080b0e] text-slate-200 antialiased selection:bg-[#f59e0b] selection:text-[#080b0e]">
      <style>{homePageStyles}</style>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 terminal-grid" />
        <div className="absolute left-[10%] top-[20%] h-[50vw] w-[50vw] rounded-full blur-3xl ambient-lamp" />
        <div className="absolute bottom-[10%] right-[-5%] h-[40vw] w-[40vw] rounded-full bg-[#38bdf8]/5 blur-[120px]" />
        {particles.map((p, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: p.left,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: p.duration,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>

      <nav
        id="top-nav"
        className="fixed left-0 top-0 z-50 flex h-20 w-full items-center border-b border-transparent transition-all duration-300"
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6">
          <a href="#" className="flex items-center gap-3 font-mono text-base font-bold tracking-wider text-white">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00f0ff] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00f0ff]" />
            </span>
            ARCHTIME
          </a>

          <div className="hidden items-center gap-8 text-xs uppercase tracking-widest text-slate-400 md:flex font-mono">
            <a href="#architecture" className="transition-colors hover:text-[#00f0ff]">
              Architecture
            </a>
            <a href="#console" className="transition-colors hover:text-[#00f0ff]">
              Console
            </a>
            <a href="#modules" className="transition-colors hover:text-[#00f0ff]">
              Modules
            </a>
            <a href="#hardware" className="transition-colors hover:text-[#00f0ff]">
              Evidence
            </a>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden border border-[#222c37] bg-[#11161b] px-3 py-1 font-mono text-[10px] text-[#ffb03a] sm:inline-block">
              EVIDENCE // VERIFIED
            </span>
            <button className="border border-[#38bdf8]/30 bg-[#11161b] px-5 py-2.5 font-mono text-xs uppercase tracking-widest transition-all hover:border-[#00f0ff] hover:text-white">
              Analyze Repository
            </button>
          </div>
        </div>
      </nav>

      <header className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20">
        <div className="absolute inset-0 z-0">
          <video
            ref={heroVideoRef}
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover opacity-40 mix-blend-screen"
            style={{ willChange: "transform" }}
          >
            <source src="/video.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-t from-[#080b0e] via-[#080b0e]/5 to-transparent" />
        </div>

        <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-12 px-6 py-12 lg:grid-cols-12">
          <div className="space-y-8 text-left lg:col-span-7">
            <div className="inline-flex items-center gap-3 border border-[#222c37] bg-[#11161b]/80 px-4 py-1.5">
              <Icon icon="radix-icons:dot-filled" className="animate-spin text-[#ffb03a]" />
              <span className="font-mono text-xs uppercase tracking-widest text-slate-300">
                Evidence-Based Architecture Reasoning
              </span>
            </div>

            <h1 className="text-5xl font-bold leading-[1.1] tracking-tight text-white sm:text-6xl md:text-7xl">
              Reconstruct How Your <br />
              <span className="bg-gradient-to-r from-[#38bdf8] via-[#ffb03a] to-[#f59e0b] bg-clip-text text-transparent font-mono">
                Architecture Evolved.
              </span>
            </h1>

            <p className="max-w-xl text-base font-light leading-relaxed text-slate-400 sm:text-lg">
              ArchTime mines Git history and source code to rebuild the evolution of your software architecture, backed by traceable evidence instead of guesswork.
            </p>

            <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
              <a
                href="#console"
                className="keycap-glow rounded-none bg-[#38bdf8] px-8 py-4 text-center font-mono text-xs font-bold uppercase tracking-widest text-[#080b0e] transition-all hover:bg-[#00f0ff]"
              >
                Run Analysis
              </a>
              <a
                href="#architecture"
                className="rounded-none border border-[#222c37] bg-[#11161b]/40 px-8 py-4 text-center font-mono text-xs font-light uppercase tracking-widest text-slate-300 transition-all hover:border-slate-400"
              >
                Explore Pipeline
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section
          id="architecture"
          data-reveal-id="architecture"
          className={`${revealClass("architecture")} mx-auto max-w-7xl px-6 py-32`}
        >
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-5">
              <span className="block text-xs uppercase tracking-widest text-[#ffb03a] font-mono">
                Repository Mining
              </span>
              <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
                From Git History to Knowledge Graph
              </h2>
              <p className="leading-relaxed text-slate-400 font-light">
                ArchTime parses source code with an Abstract Syntax Tree and combines it with Git metadata &mdash; commits, authors, timestamps, diffs &mdash; to build a knowledge graph of your system across versions.
              </p>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="border-l-2 border-[#38bdf8] pl-4">
                  <div className="font-mono text-xl font-bold text-white">AST</div>
                  <div className="text-xs uppercase tracking-wider text-slate-500">Structural Parsing</div>
                </div>
                <div className="border-l-2 border-[#ffb03a] pl-4">
                  <div className="font-mono text-xl font-bold text-white">Git History</div>
                  <div className="text-xs uppercase tracking-wider text-slate-500">Evidence Source</div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:col-span-7">
              <div className="isometric-card border border-[#222c37] bg-[#161d24] p-8 space-y-4">
                <Icon icon="ph:graph-light" className="text-3xl text-[#38bdf8]" />
                <h3 className="text-xl font-semibold text-white">Knowledge Graph</h3>
                <p className="text-sm leading-relaxed text-slate-400 font-light">
                  Represents modules, packages, classes and their dependencies across every version of the system.
                </p>
              </div>

              <div className="isometric-card border border-[#222c37] bg-[#161d24] p-8 space-y-4">
                <Icon icon="ph:git-diff-light" className="text-3xl text-[#ffb03a]" />
                <h3 className="text-xl font-semibold text-white">Architectural Diff</h3>
                <p className="text-sm leading-relaxed text-slate-400 font-light">
                  Detects module boundary changes, splits, merges and dependency direction shifts between versions.
                </p>
              </div>

              <div className="isometric-card border border-[#222c37] bg-[#161d24] p-8 space-y-4">
                <Icon icon="ph:brain-light" className="text-3xl text-slate-400" />
                <h3 className="text-xl font-semibold text-white">Evidence-Based Reasoning</h3>
                <p className="text-sm leading-relaxed text-slate-400 font-light">
                  A local LLM turns diffs, commit messages and code changes into a readable narrative of what changed.
                </p>
              </div>

              <div className="isometric-card border border-[#222c37] bg-[#161d24] p-8 space-y-4">
                <Icon icon="ph:shield-check-light" className="text-3xl text-[#00f0ff]" />
                <h3 className="text-xl font-semibold text-white">FACT / INFERENCE / UNKNOWN</h3>
                <p className="text-sm leading-relaxed text-slate-400 font-light">
                  Every AI statement is labeled by evidence strength, reducing hallucination and keeping claims traceable.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="console" data-reveal-id="console" className={`${revealClass("console")} border-y border-[#222c37] bg-[#11161b]/50 py-32`}>
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto mb-16 max-w-2xl text-center">
              <span className="mb-3 block text-xs uppercase tracking-widest text-[#38bdf8] font-mono">
                Evolution Analysis
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
                See the Diff Between Any Two Versions
              </h2>
            </div>

            <div className="mx-auto w-full max-w-4xl overflow-hidden border border-[#222c37] bg-[#080b0e] shadow-2xl">
              <div className="flex select-none items-center justify-between border-b border-[#222c37] bg-[#11161b] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/40" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/40" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500/40" />
                  <span className="ml-2 font-mono text-xs text-slate-500">archtime_pipeline.sh</span>
                </div>
                <span className="font-mono text-[10px] text-slate-600">TTY // 1</span>
              </div>

              <div className="min-h-[320px] space-y-4 bg-gradient-to-b from-[#080b0e] to-[#11161b]/20 p-6 font-mono text-xs sm:text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-[#38bdf8]">archtime@repo:~$</span>
                  <span className="text-slate-300">analyze --repo=./target-service --since=v1.0.0</span>
                </div>
                <div className="space-y-1 text-slate-500">
                  <div>[ OK ] Mining Git history and building commit graph...</div>
                  <div>[ OK ] Parsing AST for module and dependency structure...</div>
                  <div>[ OK ] Comparing architecture snapshots (graph edit distance)...</div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#38bdf8]">archtime@repo:~$</span>
                  <span className="text-slate-300">cat architectural_diff.json</span>
                </div>
                <div className="border border-[#222c37]/60 bg-[#161d24]/50 p-4 leading-relaxed text-[#ffb03a]">
                  &quot;Module `billing-service` was split from `core-monolith` at commit 4af21c9. Evidence: 3 commits, 2 authors, dependency direction reversed.&quot;
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-[#38bdf8]">archtime@repo:~$</span>
                  <span ref={typewriterRef} className="cursor-blink text-white" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="modules" data-reveal-id="modules" className={`${revealClass("modules")} mx-auto max-w-7xl px-6 py-32`}>
          <div className="mb-16 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <div>
              <span className="mb-3 block text-xs uppercase tracking-widest text-[#ffb03a] font-mono">
                Detected Changes
              </span>
              <h2 className="text-4xl font-bold tracking-tight text-white">
                Architectural Change Types
              </h2>
            </div>
            <p className="max-w-xs text-sm font-light text-slate-400">
              ArchTime classifies structural changes detected between architecture snapshots.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="group flex h-80 flex-col justify-between border border-[#222c37] bg-[#161d24] p-8 transition-colors hover:border-[#38bdf8]/40">
              <div>
                <div className="mb-6 flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center border border-[#38bdf8]/20 bg-[#38bdf8]/10 text-xl text-[#38bdf8]">
                    <Icon icon="ph:cube-light" />
                  </div>
                  <span className="font-mono text-xs text-slate-600">01 / CHANGE</span>
                </div>
                <h3 className="mb-2 text-xl font-bold text-white transition-colors group-hover:text-[#38bdf8]">
                  Module Split / Merge
                </h3>
                <p className="text-sm leading-relaxed text-slate-400 font-light">
                  Detects when a module or service is divided into multiple parts, or when separate modules are consolidated.
                </p>
              </div>
              <div className="text-[11px] uppercase tracking-widest text-slate-500 font-mono">
                Status: Graph Diff Verified
              </div>
            </div>

            <div className="group flex h-80 flex-col justify-between border border-[#222c37] bg-[#161d24] p-8 transition-colors hover:border-[#ffb03a]/40">
              <div>
                <div className="mb-6 flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center border border-[#ffb03a]/20 bg-[#ffb03a]/10 text-xl text-[#ffb03a]">
                    <Icon icon="ph:sliders-horizontal-light" />
                  </div>
                  <span className="font-mono text-xs text-slate-600">02 / CHANGE</span>
                </div>
                <h3 className="mb-2 text-xl font-bold text-white transition-colors group-hover:text-[#ffb03a]">
                  Dependency Shift
                </h3>
                <p className="text-sm leading-relaxed text-slate-400 font-light">
                  Flags new, removed, or reversed dependency relationships between packages and classes.
                </p>
              </div>
              <div className="text-[11px] uppercase tracking-widest text-slate-500 font-mono">
                Status: Direction Tracked
              </div>
            </div>

            <div className="group flex h-80 flex-col justify-between border border-[#222c37] bg-[#161d24] p-8 transition-colors hover:border-[#00f0ff]/40">
              <div>
                <div className="mb-6 flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center border border-[#00f0ff]/20 bg-[#00f0ff]/10 text-xl text-[#00f0ff]">
                    <Icon icon="ph:command-light" />
                  </div>
                  <span className="font-mono text-xs text-slate-600">03 / CHANGE</span>
                </div>
                <h3 className="mb-2 text-xl font-bold text-white transition-colors group-hover:text-[#00f0ff]">
                  Package Restructure
                </h3>
                <p className="text-sm leading-relaxed text-slate-400 font-light">
                  Identifies package reorganizations and module boundary changes across commits.
                </p>
              </div>
              <div className="text-[11px] uppercase tracking-widest text-slate-500 font-mono">
                Status: Boundary Mapped
              </div>
            </div>
          </div>
        </section>

        <section id="hardware" data-reveal-id="hardware" className={`${revealClass("hardware")} border-t border-[#222c37] bg-[#161d24]/30 py-32`}>
          <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-12">
            <div className="relative order-2 lg:col-span-6 lg:order-1">
              <div className="pointer-events-none absolute inset-0 rounded-full bg-[#38bdf8]/5 blur-[100px]" />
              <div className="relative z-10 space-y-4 border border-[#222c37] bg-[#080b0e] p-8 font-mono text-xs">
                <div className="flex justify-between border-b border-[#222c37]/40 pb-3 text-slate-500">
                  <span>EVIDENCE RECORD</span>
                  <span>COMMIT 4af21c9</span>
                </div>
                <div className="flex justify-between border-b border-[#222c37]/40 pb-2">
                  <span className="text-slate-400">Author</span>
                  <span className="text-white">j.tran@example.com</span>
                </div>
                <div className="flex justify-between border-b border-[#222c37]/40 pb-2">
                  <span className="text-slate-400">Files Changed</span>
                  <span className="text-white">14 modified, 3 added</span>
                </div>
                <div className="flex justify-between border-b border-[#222c37]/40 pb-2">
                  <span className="text-slate-400">Claim Type</span>
                  <span className="text-white">FACT</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-slate-400">Confidence</span>
                  <span className="text-[#ffb03a]">Evidence Coverage 92%</span>
                </div>
              </div>
            </div>

            <div className="space-y-6 order-1 lg:col-span-6 lg:order-2">
              <span className="block text-xs uppercase tracking-widest text-[#38bdf8] font-mono">
                Evidence-Based Reasoning
              </span>
              <h2 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
                Every explanation traces back to a commit.
              </h2>
              <p className="leading-relaxed text-slate-400 font-light">
                AI never invents a reason. If a change lacks enough evidence, ArchTime marks it as UNKNOWN instead of guessing &mdash; keeping every narrative verifiable against real Git history.
              </p>
              <div className="pt-2">
                <button className="bg-white px-8 py-4 font-mono text-xs font-bold uppercase tracking-widest text-[#080b0e] transition-colors hover:bg-[#f59e0b]">
                  View Evidence Trail
                </button>
              </div>
            </div>
          </div>
        </section>

        <section
          id="subscribe"
          data-reveal-id="subscribe"
          className={`${revealClass("subscribe")} relative mx-auto max-w-4xl overflow-hidden px-6 py-32 text-center`}
        >
          <div className="pointer-events-none absolute inset-0 rounded-full bg-[#ffb03a]/5 blur-3xl" />
          <div className="relative z-10 space-y-8">
            <Icon icon="ph:fingerprint-light" className="animate-pulse text-4xl text-[#38bdf8]" />
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Follow the ArchTime Build Log
            </h2>
            <p className="mx-auto max-w-xl text-sm font-light leading-relaxed text-slate-400 sm:text-base">
              Get updates on new evaluation benchmarks, pipeline releases and Java/Spring Boot repository support.
            </p>
            <div className="mx-auto flex max-w-md flex-col items-center gap-4 sm:flex-row">
              <input
                type="email"
                placeholder="you@domain.com"
                className="w-full border border-[#222c37] bg-[#161d24] px-5 py-4 font-mono text-xs text-white placeholder:text-slate-600 focus:border-[#38bdf8] focus:outline-none transition-colors"
              />
              <button className="w-full whitespace-nowrap bg-[#38bdf8] px-8 py-4 font-mono text-xs font-bold uppercase tracking-widest text-[#080b0e] transition-colors hover:bg-[#00f0ff] sm:w-auto">
                Subscribe
              </button>
            </div>
          </div>
        </section>

        <footer className="relative overflow-hidden border-t border-[#222c37]/40 bg-[#11161b] px-6 pb-12 pt-20">
          <div className="mx-auto mb-16 grid max-w-7xl items-start gap-16 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-5">
              <a href="#" className="font-mono text-lg font-bold tracking-wider text-white">
                ARCHTIME
              </a>
              <p className="max-w-sm text-sm font-light leading-relaxed text-slate-500">
                Evidence-based software architecture evolution reconstruction, built on Git history and AST analysis.
              </p>
            </div>

            <div className="grid w-full gap-12 md:grid-cols-3 lg:col-span-7">
              <div>
                <h4 className="mb-6 text-xs font-bold uppercase tracking-widest text-[#ffb03a] font-mono">
                  Pipeline
                </h4>
                <ul className="space-y-4 font-mono text-xs text-slate-400">
                  <li><a href="#architecture" className="transition-colors hover:text-white">Repository Mining</a></li>
                  <li><a href="#console" className="transition-colors hover:text-white">Evolution Analysis</a></li>
                  <li><a href="#hardware" className="transition-colors hover:text-white">Evidence-Based Reasoning</a></li>
                  <li><a href="#modules" className="transition-colors hover:text-white">Architectural Diff</a></li>
                </ul>
              </div>
              <div>
                <h4 className="mb-6 text-xs font-bold uppercase tracking-widest text-[#ffb03a] font-mono">
                  Scope
                </h4>
                <ul className="space-y-4 font-mono text-xs text-slate-400">
                  <li><a href="#" className="transition-colors hover:text-white">Java / Spring Boot</a></li>
                  <li><a href="#" className="transition-colors hover:text-white">Git History Analysis</a></li>
                  <li><a href="#" className="transition-colors hover:text-white">Knowledge Graph</a></li>
                  <li><a href="#" className="transition-colors hover:text-white">Benchmarks</a></li>
                </ul>
              </div>
              <div className="col-span-2 md:col-span-1">
                <h4 className="mb-6 text-xs font-bold uppercase tracking-widest text-[#ffb03a] font-mono">
                  Project
                </h4>
                <div className="flex gap-4 text-xl text-slate-500">
                  <a href="#" className="transition-colors hover:text-white">
                    <Icon icon="ph:github-logo-light" />
                  </a>
                  <a href="#" className="transition-colors hover:text-white">
                    <Icon icon="ph:terminal-light" />
                  </a>
                  <a href="#" className="transition-colors hover:text-white">
                    <Icon icon="ph:cpu-light" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-[#222c37]/40 pt-8 text-[10px] uppercase tracking-widest text-slate-600 sm:flex-row font-mono">
            <p>&copy; 2026 ArchTime. Capstone Project.</p>
            <div className="flex gap-8">
              <a href="#" className="transition-colors hover:text-white">
                FACT
              </a>
              <a href="#" className="transition-colors hover:text-white">
                INFERENCE
              </a>
              <a href="#" className="transition-colors hover:text-white">
                UNKNOWN
              </a>
            </div>
          </div>
        </footer>
      </main>
    </main>
  );
}
