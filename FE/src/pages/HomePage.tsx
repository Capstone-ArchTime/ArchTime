import { Icon } from "@iconify/react";

import { useAuth } from "@/auth/auth-context";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Mascot } from "page-mascot";
import { Logo } from "@/components/Logo";
import { roleHome } from "@/auth/permissions";
import { useT } from "@/i18n";
import LanguageSwitch from "@/components/LanguageSwitch";

const AccountMenu = lazy(() => import('@/components/AccountMenu'));
const MotionLink = motion.create(Link);

/** A sample analysis anyone signed in can open; signed out, the route guard sends them to sign in first. */
const SAMPLE_WORKSPACE = "/workspace/sample/shophub";

const particles = [
  { left: "14%", size: 3, duration: 4.5, delay: 0 },
  { left: "39%", size: 2, duration: 3.8, delay: 1.2 },
  { left: "67%", size: 4, duration: 5.2, delay: 2.4 },
  { left: "83%", size: 2.5, duration: 4.2, delay: 0.7 },
  { left: "58%", size: 2, duration: 4.9, delay: 3.1 },
];

const fontFamily = {
  sans: '"Montserrat", system-ui, sans-serif',
  mono: '"JetBrains Mono", monospace',
};

function TypewriterLine() {
  const [text, setText] = useState("");
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const sequences = ["compile_all --speed=max", "run mock_compiler.exe", "status --all --verbose"];
    let sequenceIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    let timeout: number | undefined;

    const tick = () => {
      const current = sequences[sequenceIndex];

      if (!deleting) {
        characterIndex += 1;
        setText(current.slice(0, characterIndex));
        if (characterIndex >= current.length) {
          deleting = true;
          timeout = window.setTimeout(tick, 1600);
          return;
        }
        timeout = window.setTimeout(tick, 90);
      } else {
        characterIndex -= 1;
        setText(current.slice(0, Math.max(characterIndex, 0)));
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

  return (
    <span className="text-white" style={{ fontFamily: fontFamily.mono }}>
      {text}
      <motion.span
        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
        transition={prefersReducedMotion ? undefined : { duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1], ease: "linear" }}
        style={{ color: "var(--at-link)" }}
      >
        |
      </motion.span>
    </span>
  );
}

function IsometricCard({
  icon,
  iconColor,
  title,
  description,
}: {
  icon: string;
  iconColor: string;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      className="border border-[var(--at-line)] bg-[var(--at-panel-2)] p-8 space-y-4"
      whileHover={{ y: -6, scale: 1.01, borderColor: "rgba(225, 234, 248, 0.45)" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Icon icon={icon} className="text-3xl" style={{ color: iconColor }} />
      <h3 className="text-xl font-semibold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-[var(--at-muted)] font-light">{description}</p>
    </motion.div>
  );
}

function RevealSection({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={className}>
      {children}
    </section>
  );
}

export default function HomePage() {
  const t = useT();
  const { user, loading: authLoading } = useAuth();
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const [navScrolled, setNavScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  // The main call to action starts the real flow: sign up, or straight into the app for someone already signed in.
  const startHref = user ? roleHome[user.role] : "/register";
  const startLabel = user ? t("home.start.signedIn") : t("home.start.signedOut");

  const particleList = useMemo(() => particles, []);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setNavScrolled(y > 60);
      if (heroVideoRef.current) {
        heroVideoRef.current.style.transform = `translateY(${y * 0.3}px)`;
      }
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main
      className="min-h-screen overflow-x-hidden at-home bg-[var(--at-page)] text-[var(--at-text)] antialiased selection:bg-[#d3def3] selection:text-[#18212c]"
      style={{ fontFamily: fontFamily.sans }}
    >
      {/* Phones: hidden, the fixed mascot would sit on top of the hero's buttons. */}
      <div className="fixed bottom-6 right-6 z-[60] hidden sm:block">
        <Mascot
          directions="/mascots/crt-directions.webp"
          reactions="/mascots/crt-reactions.webp"
        />
      </div>

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundSize: "40px 40px",
            backgroundImage:
              "linear-gradient(to right, rgba(220, 230, 245, 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(220, 230, 245, 0.045) 1px, transparent 1px)",
          }}
        />
        <div
          className="absolute left-[10%] top-[20%] h-[50vw] w-[50vw] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(214, 228, 255, 0.1) 0%, rgba(160, 182, 214, 0.04) 45%, transparent 70%)",
          }}
        />
        <div className="absolute bottom-[10%] right-[-5%] h-[40vw] w-[40vw] rounded-full bg-[var(--at-accent)]/5 blur-[120px]" />
        {!prefersReducedMotion && particleList.map((p, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              background: "#eef4ff",
              boxShadow: "0 0 10px rgba(226, 236, 255, 0.7), 0 0 18px rgba(200, 218, 255, 0.35)",
              pointerEvents: "none",
            }}
            initial={{ y: "-10vh", x: 0, scale: 0.85, opacity: 0 }}
            animate={{ y: "115vh", x: 24, scale: 1.05, opacity: [0, 0.85, 0.85, 0.7, 0] }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
      </div>

      <motion.nav
        className="fixed left-0 top-0 z-50 flex w-full items-center border-b transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-300"
        animate={{
          height: navScrolled ? 64 : 80,
          backgroundColor: navScrolled ? "rgba(22, 28, 34, 0.72)" : "rgba(22, 28, 34, 0)",
          borderColor: navScrolled ? "rgba(220, 230, 245, 0.17)" : "rgba(220, 230, 245, 0)",
          backdropFilter: navScrolled ? "blur(12px)" : "blur(0px)",
        }}
        transition={{ duration: 0.3 }}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6">
          <Logo />

          <div
            className="hidden items-center gap-8 text-xs uppercase tracking-widest text-white md:flex"
            style={{ fontFamily: fontFamily.mono }}
          >
            <a href="#how-it-works" className="text-white visited:text-white transition-colors hover:text-[var(--at-link)]">
              {t("home.nav.howItWorks")}
            </a>
            <a href="#diff" className="text-white visited:text-white transition-colors hover:text-[var(--at-link)]">
              {t("home.nav.diff")}
            </a>
            <a href="#change-types" className="text-white visited:text-white transition-colors hover:text-[var(--at-link)]">
              {t("home.nav.changeTypes")}
            </a>
            <a href="#evidence" className="text-white visited:text-white transition-colors hover:text-[var(--at-link)]">
              {t("home.nav.evidence")}
            </a>
          </div>

          <div className="flex items-center gap-4">
            <LanguageSwitch />
            {authLoading ? (
              <span role="status" aria-label={t("home.loadingAccount")} className="h-10 w-10 animate-pulse rounded-full border border-[var(--at-line)] bg-[var(--at-panel)] motion-reduce:animate-none" />
            ) : user ? (
              <Suspense fallback={<span className="h-10 w-10" role="status" aria-label={t("home.loadingAccountMenu")} />}><AccountMenu onNavigate={() => setMobileMenuOpen(false)} /></Suspense>
            ) : (<>
            <Link
              to="/login"
              className="hidden text-xs uppercase tracking-widest text-slate-300 transition-colors hover:text-white md:inline-block"
              style={{ fontFamily: fontFamily.mono }}
            >
              {t("common.signIn")}
            </Link>
            <Link
              to="/register"
              className="hidden border border-[var(--at-accent)]/30 bg-[var(--at-panel)] px-5 py-2.5 text-xs uppercase tracking-widest text-white transition-[color,background-color,border-color,box-shadow,opacity,transform] hover:border-[var(--at-glow)] hover:text-[var(--at-glow)] md:inline-block"
              style={{ fontFamily: fontFamily.mono }}
            >
              {t("common.signUp")}
            </Link>
            </>)}
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? t("home.closeMenu") : t("home.openMenu")}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-menu"
              className="border border-[var(--at-line)] bg-[var(--at-panel)] p-2.5 text-slate-300 transition-colors hover:border-[var(--at-glow)] hover:text-white md:hidden"
            >
              <Icon icon={mobileMenuOpen ? "ph:x-bold" : "ph:list-bold"} className="text-lg" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              id="mobile-nav-menu"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute left-0 top-full w-full overflow-hidden border-b border-[var(--at-line)] bg-[var(--at-page)]/95 backdrop-blur-md md:hidden"
            >
              <nav
                className="flex flex-col gap-1 px-6 py-4 text-xs uppercase tracking-widest text-white"
                style={{ fontFamily: fontFamily.mono }}
              >
                <a
                  href="#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  className="border-b border-[var(--at-line)]/60 py-3 text-white visited:text-white transition-colors hover:text-[var(--at-link)]"
                >
                  {t("home.nav.howItWorks")}
                </a>
                <a
                  href="#diff"
                  onClick={() => setMobileMenuOpen(false)}
                  className="border-b border-[var(--at-line)]/60 py-3 text-white visited:text-white transition-colors hover:text-[var(--at-link)]"
                >
                  {t("home.nav.diff")}
                </a>
                <a
                  href="#change-types"
                  onClick={() => setMobileMenuOpen(false)}
                  className="border-b border-[var(--at-line)]/60 py-3 text-white visited:text-white transition-colors hover:text-[var(--at-link)]"
                >
                  {t("home.nav.changeTypes")}
                </a>
                <a
                  href="#evidence"
                  onClick={() => setMobileMenuOpen(false)}
                  className="border-b border-[var(--at-line)]/60 py-3 text-white visited:text-white transition-colors hover:text-[var(--at-link)]"
                >
                  {t("home.nav.evidence")}
                </a>
                {!authLoading && !user && (<>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-3 transition-colors hover:text-[var(--at-glow)]"
                >
                  {t("common.signIn")}
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="mt-2 border border-[var(--at-accent)]/30 bg-[var(--at-panel)] px-5 py-2.5 text-center text-white transition-[color,background-color,border-color,box-shadow,opacity,transform] hover:border-[var(--at-glow)] hover:text-[var(--at-glow)]"
                >
                  {t("common.signUp")}
                </Link>
                </>)}
                <Link
                  to={startHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className="mt-2 border border-[var(--at-line)] bg-transparent px-5 py-2.5 text-center text-[var(--at-muted)] transition-[color,background-color,border-color,box-shadow,opacity,transform] hover:border-slate-400 hover:text-white"
                >
                  {startLabel}
                </Link>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

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
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--at-page)] via-[var(--at-page)]/5 to-transparent" />
        </div>

        <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-12 px-6 py-12 lg:grid-cols-12">
          <div className="space-y-8 text-left lg:col-span-7">
            <div className="inline-flex items-center gap-3 border border-[var(--at-line)] bg-[var(--at-panel)]/80 px-4 py-1.5">
              <Icon icon="radix-icons:dot-filled" className="animate-spin motion-reduce:animate-none text-[var(--at-warn)]" />
              <span
                className="text-xs uppercase tracking-widest text-slate-300"
                style={{ fontFamily: fontFamily.mono }}
              >
                {t("home.hero.badge")}
              </span>
            </div>

            <h1 className="text-5xl font-bold leading-[1.1] tracking-tight text-white sm:text-6xl md:text-7xl">
              {t("home.hero.title1")} <br />
              <span
                className="bg-gradient-to-r from-[#ffffff] via-[#d3def3] to-[#9db3dc] bg-clip-text text-transparent"
              >
                {t("home.hero.title2")}
              </span>
            </h1>

            <p className="max-w-xl text-base font-light leading-relaxed text-[var(--at-muted)] sm:text-lg">
              {t("home.hero.body")}
            </p>

            <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
              <MotionLink
                to={startHref}
                className="rounded-full bg-[var(--at-fill)] px-8 py-4 text-center text-xs font-bold uppercase tracking-widest text-[var(--at-on-fill)] transition-colors hover:bg-[var(--at-fill-hover)]"
                style={{ fontFamily: fontFamily.mono }}
                whileHover={{
                  boxShadow:
                    "0 0 45px rgba(214, 228, 255, 0.45), inset 0 0 20px rgba(255, 255, 255, 0.25)",
                }}
                initial={{
                  boxShadow: "0 0 30px rgba(214, 228, 255, 0.3), inset 0 0 15px rgba(255, 255, 255, 0.15)",
                }}
              >
                {startLabel}
              </MotionLink>
              <a
                href="#how-it-works"
                className="rounded-full border border-[var(--at-line)] bg-[var(--at-panel)]/40 px-8 py-4 text-center text-xs font-light uppercase tracking-widest text-slate-300 transition-[color,background-color,border-color,box-shadow,opacity,transform] hover:border-slate-400"
                style={{ fontFamily: fontFamily.mono }}
              >
                {t("home.hero.seeHow")}
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10">
        <RevealSection id="how-it-works" className="mx-auto max-w-7xl px-6 py-32">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-5">
              <span
                className="block text-xs uppercase tracking-widest text-[var(--at-warn)]"
                style={{ fontFamily: fontFamily.mono }}
              >
                {t("home.mining.eyebrow")}
              </span>
              <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
                {t("home.mining.title")}
              </h2>
              <p className="leading-relaxed text-[var(--at-muted)] font-light">
                {t("home.mining.body")}
              </p>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="border-l-2 border-[var(--at-accent)] pl-4">
                  <div className="text-xl font-bold text-white">
                    AST
                  </div>
                  <div className="text-xs uppercase tracking-wider text-[var(--at-muted)]">{t("home.mining.astLabel")}</div>
                </div>
                <div className="border-l-2 border-[var(--at-warn)] pl-4">
                  <div className="text-xl font-bold text-white">
                    {t("home.mining.gitTitle")}
                  </div>
                  <div className="text-xs uppercase tracking-wider text-[var(--at-muted)]">{t("home.mining.gitLabel")}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:col-span-7">
              <IsometricCard
                icon="ph:graph-light"
                iconColor="#9db3dc"
                title={t("home.card.graph.title")}
                description={t("home.card.graph.body")}
              />
              <IsometricCard
                icon="ph:git-diff-light"
                iconColor="#d3def3"
                title={t("home.card.diff.title")}
                description={t("home.card.diff.body")}
              />
              <IsometricCard
                icon="ph:brain-light"
                iconColor="#b4c0ce"
                title={t("home.card.reasoning.title")}
                description={t("home.card.reasoning.body")}
              />
              <IsometricCard
                icon="ph:shield-check-light"
                iconColor="#eaf1ff"
                title="FACT / INFERENCE / UNKNOWN"
                description={t("home.card.labels.body")}
              />
            </div>
          </div>
        </RevealSection>

        <RevealSection id="diff" className="border-y border-[var(--at-line)] bg-[var(--at-panel)]/50 py-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto mb-16 max-w-2xl text-center">
              <span
                className="mb-3 block text-xs uppercase tracking-widest text-[var(--at-link)]"
                style={{ fontFamily: fontFamily.mono }}
              >
                {t("home.diff.eyebrow")}
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
                {t("home.diff.title")}
              </h2>
            </div>

            <div className="mx-auto w-full max-w-4xl overflow-hidden border border-[var(--at-line)] bg-[var(--at-page)] shadow-2xl">
              <div className="flex select-none items-center justify-between border-b border-[var(--at-line)] bg-[var(--at-panel)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/40" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/40" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500/40" />
                  <span className="ml-2 text-xs text-[var(--at-muted)]" style={{ fontFamily: fontFamily.mono }}>
                    archtime_pipeline.sh
                  </span>
                </div>
                <span className="text-[10px] text-[var(--at-muted)]" style={{ fontFamily: fontFamily.mono }}>
                  TTY // 1
                </span>
              </div>

              <div
                className="min-h-[320px] space-y-4 bg-gradient-to-b from-[var(--at-page)] to-[var(--at-panel)]/20 p-6 text-xs sm:text-sm"
                style={{ fontFamily: fontFamily.mono }}
              >
                <div className="flex items-start gap-2">
                  <span className="text-[var(--at-link)]">archtime@repo:~$</span>
                  <span className="text-slate-300">analyze --repo=./target-service --since=v1.0.0</span>
                </div>
                <div className="space-y-1 text-[var(--at-muted)]">
                  <div>[ OK ] Mining Git history and building commit graph...</div>
                  <div>[ OK ] Parsing AST for module and dependency structure...</div>
                  <div>[ OK ] Comparing architecture snapshots (graph edit distance)...</div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[var(--at-link)]">archtime@repo:~$</span>
                  <span className="text-slate-300">cat architectural_diff.json</span>
                </div>
                <div className="border border-[var(--at-line)]/60 bg-[var(--at-panel-2)]/50 p-4 leading-relaxed text-[var(--at-warn)]">
                  &quot;{t("home.diff.quote")}&quot;
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-[var(--at-link)]">archtime@repo:~$</span>
                  <TypewriterLine />
                </div>
              </div>
            </div>
          </div>
        </RevealSection>

        <RevealSection id="change-types" className="mx-auto max-w-7xl px-6 py-32">
          <div className="mb-16 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <div>
              <span
                className="mb-3 block text-xs uppercase tracking-widest text-[var(--at-warn)]"
                style={{ fontFamily: fontFamily.mono }}
              >
                {t("home.changes.eyebrow")}
              </span>
              <h2 className="text-4xl font-bold tracking-tight text-white">{t("home.changes.title")}</h2>
            </div>
            <p className="max-w-xs text-sm font-light text-[var(--at-muted)]">
              {t("home.changes.body")}
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="group flex h-80 flex-col justify-between border border-[var(--at-line)] bg-[var(--at-panel-2)] p-8 transition-colors hover:border-[var(--at-accent)]/40">
              <div>
                <div className="mb-6 flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center border border-[var(--at-accent)]/20 bg-[var(--at-accent)]/10 text-xl text-[var(--at-link)]">
                    <Icon icon="ph:cube-light" />
                  </div>
                  <span className="text-xs text-[var(--at-muted)]" style={{ fontFamily: fontFamily.mono }}>
                    {t("home.changes.counter", { n: "01" })}
                  </span>
                </div>
                <h3 className="mb-2 text-xl font-bold text-white transition-colors group-hover:text-[var(--at-link)]">
                  {t("home.changes.split.title")}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--at-muted)] font-light">
                  {t("home.changes.split.body")}
                </p>
              </div>
              <div
                className="text-[11px] uppercase tracking-widest text-[var(--at-muted)]"
                style={{ fontFamily: fontFamily.mono }}
              >
                {t("home.changes.split.status")}
              </div>
            </div>

            <div className="group flex h-80 flex-col justify-between border border-[var(--at-line)] bg-[var(--at-panel-2)] p-8 transition-colors hover:border-[var(--at-warn)]/40">
              <div>
                <div className="mb-6 flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center border border-[var(--at-warn)]/20 bg-[var(--at-warn)]/10 text-xl text-[var(--at-warn)]">
                    <Icon icon="ph:sliders-horizontal-light" />
                  </div>
                  <span className="text-xs text-[var(--at-muted)]" style={{ fontFamily: fontFamily.mono }}>
                    {t("home.changes.counter", { n: "02" })}
                  </span>
                </div>
                <h3 className="mb-2 text-xl font-bold text-white transition-colors group-hover:text-[var(--at-warn)]">
                  {t("home.changes.shift.title")}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--at-muted)] font-light">
                  {t("home.changes.shift.body")}
                </p>
              </div>
              <div
                className="text-[11px] uppercase tracking-widest text-[var(--at-muted)]"
                style={{ fontFamily: fontFamily.mono }}
              >
                {t("home.changes.shift.status")}
              </div>
            </div>

            <div className="group flex h-80 flex-col justify-between border border-[var(--at-line)] bg-[var(--at-panel-2)] p-8 transition-colors hover:border-[var(--at-glow)]/40">
              <div>
                <div className="mb-6 flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center border border-[var(--at-glow)]/20 bg-[var(--at-glow)]/10 text-xl text-[var(--at-glow)]">
                    <Icon icon="ph:command-light" />
                  </div>
                  <span className="text-xs text-[var(--at-muted)]" style={{ fontFamily: fontFamily.mono }}>
                    {t("home.changes.counter", { n: "03" })}
                  </span>
                </div>
                <h3 className="mb-2 text-xl font-bold text-white transition-colors group-hover:text-[var(--at-glow)]">
                  {t("home.changes.package.title")}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--at-muted)] font-light">
                  {t("home.changes.package.body")}
                </p>
              </div>
              <div
                className="text-[11px] uppercase tracking-widest text-[var(--at-muted)]"
                style={{ fontFamily: fontFamily.mono }}
              >
                {t("home.changes.package.status")}
              </div>
            </div>
          </div>
        </RevealSection>

        <RevealSection id="evidence" className="border-t border-[var(--at-line)] bg-[var(--at-panel-2)]/30 py-32">
          <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-12">
            <div className="relative order-2 lg:col-span-6 lg:order-1">
              <div className="pointer-events-none absolute inset-0 rounded-full bg-[var(--at-accent)]/5 blur-[100px]" />
              <div
                className="relative z-10 space-y-4 border border-[var(--at-line)] bg-[var(--at-page)] p-8 text-xs"
                style={{ fontFamily: fontFamily.mono }}
              >
                <div className="flex justify-between border-b border-[var(--at-line)]/40 pb-3 text-[var(--at-muted)]">
                  <span>{t("home.evidence.record")}</span>
                  <span>COMMIT 4af21c9</span>
                </div>
                <div className="flex justify-between border-b border-[var(--at-line)]/40 pb-2">
                  <span className="text-[var(--at-muted)]">{t("home.evidence.author")}</span>
                  <span className="text-white">j.tran@example.com</span>
                </div>
                <div className="flex justify-between border-b border-[var(--at-line)]/40 pb-2">
                  <span className="text-[var(--at-muted)]">{t("home.evidence.files")}</span>
                  <span className="text-white">{t("home.evidence.filesValue")}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--at-line)]/40 pb-2">
                  <span className="text-[var(--at-muted)]">{t("home.evidence.claim")}</span>
                  <span className="text-white">FACT</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-[var(--at-muted)]">{t("home.evidence.confidence")}</span>
                  <span className="text-[var(--at-warn)]">{t("home.evidence.coverage")}</span>
                </div>
              </div>
            </div>

            <div className="space-y-6 order-1 lg:col-span-6 lg:order-2">
              <span
                className="block text-xs uppercase tracking-widest text-[var(--at-link)]"
                style={{ fontFamily: fontFamily.mono }}
              >
                {t("home.evidence.eyebrow")}
              </span>
              <h2 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
                {t("home.evidence.title")}
              </h2>
              <p className="leading-relaxed text-[var(--at-muted)] font-light">
                {t("home.evidence.body")}
              </p>
              <div className="pt-2">
                <Link
                  to={SAMPLE_WORKSPACE}
                  className="inline-block rounded-full bg-[var(--at-fill)] px-8 py-4 text-xs font-bold uppercase tracking-widest text-[var(--at-on-fill)] shadow-[0_0_18px_rgba(214,228,255,0.35)] transition-colors hover:bg-[var(--at-fill-hover)]"
                  style={{ fontFamily: fontFamily.mono }}
                >
                  {t("home.evidence.sample")}
                </Link>
              </div>
            </div>
          </div>
        </RevealSection>

        {/* The closing call to action. (A newsletter form stood here, but nothing stored the address, so it promised mail
            that never came.) */}
        <RevealSection id="get-started" className="relative mx-auto max-w-4xl overflow-hidden px-6 py-32 text-center">
          <div className="pointer-events-none absolute inset-0 rounded-full bg-[var(--at-warn)]/5 blur-3xl" />
          <div className="relative z-10 space-y-8">
            <Icon icon="ph:fingerprint-light" aria-hidden="true" className="animate-pulse motion-reduce:animate-none text-4xl text-[var(--at-link)]" />
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
              {t("home.cta.title")}
            </h2>
            <p className="mx-auto max-w-xl text-sm font-light leading-relaxed text-[var(--at-muted)] sm:text-base">
              {t("home.cta.body")}
            </p>
            <div className="mx-auto flex max-w-md flex-col items-stretch gap-4 sm:flex-row sm:justify-center">
              <Link
                to={startHref}
                className="whitespace-nowrap bg-[var(--at-fill)] px-8 py-4 text-center text-xs font-bold uppercase tracking-widest text-[var(--at-on-fill)] transition-colors hover:bg-[var(--at-fill-hover)]"
                style={{ fontFamily: fontFamily.mono }}
              >
                {startLabel}
              </Link>
              <Link
                to={SAMPLE_WORKSPACE}
                className="whitespace-nowrap border border-[var(--at-line)] px-8 py-4 text-center text-xs uppercase tracking-widest text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
                style={{ fontFamily: fontFamily.mono }}
              >
                {t("home.cta.sample")}
              </Link>
            </div>
          </div>
        </RevealSection>

        <footer className="relative overflow-hidden border-t border-[var(--at-line)]/40 bg-[var(--at-panel)] px-6 pb-12 pt-20">
          <div className="mx-auto mb-16 grid max-w-7xl items-start gap-16 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-5">
              <Logo />
              <p className="max-w-sm text-sm font-light leading-relaxed text-[var(--at-muted)]">
                {t("home.footer.about")}
              </p>
            </div>

            <div className="grid w-full gap-12 md:grid-cols-3 lg:col-span-7">
              <div>
                <h4
                  className="mb-6 text-xs font-bold uppercase tracking-widest text-[var(--at-warn)]"
                  style={{ fontFamily: fontFamily.mono }}
                >
                  {t("home.footer.pipeline")}
                </h4>
                <ul className="space-y-4 text-xs">
                  <li><a href="#how-it-works" className="text-white visited:text-white transition-colors hover:text-[var(--at-link)]">{t("home.footer.mining")}</a></li>
                  <li><a href="#diff" className="text-white visited:text-white transition-colors hover:text-[var(--at-link)]">{t("home.footer.evolution")}</a></li>
                  <li><a href="#evidence" className="text-white visited:text-white transition-colors hover:text-[var(--at-link)]">{t("home.footer.reasoning")}</a></li>
                  <li><a href="#change-types" className="text-white visited:text-white transition-colors hover:text-[var(--at-link)]">{t("home.footer.diff")}</a></li>
                </ul>
              </div>
              <div>
                <h4
                  className="mb-6 text-xs font-bold uppercase tracking-widest text-[var(--at-warn)]"
                  style={{ fontFamily: fontFamily.mono }}
                >
                  {t("home.footer.scope")}
                </h4>
                <ul className="space-y-4 text-xs text-[var(--at-muted)]">
                  <li>JavaScript / TypeScript</li>
                  <li>Java, C#, Python, Go</li>
                  <li>{t("home.footer.gitAnalysis")}</li>
                  <li>{t("home.footer.graph")}</li>
                  <li>{t("home.footer.benchmarks")}</li>
                </ul>
              </div>
              <div className="col-span-2 md:col-span-1">
                <h4
                  className="mb-6 text-xs font-bold uppercase tracking-widest text-[var(--at-warn)]"
                  style={{ fontFamily: fontFamily.mono }}
                >
                  {t("home.footer.project")}
                </h4>
                <div className="flex gap-4 text-xl text-[var(--at-muted)]" aria-label={t("home.footer.linksSoon")}>
                  <span className="cursor-not-allowed opacity-60" aria-disabled="true" title={t("common.comingSoon")}>
                    <Icon icon="ph:github-logo-light" />
                  </span>
                  <span className="cursor-not-allowed opacity-60" aria-disabled="true" title={t("common.comingSoon")}>
                    <Icon icon="ph:terminal-light" />
                  </span>
                  <span className="cursor-not-allowed opacity-60" aria-disabled="true" title={t("common.comingSoon")}>
                    <Icon icon="ph:cpu-light" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-[var(--at-line)]/40 pt-8 text-[10px] uppercase tracking-widest text-[var(--at-muted)] sm:flex-row"
            style={{ fontFamily: fontFamily.mono }}
          >
            <p>{t("home.footer.copyright")}</p>
            <div className="flex gap-8" aria-label={t("home.footer.legend")}>
              <span>FACT</span>
              <span>INFERENCE</span>
              <span>UNKNOWN</span>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
