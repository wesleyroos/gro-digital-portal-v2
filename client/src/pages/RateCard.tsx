import React, { useState } from "react";

const BLUE = "#2286C2";
const TEXT = "#111827";
const MUTED = "#6B7280";
const FAINT = "#9CA3AF";
const BORDER = "#E5E7EB";
const COLS = "1fr 110px 115px";

const services = [
  { index: "01", name: "Product Strategy & Advisory", desc: "Strategic roadmapping, innovation sessions, Exco-level presentations, stakeholder workshops, product vision", hourly: "1,800", daily: "14,400" },
  { index: "02", name: "Product & UX Audit", desc: "Deep-dive product audits, UX and conversion analysis, competitive benchmarking, bottleneck identification, findings reports", hourly: "1,800", daily: "14,400" },
  { index: "03", name: "Platform & Web Development", desc: "Full-stack development, platform builds, API integrations, codebase analysis, deployment, QA", hourly: "1,500", daily: "12,000" },
  { index: "04", name: "Discovery & Scoping", desc: "Requirements gathering, technical scoping, product definition, stakeholder alignment sessions", hourly: "1,800", daily: "14,400" },
  { index: "05", name: "Project & Delivery Management", desc: "Sprint management, QA oversight, progress reporting, stakeholder coordination", hourly: "1,200", daily: "9,600" },
];

const process = [
  {
    step: "01",
    title: "Get stuck in",
    body: "We don't wait for a polished brief. We meet the team, the stakeholders, the people closest to the problem — and we start learning fast.",
  },
  {
    step: "02",
    title: "Map the problems",
    body: "We identify where things break, slow down, or bleed revenue. Bottlenecks, gaps, missed opportunities — all surfaced before we write a line of code.",
  },
  {
    step: "03",
    title: "Audit & diagnose",
    body: "We dig into what exists — the codebase, the UX, the ops. We build a clear, honest picture of the current state before proposing anything.",
  },
  {
    step: "04",
    title: "Propose a plan",
    body: "Clear, opinionated, prioritised. Not a 40-slide deck — a direct path forward with a rationale behind every decision.",
  },
  {
    step: "05",
    title: "Build & iterate fast",
    body: "Implementation begins immediately. Working software in days, not months. We ship, get feedback, and improve — continuously, without stopping.",
  },
];

const tiers = [
  {
    name: "Studio",
    price: "R200,000",
    period: "/month",
    tagline: "Build the right thing, fast.",
    description: "The core GRO team embedded in your business — strategy, engineering, and product. Shipping working software from day one.",
    days: "16",
    recommended: false,
    rows: {
      "Days per month": "16",
      "Product strategy & roadmapping": true,
      "Platform & web development": true,
      "Product & UX audits": true,
      "Hosting & infrastructure": true,
      "Progress reporting": true,
      "Go-to-market strategy": false,
      "Outreach & meeting generation": false,
      "Launch planning & execution": false,
      "WhatsApp integration": false,
      "Parallel product tracks": false,
      "Additional specialist capacity": false,
    },
  },
  {
    name: "Growth",
    price: "R300,000",
    period: "/month",
    tagline: "Build it. Then take it to market.",
    description: "Everything in Studio — plus we act like a startup inside your organisation. We own the GTM, get in the room, and drive real adoption.",
    days: "22",
    recommended: true,
    rows: {
      "Days per month": "22",
      "Product strategy & roadmapping": true,
      "Platform & web development": true,
      "Product & UX audits": true,
      "Hosting & infrastructure": true,
      "Progress reporting": true,
      "Go-to-market strategy": true,
      "Outreach & meeting generation": true,
      "Launch planning & execution": true,
      "WhatsApp integration": "Scoped",
      "Parallel product tracks": false,
      "Additional specialist capacity": false,
    },
  },
  {
    name: "Scale",
    price: "Custom",
    period: "",
    tagline: "Full transformation capability.",
    description: "Multiple product tracks, expanded specialist capacity, bespoke scoping. For organisations running full-scale digital innovation programmes.",
    days: "30+",
    recommended: false,
    rows: {
      "Days per month": "30+",
      "Product strategy & roadmapping": true,
      "Platform & web development": true,
      "Product & UX audits": true,
      "Hosting & infrastructure": true,
      "Progress reporting": true,
      "Go-to-market strategy": true,
      "Outreach & meeting generation": true,
      "Launch planning & execution": true,
      "WhatsApp integration": "Scoped",
      "Parallel product tracks": true,
      "Additional specialist capacity": true,
    },
  },
];

