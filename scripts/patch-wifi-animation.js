const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

function patch(needle, replacement, label) {
  if (source.includes(replacement)) {
    console.log(`[wifi-animation] ${label} already applied.`);
    return;
  }
  if (!source.includes(needle)) {
    console.warn(`[wifi-animation] ${label} target not found; skipped.`);
    return;
  }
  source = source.replace(needle, replacement);
  changed = true;
  console.log(`[wifi-animation] ${label} applied.`);
}

patch(
`  Loader2,
  Eye,`,
`  Loader2,
  RefreshCw,
  Eye,`,
"import RefreshCw icon"
);

patch(
`      <div className="relative flex flex-col w-full max-w-[420px] bg-[#FFF9F3] sm:rounded-[40px] sm:border-[10px] border-[#6D55A3]/5 overflow-hidden shadow-2xl shadow-[#6D55A3]/20">
        
        {/* 全新品牌風格 - 頂部 Header */}`,
`      <div className="relative flex flex-col w-full max-w-[420px] bg-[#FFF9F3] sm:rounded-[40px] sm:border-[10px] border-[#6D55A3]/5 overflow-hidden shadow-2xl shadow-[#6D55A3]/20">
        <style>{\`
          .wifi-action-enter { animation: wifiFadeIn 420ms cubic-bezier(0.16, 1, 0.3, 1) both; }
          .wifi-check-button { transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), background-color 240ms ease, border-color 240ms ease, color 240ms ease, opacity 240ms ease, box-shadow 260ms ease; }
          .wifi-check-button:active { transform: scale(0.96); }
          .wifi-check-button-checking { border-color: rgba(0, 184, 184, 0.48) !important; animation: wifiGlowBreath 1200ms cubic-bezier(0.16, 1, 0.3, 1) infinite; }
          .wifi-refresh-icon-active { transform-origin: center; animation: wifiRefreshBurst 980ms cubic-bezier(0.1, 1, 0.1, 1) both; }
          .wifi-check-label { animation: wifiTextFade 260ms ease-out both; }
          @keyframes wifiFadeIn { from { opacity: 0; transform: translateY(4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
          @keyframes wifiTextFade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes wifiRefreshBurst { 0% { transform: rotate(0deg) scale(0.9); filter: drop-shadow(0 0 0 rgba(0, 184, 184, 0)); } 18% { transform: rotate(430deg) scale(1.1); filter: drop-shadow(0 0 8px rgba(0, 184, 184, 0.45)); } 72% { transform: rotate(690deg) scale(1.04); filter: drop-shadow(0 0 5px rgba(0, 184, 184, 0.25)); } 88% { transform: rotate(722deg) scale(1.02); } 100% { transform: rotate(720deg) scale(1); filter: drop-shadow(0 0 0 rgba(0, 184, 184, 0)); } }
          @keyframes wifiGlowBreath { 0% { box-shadow: 0 0 0 1px rgba(0, 184, 184, 0.14), 0 0 8px rgba(0, 184, 184, 0.18), 0 0 18px rgba(0, 184, 184, 0.10); } 50% { box-shadow: 0 0 0 1px rgba(0, 184, 184, 0.38), 0 0 14px rgba(0, 184, 184, 0.34), 0 0 34px rgba(0, 184, 184, 0.20); } 100% { box-shadow: 0 0 0 1px rgba(0, 184, 184, 0.14), 0 0 8px rgba(0, 184, 184, 0.18), 0 0 18px rgba(0, 184, 184, 0.10); } }
        \`}</style>
        
        {/* 全新品牌風格 - 頂部 Header */}`,
"inject Wi-Fi animation styles"
);

patch(
`                        className={\`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black transition-all \${
                          wifiChecking
                            ? "bg-[#E6EAF0] text-[#7B7B74] border-[#E6EAF0] cursor-not-allowed"
                            : "bg-white text-[#00B8B8] border-[#00B8B8]/25 hover:bg-[#00B8B8]/10"
                        }\`}
                      >
                        {wifiChecking ? "檢查中..." : "重新檢查"}
                      </button>`,
`                        className={\`wifi-action-enter wifi-check-button inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black \${
                          wifiChecking
                            ? "wifi-check-button-checking bg-white text-[#00B8B8] border-[#00B8B8]/40 cursor-wait"
                            : "bg-white text-[#00B8B8] border-[#00B8B8]/25 hover:bg-[#00B8B8]/10 hover:shadow-[0_0_14px_rgba(0,184,184,0.16)]"
                        }\`}
                      >
                        <RefreshCw className={\`w-3.5 h-3.5 \${wifiChecking ? "wifi-refresh-icon-active" : ""}\`} strokeWidth={2.7} />
                        <span key={wifiChecking ? "wifi-checking" : "wifi-ready"} className="wifi-check-label">
                          {wifiChecking ? "檢查中…" : "重新檢查"}
                        </span>
                      </button>`,
"enhance connected Wi-Fi button"
);

patch(
`                        className={\`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black transition-all \${
                          wifiChecking
                            ? "bg-[#E6EAF0] text-[#7B7B74] border-[#E6EAF0] cursor-not-allowed"
                            : "bg-white text-[#F25D6B] border-[#F25D6B]/25 hover:bg-[#FFF2F4]"
                        }\`}
                      >
                        {wifiChecking ? "檢查中..." : "重新檢查"}
                      </button>`,
`                        className={\`wifi-action-enter wifi-check-button inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black \${
                          wifiChecking
                            ? "wifi-check-button-checking bg-white text-[#00B8B8] border-[#00B8B8]/40 cursor-wait"
                            : "bg-white text-[#F25D6B] border-[#F25D6B]/25 hover:bg-[#FFF2F4] hover:shadow-[0_0_14px_rgba(242,93,107,0.14)]"
                        }\`}
                      >
                        <RefreshCw className={\`w-3.5 h-3.5 \${wifiChecking ? "wifi-refresh-icon-active" : ""}\`} strokeWidth={2.7} />
                        <span key={wifiChecking ? "wifi-checking" : "wifi-ready"} className="wifi-check-label">
                          {wifiChecking ? "檢查中…" : "重新檢查"}
                        </span>
                      </button>`,
"enhance disconnected Wi-Fi button"
);

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[wifi-animation] app/page.tsx patched for this build.");
} else {
  console.log("[wifi-animation] no changes needed.");
}
