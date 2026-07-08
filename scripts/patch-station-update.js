const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

const applyPatch = (needle, replacement, label) => {
  if (source.includes(replacement)) {
    console.log(`[station-update] ${label} already applied.`);
    return;
  }

  if (!source.includes(needle)) {
    console.warn(`[station-update] ${label} target not found; skipped.`);
    return;
  }

  source = source.replace(needle, replacement);
  changed = true;
  console.log(`[station-update] ${label} applied.`);
};

applyPatch(
`    if (checkinStatus === "station_confirmed") {
      setCustomAlert({ isOpen: true, message: \`今日崗位已確認：\${confirmedStation || personalSettings.role}\` });
      return;
    }
`,
`    if (checkinStatus === "station_confirmed") {
      setCustomConfirm({
        isOpen: true,
        message: \`如需調整服事崗位，請重新掃描新的崗位 QR Code。\\n\\n目前崗位：\${confirmedStation || personalSettings.role}\\n\\n重新掃描只會更新崗位，不會更改報到時間。\`,
        confirmLabel: "重新掃描",
        onConfirm: () => {
          setConfirmedStation("");
          setAssignedStation("");
          setCheckinStatus("checked_in");
          stationAutoStartAttemptedRef.current = false;
          setStationScannerOpen(true);
          setStationScannerMessage("");
        }
      });
      return;
    }
`,
"allow station update after confirmation"
);

applyPatch(
`                  今日堂次：<span className="font-black text-[#00B8B8]">{checkedInService || todayService}</span>。崗位已確認後，若需更正堂次，請總招協助處理。
`,
`                  今日堂次：<span className="font-black text-[#00B8B8]">{checkedInService || todayService}</span>。如需調整服事崗位，可使用「崗位更新」重新掃描新的名牌。堂次若需更正，請總招協助處理。
`,
"update confirmed station helper text"
);

applyPatch(
`                <button
                  type="button"
                  onClick={() => setActiveTab("timeline")}
                  className="w-full py-4 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-black rounded-[18px] shadow-lg shadow-[#F25D6B]/20 hover:opacity-90 transition-opacity"
                >
                  進入今日流程
                </button>
`,
`                <div className="grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    onClick={handleOpenStationScanner}
                    className="w-full py-4 bg-white text-[#6D55A3] border border-[#6D55A3]/20 font-black rounded-[18px] hover:bg-[#F3EEFF] transition-colors"
                  >
                    崗位更新
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("timeline")}
                    className="w-full py-4 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-black rounded-[18px] shadow-lg shadow-[#F25D6B]/20 hover:opacity-90 transition-opacity"
                  >
                    進入今日流程
                  </button>
                </div>
`,
"add station update button on check-in card"
);

applyPatch(
`             掃描崗位名牌
`,
`             {stationReady ? "崗位更新" : "掃描崗位名牌"}
`,
"rename station tab scan button when confirmed"
);

applyPatch(
`    try {
      const response = await fetch("/api/check-wifi", {
        method: "GET",
        cache: "no-store"
      });
`,
`    if (!silent) {
      setWifiCheckMessage("正在重新檢查 Wi-Fi 連線...");
    }

    try {
      const response = await fetch(\`/api/check-wifi?t=\${Date.now()}\`, {
        method: "GET",
        cache: "no-store"
      });
`,
"force fresh Wi-Fi recheck"
);

applyPatch(
`  const handleWifiCheck = () => {
    void checkWifiConnection({ silent: true });
  };
`,
`  const handleWifiCheck = () => {
    void checkWifiConnection({ silent: false });
  };
`,
"make manual Wi-Fi check visible and immediate"
);

applyPatch(
`    if (wifiVerified) return;

    void checkWifiConnection({ silent: true });
`,
`    void checkWifiConnection({ silent: true });
`,
"continue Wi-Fi checks after connected"
);

applyPatch(
`  }, [activeTab, hasCheckinProfile, checkinStatus, wifiVerified, checkWifiConnection]);
`,
`  }, [activeTab, hasCheckinProfile, checkinStatus, checkWifiConnection]);
`,
"remove stale Wi-Fi dependency"
);

applyPatch(
`                {wifiVerified ? (
                  <>
                    <p>目前您在教會網路</p>
                    <p>可進行點選簽到</p>
                  </>
                ) : (
                  <>
                    <p>目前不在教會網路</p>
                    <p className="flex items-center gap-1">
                      <span>請確認連上 Wi-Fi：Slllc 後重試</span>
                      <button
                        type="button"
                        onClick={handleWifiCheck}
                        disabled={wifiChecking}
                        aria-label="重新檢查 Wi-Fi"
                        className={\`inline-flex w-6 h-6 items-center justify-center rounded-full border font-black text-base leading-none transition-all \${
                          wifiChecking
                            ? "bg-[#E6EAF0] text-[#7B7B74] border-[#E6EAF0] cursor-not-allowed animate-spin"
                            : "bg-white text-[#F25D6B] border-[#F25D6B]/25 hover:bg-[#FFF2F4]"
                        }\`}
                      >
                        ⟳
                      </button>
                    </p>
                  </>
                )}
`,
`                {wifiVerified ? (
                  <>
                    <p>目前您在教會網路</p>
                    <p className="flex flex-wrap items-center gap-2">
                      <span>可進行點選簽到</span>
                      <button
                        type="button"
                        onClick={handleWifiCheck}
                        disabled={wifiChecking}
                        aria-label="重新檢查 Wi-Fi"
                        className={\`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black transition-all \${
                          wifiChecking
                            ? "bg-[#E6EAF0] text-[#7B7B74] border-[#E6EAF0] cursor-not-allowed"
                            : "bg-white text-[#00B8B8] border-[#00B8B8]/25 hover:bg-[#00B8B8]/10"
                        }\`}
                      >
                        {wifiChecking ? "檢查中..." : "重新檢查"}
                      </button>
                    </p>
                  </>
                ) : (
                  <>
                    <p>目前不在教會網路</p>
                    <p className="flex flex-wrap items-center gap-2">
                      <span>請確認連上 Wi-Fi：Slllc 後重試</span>
                      <button
                        type="button"
                        onClick={handleWifiCheck}
                        disabled={wifiChecking}
                        aria-label="重新檢查 Wi-Fi"
                        className={\`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black transition-all \${
                          wifiChecking
                            ? "bg-[#E6EAF0] text-[#7B7B74] border-[#E6EAF0] cursor-not-allowed"
                            : "bg-white text-[#F25D6B] border-[#F25D6B]/25 hover:bg-[#FFF2F4]"
                        }\`}
                      >
                        {wifiChecking ? "檢查中..." : "重新檢查"}
                      </button>
                    </p>
                  </>
                )}
`,
"replace ugly Wi-Fi refresh icon"
);

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[station-update] app/page.tsx patched for this build.");
} else {
  console.log("[station-update] no changes needed.");
}