const rowGroups = [
  { label: "Build", rows: [
    { name: "Days per month", desc: "Committed capacity allocated each month" },
    { name: "Product strategy & roadmapping", desc: "Roadmaps, workshops, vision alignment, innovation sessions" },
    { name: "Platform & web development", desc: "Full-stack builds, API integrations, deployment, QA" },
    { name: "Product & UX audits", desc: "Deep-dive reviews of existing products, UX and conversion analysis" },
    { name: "Hosting & infrastructure", desc: "Managed servers, uptime monitoring, deployment pipelines" },
    { name: "Progress reporting", desc: "Monthly delivery summaries, what shipped and what's next" },
  ]},
  { label: "Grow", rows: [
    { name: "Go-to-market strategy", desc: "Positioning, channel selection, messaging and launch planning" },
    { name: "Outreach & meeting generation", desc: "We get in the room — direct outreach to drive product adoption" },
    { name: "Launch planning & execution", desc: "End-to-end ownership of product launches from brief to live" },
    { name: "WhatsApp integration", desc: "Full WhatsApp build-out covering business logic, automated workflows, and BSP (Clickatell) relationship management — scoped and quoted separately once the initial concept is validated" },
  ]},
  { label: "Scale", rows: [
    { name: "Parallel product tracks", desc: "Multiple builds or innovation streams running simultaneously" },
    { name: "Additional specialist capacity", desc: "External experts and contractors brought in as the scope demands" },
  ]},
];

const qualifiers = [
  "You need a senior product mind embedded in your team — not just development capacity.",
  "You're building something new and ambitious, not maintaining a system someone else designed.",
  "You want direct access to the person doing the work, not a PM relaying messages.",
  "You can move fast and make decisions without 10 layers of approval.",
  "You value craft. The technology you ship should reflect the quality of your brand.",
];

const faqs = [
  { q: "How do we get started?", a: "A short discovery call — usually 30 minutes. We scope the first sprint together and move from there. Turnaround from first contact to active development is typically under a week." },
  { q: "Do you work on fixed-price projects?", a: "We prefer time-based billing for embedded and innovation work because scope is rarely fixed upfront. Fixed-price engagements are available for well-defined, contained scopes — discuss this on the discovery call." },
  { q: "What's the minimum retainer commitment?", a: "There's no hard minimum, but we recommend at least three months to see real impact. A retainer works best when there's a genuine product roadmap — not a one-off task list." },
  { q: "How does the AI tooling affect quality?", a: "It accelerates delivery without compromising quality. We use agentic AI tooling for development velocity — but product strategy, architecture decisions, and quality standards are always senior-led. Speed is the benefit, not a cut corner." },
  { q: "Do you work with multiple clients at once?", a: "Yes, but retainer clients receive allocated capacity and are never bumped. Project work is scheduled around retainer commitments, not the other way around." },
];

