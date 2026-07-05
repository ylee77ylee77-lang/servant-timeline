import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";

const VOICE_PROFILE_MAP: Record<string, { voice: string; stylePrompt: string }> = {
  young_female: {
    voice: "Leda",
    stylePrompt:
      "使用年輕、溫柔、清楚、輕柔的台灣華語女性聲音，像戴耳機時在耳邊提醒。語速稍慢，不要像廣播，不要像客服，不要催促，不要加任何多餘文字。"
  },
  mature_male: {
    voice: "Gacrux",
    stylePrompt:
      "使用成熟、沉穩、清楚、溫和的台灣華語男性聲音，像戴耳機時在耳邊穩定提醒。語速稍慢，不要像廣播，不要命令，不要加任何多餘文字。"
  }
};

const normalizeInput = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

const base64ToBuffer = (value: string) => Buffer.from(value, "base64");

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

const findAudioBase64 = (value: unknown): string | null => {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, any>;

  if (typeof record.output_audio?.data === "string") return record.output_audio.data;
  if (typeof record.outputAudio?.data === "string") return record.outputAudio.data;

  if (Array.isArray(record.output)) {
    for (const item of record.output) {
      const found = findAudioBase64(item);
      if (found) return found;
    }
  }

  if (Array.isArray(record.parts)) {
    for (const part of record.parts) {
      if (typeof part.inlineData?.data === "string") return part.inlineData.data;
      if (typeof part.inline_data?.data === "string") return part.inline_data.data;
    }
  }

  for (const child of Object.values(record)) {
    if (child && typeof child === "object") {
      const found = findAudioBase64(child);
      if (found) return found;
    }
  }

  return null;
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
      return new NextResponse("缺少 GEMINI_API_KEY，請先在 Vercel Environment Variables 設定。", { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const text = normalizeInput(body.text);
    const voiceProfile = normalizeInput(body.voiceProfile) || "young_female";

    if (!text) {
      return new NextResponse("缺少要產生語音的文字。", { status: 400 });
    }

    if (text.length > 500) {
      return new NextResponse("語音文字過長，請縮短到 500 字以內。", { status: 400 });
    }

    const profile = VOICE_PROFILE_MAP[voiceProfile] || VOICE_PROFILE_MAP.young_female;
    const input = `${profile.stylePrompt}\n\n請只朗讀以下引號內文字：\n「${text}」`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
        "Api-Revision": "2026-05-20"
      },
      body: JSON.stringify({
        model: GEMINI_TTS_MODEL,
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

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return new NextResponse(errorText || "Gemini 語音產生失敗。", { status: response.status });
    }

    const data = await response.json();
    const audioBase64 = findAudioBase64(data);

    if (!audioBase64) {
      return NextResponse.json(
        {
          error: "Gemini 回應中找不到音訊資料。",
          rawKeys: Object.keys(data || {})
        },
        { status: 502 }
      );
    }

    const pcmBuffer = base64ToBuffer(audioBase64);
    const wavBuffer = createWavFromPcm(pcmBuffer, 24000, 1, 16);

    return new NextResponse(new Uint8Array(wavBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Voice-Profile": voiceProfile,
        "X-Voice-Engine": "gemini"
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gemini 語音產生失敗。";
    return new NextResponse(message, { status: 500 });
  }
}
