import { useState, useEffect } from "react";

const LOGO_URL =
  "https://pub-7689bb2e0fe5474fb166518d32366c41.r2.dev/media/1773510512118-7qummfmnmo2.jpeg";

// Brand blue extracted from the logo
const BLUE = "#3A9BD5";

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
        "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap";
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
      if (res.ok) {
        const data = await res.json() as { success: boolean; role?: string };
        if (data.role === 'client') { window.location.href = "/portal"; return; }
        window.location.href = "/"; return;
      }

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

        .gl-page {
          font-family: 'Nunito', system-ui, sans-serif;
          min-height: 100vh;
          background: #EDF2F7;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
        }

        /* Card */
        .gl-card {
          width: 100%;
          max-width: 420px;
          background: #fff;
          border-radius: 16px;
          box-shadow:
            0 1px 3px rgba(0,0,0,0.06),
            0 8px 32px rgba(0,0,0,0.08),
            0 24px 64px rgba(58,155,213,0.07);
          padding: 44px 40px 40px;
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 0.38s ease, transform 0.38s ease;
        }

        @media (max-width: 480px) {
          .gl-card { padding: 36px 28px 32px; }
        }

        .gl-card.ready {
          opacity: 1;
          transform: translateY(0);
        }

        /* Logo */
        .gl-logo-wrap {
          margin-bottom: 32px;
        }

        .gl-logo {
          height: 44px;
          width: auto;
          display: block;
        }

        /* Divider line */
        .gl-divider {
          height: 1px;
          background: #EDF2F7;
          margin-bottom: 28px;
        }

        /* Heading */
        .gl-heading {
          font-size: 22px;
          font-weight: 800;
          color: #1A202C;
          margin-bottom: 4px;
          letter-spacing: -0.01em;
        }

        .gl-sub {
          font-size: 14px;
          color: #718096;
          margin-bottom: 28px;
          font-weight: 500;
        }

        /* Field */
        .gl-label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #4A5568;
          margin-bottom: 6px;
          letter-spacing: 0.01em;
        }

        .gl-input {
          display: block;
          width: 100%;
          padding: 11px 14px;
          background: #F7FAFC;
          border: 1.5px solid #E2E8F0;
          border-radius: 8px;
          font-family: 'Nunito', system-ui, sans-serif;
          font-size: 15px;
          font-weight: 500;
          color: #1A202C;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
          -webkit-appearance: none;
          margin-bottom: 18px;
        }

        .gl-input::placeholder {
          color: #CBD5E0;
          font-weight: 400;
        }

        .gl-input:focus {
          border-color: ${BLUE};
          background: #fff;
          box-shadow: 0 0 0 3px rgba(58,155,213,0.15);
        }

        .gl-input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px #F7FAFC inset;
          -webkit-text-fill-color: #1A202C;
        }

        /* Error */
        .gl-error {
          padding: 10px 14px;
          background: #FFF5F5;
          border: 1.5px solid #FED7D7;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #C53030;
          margin-bottom: 16px;
          line-height: 1.5;
        }

        /* Button */
        .gl-btn {
          width: 100%;
          padding: 13px 24px;
          background: ${BLUE};
          color: #fff;
          border: none;
          border-radius: 8px;
          font-family: 'Nunito', system-ui, sans-serif;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
          margin-top: 4px;
        }

        .gl-btn:hover:not(:disabled) {
          background: #2a8bc5;
          box-shadow: 0 4px 16px rgba(58,155,213,0.35);
        }

        .gl-btn:active:not(:disabled) {
          transform: scale(0.99);
        }

        .gl-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Footer */
        .gl-footer {
          margin-top: 24px;
          font-size: 13px;
          color: #A0AEC0;
          text-align: center;
          font-weight: 500;
          line-height: 1.6;
        }

        .gl-footer a {
          color: ${BLUE};
          text-decoration: none;
          font-weight: 700;
        }

        .gl-footer a:hover {
          text-decoration: underline;
        }
      `}</style>

      <div className="gl-page">
        <div className={`gl-card${ready ? " ready" : ""}`}>

          <div className="gl-logo-wrap">
            <img
              src={LOGO_URL}
              alt="GRO digital"
              className="gl-logo"
            />
          </div>

          <div className="gl-divider" />

          <p className="gl-heading">Welcome back</p>
          <p className="gl-sub">Sign in to your client portal</p>

          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="gl-email" className="gl-label">Email address</label>
            <input
              id="gl-email"
              className="gl-input"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
            />

            <label htmlFor="gl-password" className="gl-label">Password</label>
            <input
              id="gl-password"
              className="gl-input"
              type="password"
              placeholder="••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            {error && <div className="gl-error">{error}</div>}

            <button type="submit" className="gl-btn" disabled={loading}>
              {loading ? "Signing in…" : "Sign in →"}
            </button>
          </form>

          <p className="gl-footer">
            Need access?{" "}
            <a href="mailto:hello@grodigital.co.za">Contact GRO Digital</a>
          </p>
        </div>
      </div>
    </>
  );
}
