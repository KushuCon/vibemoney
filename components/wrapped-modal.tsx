"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Share2 } from "lucide-react";

interface WrappedData {
  monthLabel: string;
  totalSpent: number;
  transactionCount: number;
  topCategories: { id: string; name: string; emoji: string; amount: number }[];
  topMerchants: { name: string; amount: number }[];
  personality: {
    title: string;
    subtitle: string;
    description: string;
    roast: string;
    emoji: string;
  };
}

export function WrappedModal({ data, onClose }: { data: WrappedData; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const formatINR = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#0a0a0a",
      });
      const link = document.createElement("a");
      link.download = `vibewallet-${data.monthLabel.replace(" ", "-").toLowerCase()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  const handleShare = async () => {
    const text = `My ${data.monthLabel} money vibe: "${data.personality.title}" ${data.personality.emoji}\nSpent ${formatINR(data.totalSpent)} across ${data.transactionCount} transactions\n${data.personality.roast}\n\nVibeWallet 💸`;
    if (navigator.share) {
      await navigator.share({ text });
    } else {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard!");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm">
        {/* Controls */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white">{data.monthLabel} Wrapped</span>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* The shareable card */}
        <div
          ref={cardRef}
          className="rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(145deg, #0f0f0f 0%, #1a1a1a 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center">
                <span className="text-black text-[10px] font-bold">V</span>
              </div>
              <span className="text-white/60 text-xs font-medium">VibeWallet</span>
            </div>
            <span className="text-white/40 text-xs">{data.monthLabel}</span>
          </div>

          {/* Personality */}
          <div className="px-5 py-6 text-center">
            <div className="text-5xl mb-3">{data.personality.emoji}</div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{data.personality.title}</h2>
            <p className="text-white/40 text-sm mt-1">{data.personality.subtitle}</p>
            <p className="text-white/70 text-xs mt-3 leading-relaxed max-w-[240px] mx-auto">
              {data.personality.roast}
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-px bg-white/5 mx-5 rounded-xl overflow-hidden mb-5">
            {[
              { label: "Spent", value: formatINR(data.totalSpent) },
              { label: "Transactions", value: data.transactionCount.toString() },
              { label: "Top vibe", value: data.topCategories[0]?.emoji || "🌀" },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/[0.03] px-3 py-3 text-center">
                <div className="text-white font-semibold text-sm">{stat.value}</div>
                <div className="text-white/40 text-[10px] mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Top categories */}
          <div className="px-5 pb-5">
            <div className="text-white/40 text-[10px] font-medium uppercase tracking-wider mb-2">
              Where it all went
            </div>
            <div className="space-y-1.5">
              {data.topCategories.slice(0, 4).map((cat, i) => (
                <div key={cat.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{cat.emoji}</span>
                    <span className="text-white/70 text-xs">{cat.name}</span>
                  </div>
                  <span className="text-white/50 text-xs font-mono">
                    {formatINR(cat.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-4 text-center">
            <span className="text-white/20 text-[10px]">vibewallet.app · Powered by AI</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-3">
          <Button
            onClick={handleShare}
            variant="outline"
            className="flex-1 gap-2 text-sm rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            <Share2 className="w-4 h-4" />
            Share
          </Button>
          <Button
            onClick={handleDownload}
            className="flex-1 gap-2 text-sm rounded-xl"
          >
            <Download className="w-4 h-4" />
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}