const css = `
  * { box-sizing: border-box; }

  @keyframes gd-fade {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .gd-fade-1 { animation: gd-fade 0.55s ease 0.05s both; }
  .gd-fade-2 { animation: gd-fade 0.55s ease 0.18s both; }

  .gd-nav-link { font-size: 13px; font-weight: 500; color: ${MUTED}; text-decoration: none; letter-spacing: -0.005em; transition: color 0.12s ease; }
  .gd-nav-link:hover { color: ${TEXT}; }

  .gd-cta-sm { display: inline-flex; align-items: center; gap: 7px; background: ${BLUE}; color: #fff; padding: 9px 18px; font-size: 13px; font-weight: 600; letter-spacing: -0.01em; text-decoration: none; border-radius: 7px; transition: opacity 0.15s ease; white-space: nowrap; }
  .gd-cta-sm:hover { opacity: 0.88; }

  .gd-cta-lg { display: inline-flex; align-items: center; gap: 8px; background: ${BLUE}; color: #fff; padding: 13px 26px; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; text-decoration: none; border-radius: 8px; transition: opacity 0.15s ease; white-space: nowrap; }
  .gd-cta-lg:hover { opacity: 0.88; }

  .gd-row { transition: background 0.1s ease; border-radius: 6px; }
  .gd-row:hover { background: #F5FAFF; }
  .gd-row:hover .gd-row-bar { background: ${BLUE}; }
  .gd-row-bar { width: 2px; flex-shrink: 0; align-self: stretch; background: transparent; border-radius: 2px; transition: background 0.1s ease; }

  .gd-process-step { position: relative; }
  .gd-process-step:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 18px;
    left: calc(100% + 1px);
    width: calc(100% - 2px);
    height: 1px;
    background: ${BORDER};
  }

  .gd-tier-col { transition: box-shadow 0.15s ease; }

  .gd-qualifier { display: flex; align-items: flex-start; gap: 14px; padding: 18px 0; border-bottom: 1px solid ${BORDER}; }
  .gd-qualifier:last-child { border-bottom: none; }

  .gd-faq { padding: 24px 0; border-bottom: 1px solid ${BORDER}; }
  .gd-faq:last-child { border-bottom: none; }

  .gd-footer-link { font-size: 13px; color: rgba(255,255,255,0.6); text-decoration: none; transition: color 0.12s ease; }
  .gd-footer-link:hover { color: #fff; }

  @media (max-width: 700px) {
    .gd-wrap { padding-left: 20px !important; padding-right: 20px !important; }
    .gd-hero-title { font-size: 44px !important; }
    .gd-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .gd-row-grid { display: block !important; }
    .gd-row-rates { display: flex; gap: 24px; padding-top: 12px; }
    .gd-process-grid { grid-template-columns: 1fr !important; }
    .gd-process-step::after { display: none !important; }
    .gd-retainer-top { grid-template-columns: 1fr !important; gap: 28px !important; }
    .gd-retainer-items { grid-template-columns: 1fr !important; }
    .gd-qualifier-grid { grid-template-columns: 1fr !important; gap: 0 !important; }
    .gd-cta-bar { flex-direction: column !important; gap: 20px !important; }
    .gd-footer-cols { flex-direction: column !important; gap: 40px !important; }
    .gd-footer-contacts { flex-direction: column !important; gap: 32px !important; }
    .gd-footer-bottom { flex-direction: column !important; text-align: center; gap: 6px !important; }
    .gd-nav-links { display: none !important; }
  }
`;

function DownloadButton() {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rates/pdf");
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "GRO-Digital-Rate-Card-2026.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("PDF generation failed — please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        background: "transparent",
        color: loading ? FAINT : TEXT,
        padding: "12px 20px",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        border: `1.5px solid ${BORDER}`,
        borderRadius: 8,
        cursor: loading ? "default" : "pointer",
        transition: "border-color 0.15s, color 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {loading ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          Generating…
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Download PDF
        </>
      )}
    </button>
  );
}

