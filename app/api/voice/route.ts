import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VOICE_PROFILE_MAP: Record<string, { voice: string; instructions: string; speed: number }> = {
  young_female: {
    voice: "shimmer",
    speed: 0.96,
    instructions:
      "使用自然、年輕、溫柔、清楚的台灣繁體中文女性語氣。像戴耳機時在耳邊輕聲提醒，不要像廣播、不要機械、不要催促。語速稍慢，語尾柔和，情緒親切穩定。"
  },
  mature_male: {
    voice: "onyx",
    speed: 0.95,
    instructions:
      "使用成熟、沉穩、清楚的台灣繁體中文男性語氣。像戴耳機時在耳邊穩定提醒，不要像廣播、不要命令、不要機械。語速稍慢，語氣可靠柔和。"
  }
};

const normalizeInput = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new NextResponse("缺少 OPENAI_API_KEY，請先在 Vercel 或 .env.local 設定。", { status: 500 });
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

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: profile.voice,
        input: text,
        instructions: profile.instructions,
        response_format: "mp3",
        speed: profile.speed
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return new NextResponse(errorText || "OpenAI 語音產生失敗。", { status: response.status });
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Voice-Profile": voiceProfile
      }
    });
  } catch (error: any) {
    return new NextResponse(error?.message || "語音產生失敗。", { status: 500 });
  }
}
