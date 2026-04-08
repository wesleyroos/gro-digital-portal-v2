import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle } from "lucide-react";

export default function SharedQuote() {
  const { token } = useParams<{ token: string }>();
  const { data: quote, isLoading, error } = trpc.quote.getByToken.useQuery({ token });
  const signMutation = trpc.quote.sign.useMutation();

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [companyError, setCompanyError] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(900);

  function handleIframeLoad() {
    try {
      const body = iframeRef.current?.contentDocument?.body;
      if (body) setIframeHeight(body.scrollHeight + 32);
    } catch {
      // cross-origin fallback — leave default height
    }
  }

  async function handleSign() {
    const nameOk = !!name.trim();
    const companyOk = !!company.trim();
    setNameError(!nameOk);
    setCompanyError(!companyOk);
    if (!nameOk || !companyOk) return;
    await signMutation.mutateAsync({ token, signedBy: name.trim(), signedCompany: company.trim(), signerEmail: email.trim() || undefined });
    setSigned(true);
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#fff" }}>
        <p style={{ fontFamily: "sans-serif", color: "#888", fontSize: 14 }}>Loading quote…</p>
      </div>
    );
  }

  if (!quote || error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#fff", gap: 12 }}>
        <AlertCircle size={32} color="#dc2626" />
        <p style={{ fontFamily: "sans-serif", color: "#333", fontSize: 15, fontWeight: 600 }}>Quote not found</p>
        <p style={{ fontFamily: "sans-serif", color: "#888", fontSize: 13 }}>This link may be invalid or expired.</p>
      </div>
    );
  }

  const alreadySigned = quote.status === "signed" || signed;

  return (
    <div style={{ background: "#f5f5f5", minHeight: "100vh", paddingBottom: 64 }}>
      {/* Quote content in iframe */}
      <iframe
        ref={iframeRef}
        srcDoc={quote.htmlContent}
        onLoad={handleIframeLoad}
        style={{
          width: "100%",
          height: iframeHeight,
          border: "none",
          display: "block",
          background: "#fff",
        }}
        title="Quote"
      />

      {/* Signature section */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px" }}>
        <div style={{
          background: "#fff",
          border: "1px solid #e2e2e2",
          borderRadius: 10,
          padding: "32px 36px",
          marginTop: 24,
        }}>
          {alreadySigned ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0" }}>
              <CheckCircle2 size={40} color="#16a34a" />
              <p style={{ fontFamily: "sans-serif", fontSize: 17, fontWeight: 700, color: "#111", margin: 0 }}>
                Quote signed
              </p>
              <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666", margin: 0, textAlign: "center" }}>
                Signed by <strong>{quote.signedBy ?? name}</strong>
                {(quote.signedCompany ?? company) && <> · {quote.signedCompany ?? company}</>}
                {quote.signedAt && (
                  <> on {new Date(quote.signedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</>
                )}
              </p>
              <p style={{ fontFamily: "sans-serif", fontSize: 12, color: "#999", margin: 0 }}>
                A copy of this quote has been recorded. Gro Digital will be in touch shortly.
              </p>
            </div>
          ) : (
            <>
              <p style={{ fontFamily: "sans-serif", fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 4 }}>
                Sign &amp; Accept
              </p>
              <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666", marginBottom: 24 }}>
                By signing below you confirm you have read and agree to the terms in this quote.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", display: "block", marginBottom: 6 }}>
                    Full name
                  </label>
                  <Input
                    value={name}
                    onChange={e => { setName(e.target.value); setNameError(false); }}
                    style={nameError ? { borderColor: "#dc2626" } : undefined}
                  />
                  {nameError && (
                    <p style={{ fontFamily: "sans-serif", fontSize: 11, color: "#dc2626", marginTop: 4 }}>Required</p>
                  )}
                </div>
                <div>
                  <label style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", display: "block", marginBottom: 6 }}>
                    Company
                  </label>
                  <Input
                    value={company}
                    onChange={e => { setCompany(e.target.value); setCompanyError(false); }}
                    style={companyError ? { borderColor: "#dc2626" } : undefined}
                  />
                  {companyError && (
                    <p style={{ fontFamily: "sans-serif", fontSize: 11, color: "#dc2626", marginTop: 4 }}>Required</p>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", display: "block", marginBottom: 6 }}>
                  Email <span style={{ textTransform: "none", fontWeight: 400, color: "#bbb" }}>(optional — for your copy)</span>
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 24 }}>
                <Checkbox
                  id="agree"
                  checked={agreed}
                  onCheckedChange={v => setAgreed(v === true)}
                  style={{ marginTop: 2 }}
                />
                <Label htmlFor="agree" style={{ fontFamily: "sans-serif", fontSize: 13, color: "#444", lineHeight: 1.5, cursor: "pointer" }}>
                  I have read and agree to all terms and conditions set out in this quote.
                </Label>
              </div>

              <Button
                onClick={handleSign}
                disabled={!agreed || signMutation.isPending}
                style={{ width: "100%" }}
              >
                {signMutation.isPending ? "Signing…" : "Sign & Accept Quote"}
              </Button>

              {signMutation.isError && (
                <p style={{ fontFamily: "sans-serif", fontSize: 12, color: "#dc2626", marginTop: 10, textAlign: "center" }}>
                  {signMutation.error.message}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