function SiteHeader() {
  return (
    <header style={{ background: "#fff", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, zIndex: 50 }}>
      <div className="gd-wrap" style={{ maxWidth: 980, margin: "0 auto", padding: "0 48px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
        <a href="/rates" style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
          <img src="/gro-digital-logo.jpg" alt="GRO Digital" style={{ height: 36, width: "auto", display: "block" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        </a>
        <nav className="gd-nav-links" style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <a href="#services" className="gd-nav-link">Services</a>
          <a href="#process" className="gd-nav-link">How We Work</a>
          <a href="#retainer" className="gd-nav-link">Retainer</a>
          <a href="#faq" className="gd-nav-link">FAQ</a>
        </nav>
        <a href="mailto:wesley@grodigital.co.za" className="gd-cta-sm">Get in touch</a>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer style={{ background: "#0C111D", color: "#fff" }}>
      <div className="gd-wrap" style={{ maxWidth: 980, margin: "0 auto", padding: "56px 48px 48px" }}>
        <div className="gd-footer-cols" style={{ display: "flex", justifyContent: "space-between", gap: 64 }}>
          <div style={{ maxWidth: 280 }}>
            <img src="/gro-digital-logo-light.png" alt="GRO Digital" style={{ height: 32, width: "auto", display: "block", marginBottom: 20 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.4)", lineHeight: 1.75, margin: 0 }}>
              A lean, AI-powered product strategy and development studio. From idea to MVP — fast.
            </p>
          </div>
          <div className="gd-footer-contacts" style={{ display: "flex", gap: 64, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: 16 }}>Contact</div>
              <a href="mailto:wesley@grodigital.co.za" className="gd-footer-link" style={{ display: "block", marginBottom: 8 }}>wesley@grodigital.co.za</a>
              <a href="https://grodigital.co.za" className="gd-footer-link">grodigital.co.za</a>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: 16 }}>Address</div>
              <address style={{ fontStyle: "normal", fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.9 }}>
                Darter Studios<br />
                Longkloof, 7 Darter Rd<br />
                Gardens, Cape Town<br />
                8001
              </address>
            </div>
          </div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="gd-wrap gd-footer-bottom" style={{ maxWidth: 980, margin: "0 auto", padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.22)" }}>Gro Digital (Pty) Ltd &middot; Reg. 2020/064443/07</span>
          <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.18)" }}>&copy; {new Date().getFullYear()} Gro Digital</span>
        </div>
      </div>
    </footer>
  );
}

export default function RateCard() {
  return (
    <>
      <style>{css}</style>
      <div style={{ fontFamily: "'Inter', ui-sans-serif, sans-serif", background: "#fff", minHeight: "100vh", color: TEXT }}>

        <SiteHeader />

        {/* ── HERO ──────────────────────────────────────────── */}
        <section style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="gd-wrap" style={{ maxWidth: 980, margin: "0 auto", padding: "80px 48px 88px" }}>
            <div className="gd-fade-1" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginBottom: 28 }}>
              <h1 className="gd-hero-title" style={{ fontSize: "clamp(48px, 7vw, 84px)", fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1, margin: 0, color: TEXT }}>
                Rate Card
              </h1>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: BLUE, paddingBottom: 10, flexShrink: 0 }}>Effective 2026</span>
            </div>
            <p className="gd-fade-2" style={{ fontSize: 16, color: MUTED, maxWidth: 480, lineHeight: 1.75, margin: 0 }}>
              Senior product strategy, engineering and innovation.<br />Priced by time. Delivered with intent.
            </p>
          </div>
        </section>

        {/* ── BELIEF ────────────────────────────────────────── */}
        <section style={{ background: "#0C111D", borderBottom: `1px solid #1F2937` }}>
          <div className="gd-wrap" style={{ maxWidth: 980, margin: "0 auto", padding: "56px 48px" }}>
            <p style={{ fontSize: "clamp(20px, 2.8vw, 28px)", fontWeight: 700, color: "#fff", letterSpacing: "-0.025em", lineHeight: 1.45, margin: 0, maxWidth: 720 }}>
              Great products aren't built by the biggest teams.
              They're built by the right people — deeply embedded,
              moving fast, and obsessed with the outcome.
            </p>
            <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 24, height: 2, background: BLUE, borderRadius: 2 }} />
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", letterSpacing: "0.01em" }}>From idea to MVP — fast.</span>
            </div>
          </div>
        </section>


        {/* ── SERVICES ──────────────────────────────────────── */}
        <section id="services" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="gd-wrap" style={{ maxWidth: 980, margin: "0 auto", padding: "0 48px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "36px 12px 10px" }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: FAINT }}>Services</span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              {[...services, { index: "06", name: "Hosting & Infrastructure", desc: "Server management, uptime monitoring, deployment pipelines, domain administration — per platform managed" }].map((s, i, arr) => (
                <div
                  key={s.index}
                  className="gd-row"
                  style={{
                    display: "flex",
                    borderTop: `1px solid ${BORDER}`,
                    borderRight: i % 2 === 0 ? `1px solid ${BORDER}` : "none",
                  }}
                >
                  <div className="gd-row-bar" />
                  <div style={{ flex: 1, padding: "22px 16px 22px 12px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: FAINT, minWidth: 20 }}>{s.index}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: TEXT, letterSpacing: "-0.01em" }}>{s.name}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.65, paddingLeft: 30 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ height: 56 }} />
          </div>
        </section>

        {/* ── PROCESS ───────────────────────────────────────── */}
        <section id="process" style={{ background: "#F9FAFB", borderBottom: `1px solid ${BORDER}` }}>
          <div className="gd-wrap" style={{ maxWidth: 980, margin: "0 auto", padding: "72px 48px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: FAINT }}>How we work</span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>
            <div style={{ marginBottom: 48 }}>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800, letterSpacing: "-0.03em", color: TEXT, margin: "0 0 12px" }}>
                Fast by design. Not by accident.
              </h2>
              <p style={{ fontSize: 15, color: MUTED, margin: 0, lineHeight: 1.7, maxWidth: 520 }}>
                Most agencies spend months in discovery. We start building useful things in days. Here's how.
              </p>
            </div>

            <div className="gd-process-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0 40px" }}>
              {process.map((p, i) => (
                <div key={p.step} className="gd-process-step" style={{ position: "relative" }}>
                  {/* Connecting line */}
                  {i < process.length - 1 && (
                    <div style={{
                      position: "absolute",
                      top: 17,
                      left: "calc(100% + 8px)",
                      width: "calc(100% + 8px)",
                      height: 1,
                      background: BORDER,
                      zIndex: 0,
                    }} />
                  )}
                  {/* Step number circle */}
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: i === 0 ? BLUE : "#fff",
                    border: `1.5px solid ${i === 0 ? BLUE : BORDER}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 20,
                    position: "relative",
                    zIndex: 1,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? "#fff" : FAINT, letterSpacing: "0.02em" }}>{p.step}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, letterSpacing: "-0.01em", marginBottom: 8 }}>{p.title}</div>
                  <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.7 }}>{p.body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── RETAINER PACKAGES ─────────────────────────────── */}
        <section id="retainer" style={{ background: "#F9FAFB", borderBottom: `1px solid ${BORDER}` }}>
          <div className="gd-wrap" style={{ maxWidth: 980, margin: "0 auto", padding: "72px 48px" }}>

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: FAINT }}>Monthly Retainer</span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>
            <div style={{ marginBottom: 48 }}>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800, letterSpacing: "-0.03em", color: TEXT, margin: "0 0 12px" }}>
                Embedded. Committed. Compounding.
              </h2>
              <p style={{ fontSize: 15, color: MUTED, margin: 0, lineHeight: 1.7, maxWidth: 560 }}>
                A retainer isn't just a discount — it's a fundamentally different engagement. We become part of your team, not a vendor you call when something breaks.
              </p>
            </div>

            {/* Pricing matrix */}
            <div style={{ borderRadius: 12, border: `1px solid ${BORDER}`, background: "#fff", overflow: "hidden" }}>

              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr 1fr" }}>
                <div style={{ background: "#F9FAFB", borderRight: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: "20px" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: FAINT }}>Package</span>
                </div>
                {tiers.map((t, ti) => (
                  <div
                    key={t.name}
                    style={{
                      padding: "20px 24px 24px",
                      borderRight: ti < tiers.length - 1 ? `1px solid ${BORDER}` : "none",
                      borderBottom: `1px solid ${BORDER}`,
                      borderTop: `3px solid ${t.recommended ? BLUE : "transparent"}`,
                      background: t.recommended ? "#FAFEFF" : "#fff",
                    }}
                  >
                    {t.recommended && (
                      <div style={{ display: "inline-block", background: BLUE, color: "#fff", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "3px 10px", borderRadius: 99, marginBottom: 12 }}>
                        Recommended
                      </div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 6, marginTop: t.recommended ? 0 : 22 }}>{t.name}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 8 }}>
                      <span style={{ fontSize: t.price === "Custom" ? 22 : 26, fontWeight: 800, letterSpacing: "-0.04em", color: t.recommended ? BLUE : TEXT, lineHeight: 1 }}>{t.price}</span>
                      {t.period && <span style={{ fontSize: 12, color: FAINT }}>{t.period}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{t.tagline}</div>
                  </div>
                ))}
              </div>

              {/* Service rows by group */}
              {rowGroups.map((group, gi) => (
                <React.Fragment key={gi}>
                  {/* Group label */}
                  <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr 1fr", borderTop: `1px solid ${BORDER}` }}>
                    <div style={{ gridColumn: "1 / -1", background: "#F9FAFB", borderBottom: `1px solid ${BORDER}`, padding: "7px 20px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: BLUE }}>{group.label}</span>
                      <div style={{ flex: 1, height: 1, background: BORDER }} />
                    </div>
                  </div>
                  {group.rows.map((row, ri) => (
                    <div key={ri} style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr 1fr" }}>
                      <div style={{ padding: "12px 20px", borderRight: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, background: "#fff" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{row.name}</div>
                        <div style={{ fontSize: 11, color: FAINT, lineHeight: 1.45 }}>{row.desc}</div>
                      </div>
                      {tiers.map((t, ti) => {
                        const val = t.rows[row.name as keyof typeof t.rows];
                        return (
                          <div
                            key={t.name}
                            style={{
                              padding: "12px 24px",
                              borderRight: ti < tiers.length - 1 ? `1px solid ${BORDER}` : "none",
                              borderBottom: `1px solid ${BORDER}`,
                              background: t.recommended ? "#FAFEFF" : "#fff",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            {typeof val === "string" ? (
                              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{val}</span>
                            ) : val ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" fill={BLUE} fillOpacity="0.1" />
                                <path d="M7.5 12.5l3 3 6-6.5" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            ) : (
                              <div style={{ width: 14, height: 1.5, background: "#D1D5DB", borderRadius: 1 }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </React.Fragment>
              ))}

              {/* CTA row */}
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr 1fr" }}>
                <div style={{ padding: "20px", borderRight: `1px solid ${BORDER}`, background: "#F9FAFB" }} />
                {tiers.map((t, ti) => (
                  <div key={t.name} style={{ padding: "16px 24px", borderRight: ti < tiers.length - 1 ? `1px solid ${BORDER}` : "none", background: t.recommended ? "#FAFEFF" : "#F9FAFB" }}>
                    <a
                      href="mailto:wesley@grodigital.co.za"
                      style={{
                        display: "block",
                        textAlign: "center",
                        padding: "10px 16px",
                        borderRadius: 7,
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: "none",
                        background: t.recommended ? BLUE : "transparent",
                        color: t.recommended ? "#fff" : BLUE,
                        border: `1.5px solid ${t.recommended ? BLUE : BORDER}`,
                        letterSpacing: "-0.01em",
                        transition: "opacity 0.15s",
                      }}
                    >
                      {t.name === "Scale" ? "Get a quote" : "Get started"}
                    </a>
                  </div>
                ))}
              </div>

            </div>

            <p style={{ fontSize: 12, color: FAINT, marginTop: 16 }}>
              All retainers invoiced monthly in advance. One month's written notice to scale up, down, or pause.
            </p>

          </div>
        </section>

        {/* ── RIGHT FOR US IF ───────────────────────────────── */}
        <section style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="gd-wrap" style={{ maxWidth: 980, margin: "0 auto", padding: "72px 48px" }}>
            <div className="gd-qualifier-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "0 80px", alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: FAINT, marginBottom: 20 }}>Right for us if</div>
                <h2 style={{ fontSize: "clamp(24px, 2.8vw, 32px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2, color: TEXT, margin: 0 }}>
                  We do our best work with clients who:
                </h2>
              </div>
              <div>
                {qualifiers.map((q, i) => (
                  <div key={i} className="gd-qualifier">
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${BLUE}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 14.5, color: TEXT, lineHeight: 1.65 }}>{q}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────── */}
        <section id="faq" style={{ background: "#F9FAFB", borderBottom: `1px solid ${BORDER}` }}>
          <div className="gd-wrap" style={{ maxWidth: 980, margin: "0 auto", padding: "72px 48px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 48 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: FAINT }}>FAQ</span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>
            <div style={{ maxWidth: 680 }}>
              {faqs.map((f) => (
                <div key={f.q} className="gd-faq">
                  <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, letterSpacing: "-0.01em", marginBottom: 10 }}>{f.q}</div>
                  <div style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.75 }}>{f.a}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── AD HOC RATES ──────────────────────────────────── */}
        <section style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="gd-wrap" style={{ maxWidth: 980, margin: "0 auto", padding: "72px 48px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: FAINT }}>Ad hoc rates</span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>
            <div style={{ marginBottom: 36 }}>
              <h2 style={{ fontSize: "clamp(20px, 2.5vw, 26px)", fontWeight: 800, letterSpacing: "-0.03em", color: TEXT, margin: "0 0 10px" }}>
                Not on a retainer?
              </h2>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, maxWidth: 480, margin: 0 }}>
                For once-off projects, short engagements, or work outside a retainer scope, we bill at the following standard rates.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              {/* Column headers */}
              <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 110px 115px", gap: "0 24px", paddingBottom: 10, borderBottom: `1px solid ${BORDER}`, marginBottom: 0 }}>
                <div />
                <div style={{ textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: FAINT }}>Per Hour</div>
                <div style={{ textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: FAINT }}>Per Day</div>
              </div>

              {/* Rate rows */}
              {[...services, { index: "06", name: "Hosting & Infrastructure", desc: "Per platform managed", hourly: null, daily: null, monthly: "6,000" }].map((s: any) => (
                <div key={s.index} style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 110px 115px", gap: "0 24px", padding: "16px 0", borderBottom: `1px solid ${BORDER}`, alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={{ fontSize: 10, color: FAINT, minWidth: 20 }}>{s.index}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: TEXT, letterSpacing: "-0.01em" }}>{s.name}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {s.hourly ? (
                      <>
                        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.03em", color: TEXT }}>R{s.hourly}</span>
                        <span style={{ fontSize: 10, color: FAINT }}>/hr</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.03em", color: TEXT }}>R{s.monthly}</span>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {s.daily ? (
                      <>
                        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.03em", color: BLUE }}>R{s.daily}</span>
                        <span style={{ fontSize: 10, color: FAINT }}>/day</span>
                      </>
                    ) : s.monthly ? (
                      <span style={{ fontSize: 11, color: FAINT }}>/month</span>
                    ) : (
                      <span style={{ fontSize: 15, color: FAINT }}>—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 12, color: FAINT, marginTop: 14 }}>
              A day rate assumes 8 hours. Retainer clients receive 25–30% off these rates.
            </p>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────── */}
        <section>
          <div className="gd-wrap" style={{ maxWidth: 980, margin: "0 auto", padding: "56px 48px" }}>
            <div className="gd-cta-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: TEXT, marginBottom: 6 }}>Ready to work together?</div>
                <div style={{ fontSize: 13.5, color: MUTED }}>Discuss a project, retainer, or anything in between.</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <DownloadButton />
                <a href="mailto:wesley@grodigital.co.za" className="gd-cta-lg">
                  Get in touch
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </section>

        <SiteFooter />

      </div>
    </>
  );
}
