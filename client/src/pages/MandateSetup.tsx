import { trpc } from "@/lib/trpc";
import { useParams } from "wouter";
import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "R0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `R${num.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

declare global {
  interface Window {
    PaystackPop: {
      newTransaction: (opts: {
        key: string;
        accessCode: string;
        onSuccess: (transaction: { reference: string }) => void;
        onCancel: () => void;
      }) => void;
    };
  }
}

function loadPaystackScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v2/inline.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Paystack script"));
    document.head.appendChild(script);
  });
}

export default function MandateSetup() {
  const { token } = useParams<{ token: string }>();
  const [cardState, setCardState] = useState<"idle" | "loading" | "success" | "cancelled" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: mandate, isLoading, refetch } = trpc.mandate.getByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const initMutation = trpc.mandate.initializeCardSetup.useMutation();

  const handlePayCard = useCallback(async () => {
    if (!mandate) return;
    setCardState("loading");
    setErrorMsg("");
    try {
      await loadPaystackScript();
      const { accessCode, publicKey } = await initMutation.mutateAsync({ token: token ?? "" });
      window.PaystackPop.newTransaction({
        key: publicKey,
        accessCode,
        onSuccess: async () => {
          // Poll until mandate activates (webhook fires async)
          for (let i = 0; i < 12; i++) {
            await new Promise(r => setTimeout(r, 2500));
            const result = await refetch();
            if (result.data?.status === "active") break;
          }
          setCardState("success");
        },
        onCancel: () => setCardState("cancelled"),
      });
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
      setCardState("error");
    }
  }, [mandate, token, initMutation, refetch]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!mandate) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
            <p className="font-semibold text-gray-900 mb-1">Link not found</p>
            <p className="text-sm text-muted-foreground">This billing setup link is invalid or has expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalRands = mandate.lineItems.reduce((sum, item) => sum + parseFloat(String(item.amount)), 0);
  const isAlreadyActive = mandate.status === "active";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="w-full max-w-md mb-6">
        <img
          src="https://pub-7689bb2e0fe5474fb166518d32366c41.r2.dev/media/1773557375019-ei1drt50gii.png"
          alt="Gro Digital"
          className="h-8 w-auto"
        />
      </div>

      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="p-6 sm:p-8">
          {isAlreadyActive || cardState === "success" ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-semibold text-gray-900 mb-2">You're all set!</p>
              <p className="text-sm text-muted-foreground">
                {isAlreadyActive && mandate.cardLast4
                  ? `Your ${mandate.cardBrand ?? "card"} ending in ${mandate.cardLast4} is on file. We'll charge it automatically according to your billing schedule.`
                  : "Your card has been saved securely. You'll be charged automatically going forward — no action needed."}
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-1">Set up billing</h1>
              <p className="text-sm text-muted-foreground mb-6">
                For {mandate.clientName} — enter your card once, and we'll handle everything automatically.
              </p>

              {/* Line items */}
              <div className="border rounded-lg overflow-hidden mb-6">
                <div className="bg-gray-50 px-4 py-2.5 flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <span>Service</span>
                  <span>Amount</span>
                </div>
                {mandate.lineItems.map(item => (
                  <div key={item.id} className="px-4 py-3 flex justify-between items-center border-t border-gray-100">
                    <span className="text-sm text-gray-900">{item.description}</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatCurrency(item.amount)}<span className="text-muted-foreground font-normal">/{item.interval === "monthly" ? "mo" : "yr"}</span>
                    </span>
                  </div>
                ))}
                <div className="px-4 py-3 flex justify-between items-center border-t border-gray-200 bg-gray-50">
                  <span className="text-sm font-semibold text-gray-900">Charged today</span>
                  <span className="text-sm font-bold text-gray-900">{formatCurrency(totalRands)}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-5">
                You'll be charged {formatCurrency(totalRands)} today for the first billing period, then automatically on schedule. You can cancel at any time by contacting us.
              </p>

              {cardState === "cancelled" && (
                <p className="text-sm text-amber-600 mb-4 text-center">Payment was cancelled — you can try again below.</p>
              )}

              {cardState === "error" && (
                <p className="text-sm text-red-600 mb-4 text-center">{errorMsg || "Something went wrong, please try again."}</p>
              )}

              <Button
                className="w-full gap-2 bg-[#2286c2] hover:bg-[#1a6fa0] text-white"
                size="lg"
                onClick={handlePayCard}
                disabled={cardState === "loading"}
              >
                {cardState === "loading" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Opening payment form…</>
                ) : (
                  <><CreditCard className="w-4 h-4" /> Enter card details</>
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground mt-4">
                Secured by <strong>Paystack</strong> · Your card details are never stored on our servers
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground text-center">
        Questions? Email{" "}
        <a href="mailto:wesley@grodigital.co.za" className="text-[#2286c2] hover:underline">
          wesley@grodigital.co.za
        </a>
      </p>
    </div>
  );
}
