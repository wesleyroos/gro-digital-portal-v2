import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Megaphone, ArrowRight, Plus, X } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useState, useRef } from "react";

const STATUS_LABELS: Record<string, string> = {
  discovery: "Discovery",
  strategy: "Strategy",
  generating: "Generating",
  approval: "Pending Approval",
  active: "Active",
  completed: "Completed",
};

const STATUS_BADGE: Record<string, string> = {
  discovery: "bg-gray-100 text-gray-600 border-gray-200",
  strategy: "bg-blue-50 text-blue-700 border-blue-200",
  generating: "bg-amber-50 text-amber-700 border-amber-200",
  approval: "bg-violet-50 text-violet-700 border-violet-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-gray-50 text-gray-500 border-gray-200",
};

const STATUS_BORDER: Record<string, string> = {
  active: "border-l-emerald-500",
  approval: "border-l-violet-500",
  generating: "border-l-amber-400",
  strategy: "border-l-blue-400",
  discovery: "border-l-gray-300",
  completed: "border-l-gray-200",
};

export default function PortalMarketing() {
  useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [, setLocation] = useLocation();
  const [showModal, setShowModal] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: campaigns = [], isLoading } = trpc.clientPortal.getCampaigns.useQuery();
  const createMutation = trpc.clientPortal.createCampaign.useMutation({
    onSuccess: ({ id }) => setLocation(`/portal/marketing/${id}`),
  });

  const activeCampaigns = campaigns.filter(c => c.status === "active");
  const pendingCampaigns = campaigns.filter(c => c.status === "approval");
  const today = new Date();

  function openModal() {
    setCampaignName("");
    setShowModal(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function closeModal() {
    setShowModal(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!campaignName.trim()) return;
    createMutation.mutate({ name: campaignName.trim() });
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4 pb-12">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8 pb-12">

      {/* Header */}
      <div className="flex items-end justify-between pt-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-[#3b8dc6] mb-1">Marketing</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Your Campaigns</h1>
        </div>
        <div className="flex items-center gap-3 pb-1">
          <p className="text-sm text-gray-400 font-medium">{format(today, "EEEE, d MMMM yyyy")}</p>
          <button
            onClick={openModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3b8dc6] text-white text-sm font-semibold shadow-sm hover:bg-[#2d7ab5] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Request Campaign
          </button>
        </div>
      </div>
      <hr className="border-gray-100" />

      {/* KPI strip */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col gap-1 border-l-[3px] border-l-[#3b8dc6]">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total</p>
            <p className="text-2xl font-bold text-gray-900 leading-none">{campaigns.length}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col gap-1 border-l-[3px] border-l-emerald-400">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Active</p>
            <p className="text-2xl font-bold text-gray-900 leading-none">{activeCampaigns.length}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col gap-1 border-l-[3px] border-l-violet-400">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Pending Approval</p>
            <p className="text-2xl font-bold text-gray-900 leading-none">{pendingCampaigns.length}</p>
          </div>
        </div>
      )}

      {/* Campaign list */}
      {campaigns.length === 0 ? (
        <div className="text-center py-20">
          <div className="h-14 w-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
            <Megaphone className="h-7 w-7 text-violet-400" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">No campaigns yet</h2>
          <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">Your campaigns will appear here once they've been created.</p>
          <button
            onClick={openModal}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3b8dc6] text-white text-sm font-semibold shadow-sm hover:bg-[#2d7ab5] transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Campaign
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="h-4 w-4 text-[#3b8dc6]" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">All Campaigns</h2>
          </div>
          <div className="space-y-2">
            {campaigns.map(campaign => (
              <div
                key={campaign.id}
                className={`bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition-shadow flex border-l-[3px] ${STATUS_BORDER[campaign.status] ?? "border-l-gray-300"}`}
                onClick={() => setLocation(`/portal/marketing/${campaign.id}`)}
              >
                <div className="flex items-center gap-4 px-4 py-3.5 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{campaign.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {campaign.startDate ? `Started ${format(new Date(campaign.startDate), "d MMM yyyy")}` : "Not started"}
                      {campaign.endDate ? ` · Ends ${format(new Date(campaign.endDate), "d MMM yyyy")}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 font-semibold px-2 py-0.5 ${STATUS_BADGE[campaign.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                    {STATUS_LABELS[campaign.status] ?? campaign.status}
                  </Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Campaign Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">New Campaign</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                ref={inputRef}
                type="text"
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                placeholder="Campaign name"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3b8dc6]/30 focus:border-[#3b8dc6]"
                maxLength={120}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!campaignName.trim() || createMutation.isPending}
                  className="flex-1 px-4 py-2 rounded-lg bg-[#3b8dc6] text-white text-sm font-semibold hover:bg-[#2d7ab5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createMutation.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
