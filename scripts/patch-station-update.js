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

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[station-update] app/page.tsx patched for this build.");
} else {
  console.log("[station-update] no changes needed.");
}
