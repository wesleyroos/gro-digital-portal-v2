import { useState, useEffect } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = "gro-login-font";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap";
      document.head.appendChild(link);
    }
    const t = setTimeout(() => setReady(true), 40);
    return () => clearTimeout(t);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/client-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (res.ok) { window.location.href = "/portal"; return; }

      const adminRes = await fetch("/api/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (adminRes.ok) { window.location.href = "/"; return; }

      setError("Invalid email or password.");
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .gro-page {
          font-family: 'Outfit', system-ui, sans-serif;
          min-height: 100vh;
          background: #f5f7fa;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        /* Subtle dot grid — mirrors their dark site's grid texture */
        .gro-page::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: radial-gradient(circle, #d0d8e4 1px, transparent 1px);
          background-size: 32px 32px;
          opacity: 0.55;
          pointer-events: none;
        }

        /* Blue glow accent — top-left, echoing their hero */
        .gro-page::after {
          content: '';
          position: fixed;
          top: -200px;
          left: -200px;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0,119,194,0.1) 0%, transparent 65%);
          pointer-events: none;
        }

        /* ── Top nav bar ── */
        .gro-nav {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          padding: 28px 48px;
        }

        @media (max-width: 600px) {
          .gro-nav { padding: 24px 24px; }
        }

        .gro-logo {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.01em;
          color: #0d1117;
          text-decoration: none;
          line-height: 1;
        }

        .gro-logo-accent {
          color: #0077c2;
        }

        /* ── Main centered content ── */
        .gro-main {
          position: relative;
          z-index: 10;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 24px 64px;
        }

        .gro-card {
          width: 100%;
          max-width: 460px;
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 0.4s ease, transform 0.4s ease;
        }

        .gro-card.ready {
          opacity: 1;
          transform: translateY(0);
        }

        /* Eyebrow */
        .gro-eyebrow {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #0077c2;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .gro-eyebrow::before {
          content: '';
          display: block;
          width: 20px;
          height: 2px;
          background: #0077c2;
          flex-shrink: 0;
        }

        /* Heading — mirrors the big bold hero type from their site */
        .gro-title {
          font-size: clamp(40px, 6vw, 56px);
          font-weight: 900;
          letter-spacing: -0.03em;
          line-height: 1.0;
          color: #0d1117;
          margin-bottom: 12px;
        }

        .gro-title-accent {
          color: #0077c2;
        }

        .gro-subtitle {
          font-size: 15px;
          font-weight: 400;
          color: #6b7685;
          line-height: 1.6;
          margin-bottom: 40px;
          max-width: 340px;
        }

        /* Form */
        .gro-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #8a95a3;
          margin-bottom: 7px;
        }

        .gro-input {
          display: block;
          width: 100%;
          padding: 13px 16px;
          background: #ffffff;
          border: 1.5px solid #dde3ec;
          border-radius: 8px;
          font-family: 'Outfit', system-ui, sans-serif;
          font-size: 15px;
          font-weight: 400;
          color: #0d1117;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          -webkit-appearance: none;
          margin-bottom: 18px;
        }

        .gro-input::placeholder {
          color: #b8c0cc;
        }

        .gro-input:focus {
          border-color: #0077c2;
          box-shadow: 0 0 0 3px rgba(0, 119, 194, 0.12);
        }

        /* autocomplete dark bg override */
        .gro-input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px #fff inset;
          -webkit-text-fill-color: #0d1117;
        }

        .gro-error {
          padding: 11px 14px;
          background: #fff1f1;
          border: 1.5px solid #fca5a5;
          border-radius: 8px;
          font-size: 13px;
          color: #b91c1c;
          margin-bottom: 16px;
          line-height: 1.5;
        }

        .gro-btn {
          width: 100%;
          padding: 14px 28px;
          background: #0077c2;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-family: 'Outfit', system-ui, sans-serif;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .gro-btn:hover:not(:disabled) {
          background: #006aad;
          box-shadow: 0 6px 20px rgba(0, 119, 194, 0.3);
        }

        .gro-btn:active:not(:disabled) {
          transform: scale(0.99);
        }

        .gro-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .gro-btn-arrow {
          font-size: 18px;
          line-height: 1;
          transition: transform 0.15s;
        }

        .gro-btn:hover:not(:disabled) .gro-btn-arrow {
          transform: translateX(3px);
        }

        .gro-help {
          margin-top: 24px;
          font-size: 13px;
          color: #9aa3b0;
          text-align: center;
        }

        .gro-help a {
          color: #0077c2;
          text-decoration: none;
          font-weight: 500;
        }

        .gro-help a:hover {
          text-decoration: underline;
        }

        /* ── Decorative rotating ring (mirrors their site's bottom-right element) ── */
        .gro-ring {
          position: fixed;
          bottom: -80px;
          right: -80px;
          width: 280px;
          height: 280px;
          pointer-events: none;
          opacity: 0.18;
          animation: gro-spin 30s linear infinite;
        }

        @keyframes gro-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="gro-page">
        {/* Nav */}
        <nav className="gro-nav">
          <span className="gro-logo">
            Gro<span className="gro-logo-accent">Digital</span>
          </span>
        </nav>

        {/* Main */}
        <main className="gro-main">
          <div className={`gro-card${ready ? " ready" : ""}`}>
            <p className="gro-eyebrow">Client Portal</p>

            <h1 className="gro-title">
              Sign<br />
              <span className="gro-title-accent">in.</span>
            </h1>

            <p className="gro-subtitle">
              Access your campaigns, creative assets, and performance data.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <label htmlFor="gro-email" className="gro-label">Email address</label>
              <input
                id="gro-email"
                className="gro-input"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />

              <label htmlFor="gro-password" className="gro-label">Password</label>
              <input
                id="gro-password"
                className="gro-input"
                type="password"
                placeholder="••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />

              {error && <div className="gro-error">{error}</div>}

              <button type="submit" className="gro-btn" disabled={loading}>
                {loading ? "Signing in…" : <>Sign in <span className="gro-btn-arrow">→</span></>}
              </button>
            </form>

            <p className="gro-help">
              Need access?{" "}
              <a href="mailto:hello@grodigital.co.za">Contact GRO Digital</a>
            </p>
          </div>
        </main>

        {/* Decorative ring — mirrors the circular "DIGITAL STUDIO" on their site */}
        <svg className="gro-ring" viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="140" cy="140" r="120" stroke="#0077c2" strokeWidth="1" strokeDasharray="4 8" />
          <circle cx="140" cy="140" r="96" stroke="#0077c2" strokeWidth="1" strokeDasharray="2 6" />
          <text fill="#0077c2" fontSize="11" fontFamily="Outfit,sans-serif" fontWeight="600" letterSpacing="6">
            <textPath href="#ring-path">
              GRO DIGITAL · CLIENT PORTAL · GRO DIGITAL · CLIENT PORTAL ·
            </textPath>
          </text>
          <path id="ring-path" d="M140,20 a120,120 0 1,1 -0.1,0" fill="none" />
        </svg>
      </div>
    </>
  );
}
