import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";

let logoDataUrl = "";
let logoLightDataUrl = "";
try {
  const buf = fs.readFileSync(path.join(process.cwd(), "client/public/gro-digital-logo.jpg"));
  logoDataUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
} catch {
  // logo unavailable — text fallback used in template
}
try {
  const buf = fs.readFileSync(path.join(process.cwd(), "client/public/gro-digital-logo-light.png"));
  logoLightDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
} catch {
  // light logo unavailable
}

const BLUE = "#2286C2";
const DARK = "#080D16";
const TEXT = "#111827";
const MUTED = "#6B7280";
const FAINT = "#9CA3AF";
const BORDER = "#E5E7EB";

const services = [
  { index: "01", name: "Product Strategy & Advisory", desc: "Strategic roadmapping, innovation sessions, Exco-level presentations, stakeholder workshops, product vision", hourly: "1,800", daily: "14,400" },
  { index: "02", name: "Product & UX Audit", desc: "Deep-dive product audits, UX and conversion analysis, competitive benchmarking, bottleneck identification, findings reports", hourly: "1,800", daily: "14,400" },
  { index: "03", name: "Platform & Web Development", desc: "Full-stack development, platform builds, API integrations, codebase analysis, deployment, QA", hourly: "1,500", daily: "12,000" },
  { index: "04", name: "Discovery & Scoping", desc: "Requirements gathering, technical scoping, product definition, stakeholder alignment sessions", hourly: "1,800", daily: "14,400" },
  { index: "05", name: "Project & Delivery Management", desc: "Sprint management, QA oversight, progress reporting, stakeholder coordination", hourly: "1,200", daily: "9,600" },
  { index: "06", name: "Hosting & Infrastructure", desc: "Server management, uptime monitoring, deployment pipelines, domain administration — per platform managed", monthly: "6,000" },
] as Array<{ index: string; name: string; desc: string; hourly?: string; daily?: string; monthly?: string }>;

const tiers = [
  {
    name: "Studio",
    price: "R200,000",
    period: "/month",
    tagline: "Build the right thing, fast.",
    recommended: false,
  },
  {
    name: "Growth",
    price: "R300,000",
    period: "/month",
    tagline: "Build it. Then take it to market.",
    recommended: true,
  },
  {
    name: "Scale",
    price: "Custom",
    period: "",
    tagline: "Full transformation capability.",
    recommended: false,
  },
];

const rowGroups = [
  {
    label: "Build",
    rows: [
      { name: "Days per month", desc: "Committed capacity allocated each month", vals: ["16", "22", "30+"] },
      { name: "Product strategy & roadmapping", desc: "Roadmaps, workshops, vision alignment", vals: [true, true, true] },
      { name: "Platform & web development", desc: "Full-stack builds, APIs, deployment", vals: [true, true, true] },
      { name: "Product & UX audits", desc: "Deep-dive reviews & findings reports", vals: [true, true, true] },
      { name: "Progress reporting", desc: "Monthly delivery summaries", vals: [true, true, true] },
    ],
  },
  {
    label: "Grow",
    rows: [
      { name: "Go-to-market strategy", desc: "Positioning, channels, messaging, launch plan", vals: [false, true, true] },
      { name: "Outreach & meeting generation", desc: "We get in the room — direct outreach for adoption", vals: [false, true, true] },
      { name: "Launch planning & execution", desc: "End-to-end launch ownership from brief to live", vals: [false, true, true] },
      { name: "WhatsApp integration", desc: "Full build-out: business logic, automated workflows, BSP relationship management — scoped separately", vals: [false, "Scoped", "Scoped"] },
    ],
  },
  {
    label: "Scale",
    rows: [
      { name: "Parallel product tracks", desc: "Multiple builds running simultaneously", vals: [false, false, true] },
      { name: "Additional specialist capacity", desc: "External experts brought in as scope demands", vals: [false, false, true] },
    ],
  },
];

