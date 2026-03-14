import { useState, useEffect } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = "gro-login-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Instrument+Sans:wght@400;500;600&display=swap";
      document.head.appendChild(link);
    }
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // Try client login first
      const res = await fetch("/api/auth/client-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (res.ok) {
        window.location.href = "/portal";
        return;
      }

      // Fall back to admin password login
      const adminRes = await fetch("/api/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (adminRes.ok) {
        window.location.href = "/";
        return;
      }

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
        .login-page * { box-sizing: border-box; }

        .login-font-display {
          font-family: 'Cormorant Garamond', Georgia, serif;
        }
        .login-font-ui {
          font-family: 'Instrument Sans', system-ui, sans-serif;
        }

        /* ── dot grid overlay ──────────────────────────── */
        .login-dot-grid::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px);
          background-size: 26px 26px;
          pointer-events: none;
        }

        /* ── form inputs ───────────────────────────────── */
        .login-field {
          width: 100%;
          padding: 11px 0 11px 0;
          border: none;
          border-bottom: 1.5px solid #D8D2CA;
          background: transparent;
          font-family: 'Instrument Sans', system-ui, sans-serif;
          font-size: 15px;
          color: #1C1916;
          outline: none;
          transition: border-color 0.18s ease;
          -webkit-appearance: none;
          border-radius: 0;
        }
        .login-field:focus {
          border-bottom-color: #0D1410;
        }
        .login-field::placeholder {
          color: #B8B0A6;
        }

        /* ── submit button ─────────────────────────────── */
        .login-submit {
          width: 100%;
          padding: 15px 24px;
          background: #0D1410;
          color: #E8E2D8;
          border: none;
          font-family: 'Instrument Sans', system-ui, sans-serif;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.2s ease, opacity 0.15s ease;
          border-radius: 2px;
        }
        .login-submit:hover:not(:disabled) {
          background: #1B2E1F;
        }
        .login-submit:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        /* ── responsive ───────────────────────────────── */
        .login-panel-left { display: none !important; }
        .login-mobile-logo { display: block; }
        @media (min-width: 900px) {
          .login-panel-left { display: flex !important; }
          .login-mobile-logo { display: none !important; }
        }

        /* ── entry animation ───────────────────────────── */
        .login-form-wrap {
          opacity: 0;
          transform: translateY(14px);
          transition: opacity 0.5s ease, transform 0.5s ease;
        }
        .login-form-wrap.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .login-panel-left {
          opacity: 0;
          transition: opacity 0.6s ease 0.1s;
        }
        .login-panel-left.visible {
          opacity: 1;
        }
      `}</style>

      <div
        className="login-page login-font-ui"
        style={{ minHeight: "100vh", display: "flex" }}
      >
        {/* ── Left brand panel (hidden on small screens) ── */}
        <div
          className={`login-dot-grid login-panel-left ${mounted ? "visible" : ""}`}
          style={{
            width: "42%",
            flexShrink: 0,
            background: "#0D1410",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "52px 56px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Ghost letterform */}
          <div
            className="login-font-display"
            style={{
              position: "absolute",
              bottom: "-120px",
              right: "-80px",
              fontSize: "500px",
              fontWeight: 300,
              color: "rgba(255,255,255,0.025)",
              lineHeight: 1,
              userSelect: "none",
              pointerEvents: "none",
              letterSpacing: "-0.04em",
            }}
            aria-hidden
          >
            G
          </div>

          {/* Wordmark */}
          <div>
            <span
              className="login-font-display"
              style={{
                fontSize: "20px",
                fontWeight: 400,
                color: "#DDD7CC",
                letterSpacing: "0.05em",
              }}
            >
              GRO Digital
            </span>
          </div>

          {/* Hero text */}
          <div>
            <div
              style={{
                width: "32px",
                height: "2px",
                background: "#5C8F68",
                marginBottom: "32px",
              }}
            />
            <h2
              className="login-font-display"
              style={{
                fontSize: "54px",
                fontWeight: 300,
                lineHeight: 1.12,
                color: "#E0DAD0",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              Your brand,
              <br />
              <em style={{ fontStyle: "italic", color: "#7DB88A" }}>
                amplified.
              </em>
            </h2>
            <p
              style={{
                marginTop: "28px",
                fontSize: "14px",
                lineHeight: 1.75,
                color: "#728070",
                maxWidth: "260px",
              }}
            >
              Access your campaigns, creative assets, and performance
              reporting — all in one place.
            </p>
          </div>

          {/* Footer */}
          <p
            style={{
              fontSize: "11px",
              color: "#3A4D3A",
              letterSpacing: "0.06em",
            }}
          >
            © {new Date().getFullYear()} GRO Digital
          </p>
        </div>

        {/* ── Right form panel ── */}
        <div
          style={{
            flex: 1,
            background: "#F9F6F2",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 32px",
          }}
        >
          {/* Mobile wordmark */}
          <div
            className="login-mobile-logo"
            style={{ width: "100%", maxWidth: "380px", marginBottom: "40px" }}
          >
            <span
              className="login-font-display"
              style={{
                fontSize: "22px",
                fontWeight: 400,
                color: "#0D1410",
                letterSpacing: "0.04em",
              }}
            >
              GRO Digital
            </span>
          </div>

          <div
            className={`login-form-wrap ${mounted ? "visible" : ""}`}
            style={{ width: "100%", maxWidth: "380px" }}
          >
            {/* Heading */}
            <div style={{ marginBottom: "44px" }}>
              <h1
                className="login-font-display"
                style={{
                  fontSize: "40px",
                  fontWeight: 400,
                  color: "#0D1410",
                  margin: 0,
                  lineHeight: 1.1,
                  letterSpacing: "-0.01em",
                }}
              >
                Welcome back.
              </h1>
              <p
                style={{
                  marginTop: "10px",
                  fontSize: "14px",
                  color: "#928D86",
                }}
              >
                Sign in to your client portal.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {/* Email */}
              <div style={{ marginBottom: "28px" }}>
                <label
                  htmlFor="login-email"
                  style={{
                    display: "block",
                    fontSize: "10.5px",
                    fontWeight: 600,
                    letterSpacing: "0.11em",
                    textTransform: "uppercase" as const,
                    color: "#7A7470",
                    marginBottom: "8px",
                  }}
                >
                  Email address
                </label>
                <input
                  id="login-email"
                  className="login-field"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: "36px" }}>
                <label
                  htmlFor="login-password"
                  style={{
                    display: "block",
                    fontSize: "10.5px",
                    fontWeight: 600,
                    letterSpacing: "0.11em",
                    textTransform: "uppercase" as const,
                    color: "#7A7470",
                    marginBottom: "8px",
                  }}
                >
                  Password
                </label>
                <input
                  id="login-password"
                  className="login-field"
                  type="password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {/* Error */}
              {error && (
                <div
                  style={{
                    marginBottom: "24px",
                    padding: "12px 16px",
                    background: "#FFF1F1",
                    border: "1px solid #F5C6C6",
                    borderRadius: "3px",
                    fontSize: "13px",
                    color: "#B91C1C",
                    lineHeight: 1.5,
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="login-submit"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {/* Footer note */}
            <p
              style={{
                marginTop: "32px",
                fontSize: "12px",
                color: "#B0A9A1",
                textAlign: "center" as const,
                lineHeight: 1.6,
              }}
            >
              Need access?{" "}
              <a
                href="mailto:hello@grodigital.co.za"
                style={{ color: "#5C8F68", textDecoration: "none" }}
              >
                Contact GRO Digital
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
