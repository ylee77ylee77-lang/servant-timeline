const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(file, "utf8");
let changed = false;

const replaceRequired = (from, to, label) => {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`[html-audio] Missing target: ${label}`);
  source = source.replace(from, to);
  changed = true;
  console.log(`[html-audio] ${label}`);
};

replaceRequired(
  `  const voiceAudioContextRef = useRef<any>(null);`,
  `  const voiceAudioContextRef = useRef<any>(null);\n  const voiceHtmlAudioRef = useRef<HTMLAudioElement | null>(null);`,
  "added persistent HTML audio ref"
);

replaceRequired(
  `  const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));`,
  `  const getVoiceHtmlAudio = () => {
    if (typeof window === "undefined") return null;

    if (!voiceHtmlAudioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.setAttribute("playsinline", "true");
      voiceHtmlAudioRef.current = audio;
    }

    return voiceHtmlAudioRef.current;
  };

  const playVoiceBlob = async (blob: Blob) => {
    if (!blob || blob.size < 256) {
      throw new Error("語音音檔內容為空或不完整。");
    }

    const audio = getVoiceHtmlAudio();
    if (!audio) throw new Error("此裝置沒有可用的音訊播放器。");

    const objectUrl = URL.createObjectURL(blob);

    try {
      audio.pause();
      audio.src = objectUrl;
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = 1;
      audio.load();

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let startTimer = 0;

        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          if (startTimer) window.clearTimeout(startTimer);
          audio.onended = null;
          audio.onerror = null;
          error ? reject(error) : resolve();
        };

        audio.onended = () => finish();
        audio.onerror = () => finish(new Error("瀏覽器無法解碼或播放 MP3 音檔。"));

        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(error => finish(error instanceof Error ? error : new Error("瀏覽器拒絕播放音訊。")));
        }

        startTimer = window.setTimeout(() => {
          if (audio.paused || audio.readyState < 2) {
            finish(new Error("瀏覽器未開始播放音訊，可能受到自動播放限制。"));
          }
        }, 4000);
      });

      console.info("語音音檔播放完成", { size: blob.size, type: blob.type || "audio/mpeg" });
    } catch (htmlAudioError) {
      console.warn("HTML Audio 播放失敗，改用 Web Audio 備援:", htmlAudioError);

      const ctx = getVoiceAudioContext();
      if (!ctx) throw htmlAudioError;
      if (ctx.state === "suspended") await ctx.resume();

      const arrayBuffer = await blob.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      await playVoiceBuffer(decodedBuffer);
    } finally {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
    }
  };

  const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));`,
  "added HTML audio primary playback"
);

replaceRequired(
  `          const buffer = await loadVoiceBuffer(nextText);\n          await playVoiceBuffer(buffer);`,
  `          const blob = await fetchVoiceBlob(nextText);\n          if (!blob) throw new Error("未取得語音音檔。");\n          await playVoiceBlob(blob);`,
  "changed reminder queue to HTML audio"
);

replaceRequired(
  `    const ctx = getVoiceAudioContext();\n    if (!ctx) {\n      setCustomAlert({ isOpen: true, message: "此裝置暫時無法播放試聽音訊。" });\n      return;\n    }`,
  `    const audio = getVoiceHtmlAudio();\n    if (!audio) {\n      setCustomAlert({ isOpen: true, message: "此裝置暫時無法播放試聽音訊。" });\n      return;\n    }`,
  "changed preview capability check"
);

replaceRequired(
  `      if (ctx.state === "suspended") {\n        await ctx.resume();\n      }\n\n      const response = await fetch("/api/voice", {`,
  `      const response = await fetch("/api/voice", {`,
  "removed Web Audio-only preview unlock"
);

replaceRequired(
  `      const blob = await response.blob();\n      const arrayBuffer = await blob.arrayBuffer();\n      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));\n      await playVoiceBuffer(decodedBuffer);`,
  `      const blob = await response.blob();\n      await playVoiceBlob(blob);`,
  "changed preview to HTML audio"
);

if (!source.includes("const playVoiceBlob = async (blob: Blob)")) throw new Error("[html-audio] Playback helper verification failed");
if (!source.includes("await playVoiceBlob(blob);")) throw new Error("[html-audio] Playback call verification failed");

fs.writeFileSync(file, source, "utf8");
console.log(changed ? "[html-audio] playback patch applied and verified" : "[html-audio] already applied and verified");
