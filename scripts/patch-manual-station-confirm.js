const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

const replaceOnce = (label, from, to, options = {}) => {
  if (source.includes(to)) {
    console.log("[manual-station-confirm] " + label + " already patched.");
    return;
  }
  if (!source.includes(from)) {
    if (!options.optional) {
      console.warn("[manual-station-confirm] " + label + " target not found; skipped.");
    }
    return;
  }
  source = source.replace(from, to);
  changed = true;
  console.log("[manual-station-confirm] " + label + " patched.");
};

replaceOnce(
  "normalize manual QR text",
  `  const parseStationQrCode = (rawCode: string) => {
    const value = rawCode.trim();
    if (!value) return null;
`,
  `  const parseStationQrCode = (rawCode: string) => {
    const value = String(rawCode || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[：]/g, ":")
      .replace(/[｜]/g, "|")
      .replace(/\s+/g, " ")
      .trim();
    if (!value) return null;
`
);

replaceOnce(
  "pipe parser supports normalized separator",
  `    if (value.includes("｜") || value.includes("|")) {
      const separator = value.includes("｜") ? "｜" : "|";
      const [maybeService = "", maybeStation = ""] = value.split(separator).map(part => part.trim());
`,
  `    if (value.includes("|")) {
      const separator = "|";
      const [maybeService = "", maybeStation = ""] = value.split(separator).map(part => part.trim());
`
);

replaceOnce(
  "fuzzy direct station match",
  `    const directOptions = getStationOptionsForService(directService);
    if (directOptions.includes(value)) {
      return {
        service: directService,
        station: value,
        role: inferRoleFromStation(value),
        tag: "",
        raw: value
      };
    }
`,
  `    const directOptions = getStationOptionsForService(directService);
    const normalizeStationText = (text: string) => String(text || "").replace(/\s/g, "").toLowerCase();
    const normalizedValue = normalizeStationText(value);
    const matchedStation = directOptions.find(option => {
      const normalizedOption = normalizeStationText(option);
      return normalizedOption === normalizedValue || normalizedOption.includes(normalizedValue) || normalizedValue.includes(normalizedOption);
    });

    if (matchedStation) {
      return {
        service: directService,
        station: matchedStation,
        role: inferRoleFromStation(matchedStation),
        tag: "",
        raw: value
      };
    }
`
);

replaceOnce(
  "manual submit stops camera and validates",
  `  const handleManualStationCodeSubmit = () => {
    confirmStationFromQrCode(stationManualCode);
  };
`,
  `  const handleManualStationCodeSubmit = (event?: any) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const manualCode = String(stationManualCode || "").trim();
    if (!manualCode) {
      setStationScannerMessage("請先輸入崗位碼，例如：主二堂｜2樓大堂專招，或直接輸入 2樓大堂專招。");
      triggerVibration([80, 80, 80]);
      return;
    }

    // 手動確認時先停止相機，避免相機掃描狀態把錯誤或成功回饋蓋住，造成看起來點了沒反應。
    stopStationScanner();
    setStationScannerMessage("正在確認崗位...");

    window.setTimeout(() => {
      confirmStationFromQrCode(manualCode);
    }, 0);
  };
`
);

replaceOnce(
  "manual button event passthrough",
  `                    onClick={handleManualStationCodeSubmit}
`,
  `                    onClick={(event) => handleManualStationCodeSubmit(event)}
`
);

replaceOnce(
  "manual button event passthrough fullscreen",
  `                     onClick={handleManualStationCodeSubmit}
`,
  `                     onClick={(event) => handleManualStationCodeSubmit(event)}
`,
  { optional: true }
);

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[manual-station-confirm] app/page.tsx patched for this build.");
} else {
  console.log("[manual-station-confirm] no changes needed.");
}