const steps = [
  { step: "01", title: "Get stuck in", body: "We don't wait for a polished brief. We meet the team, the stakeholders, the people closest to the problem — and we start learning fast." },
  { step: "02", title: "Map the problems", body: "We identify where things break, slow down, or bleed revenue. Bottlenecks, gaps, missed opportunities — all surfaced before we write a line of code." },
  { step: "03", title: "Audit & diagnose", body: "We dig into what exists — the codebase, the UX, the ops. We build a clear, honest picture of the current state before proposing anything." },
  { step: "04", title: "Propose a plan", body: "Clear, opinionated, prioritised. Not a 40-slide deck — a direct path forward with a rationale behind every decision." },
  { step: "05", title: "Build & iterate fast", body: "Implementation begins immediately. Working software in days, not months. We ship, get feedback, and improve — continuously, without stopping." },
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

function cell(val: boolean | string, isRec: boolean): string {
  const bg = isRec ? "#FAFEFF" : "#fff";
  if (typeof val === "string") {
    return `<td style="padding:10px 14px;border-right:1px solid ${BORDER};border-bottom:1px solid #F3F4F6;background:${bg};text-align:center;vertical-align:middle;">
      <span style="font-size:13px;font-weight:800;letter-spacing:-0.03em;color:${TEXT};">${val}</span>
    </td>`;
  }
  if (val) {
    return `<td style="padding:10px 14px;border-right:1px solid ${BORDER};border-bottom:1px solid #F3F4F6;background:${bg};text-align:center;vertical-align:middle;">
      <span style="color:${BLUE};font-size:14px;font-weight:700;">✓</span>
    </td>`;
  }
  return `<td style="padding:10px 14px;border-right:1px solid ${BORDER};border-bottom:1px solid #F3F4F6;background:${bg};text-align:center;vertical-align:middle;">
    <span style="color:#D1D5DB;font-size:14px;">—</span>
  </td>`;
}

function buildRateCardHtml(): string {
  const logoHtml = logoLightDataUrl
    ? `<img src="${logoLightDataUrl}" alt="Gro Digital" style="height:32px;display:block;" />`
    : logoDataUrl
    ? `<div style="background:#fff;border-radius:6px;padding:5px 10px;display:inline-block;"><img src="${logoDataUrl}" alt="Gro Digital" style="height:24px;display:block;" /></div>`
    : `<span style="font-size:15px;font-weight:800;color:${BLUE};letter-spacing:-0.02em;">Gro Digital</span>`;

  const serviceRows = services.map((s, i) => {
    const isLeft = i % 2 === 0;
    const isLastRow = i >= services.length - 2;
    return `<div style="padding:14px ${isLeft ? "18px 14px 0" : "0 14px 14px 18px"};${isLastRow ? "" : `border-bottom:1px solid ${BORDER};`}">
      <div style="font-size:9px;color:${FAINT};margin-bottom:3px;">${s.index}</div>
      <div style="font-size:11.5px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;margin-bottom:4px;">${s.name}</div>
      <div style="font-size:9.5px;color:${MUTED};line-height:1.55;">${s.desc}</div>
    </div>`;
  });

  const tierHeaders = tiers.map((t, i) => {
    const isLast = i === tiers.length - 1;
    const bg = t.recommended ? "#FAFEFF" : "#fff";
    const topBorder = `border-top:3px solid ${t.recommended ? BLUE : "transparent"};`;
    return `<th style="padding:16px 14px;border-bottom:1px solid ${BORDER};${!isLast ? `border-right:1px solid ${BORDER};` : ""}${topBorder}background:${bg};text-align:left;vertical-align:top;width:19%;">
      ${t.recommended ? `<div style="display:inline-block;background:${BLUE};color:#fff;font-size:7px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:2px 8px;border-radius:99px;margin-bottom:8px;">Recommended</div>` : `<div style="height:16px;margin-bottom:8px;"></div>`}
      <div style="font-size:11px;font-weight:700;color:${TEXT};margin-bottom:5px;">${t.name}</div>
      <div style="font-size:${t.price === "Custom" ? "16" : "20"}px;font-weight:800;letter-spacing:-0.04em;color:${t.recommended ? BLUE : TEXT};line-height:1;margin-bottom:4px;">${t.price}${t.period ? `<span style="font-size:10px;font-weight:500;color:${FAINT};">${t.period}</span>` : ""}</div>
      <div style="font-size:9px;color:${MUTED};line-height:1.45;">${t.tagline}</div>
    </th>`;
  }).join("");

  const tableRows = rowGroups.map(g => {
    const groupRow = `<tr>
      <td colspan="4" style="padding:6px 16px;background:#F9FAFB;border-top:1px solid ${BORDER};border-bottom:1px solid ${BORDER};">
        <span style="font-size:8px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BLUE};">${g.label}</span>
      </td>
    </tr>`;

    const dataRows = g.rows.map(r => {
      const [v0, v1, v2] = r.vals;
      return `<tr>
        <td style="padding:10px 16px;border-right:1px solid ${BORDER};border-bottom:1px solid #F3F4F6;background:#fff;vertical-align:top;">
          <div style="font-size:10.5px;font-weight:600;color:${TEXT};margin-bottom:2px;">${r.name}</div>
          <div style="font-size:8.5px;color:${FAINT};line-height:1.4;">${r.desc}</div>
        </td>
        ${cell(v0, false)}
        ${cell(v1, true)}
        ${cell(v2, false)}
      </tr>`;
    }).join("");

    return groupRow + dataRows;
  }).join("");

  const processHtml = steps.map(s => `
    <tr>
      <td style="padding:12px 16px 12px 0;border-bottom:1px solid ${BORDER};vertical-align:top;width:32px;">
        <div style="width:26px;height:26px;border-radius:50%;background:${s.step === "01" ? BLUE : "#F3F4F6"};display:flex;align-items:center;justify-content:center;text-align:center;line-height:26px;">
          <span style="font-size:9px;font-weight:700;color:${s.step === "01" ? "#fff" : FAINT};">${s.step}</span>
        </div>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid ${BORDER};vertical-align:top;">
        <div style="font-size:12px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;margin-bottom:4px;">${s.title}</div>
        <div style="font-size:10px;color:${MUTED};line-height:1.6;">${s.body}</div>
      </td>
    </tr>
  `).join("");

  const pageFooter = (page: number, total: number, note = "") => `
    <div style="padding:10px 48px;border-top:1px solid ${BORDER};display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:8.5px;color:${FAINT};">Gro Digital · Rate Card 2026</span>
      <span style="font-size:8.5px;color:${FAINT};">Page ${page} of ${total}</span>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { width: 210mm; position: relative; page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    @page { size: A4; margin: 0; }
  </style>
</head>
<body>

<!-- ═══════════════════════════════════════ COVER ══ -->
<div class="page" style="height:299mm;margin:-1mm;width:calc(210mm + 2mm);background:${DARK};display:flex;flex-direction:column;overflow:hidden;">

  <!-- Nav -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding:24px 48px;border-bottom:1px solid rgba(255,255,255,0.07);">
    ${logoHtml}
    <span style="font-size:11px;color:rgba(255,255,255,0.75);letter-spacing:0.01em;">grodigital.co.za</span>
  </div>

  <!-- Body -->
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:48px 56px;">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BLUE};margin-bottom:20px;">Effective 2026</div>
    <h1 style="font-size:80px;font-weight:800;letter-spacing:-0.05em;line-height:0.92;color:#fff;margin-bottom:28px;">Rate<br/>Card</h1>
    <div style="width:40px;height:3px;background:${BLUE};border-radius:2px;margin-bottom:24px;"></div>
    <p style="font-size:15px;color:rgba(255,255,255,0.65);line-height:1.75;max-width:320px;">
      Senior product strategy, engineering<br/>and innovation. Priced by time.<br/>Delivered with intent.
    </p>
  </div>

  <!-- Footer -->
  <div style="padding:22px 48px;border-top:1px solid rgba(255,255,255,0.07);display:flex;justify-content:space-between;align-items:flex-end;">
    <div style="font-size:10px;color:rgba(255,255,255,0.7);line-height:1.9;">
      Darter Studios<br/>
      Longkloof, 7 Darter Rd<br/>
      Gardens, Cape Town, 8001
    </div>
    <div style="font-size:10px;color:rgba(255,255,255,0.65);text-align:right;line-height:1.9;">
      Gro Digital (Pty) Ltd<br/>
      Reg. 2020/064443/07<br/>
      grodigital.co.za
    </div>
  </div>

</div>

<!-- ══════════════════════════ SERVICES + HOW WE WORK ══ -->
<div class="page" style="min-height:297mm;background:#fff;display:flex;flex-direction:column;">
  <div style="height:4px;background:${BLUE};"></div>
  <div style="flex:1;padding:36px 48px 24px;">

    <!-- Services & rates -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <span style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};">Services & rates</span>
      <div style="flex:1;height:1px;background:${BORDER};"></div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${FAINT};padding:0 0 10px;border-bottom:1px solid ${BORDER};text-align:left;" colspan="2">Service</th>
          <th style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${FAINT};padding:0 0 10px;border-bottom:1px solid ${BORDER};text-align:right;width:90px;">Per Hour</th>
          <th style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${FAINT};padding:0 0 10px;border-bottom:1px solid ${BORDER};text-align:right;width:100px;">Per Day</th>
        </tr>
      </thead>
      <tbody>
        ${services.filter(s => s.hourly).map(s => `<tr>
          <td style="padding:12px 8px 12px 0;border-bottom:1px solid #F3F4F6;vertical-align:top;width:24px;">
            <span style="font-size:8.5px;color:${FAINT};">${s.index}</span>
          </td>
          <td style="padding:12px 16px 12px 0;border-bottom:1px solid #F3F4F6;vertical-align:top;">
            <div style="font-size:11.5px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;margin-bottom:3px;">${s.name}</div>
            <div style="font-size:9px;color:${MUTED};line-height:1.55;">${s.desc}</div>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #F3F4F6;text-align:right;vertical-align:top;white-space:nowrap;">
            <span style="font-size:12px;font-weight:700;color:${TEXT};">R${s.hourly}</span><span style="font-size:8px;color:${FAINT};">/hr</span>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #F3F4F6;text-align:right;vertical-align:top;white-space:nowrap;">
            <span style="font-size:12px;font-weight:700;color:${BLUE};">R${s.daily}</span><span style="font-size:8px;color:${FAINT};">/day</span>
          </td>
        </tr>`).join("")}
      </tbody>
    </table>
    <p style="font-size:8px;color:${FAINT};margin-top:8px;margin-bottom:32px;">A day rate assumes 8 hours. Retainer clients receive 25–30% off these rates.</p>

    <!-- How we work -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
      <span style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};">How we work</span>
      <div style="flex:1;height:1px;background:${BORDER};"></div>
    </div>
    <h2 style="font-size:20px;font-weight:800;letter-spacing:-0.03em;color:${TEXT};margin-bottom:5px;line-height:1.1;">Fast by design. Not by accident.</h2>
    <p style="font-size:11px;color:${MUTED};margin-bottom:20px;line-height:1.6;">Most agencies spend months in discovery. We start building useful things in days.</p>
    <table style="width:100%;border-collapse:collapse;">
      <tbody>${processHtml}</tbody>
    </table>

  </div>
  ${pageFooter(2, 4)}
</div>

<!-- ═══════════════════════════════════ PACKAGES ══ -->
<div class="page" style="min-height:297mm;background:#F9FAFB;display:flex;flex-direction:column;">
  <div style="height:4px;background:${BLUE};"></div>
  <div style="flex:1;padding:32px 48px 20px;">

    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
      <span style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};">Monthly Retainer</span>
      <div style="flex:1;height:1px;background:${BORDER};"></div>
    </div>
    <h2 style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:${TEXT};margin-bottom:20px;line-height:1.1;">Embedded. Committed. Compounding.</h2>

    <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;background:#fff;">
      <thead>
        <tr>
          <th style="padding:16px;border-bottom:1px solid ${BORDER};border-right:1px solid ${BORDER};background:#F9FAFB;text-align:left;vertical-align:bottom;width:42%;">
            <span style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${FAINT};">Package</span>
          </th>
          ${tierHeaders}
        </tr>
      </thead>
      <tbody>
        ${tableRows}
        <tr>
          <td style="padding:14px 16px;border-right:1px solid ${BORDER};background:#F9FAFB;"></td>
          ${tiers.map((t, i) => {
            const isLast = i === tiers.length - 1;
            const bg = t.recommended ? "#FAFEFF" : "#F9FAFB";
            return `<td style="padding:14px;${!isLast ? `border-right:1px solid ${BORDER};` : ""}background:${bg};text-align:center;">
              <div style="display:inline-block;padding:7px 14px;border-radius:6px;font-size:10px;font-weight:600;background:${t.recommended ? BLUE : "transparent"};color:${t.recommended ? "#fff" : BLUE};border:1.5px solid ${t.recommended ? BLUE : BORDER};letter-spacing:-0.01em;">
                ${t.name === "Scale" ? "Get a quote" : "Get started"}
              </div>
            </td>`;
          }).join("")}
        </tr>
      </tbody>
    </table>

    <p style="font-size:8.5px;color:${FAINT};margin-top:10px;">All retainers invoiced monthly in advance. One month's written notice to scale up, down, or pause.</p>

  </div>
  ${pageFooter(3, 4)}
</div>

<!-- ══════════════════════════ QUALIFIERS · FAQ · CONTACT ══ -->
<div class="page" style="min-height:297mm;background:#fff;display:flex;flex-direction:column;">
  <div style="height:4px;background:${BLUE};"></div>
  <div style="flex:1;padding:36px 48px 24px;">

    <!-- Right for us if -->
    <div style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};">Right for us if</span>
        <div style="flex:1;height:1px;background:${BORDER};"></div>
      </div>
      <p style="font-size:11px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;margin-bottom:10px;">We do our best work with clients who:</p>
      ${qualifiers.map(q => `<div style="display:flex;align-items:flex-start;gap:12px;padding:7px 0;border-bottom:1px solid ${BORDER};">
        <div style="width:15px;height:15px;border-radius:50%;background:${BLUE}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;text-align:center;line-height:15px;">
          <span style="font-size:9px;color:${BLUE};font-weight:700;">✓</span>
        </div>
        <span style="font-size:10px;color:${TEXT};line-height:1.6;">${q}</span>
      </div>`).join("")}
    </div>

    <!-- FAQ -->
    <div style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};">FAQ</span>
        <div style="flex:1;height:1px;background:${BORDER};"></div>
      </div>
      ${faqs.map(f => `<div style="padding:9px 0;border-bottom:1px solid ${BORDER};page-break-inside:avoid;">
        <div style="font-size:11px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;margin-bottom:4px;">${f.q}</div>
        <div style="font-size:9.5px;color:${MUTED};line-height:1.65;">${f.a}</div>
      </div>`).join("")}
    </div>

    <!-- Contact -->
    <div style="page-break-inside:avoid;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};">Get in touch</span>
        <div style="flex:1;height:1px;background:${BORDER};"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;background:#F9FAFB;">
        <div style="padding:18px 20px;border-right:1px solid ${BORDER};">
          <div style="font-size:8px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${FAINT};margin-bottom:8px;">Email</div>
          <div style="font-size:11px;color:${BLUE};font-weight:500;">wesley@grodigital.co.za</div>
        </div>
        <div style="padding:18px 20px;border-right:1px solid ${BORDER};">
          <div style="font-size:8px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${FAINT};margin-bottom:8px;">Website</div>
          <div style="font-size:11px;color:${TEXT};font-weight:500;">grodigital.co.za</div>
        </div>
        <div style="padding:18px 20px;">
          <div style="font-size:8px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${FAINT};margin-bottom:8px;">Address</div>
          <div style="font-size:10.5px;color:${TEXT};line-height:1.7;">Darter Studios, Longkloof<br/>7 Darter Rd, Gardens<br/>Cape Town, 8001</div>
        </div>
      </div>
    </div>

  </div>
  ${pageFooter(4, 4)}
</div>

</body>
</html>`;
}

export function registerPdfRoutes(app: Express) {
  app.get("/api/rates/pdf", async (req, res) => {
    try {
      const apiKey = process.env.PDFSHIFT_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: "PDF service not configured" });
        return;
      }

      const html = buildRateCardHtml();

      const pdfRes = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
        method: "POST",
        headers: {
          "Authorization": "Basic " + Buffer.from(`api:${apiKey}`).toString("base64"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: html,
          format: "A4",
          margin: "0",
          use_print: false,
          sandbox: false,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!pdfRes.ok) {
        const text = await pdfRes.text();
        console.error("[pdf-routes] PDFShift error:", text);
        res.status(500).json({ error: "Failed to generate PDF" });
        return;
      }

      const buf = Buffer.from(await pdfRes.arrayBuffer());
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="GRO-Digital-Rate-Card-2026.pdf"');
      res.send(buf);
    } catch (err) {
      console.error("[pdf-routes] Error:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });
}
