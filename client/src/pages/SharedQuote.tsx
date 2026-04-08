import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle } from "lucide-react";

const MOBILE_STYLES = `<style>
@media (max-width: 600px) {
  body { padding: 24px 20px 48px !important; font-size: 13px !important; }
  .meta-grid { grid-template-columns: 1fr !important; }
  .meta-cell:nth-child(even) { border-left: none !important; padding-left: 0 !important; }
  .meta-label { font-size: 11px !important; }
  .meta-value { font-size: 13px !important; }
  table.items th, table.items td { font-size: 12px !important; }
  table.items td.desc .sub { font-size: 11px !important; }
  table.items td.freq { display: none !important; }
  table.items td.vat  { display: none !important; }
  table.items th.center { display: none !important; }
  .payment-strip { flex-direction: column !important; }
  .payment-cell { border-right: none !important; border-bottom: 1px solid #e0e0e0 !important; }
  .payment-cell:last-child { border-bottom: none !important; }
  .payment-cell .plabel { font-size: 11px !important; }
  .payment-cell .pval   { font-size: 13px !important; }
  .terms-intro { font-size: 13px !important; }
  ol.terms li  { font-size: 12px !important; }
  .doc-footer  { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
  .doc-footer .footer-text { font-size: 11px !important; }
}
</style>`;

function injectMobileStyles(html: string): string {
  if (html.includes('</head>')) return html.replace('</head>', MOBILE_STYLES + '</head>');
  return MOBILE_STYLES + html;
}

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
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-sm text-muted-foreground">Loading quote…</p>
      </div>
    );
  }

  if (!quote || error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white gap-3">
        <AlertCircle size={32} className="text-destructive" />
        <p className="text-sm font-semibold text-foreground">Quote not found</p>
        <p className="text-xs text-muted-foreground">This link may be invalid or expired.</p>
      </div>
    );
  }

  const alreadySigned = quote.status === "signed" || signed;

  return (
    <div className="bg-[#f5f5f5] min-h-screen pb-16">
      {/* Quote content in iframe */}
      <iframe
        ref={iframeRef}
        srcDoc={injectMobileStyles(quote.htmlContent)}
        onLoad={handleIframeLoad}
        style={{ width: "100%", height: iframeHeight, border: "none", display: "block", background: "#fff" }}
        title="Quote"
      />

      {/* Signature section */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 mt-6">
        <div className="bg-white border border-[#e2e2e2] rounded-xl p-6 sm:p-9">
          {alreadySigned ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 size={40} className="text-green-600" />
              <p className="text-base font-bold text-foreground">Quote signed</p>
              <p className="text-sm text-muted-foreground text-center">
                Signed by <strong>{quote.signedBy ?? name}</strong>
                {(quote.signedCompany ?? company) && <> · {quote.signedCompany ?? company}</>}
                {quote.signedAt && (
                  <> on {new Date(quote.signedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</>
                )}
              </p>
              <p className="text-xs text-muted-foreground text-center">
                A copy of this quote has been recorded. Gro Digital will be in touch shortly.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm font-bold text-foreground mb-1">Sign &amp; Accept</p>
              <p className="text-sm text-muted-foreground mb-6">
                By signing below you confirm you have read and agree to the terms in this quote.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Full name
                  </label>
                  <Input
                    value={name}
                    onChange={e => { setName(e.target.value); setNameError(false); }}
                    className={nameError ? "border-destructive" : ""}
                  />
                  {nameError && <p className="text-[11px] text-destructive mt-1">Required</p>}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Company
                  </label>
                  <Input
                    value={company}
                    onChange={e => { setCompany(e.target.value); setCompanyError(false); }}
                    className={companyError ? "border-destructive" : ""}
                  />
                  {companyError && <p className="text-[11px] text-destructive mt-1">Required</p>}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                  Email <span className="normal-case font-normal text-muted-foreground/60">(optional — for your copy)</span>
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div className="flex items-start gap-2.5 mb-6">
                <Checkbox
                  id="agree"
                  checked={agreed}
                  onCheckedChange={v => setAgreed(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="agree" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                  I have read and agree to all terms and conditions set out in this quote.
                </Label>
              </div>

              <Button
                onClick={handleSign}
                disabled={!agreed || signMutation.isPending}
                className="w-full"
              >
                {signMutation.isPending ? "Signing…" : "Sign & Accept Quote"}
              </Button>

              {signMutation.isError && (
                <p className="text-xs text-destructive mt-2.5 text-center">
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
