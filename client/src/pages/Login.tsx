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
        "https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&display=swap";
      document.head.appendChild(link);
    }
    const t = setTimeout(() => setReady(true), 50);
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

        .gro-login {
          font-family: 'Syne', system-ui, sans-serif;
          min-height: 100vh;
          display: flex;
          align-items: stretch;
          background: #f4f6f9;
        }

        /* ── left brand panel ── */
        .gro-left {
          display: none;
          width: 44%;
          flex-shrink: 0;
          background: #0077c2;
          position: relative;
          padding: 56px 60px;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
        }

        @media (min-width: 860px) {
          .gro-left { display: flex; }
        }

        /* subtle dot pattern on blue panel */
        .gro-left::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px);
          background-size: 28px 28px;
          pointer-events: none;
        }

        /* bottom-right circle accent */
        .gro-left::after {
          content: '';
          position: absolute;
          bottom: -140px;
          right: -140px;
          width: 420px;
          height: 420px;
          border-radius: 50%;
          background: rgba(0,0,0,0.12);
          pointer-events: none;
        }

        .gro-wordmark {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #fff;
          position: relative;
          z-index: 2;
        }

        .gro-wordmark span {
          color: rgba(255,255,255,0.5);
        }

        .gro-hero {
          position: relative;
          z-index: 2;
        }

        .gro-hero-eyebrow {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.65);
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .gro-hero-eyebrow::before {
          content: '';
          display: block;
          width: 20px;
          height: 2px;
          background: rgba(255,255,255,0.65);
          flex-shrink: 0;
        }

        .gro-hero-title {
          font-size: 44px;
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.02em;
          color: #fff;
          margin-bottom: 20px;
        }

        .gro-hero-title em {
          font-style: normal;
          color: rgba(255,255,255,0.6);
        }

        .gro-hero-sub {
          font-size: 14px;
          font-weight: 400;
          line-height: 1.7;
          color: rgba(255,255,255,0.6);
          max-width: 280px;
        }

        .gro-footer-text {
          font-size: 11px;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.08em;
          position: relative;
          z-index: 2;
        }

        /* ── right form panel ── */
        .gro-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 32px;
          background: #fff;
        }

        .gro-form-box {
          width: 100%;
          max-width: 400px;
          opacity: 0;
          transform: translateY(14px);
          transition: opacity 0.4s ease, transform 0.4s ease;
        }

        .gro-form-box.visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* mobile wordmark */
        .gro-mobile-mark {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #040810;
          margin-bottom: 40px;
          display: block;
        }
        .gro-mobile-mark span { color: #0077c2; }

        @media (min-width: 860px) {
          .gro-mobile-mark { display: none; }
        }

        .gro-heading {
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #0a0d14;
          margin-bottom: 6px;
        }

        .gro-subheading {
          font-size: 14px;
          color: #8a9099;
          margin-bottom: 36px;
          line-height: 1.5;
        }

        .gro-field-wrap {
          margin-bottom: 18px;
        }

        .gro-label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #9aa0aa;
          margin-bottom: 7px;
        }

        .gro-input {
          width: 100%;
          padding: 12px 14px;
          background: #f7f8fa;
          border: 1.5px solid #e4e7ec;
          border-radius: 6px;
          font-family: 'Syne', system-ui, sans-serif;
          font-size: 15px;
          color: #0a0d14;
          outline: none;
          transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
          -webkit-appearance: none;
        }

        .gro-input::placeholder {
          color: #c2c8d0;
        }

        .gro-input:focus {
          border-color: #0077c2;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(0,119,194,0.1);
        }

        .gro-error {
          padding: 11px 14px;
          background: #fef2f2;
          border: 1.5px solid #fecaca;
          border-radius: 6px;
          font-size: 13px;
          color: #b91c1c;
          margin-bottom: 18px;
          line-height: 1.5;
        }

        .gro-btn {
          width: 100%;
          padding: 13px 24px;
          background: #0077c2;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-family: 'Syne', system-ui, sans-serif;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.05em;
          cursor: pointer;
          margin-top: 6px;
          transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
        }

        .gro-btn:hover:not(:disabled) {
          background: #006aad;
          box-shadow: 0 4px 16px rgba(0,119,194,0.28);
        }

        .gro-btn:active:not(:disabled) {
          transform: scale(0.99);
        }

        .gro-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .gro-contact {
          margin-top: 28px;
          font-size: 12px;
          color: #adb4be;
          text-align: center;
          line-height: 1.6;
        }

        .gro-contact a {
          color: #0077c2;
          text-decoration: none;
        }

        .gro-contact a:hover {
          text-decoration: underline;
        }
      `}</style>

      <div className="gro-login">
        {/* ── Left brand panel ── */}
        <div className="gro-left">
          <div className="gro-wordmark">
            GRO<span>*</span>DIGITAL
          </div>

          <div className="gro-hero">
            <p className="gro-hero-eyebrow">Client Portal</p>
            <h2 className="gro-hero-title">
              Your brand,<br />
              <em>amplified.</em>
            </h2>
            <p className="gro-hero-sub">
              Track campaigns, review creative assets, and stay across everything — all in one place.
            </p>
          </div>

          <p className="gro-footer-text">© {new Date().getFullYear()} GRO Digital</p>
        </div>

        {/* ── Right form panel ── */}
        <div className="gro-right">
          <div className={`gro-form-box${ready ? " visible" : ""}`}>
            <span className="gro-mobile-mark">GRO<span>*</span>DIGITAL</span>

            <h1 className="gro-heading">Sign in</h1>
            <p className="gro-subheading">Access your client portal.</p>

            <form onSubmit={handleSubmit} noValidate>
              <div className="gro-field-wrap">
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
              </div>

              <div className="gro-field-wrap">
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
              </div>

              {error && <div className="gro-error">{error}</div>}

              <button type="submit" className="gro-btn" disabled={loading}>
                {loading ? "Signing in…" : "Sign in →"}
              </button>
            </form>

            <p className="gro-contact">
              Need access?{" "}
              <a href="mailto:hello@grodigital.co.za">Contact GRO Digital</a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
