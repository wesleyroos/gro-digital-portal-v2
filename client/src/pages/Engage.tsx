import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MessageCircle, Mail, Phone, RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const TENANT_URL = "https://engage.grodigital.co.za/t/gro-digital";

function rands(cents: number) {
  return `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "bad" }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : ""}`}>
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Rail({ icon: Icon, name, status, detail }: { icon: typeof Mail; name: string; status: string; detail?: string | null }) {
  const live = status === "active";
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <Icon className={`h-4 w-4 ${live ? "text-emerald-600" : "text-muted-foreground/40"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{detail || status.replace(/_/g, " ")}</p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${live ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
        {live ? "live" : "off"}
      </span>
    </div>
  );
}

export default function Engage() {
  const utils = trpc.useUtils();
  const { data: status, isLoading } = trpc.engage.status.useQuery();
  const { data: templates = [] } = trpc.engage.templates.useQuery();
  const { data: contacts = [] } = trpc.contact.list.useQuery();

  const toggle = trpc.engage.setEnabled.useMutation({
    onSuccess: () => { utils.engage.status.invalidate(); toast.success("Saved"); },
    onError: (e) => toast.error(e.message),
  });
  const sync = trpc.engage.syncContacts.useMutation({
    onSuccess: (r) => {
      utils.engage.status.invalidate();
      const bits = [`${r.created} created`, `${r.updated} updated`];
      if (r.skipped) bits.push(`${r.skipped} skipped`);
      toast.success(`Synced — ${bits.join(", ")}`);
      if (r.errors.length) toast.error(`${r.errors.length} failed: ${r.errors[0]}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const localSendable = contacts.filter((c) => !c.isInternal && (c.email || c.phone)).length;

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!status?.keyPresent) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Engage</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium">Not configured</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No <span className="font-mono">ENGAGE_API_KEY</span> is set on this service, so the portal
              cannot reach Engage. Mint a key in Engage → Settings → API keys and set it as an
              environment variable.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const w = status.wallet;
  const ch = status.channels;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Engage</h1>
          <p className="text-sm text-muted-foreground">
            Gro Digital is tenant #4 on its own engagement platform. This is the client's view of it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href={TENANT_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline">
            Open in Engage <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <Switch
              checked={status.enabled}
              onCheckedChange={(v) => toggle.mutate({ enabled: v })}
              disabled={toggle.isPending}
            />
            <span className="text-sm font-medium">{status.enabled ? "Engage on" : "Engage off"}</span>
          </div>
        </div>
      </div>

      {status.error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-700">Could not read everything from Engage</p>
            <p className="break-words text-xs text-red-600">{status.error}</p>
          </div>
        </div>
      )}

      {!status.enabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          Engage is switched off here. Nothing syncs and no campaign can be sent from the portal.
          The wallet and rails below are still read live.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Wallet"
          value={w ? rands(w.balanceCents) : "—"}
          hint={w?.lowBalance ? "low balance" : "available to spend"}
          tone={w?.lowBalance ? "warn" : undefined}
        />
        <Tile
          label="Sending"
          value={w ? (w.canSend ? "Allowed" : "Blocked") : "—"}
          hint={w?.sendingBlockedReason?.replace(/_/g, " ") ?? (w?.billingActive ? "billing active" : undefined)}
          tone={w && !w.canSend ? "bad" : undefined}
        />
        <Tile
          label="Contacts in Engage"
          value={status.contactCount === null ? "—" : String(status.contactCount)}
          hint={`${localSendable} sendable in the portal`}
          tone={status.contactCount !== null && status.contactCount < localSendable ? "warn" : undefined}
        />
        <Tile label="Templates" value={String(templates.length)} hint="approved and pending" />
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Contact sync</p>
              <p className="text-sm text-muted-foreground">
                Changes push to Engage on their own now — every consent edit, opt-out and company
                exclusion syncs as it happens. This button is for a full reconciliation, or after
                Engage has been unreachable. Our own team is never sent.
              </p>
            </div>
            <Button onClick={() => sync.mutate()} disabled={sync.isPending || !status.enabled}>
              <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
              {sync.isPending ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-semibold">Rails</p>
            {ch ? (
              <div className="space-y-2">
                <Rail icon={MessageCircle} name="WhatsApp" status={ch.whatsapp.status} detail={ch.whatsapp.displayNumber} />
                <Rail icon={Mail} name="Email" status={ch.email.status} detail={ch.email.from} />
                <Rail icon={Phone} name="SMS" status={ch.sms.status} detail="shared SMSPortal number" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Could not read the rails.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-semibold">Rates</p>
            {w?.rates ? (
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {Object.entries(w.rates).map(([k, v]) => (
                    <tr key={k}>
                      <td className="py-1.5 capitalize text-muted-foreground">{k.replace(/Cents$/, "").replace(/([A-Z])/g, " $1").trim()}</td>
                      <td className="py-1.5 text-right tabular-nums">{rands(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">No rate card readable.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="font-semibold">Wallet history</p>
          {w?.entries?.length ? (
            <table className="mt-3 w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">What</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {w.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 text-muted-foreground">{new Date(e.at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="py-2">{e.note ?? e.type.replace(/_/g, " ")}</td>
                    <td className={`py-2 text-right tabular-nums ${e.amountCents < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {e.amountCents < 0 ? "−" : "+"}{rands(Math.abs(e.amountCents))}
                    </td>
                    <td className="py-2 text-right tabular-nums">{rands(e.balanceAfterCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Nothing has moved through the wallet yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="font-semibold">Templates</p>
          {templates.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No templates yet. WhatsApp marketing needs an approved template before anything can be
              sent, and Meta approves on its own clock — submit early.
            </p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Channel</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 font-medium">{t.name}</td>
                    <td className="py-2 text-muted-foreground">{t.channel}</td>
                    <td className="py-2 text-muted-foreground">{t.category ?? "—"}</td>
                    <td className="py-2">{t.status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
