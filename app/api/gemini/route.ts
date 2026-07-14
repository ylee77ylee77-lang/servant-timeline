import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, systemInstruction, responseSchema } = body;

    // 從 Vercel 環境變數中讀取您的 Gemini API 金鑰
    // 請務必在 Vercel 專案的 Settings -> Environment Variables 中設定 GEMINI_API_KEY
    const apiKey = process.env.GEMINI_API_KEY; 
    
    if (!apiKey) {
      return NextResponse.json({ error: "伺服器未設定 Gemini API 金鑰 (GEMINI_API_KEY)" }, { status: 500 });
    }

    // 呼叫 Google 官方 API (正式環境使用)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const payload: any = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] }
    };

    // 如果有 Schema 限制 (用於 Checklist 產生器)，則一併送出
    if (responseSchema) {
      payload.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.text();
      throw new Error(`Gemini API 回應錯誤: ${res.status} ${errData}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    return NextResponse.json({ text: text?.trim() });
  } catch (error: any) {
    console.error("伺服器端 Gemini API 發生錯誤:", error);
    return NextResponse.json({ error: error.message || "伺服器內部錯誤" }, { status: 500 });
  }
}
