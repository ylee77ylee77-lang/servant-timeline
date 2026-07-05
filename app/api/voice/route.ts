import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_TTS_MODELS = [
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts"
];

const VOICE_PROFILE_MAP: Record<string, { voice: string; stylePrompt: string }> = {
  young_female: {
    voice: "Leda",
    stylePrompt:
      "Use a youthful, gentle, clear Taiwanese Mandarin female voice. Speak softly as a personal earbud reminder. Slightly slow pace. Do not sound like a broadcast, customer service agent, or command. Read only the reminder text."
  },
  mature_male: {
    voice: "Gacrux",
    stylePrompt:
      "Use a mature, calm, clear Taiwanese Mandarin male voice. Speak softly as a personal earbud reminder. Slightly slow pace. Do not sound like a broadcast or command. Read only the reminder text."
  }
};

const normalizeInput = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

const isProbablyBase64 = (value: string) => {
  if (!value || value.length < 200) return false;
  const sample = value.slice(0, 200);
  return /^[A-Za-z0-9+/=\s]+$/.test(sample);
};

const findAudioBase64 = (value: unknown, parentKey = ""): string | null => {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, any>;

  if (typeof record.output_audio?.data === "string") return record.output_audio.data;
  if (typeof record.outputAudio?.data === "string") return record.outputAudio.data;
  if (typeof record.audio?.data === "string") return record.audio.data;

  if (Array.isArray(record.output)) {
    for (const item of record.output) {
      const found = findAudioBase64(item, "output");
      if (found) return found;
    }
  }

  if (Array.isArray(record.parts)) {
    for (const part of record.parts) {
      if (typeof part.inlineData?.data === "string") return part.inlineData.data;
      if (typeof part.inline_data?.data === "string") return part.inline_data.data;
      const found = findAudioBase64(part, "parts");
      if (found) return found;
    }
  }

  for (const [key, child] of Object.entries(record)) {
    const keyLower = key.toLowerCase();
    const parentKeyLower = parentKey.toLowerCase();

    if (
      typeof child === "string" &&
      keyLower.includes("data") &&
      isProbablyBase64(child) &&
      (
        parentKeyLower.includes("audio") ||
        keyLower.includes("audio") ||
        String(record.type || "").toLowerCase().includes("audio") ||
        String(record.mimeType || record.mime_type || "").toLowerCase().includes("audio") ||
        child.length > 1000
      )
    ) {
      return child;
    }

    if (child && typeof child === "object") {
      const found = findAudioBase64(child, key);
      if (found) return found;
    }
  }

  return null;
};

const createWavFromPcm = (
  pcmBuffer: Buffer,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16
) => {
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
};

const safeJsonPreview = (value: unknown) => {
  try {
    return JSON.stringify(value).slice(0, 1600);
  } catch {
    return String(value).slice(0, 1600);
  }
};

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/voice",
    message: "Gemini voice API route is deployed.",
    hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY)
  });
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "缺少 GEMINI_API_KEY，請先在 Vercel Environment Variables 設定。" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const text = normalizeInput(body.text);
    const voiceProfile = normalizeInput(body.voiceProfile) || "young_female";

    if (!text) {
      return NextResponse.json({ error: "缺少要產生語音的文字。" }, { status: 400 });
    }

    if (text.length > 500) {
      return NextResponse.json({ error: "語音文字過長，請縮短到 500 字以內。" }, { status: 400 });
    }

    const profile = VOICE_PROFILE_MAP[voiceProfile] || VOICE_PROFILE_MAP.young_female;
    const input = `${profile.stylePrompt}

Reminder text:
「${text}」`;

    const attempts: any[] = [];

    for (const model of GEMINI_TTS_MODELS) {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          input,
          response_format: {
            type: "audio"
          },
          generation_config: {
            speech_config: [
              {
                voice: profile.voice
              }
            ]
          }
        })
      });

      const responseText = await response.text();

      if (!response.ok) {
        attempts.push({
          model,
          status: response.status,
          ok: false,
          preview: responseText.slice(0, 800)
        });
        continue;
      }

      let data: any = null;

      try {
        data = JSON.parse(responseText);
      } catch {
        attempts.push({
          model,
          status: response.status,
          ok: true,
          error: "Gemini 回應不是 JSON",
          preview: responseText.slice(0, 800)
        });
        continue;
      }

      const audioBase64 = findAudioBase64(data);

      if (audioBase64) {
        const pcmBuffer = Buffer.from(audioBase64, "base64");
        const wavBuffer = createWavFromPcm(pcmBuffer, 24000, 1, 16);

        return new NextResponse(new Uint8Array(wavBuffer), {
          status: 200,
          headers: {
            "Content-Type": "audio/wav",
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Voice-Profile": voiceProfile,
            "X-Voice-Engine": "gemini",
            "X-Gemini-TTS-Model": model
          }
        });
      }

      attempts.push({
        model,
        status: response.status,
        ok: true,
        error: "Gemini 回應成功，但找不到 output_audio.data。",
        keys: Object.keys(data || {}),
        preview: safeJsonPreview(data)
      });
    }

    return NextResponse.json(
      {
        error: "Gemini 語音產生失敗：沒有取得音訊資料。",
        attempts
      },
      { status: 502 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gemini 語音產生失敗。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
