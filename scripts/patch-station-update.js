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

applyPatch(
`        {/* QR 崗位碼掃描視窗 */}
        {stationScannerOpen && (
          <div className="fixed inset-0 z-[105] flex items-center justify-center p-5 bg-[#1F2937]/50 backdrop-blur-sm">
            <div className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl border border-[#E6EAF0] overflow-hidden">
              <div className="p-4 bg-[#FFF9F3] border-b border-[#E6EAF0] flex items-center justify-between gap-3">
                <p className={\`flex-1 text-center font-black text-[#6D55A3] \${
                  stationCameraActive
                    ? "text-[14px] sm:text-[15px] leading-none whitespace-nowrap"
                    : "text-xs leading-relaxed"
                }\`}>
                  {stationCameraActive ? "相機已開啟，請將 QR Code 放入畫面中央。" : stationScannerMessage}
                </p>
                <button
                  type="button"
                  onClick={handleCloseStationScanner}
                  className="w-9 h-9 rounded-full bg-white text-[#7B7B74] flex items-center justify-center border border-[#E6EAF0] hover:text-[#F25D6B] transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="relative rounded-[22px] bg-[#1F2937] overflow-hidden aspect-video flex items-center justify-center">
                  <video
                    ref={stationScanVideoRef}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                  {!stationCameraActive && (
                    <div className="absolute text-white/70 text-xs font-bold">
                      尚未開啟相機
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-[#E6EAF0]">
                  <label className="block text-[11px] font-black text-[#7B7B74] tracking-widest mb-2">
                    手動輸入崗位碼
                  </label>
                  <textarea
                    value={stationManualCode}
                    onChange={e => setStationManualCode(e.target.value)}
                    placeholder="例如：主二堂｜2樓大堂專招"
                    className="w-full h-20 px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-xs font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleManualStationCodeSubmit}
                    className="mt-3 w-full py-3 bg-white text-[#6D55A3] border border-[#6D55A3]/20 font-black rounded-[16px] hover:bg-[#F3EEFF] transition-colors"
                  >
                    確認崗位
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
`,
`        {/* QR 崗位碼全螢幕掃描 */}
        {stationScannerOpen && (
          <div className="fixed inset-0 z-[105] bg-[#05070D] overflow-hidden">
            <video
              ref={stationScanVideoRef}
              className="absolute inset-0 w-full h-full object-cover"
              muted
              playsInline
            />

            <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/10 to-black/70 pointer-events-none" />

            <div className="absolute left-0 right-0 top-0 z-10 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-white text-[19px] font-black tracking-tight">掃描崗位 QR Code</div>
                <div className="text-white/85 text-sm font-bold mt-1">請對準條碼進行掃描</div>
              </div>
              <button
                type="button"
                onClick={handleCloseStationScanner}
                aria-label="關閉掃描"
                className="w-11 h-11 rounded-full bg-black/45 text-white flex items-center justify-center border border-white/20 backdrop-blur-md active:scale-95 transition-transform shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-4">
              <div className="relative w-[86vw] max-w-[390px] aspect-square rounded-[34px] border-[4px] border-white/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.34)]">
                <div className="absolute -top-1 -left-1 w-12 h-12 border-t-[7px] border-l-[7px] border-[#00E0E0] rounded-tl-[34px]" />
                <div className="absolute -top-1 -right-1 w-12 h-12 border-t-[7px] border-r-[7px] border-[#00E0E0] rounded-tr-[34px]" />
                <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-[7px] border-l-[7px] border-[#00E0E0] rounded-bl-[34px]" />
                <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-[7px] border-r-[7px] border-[#00E0E0] rounded-br-[34px]" />
              </div>
            </div>

            {!stationCameraActive && (
              <div className="absolute inset-0 z-20 flex items-center justify-center px-8 text-center pointer-events-none">
                <div className="rounded-[24px] bg-black/55 border border-white/15 px-5 py-4 text-white/90 text-sm font-bold backdrop-blur-md">
                  正在開啟相機...
                </div>
              </div>
            )}

            {stationScannerMessage && !stationCameraActive && (
              <div className="absolute left-5 right-5 bottom-[calc(11.5rem+env(safe-area-inset-bottom))] z-20 rounded-[18px] bg-black/60 border border-white/15 px-4 py-3 text-white/90 text-xs font-bold text-center backdrop-blur-md">
                {stationScannerMessage}
              </div>
            )}

            <div className="absolute left-0 right-0 bottom-0 z-20 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 bg-gradient-to-t from-black/85 to-transparent">
              <details className="group rounded-[22px] border border-white/15 bg-black/35 backdrop-blur-md overflow-hidden">
                <summary className="list-none cursor-pointer px-4 py-3 text-center text-white text-sm font-black group-open:border-b group-open:border-white/10">
                  掃不到？手動輸入崗位碼
                </summary>
                <div className="p-4">
                  <textarea
                    value={stationManualCode}
                    onChange={e => setStationManualCode(e.target.value)}
                    placeholder="例如：主二堂｜2樓大堂專招"
                    className="w-full h-20 px-4 py-3 bg-white/95 border border-white/20 rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#00E0E0]/50 resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleManualStationCodeSubmit}
                    className="mt-3 w-full py-3 bg-white text-[#6D55A3] font-black rounded-[16px] active:scale-[0.99] transition-transform"
                  >
                    確認崗位
                  </button>
                </div>
              </details>
            </div>
          </div>
        )}
`,
"make QR scanner full screen"
);

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[station-update] app/page.tsx patched for this build.");
} else {
  console.log("[station-update] no changes needed.");
}
