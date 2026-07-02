"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  Check, 
  Clock, 
  MapPin, 
  User, 
  BarChart2, 
  ListTodo,
  AlertCircle,
  Settings, 
  Plus,        
  Trash2,
  X,        
  Info,
  Sparkles,
  HeartHandshake,
  Edit,
  Lock,
  Unlock,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Volume2,
  VolumeX,
  Mic,    
  MicOff,
  Loader2 
} from 'lucide-react';

// 1. 您的專屬雲端鑰匙 (維持原樣)
const supabaseUrl = 'https://mhltzoirtzoiinuaauwy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obHR6b2lydHpvaWludWFhdXd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3Njk5NTcsImV4cCI6MjA5NzM0NTk1N30.eS_ZJlyDGuAMjBmAA8gxHcSgjxgzm9PdID8Zolvxdtc';

const hasValidKeys = supabaseUrl.startsWith('http') && supabaseAnonKey.startsWith('eyJ');

// 使用原生 fetch 方法連線雲端 (維持原樣)
const supabaseFetch = async (endpoint: string, method = 'GET', body: any = null) => {
  if (!hasValidKeys) throw new Error("Missing keys");
  const headers: any = {
    'apikey': supabaseAnonKey,
    'Authorization': `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${endpoint}`, options);
    if (!res.ok) {
      let errMessage = res.statusText;
      try {
        const errData = await res.json();
        if (errData.message) errMessage = errData.message;
      } catch (e) {}
      throw new Error(errMessage);
    }
    if (method === 'DELETE') return true;
    return await res.json();
  } catch (err: any) {
    throw new Error(err.message || "網路連線失敗，或遭到瀏覽器阻擋");
  }
};

// 系統外部輔助計算完成率 (防範 esbuild 等編譯器將除法斜線誤判為正規表示法開頭)
const calculateRate = (completedCount: number, totalCount: number): number => {
  if (!totalCount || totalCount === 0) return 0;
  return Math.round((completedCount * 100) / totalCount);
};

export default function App() {
  const [nodes, setNodes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [activeTab, setActiveTab] = useState('checkin');
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const activeNodeRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const nodeMarkerRefs = useRef<{ [nodeId: string]: HTMLDivElement | null }>({});
  const lastTaskBlockIdRef = useRef<string | null>(null);
  const taskBlockNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentTimeCursorTop, setCurrentTimeCursorTop] = useState<number | null>(null);
  const [taskBlockNotice, setTaskBlockNotice] = useState("");

  const [detailModal, setDetailModal] = useState<{isOpen: boolean, title: string, details: string}>({isOpen: false, title: '', details: ''});

  const [currentService, setCurrentService] = useState('主一堂'); 
  const serviceOptions = ['六晚崇', '主一堂', '主二堂'];

  // --- 報到 / 崗位 UI 狀態 ---
  // 這一版先完成報到前端流程；正式密碼雜湊、Wi-Fi 驗證與 Supabase 報到紀錄會接在下一階段。
  const CHECKIN_PROFILE_STORAGE_KEY = "shekinah_checkin_profile_v1";
  const [checkinProfile, setCheckinProfile] = useState({
    name: "",
    phoneLast4: "",
    deviceRemembered: false
  });
  const [checkinForm, setCheckinForm] = useState({
    name: "",
    phoneLast4: "",
    password: "",
    confirmPassword: ""
  });
  const [resetPasswordForm, setResetPasswordForm] = useState({
    name: "",
    phoneLast4: "",
    resetCode: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [wifiVerified, setWifiVerified] = useState(false);
  const [checkinStatus, setCheckinStatus] = useState<"not_checked_in" | "checked_in" | "station_confirmed">("not_checked_in");
  const [checkedInAt, setCheckedInAt] = useState("");
  const [checkedInService, setCheckedInService] = useState("");
  const [confirmedStation, setConfirmedStation] = useState("");
  
  const hasManuallySwitchedRef = useRef(false);

  // --- 權限鎖定相關狀態 ---
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const ADMIN_PASSWORD = '1234'; // 管理員驗證密碼

  // --- 自訂精美 Modal 提示框狀態 ---
  const [customAlert, setCustomAlert] = useState<{isOpen: boolean, message: string}>({ isOpen: false, message: "" });
  const [customConfirm, setCustomConfirm] = useState<{isOpen: boolean, message: string, onConfirm: () => void}>({ isOpen: false, message: "", onConfirm: () => {} });

  // --- 管理與編輯任務狀態 ---
  const [isAdding, setIsAdding] = useState(false);
  const [newNode, setNewNode] = useState({
    service_type: '主一堂', 
    time: '08:00',
    title: '',
    assignee: '',
    location: '',
    details: ''
  });

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    service_type: '主一堂',
    time: '08:00',
    title: '',
    assignee: '',
    location: '',
    details: ''
  });

  // --- 行內即時修改（Inline Editing）狀態 ---
  const [activeInlineEdit, setActiveInlineEdit] = useState<{ type: 'node' | 'checklist', id: string, field: string } | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState("");

  // --- 展開折疊管理確認項目狀態 (Accordion) ---
  const [expandedChecklistNodeId, setExpandedChecklistNodeId] = useState<string | null>(null);
  const [newChecklistItem, setNewChecklistItem] = useState({ text: "", details: "" });
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  // --- 【語音與自動報時相關狀態】 ---
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false); // 預設關閉自動報時
  const [isListening, setIsListening] = useState(false); // 麥克風聆聽狀態
  const [isThinking, setIsThinking] = useState(false); // AI 思考狀態
  const [voiceResultText, setVoiceResultText] = useState(""); // 語音指令解析文字回饋
  const [recognition, setRecognition] = useState<any>(null); // SpeechRecognition 實例
  const announcedNodesRef = useRef<Set<string>>(new Set()); // 紀錄已報時的任務，避免重複廣播

  // --- 【Gemini API 服事智慧生成狀態】 ---
  const [aiSuggestions, setAiSuggestions] = useState<{ [nodeId: string]: any[] }>({}); // AI 推薦 Checklist
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState<string | null>(null); // 正在生成建議的 nodeId

  // --- 【我的提醒｜個人設定】 ---
  // 設定會記憶在同一台裝置、同一個瀏覽器中，不需要登入。
  const PERSONAL_REMINDER_STORAGE_KEY = "shekinah_personal_reminder_settings_v1";

  const isCommunionWeek = (date = new Date()) => {
    const serviceDate = new Date(date);

    // 週六晚崇若隔天是該月份第一個週日，也算隔月第一週聖餐週。
    if (serviceDate.getDay() === 6) {
      const nextDay = new Date(serviceDate);
      nextDay.setDate(serviceDate.getDate() + 1);
      const firstSunday = new Date(nextDay.getFullYear(), nextDay.getMonth(), 1);
      while (firstSunday.getDay() !== 0) firstSunday.setDate(firstSunday.getDate() + 1);
      return nextDay.toDateString() === firstSunday.toDateString();
    }

    if (serviceDate.getDay() === 0) {
      const firstSunday = new Date(serviceDate.getFullYear(), serviceDate.getMonth(), 1);
      while (firstSunday.getDay() !== 0) firstSunday.setDate(firstSunday.getDate() + 1);
      return serviceDate.toDateString() === firstSunday.toDateString();
    }

    return false;
  };

  const baseRoleOptions = [
    "總招",
    "副總招",
    "專招",
    "牧招"
  ];

  const roleOptions = isCommunionWeek(currentDate || new Date())
    ? [...baseRoleOptions, "聖餐助手"]
    : baseRoleOptions;

  const [personalSettings, setPersonalSettings] = useState({
    name: "",
    role: "總招",
    voiceReminderEnabled: true,
    vibrationReminderEnabled: true,
    reminderPre5Enabled: true,
    reminderNowEnabled: true,
    voiceDetailLevel: "standard" as "simple" | "standard" | "detailed"
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = window.localStorage.getItem(PERSONAL_REMINDER_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setPersonalSettings(prev => ({
          ...prev,
          ...parsed,
          role: parsed.role === "總召"
            ? "總招"
            : parsed.role === "副總召"
              ? "副總招"
              : (parsed.role || "總招"),
          vibrationReminderEnabled: parsed.vibrationReminderEnabled !== false,
          voiceDetailLevel: parsed.voiceDetailLevel || "standard"
        }));
      }
    } catch (err) {
      console.error("讀取個人提醒設定失敗:", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = window.localStorage.getItem(CHECKIN_PROFILE_STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      setCheckinProfile({
        name: parsed.name || "",
        phoneLast4: parsed.phoneLast4 || "",
        deviceRemembered: parsed.deviceRemembered === true
      });

      if (parsed.name) {
        setPersonalSettings(prev => ({
          ...prev,
          name: parsed.name
        }));
      }
    } catch (err) {
      console.error("讀取報到身分失敗:", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!checkinProfile.name || !checkinProfile.phoneLast4) return;

    try {
      window.localStorage.setItem(CHECKIN_PROFILE_STORAGE_KEY, JSON.stringify(checkinProfile));
    } catch (err) {
      console.error("儲存報到身分失敗:", err);
    }
  }, [checkinProfile]);

  const updatePersonalSettings = (patch: Partial<typeof personalSettings>) => {
    setPersonalSettings(prev => ({ ...prev, ...patch }));
  };

  const normalizeText = (value: any) => String(value || "").toLowerCase();

  const taskSearchText = (node: any) => normalizeText([
    node.title,
    node.assignee,
    node.location,
    node.details
  ].join(" "));

  const textContainsAny = (text: string, keywords: string[]) => {
    return keywords.some(keyword => text.includes(normalizeText(keyword)));
  };

  const getRoleKeywords = (role: string) => {
    const map: { [key: string]: string[] } = {
      "總招": ["總招", "總召", "總招待", "總招工作"],
      "副總招": ["副總招", "副總召", "三樓", "3樓", "3f", "三層"],
      "專招": ["專招", "總招", "副總招", "電梯專招", "手扶梯專招", "外場專招", "大堂專招"],
      "牧招": ["牧招", "區塊牧招", "區塊", "1A", "1B", "2A", "2B", "2C", "3A", "3B", "3C", "4A", "4B", "4C", "5", "6", "7A", "7B", "8", "9A", "10"],
      "聖餐助手": ["聖餐助手", "聖餐", "餅杯", "發餅", "發杯", "領杯", "領餅"]
    };

    return map[role] || [role];
  };

  const isThirdFloorTask = (node: any) => {
    return textContainsAny(taskSearchText(node), ["三樓", "3樓", "3f", "三層"]);
  };

  const isNodeForCurrentPerson = (node: any) => {
    const role = personalSettings.role || "總招";

    if (role === "總招") return true;

    if (role === "副總招") {
      return isThirdFloorTask(node) || textContainsAny(taskSearchText(node), ["副總招", "副總召"]);
    }

    return textContainsAny(taskSearchText(node), getRoleKeywords(role));
  };


  // 為語音問答與時間軸綁定最新的狀態 Ref，防範閉包快照問題
  const filteredNodesRef = useRef<any[]>([]);
  const currentTimeRef = useRef<string>("");

  useEffect(() => {
    filteredNodesRef.current = nodes
      .filter(n => n.service_type === currentService)
      .filter(isNodeForCurrentPerson);
  }, [nodes, currentService, personalSettings.role, personalSettings.name]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // 預先載入瀏覽器語音包
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // 溫柔女聲報時函數
  const speak = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    
    // 如果有正在播放的聲音，先暫停避免重疊
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW';
    utterance.rate = 0.85; 
    utterance.pitch = 1.2; 
    utterance.volume = 0.85;

    const voices = window.speechSynthesis.getVoices();
    
    // 優先尋找台灣繁體女聲
    const femaleVoice = voices.find(v => 
      v.lang.includes('zh-TW') && 
      (v.name.includes('Hanhan') || v.name.includes('Yating') || v.name.includes('Mei-Jia') || v.name.includes('Google'))
    );

    if (femaleVoice) {
      utterance.voice = femaleVoice;
    } else {
      const anyZh = voices.find(v => v.lang.includes('zh'));
      if (anyZh) utterance.voice = anyZh;
    }

    window.speechSynthesis.speak(utterance);
  };

  // --- Gemini API 指令產生器 (內嵌夏凱納招待處專業知識庫) ---
  const generateSystemInstruction = (currentService: string, currentTime: string, nodes: any[]) => {
    const serializedNodes = JSON.stringify(nodes.map(n => ({
      time: n.time,
      title: n.title,
      assignee: n.assignee,
      location: n.location,
      details: n.details,
      checklist: (n.checklist || []).map((c: any) => ({ text: c.text, details: c.details, completed: c.is_completed }))
    })));

    return `你現在是「夏凱納靈糧堂」主日崇拜招待處的 AI 智慧語音助理。
你的名字叫「招待助理」，說話語氣溫柔、熱情、有禮貌、充滿神的愛（常在合適時機說「歡迎回家」或「平安」）。
請根據目前提供的即時數據與夏凱納招待處的專業領域知識，回答使用者的口語問題。

【當前即時系統數據】：
- 目前堂次：${currentService}
- 目前時間：${currentTime}
- 當前所有排定任務與細項資料 (JSON)：${serializedNodes}

【夏凱納招待處專業知識庫（若使用者問到，請以此回答）】：
1. 奉獻袋準備數量：
   - 六晚崇（週六晚堂崇拜）：需要預備 4 個奉獻袋。
   - 主一堂（週日上午第一堂）：需要預備 6 個奉獻袋。
   - 主二堂（週日上午第二堂）：需要預備 8 個奉獻袋。
2. 聖餐用品預備：
   - 聖餐主日時，各堂次聖餐杯與無酵餅數量比照奉獻袋規格或依組長指示。
   - 聖餐同工需在聚會開始前 30 分鐘，將聖餐桌布置完畢並擺放就位。
3. 崗位分工與主要職責：
   - 門口迎賓：熱情微笑、揮手說「平安、歡迎回家」，注意協助行動不便者引導至電梯。
   - 發放週報：雙手遞交週報，指引大堂入口。
   - 大堂指引：引導會友從後排或兩側走道依序向前就座，保持走道通暢。
   - 奉獻服事：負責收取奉獻，收取完後交由出納同工至財務室清點。
4. 新朋友引導：
   - 指引他們填寫新友留名卡，並引導至 1F 的「新友歡迎交誼區」，由關懷同工陪伴。
5. 安全與緊急狀況：
   - 如遇緊急身體不適，請立即通知 1F 保全服務台。

【回答規則】：
1. 請用繁體中文回答。
2. 回答必須非常簡短、精煉、生活化（1至2句話內，不要冗長），因為回答會被語音朗讀。
3. 絕對不要使用任何 Markdown 標記（如 **、*、###、- 等），請輸出乾淨的純文字。`;
  };

  // --- Gemini API 指令重試呼召 (安全後端防禦與沙盒相容機制) ---
  const callGeminiWithRetry = async (
    prompt: string, 
    systemInstruction: string, 
    retries = 5, 
    delay = 1000,
    responseSchema: any = null
  ): Promise<string> => {
    
    // 智慧檢測是否處於 Canvas 預覽沙盒，如果是則維持直連以保證預覽功能不中斷
    const isPreviewEnvironment = typeof window !== 'undefined' && window.location.hostname.includes('googleusercontent.com');

    if (isPreviewEnvironment) {
      const apiKey = ""; // 執行環境會在運行時自動注入此 Key
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      
      const payload: any = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] }
      };

      if (responseSchema) {
        payload.generationConfig = {
          responseMimeType: "application/json",
          responseSchema: responseSchema
        };
      }

      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text.trim();
          }
        } catch (e) {}
        if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
      throw new Error("Gemini API 呼叫失敗 (預覽環境)");
    }

    // --- 正式環境（Vercel 等）：呼叫同專案的後端 API Route，保護金鑰安全 ---
    const url = `/api/gemini`;
    const payload: any = { prompt, systemInstruction, responseSchema };

    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.text) return data.text;
          if (data.error) throw new Error(data.error);
        }
      } catch (e) {
        // 靜默重試
      }
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
    throw new Error("正式環境 Gemini API 呼叫失敗，請確認環境變數 GEMINI_API_KEY 是否正確設定");
  };

  // --- Gemini API 生成建議 Checklist ---
  const handleGenerateAIChecklist = async (node: any) => {
    setIsGeneratingSuggestions(node.id);
    try {
      const systemPrompt = "你是一位極其專業、貼心的教會主日招待長執，擅長為各項服事任務規劃具體可行的實行細節項目。";
      const prompt = `請針對以下招待任務：
      - 堂次：${node.service_type}
      - 任務名稱：${node.title}
      - 負責角色：${node.assignee}
      - 地點：${node.location}
      - 任務備註：${node.details || "無"}

      請自動推薦 3 個最具體、最重要的現場確認細項（Checklist items）。
      每項都需要有簡短的名字（text，限 15 字以內）以及詳細的提醒引導（details，限 40 字以內，語氣溫和親切，例如「帶有微笑迎接每位會友」）。`;

      const schema = {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            text: { type: "STRING" },
            details: { type: "STRING" }
          },
          required: ["text", "details"]
        }
      };

      const jsonResponse = await callGeminiWithRetry(prompt, systemPrompt, 5, 1000, schema);
      const parsed = JSON.parse(jsonResponse);
      if (Array.isArray(parsed)) {
        setAiSuggestions(prev => ({ ...prev, [node.id]: parsed }));
        speak("已經為您生成了三項貼心的服事建議細項，請您過目！");
      }
    } catch (error: any) {
      setCustomAlert({ isOpen: true, message: "AI 建議生成失敗：" + error.message });
    } finally {
      setIsGeneratingSuggestions(null);
    }
  };

  // 將 AI 建議項目寫入 Supabase
  const handleAddSuggestedItem = async (nodeId: string, suggestion: { text: string, details: string }) => {
    const node = nodes.find(n => n.id === nodeId);
    const maxOrder = node?.checklist && node.checklist.length > 0 
      ? Math.max(...node.checklist.map((c: any) => c.sort_order || 0)) 
      : -1;

    const newItemId = 'c_' + Math.random().toString(36).substr(2, 9);
    try {
      await supabaseFetch('checklist_items', 'POST', {
        id: newItemId,
        node_id: nodeId,
        text: suggestion.text,
        details: suggestion.details,
        is_completed: false,
        sort_order: maxOrder + 1
      });
      // 移除已新增的本地建議
      setAiSuggestions(prev => {
        const current = prev[nodeId] || [];
        const filtered = current.filter(item => item.text !== suggestion.text);
        return { ...prev, [nodeId]: filtered };
      });
      fetchData(true);
    } catch (err: any) {
      setCustomAlert({ isOpen: true, message: "新增確認項目失敗：" + err.message });
    }
  };

  // 一鍵匯入所有建議
  const handleAddAllSuggestions = async (nodeId: string) => {
    const suggestions = aiSuggestions[nodeId] || [];
    if (suggestions.length === 0) return;

    const node = nodes.find(n => n.id === nodeId);
    let currentMaxOrder = node?.checklist && node.checklist.length > 0 
      ? Math.max(...node.checklist.map((c: any) => c.sort_order || 0)) 
      : -1;

    try {
      for (const item of suggestions) {
        currentMaxOrder += 1;
        const newItemId = 'c_' + Math.random().toString(36).substr(2, 9);
        await supabaseFetch('checklist_items', 'POST', {
          id: newItemId,
          node_id: nodeId,
          text: item.text,
          details: item.details,
          is_completed: false,
          sort_order: currentMaxOrder
        });
      }
      setAiSuggestions(prev => {
        const updated = { ...prev };
        delete updated[nodeId];
        return updated;
      });
      fetchData(true);
      setCustomAlert({ isOpen: true, message: "已成功將所有 AI 推薦項目匯入至任務清單！" });
    } catch (err: any) {
      setCustomAlert({ isOpen: true, message: "匯入建議失敗：" + err.message });
    }
  };

  // --- 本地語義意圖 Fallback 機制 (在斷網、API 出錯時自動接管) ---
  const handleLocalVoiceCommandFallback = (commandText: string) => {
    const text = commandText.toLowerCase().trim();
    const currentNodes = filteredNodesRef.current;

    if (currentNodes.length === 0) {
      speak("目前這個場次，沒有安排任何服事任務喔。");
      return;
    }

    if (text.includes("現在") || text.includes("目前") || text.includes("當前") || text.includes("現在的任務")) {
      const activeId = getActiveNodeIdByTime();
      const activeNode = currentNodes.find(n => n.id === activeId);
      
      if (activeNode) {
        speak(`現在時間是 ${currentTimeRef.current}。目前正在進行的服事任務是：「${activeNode.title}」。負責人是：「${activeNode.assignee}」，地點在：「${activeNode.location}」。`);
      } else {
        speak(`現在時間是 ${currentTimeRef.current}，目前時間點沒有安排特定服事任務喔。`);
      }
    } 
    else if (text.includes("接下來") || text.includes("下一個") || text.includes("等一下") || text.includes("稍後")) {
      const activeId = getActiveNodeIdByTime();
      const sorted = [...currentNodes].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
      const activeIdx = sorted.findIndex(n => n.id === activeId);

      if (activeIdx !== -1 && activeIdx < sorted.length - 1) {
        const nextNode = sorted[activeIdx + 1];
        speak(`下一個服事任務將在 ${nextNode.time} 開始。任務是：「${nextNode.title}」。由「${nextNode.assignee}」負責，在「${nextNode.location}」進行。`);
      } else {
        speak("接下來已經沒有其他服事任務囉。大家今天辛苦了，歡迎回家！");
      }
    } 
    else if (text.includes("今天") || text.includes("全部") || text.includes("所有") || text.includes("流程")) {
      speak(`今天這堂服事一共安排了 ${currentNodes.length} 個任務流程，您可以透過今日流程查看完整的時間軸。`);
    } 
    else if (text.includes("進度") || text.includes("完成") || text.includes("狀況")) {
      const allTasks = currentNodes.flatMap(n => n.checklist || []);
      const completedTasks = allTasks.filter(t => t.is_completed);
      const rate = calculateRate(completedTasks.length, allTasks.length);
      speak(`目前服事進度：總共 ${allTasks.length} 個確認細項，已完成 ${completedTasks.length} 項，整體完成率為百分之 ${rate}。`);
    }
    else if (text.includes("奉獻") && text.includes("袋")) {
      if (currentService === "六晚崇") {
        speak("週六晚崇拜需要準備 4 個奉獻袋。");
      } else if (currentService === "主一堂") {
        speak("主日第一堂崇拜需要準備 6 個奉獻袋。");
      } else {
        speak("主日第二堂崇拜需要準備 8 個奉獻袋。");
      }
    }
    else {
      speak(`我聽到了「${commandText}」，但我不太明白意思。您可以試著問我：「現在要做什麼？」或者「接下來要做什麼？」`);
    }
  };

  // --- AI 智慧語音指令核心入口 ---
  const handleVoiceCommand = async (commandText: string) => {
    setIsThinking(true);
    try {
      const instruction = generateSystemInstruction(currentService, currentTimeRef.current, filteredNodesRef.current);
      const response = await callGeminiWithRetry(commandText, instruction);
      speak(response);
    } catch (err) {
      console.error("Gemini AI 語音理解失敗，改用本地關鍵字比對 fallback", err);
      handleLocalVoiceCommandFallback(commandText);
    } finally {
      setIsThinking(false);
    }
  };

  // --- 語音辨識初始化與控制邏輯 ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        const rec = new SpeechRecognitionClass();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'zh-TW';

        rec.onstart = () => {
          setIsListening(true);
        };

        rec.onend = () => {
          setIsListening(false);
        };

        rec.onerror = (event: any) => {
          console.error("語音辨識出錯", event.error);
          setIsListening(false);
          if (event.error === 'not-allowed') {
            setCustomAlert({ isOpen: true, message: "語音助理需要麥克風使用權限，請於瀏覽器中允許麥克風權限後重試！" });
          }
        };

        rec.onresult = async (event: any) => {
          const transcript = event.results[0][0].transcript;
          setVoiceResultText(transcript);
          setIsListening(false); 
          await handleVoiceCommand(transcript);
          
          setTimeout(() => {
            setVoiceResultText("");
          }, 4000);
        };

        setRecognition(rec);
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognition) {
      setCustomAlert({ isOpen: true, message: "您的裝置或瀏覽器不支援語音助理功能。建議使用 Google Chrome 或 Edge 瀏覽器！" });
      return;
    }
    if (isListening) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (err) {
        console.error(err);
      }
    }
  };

  // 確保時鐘即時更新，並加入自動切換邏輯
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const newTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setCurrentDate(now);
      setCurrentTime(newTimeStr);

      if (!hasManuallySwitchedRef.current) {
        const day = now.getDay(); 
        const timeValue = now.getHours() + (now.getMinutes() / 60); 

        if (day === 6) {
          setCurrentService('六晚崇');
        } else if (day === 0) {
          if (timeValue < 10.5) { 
            setCurrentService('主一堂');
          } else { 
            setCurrentService('主二堂');
          }
        }
      }
    };
    
    updateTime(); 
    const timer = setInterval(updateTime, 1000); 
    return () => clearInterval(timer);
  }, []);

  // --- 【整合自動化】自動語音報時核心觸發邏輯 ---
  // 自動報時開啟時，會同時尊重：
  // 1. 個人設定：角色篩選、語音提醒、5分鐘前、準點、語音內容
  // 2. 不提醒未完成，避免造成現場壓力
  useEffect(() => {
    if (!isVoiceEnabled || !currentTime || nodes.length === 0 || !personalSettings.voiceReminderEnabled) return;

    const currentMinutes = timeToMinutes(currentTime);
    const currentServiceNodes = nodes
      .filter(n => n.service_type === currentService)
      .filter(isNodeForCurrentPerson);

    currentServiceNodes.forEach((node) => {
      const settings = getReminderSettings(node);
      if (!settings.voiceReminderEnabled) return;

      const nodeMinutes = timeToMinutes(node.time);
      const minutesBeforeTask = nodeMinutes - currentMinutes;

      let reminderType: "pre5" | "now" | null = null;

      if (minutesBeforeTask === 5 && settings.reminderPre5Enabled && personalSettings.reminderPre5Enabled) {
        reminderType = "pre5";
      } else if (minutesBeforeTask === 0 && settings.reminderNowEnabled && personalSettings.reminderNowEnabled) {
        reminderType = "now";
      }

      if (!reminderType) return;

      const announceId = `${node.id}-${reminderType}-${personalSettings.role}`;

      if (announcedNodesRef.current.has(announceId)) return;

      announcedNodesRef.current.add(announceId);
      speak(buildReminderSpeechText(node, reminderType));
    });

    if (currentTime === "00:00") {
      announcedNodesRef.current.clear();
    }
  }, [
    currentTime,
    isVoiceEnabled,
    nodes,
    currentService,
    personalSettings.role,
    personalSettings.name,
    personalSettings.voiceReminderEnabled,
    personalSettings.reminderPre5Enabled,
    personalSettings.reminderNowEnabled,
    personalSettings.voiceDetailLevel
  ]);

  const fetchData = async (isBackgroundSync = false) => {
    try {
      if (!isBackgroundSync) setFetchError("");
      const nodesData = await supabaseFetch('timeline_nodes?order=time.asc');
      const checklistData = await supabaseFetch('checklist_items?order=sort_order.asc,id.asc');

      if (nodesData && checklistData) {
        const formattedNodes = nodesData.map((node: any) => ({
          ...node,
          voice_reminder_enabled: node.voice_reminder_enabled !== false,
          reminder_pre5_enabled: node.reminder_pre5_enabled !== false,
          reminder_now_enabled: node.reminder_now_enabled !== false,
          checklist: checklistData.filter((c: any) => c.node_id === node.id)
        }));
        setNodes(formattedNodes);
      }
    } catch (error: any) {
      console.error("讀取資料失敗:", error);
      if (!isBackgroundSync) setFetchError(error.message);
    } finally {
      if (!isBackgroundSync) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (hasValidKeys) {
      fetchData(); 
      const syncTimer = setInterval(() => {
        fetchData(true); 
      }, 10000);
      return () => clearInterval(syncTimer); 
    } else {
      setIsLoading(false);
    }
  }, []);

  const serviceNodes = nodes.filter(n => n.service_type === currentService);
  const filteredNodes = serviceNodes.filter(isNodeForCurrentPerson);
  const adminNodes = serviceNodes;
  const isNodeCompleted = (node: any) => node.checklist && node.checklist.length > 0 && node.checklist.every((c: any) => c.is_completed);

  const timeToMinutes = (tStr: string) => {
    if (!tStr) return 0;
    const [h, m] = tStr.split(':').map(Number);
    return h * 60 + m;
  };

  const getActiveNodeIdByTime = () => {
    if (filteredNodes.length === 0) return null;
    const currentMinutes = timeToMinutes(currentTime);
    const sortedNodes = [...filteredNodes].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    if (currentMinutes < timeToMinutes(sortedNodes[0].time)) {
      return sortedNodes[0].id;
    }

    for (let i = 0; i < sortedNodes.length; i++) {
      const nodeMin = timeToMinutes(sortedNodes[i].time);
      const nextNodeMin = sortedNodes[i + 1] ? timeToMinutes(sortedNodes[i + 1].time) : Infinity;

      if (currentMinutes >= nodeMin && currentMinutes < nextNodeMin) {
        return sortedNodes[i].id;
      }
    }

    return sortedNodes[sortedNodes.length - 1].id;
  };

  const activeNodeId = getActiveNodeIdByTime();

  const triggerVibration = (pattern: number | number[]) => {
    if (!personalSettings.vibrationReminderEnabled) return;
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;

    try {
      navigator.vibrate(pattern);
    } catch (err) {
      console.warn("震動提醒未能啟動:", err);
    }
  };

  const getTaskBlockVibrationPattern = (node: any) => {
    const text = `${node?.title || ""} ${node?.location || ""} ${node?.details || ""}`;

    if (
      text.includes("就位") ||
      text.includes("聖餐") ||
      text.includes("散場") ||
      text.includes("漏排") ||
      text.includes("多排") ||
      text.includes("支援")
    ) {
      return [200, 100, 200];
    }

    return 200;
  };

  useEffect(() => {
    if (!currentTime || !activeNodeId || filteredNodes.length === 0) return;

    if (lastTaskBlockIdRef.current === null) {
      lastTaskBlockIdRef.current = activeNodeId;
      return;
    }

    if (lastTaskBlockIdRef.current === activeNodeId) return;

    const currentNode = filteredNodes.find((node: any) => node.id === activeNodeId);
    lastTaskBlockIdRef.current = activeNodeId;

    if (!currentNode) return;

    triggerVibration(getTaskBlockVibrationPattern(currentNode));

    setTaskBlockNotice(`已進入下一個任務區塊：${currentNode.title || "服事任務"}`);

    if (taskBlockNoticeTimerRef.current) {
      clearTimeout(taskBlockNoticeTimerRef.current);
    }

    taskBlockNoticeTimerRef.current = setTimeout(() => {
      setTaskBlockNotice("");
    }, 6000);

    return () => {
      if (taskBlockNoticeTimerRef.current) {
        clearTimeout(taskBlockNoticeTimerRef.current);
      }
    };
  }, [
    activeNodeId,
    currentTime,
    filteredNodes.length,
    personalSettings.vibrationReminderEnabled
  ]);


  const getCurrentMinuteValue = () => {
    const now = currentDate || new Date();
    return now.getHours() * 60 + now.getMinutes() + (now.getSeconds() / 60);
  };

  useEffect(() => {
    if (activeTab !== 'timeline' || filteredNodes.length === 0 || !timelineContainerRef.current) {
      setCurrentTimeCursorTop(null);
      return;
    }

    const sortedNodes = [...filteredNodes].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    const currentMinutes = getCurrentMinuteValue();

    let previousNode = sortedNodes[0];
    let nextNode = sortedNodes[0];
    let progressRatio = 0;

    if (currentMinutes <= timeToMinutes(sortedNodes[0].time)) {
      previousNode = sortedNodes[0];
      nextNode = sortedNodes[0];
      progressRatio = 0;
    } else if (currentMinutes >= timeToMinutes(sortedNodes[sortedNodes.length - 1].time)) {
      previousNode = sortedNodes[sortedNodes.length - 1];
      nextNode = sortedNodes[sortedNodes.length - 1];
      progressRatio = 0;
    } else {
      for (let i = 0; i < sortedNodes.length - 1; i++) {
        const startMin = timeToMinutes(sortedNodes[i].time);
        const endMin = timeToMinutes(sortedNodes[i + 1].time);

        if (currentMinutes >= startMin && currentMinutes <= endMin) {
          previousNode = sortedNodes[i];
          nextNode = sortedNodes[i + 1];
          progressRatio = endMin === startMin ? 0 : (currentMinutes - startMin) / (endMin - startMin);
          break;
        }
      }
    }

    const containerRect = timelineContainerRef.current.getBoundingClientRect();
    const previousMarker = nodeMarkerRefs.current[previousNode.id];
    const nextMarker = nodeMarkerRefs.current[nextNode.id];

    if (!previousMarker || !nextMarker) {
      setCurrentTimeCursorTop(null);
      return;
    }

    const getMarkerCenterY = (el: HTMLDivElement) => {
      const rect = el.getBoundingClientRect();
      return rect.top - containerRect.top + (rect.height / 2);
    };

    const previousY = getMarkerCenterY(previousMarker);
    const nextY = getMarkerCenterY(nextMarker);
    const cursorY = previousY + ((nextY - previousY) * progressRatio);

    setCurrentTimeCursorTop(cursorY);
  }, [
    activeTab,
    currentDate,
    currentService,
    nodes,
    filteredNodes.length,
    personalSettings.role,
    personalSettings.name
  ]);


  const formatMinutesText = (minutes: number) => {
    if (minutes <= 0) return "現在";
    if (minutes < 60) return `${minutes} 分鐘後`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours} 小時後`;
    return `${hours} 小時 ${mins} 分鐘後`;
  };

  const buildChecklistSummary = (node: any) => {
    const checklist = (node.checklist || [])
      .map((item: any) => item.text)
      .filter(Boolean)
      .slice(0, 3);

    if (checklist.length === 0) return "";

    return `確認事項：${checklist.join("、")}。`;
  };

  const buildReminderSpeechText = (node: any, reminderType: "pre5" | "now") => {
    const title = node.title || "服事任務";
    const assignee = node.assignee || "未指定";
    const location = node.location || "未指定";
    const detailText = node.details ? `任務提示：${node.details}。` : "";
    const checklistText = buildChecklistSummary(node);

    if (personalSettings.voiceDetailLevel === "simple") {
      return reminderType === "pre5"
        ? `提醒：${title}。`
        : `時間到：${title}。`;
    }

    if (personalSettings.voiceDetailLevel === "detailed") {
      return reminderType === "pre5"
        ? `提醒，五分鐘後：${title}。負責：${assignee}。地點：${location}。${detailText}${checklistText}`
        : `時間到，請進行：${title}。負責：${assignee}。地點：${location}。${detailText}${checklistText}`;
    }

    return reminderType === "pre5"
      ? `提醒，五分鐘後：${title}。`
      : `時間到，請進行：${title}。負責：${assignee}。地點：${location}。`;
  };

  const getNextReminderInfo = () => {
    if (!personalSettings.voiceReminderEnabled) return null;

    const currentMinutes = timeToMinutes(currentTime);
    const currentServiceNodes = [...filteredNodes].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    const reminderCandidates = currentServiceNodes.flatMap((node) => {
      const settings = getReminderSettings(node);
      if (!settings.voiceReminderEnabled) return [];

      const nodeMinutes = timeToMinutes(node.time);
      const candidates: any[] = [];

      if (settings.reminderPre5Enabled && personalSettings.reminderPre5Enabled) {
        candidates.push({
          node,
          reminderType: "pre5" as const,
          reminderMinutes: nodeMinutes - 5,
          label: "提醒"
        });
      }

      if (settings.reminderNowEnabled && personalSettings.reminderNowEnabled) {
        candidates.push({
          node,
          reminderType: "now" as const,
          reminderMinutes: nodeMinutes,
          label: "準點提醒"
        });
      }

      return candidates;
    });

    const nextReminder = reminderCandidates
      .filter(item => item.reminderMinutes > currentMinutes)
      .sort((a, b) => a.reminderMinutes - b.reminderMinutes)[0];

    if (!nextReminder) return null;

    return {
      ...nextReminder,
      minutesUntil: nextReminder.reminderMinutes - currentMinutes
    };
  };

  const buildVoiceReminderStatusText = () => {
    const currentServiceNodes = [...filteredNodes].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    if (currentServiceNodes.length === 0) {
      return `自動報時已開啟。目前 ${currentService} 尚未安排服事任務。`;
    }

    const currentMinutes = timeToMinutes(currentTime);
    const activeNode = currentServiceNodes.find(node => node.id === activeNodeId) || currentServiceNodes[0];
    const activeNodeMinutes = timeToMinutes(activeNode.time);
    const nextReminder = getNextReminderInfo();

    const currentMessage = currentMinutes < activeNodeMinutes
      ? `自動報時已開啟。下一個任務是：${activeNode.title}，時間是 ${activeNode.time}。`
      : `自動報時已開啟。目前任務是：${activeNode.title}。`;

    if (!nextReminder) {
      return currentMessage;
    }

    const nextMessage = nextReminder.reminderType === "pre5"
      ? `${formatMinutesText(nextReminder.minutesUntil)}，提醒：${nextReminder.node.title}。`
      : `${formatMinutesText(nextReminder.minutesUntil)}，提醒進行：${nextReminder.node.title}。`;

    return `自動報時已開啟。${nextMessage}`;
  };

  const announceVoiceReminderStatus = () => {
    speak(buildVoiceReminderStatusText());
  };

  const handleToggleVoiceReminder = () => {
    const nextEnabled = !isVoiceEnabled;
    setIsVoiceEnabled(nextEnabled);

    if (nextEnabled) {
      // 一定要在使用者點擊事件當下直接呼叫 speak。
      // 手機瀏覽器常會阻擋 setTimeout 裡的語音播放，導致按了沒有馬上播報。
      speak(buildVoiceReminderStatusText());
    } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const hasCheckinProfile = Boolean(checkinProfile.name && checkinProfile.phoneLast4);
  const displayCheckinName = checkinProfile.name || personalSettings.name || "";

  const isValidPhoneLast4 = (value: string) => /^\d{4}$/.test(value.trim());
  const isValidPassword = (value: string) => value.trim().length >= 10;

  const clearCheckinIdentity = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CHECKIN_PROFILE_STORAGE_KEY);
    }

    setCheckinProfile({
      name: "",
      phoneLast4: "",
      deviceRemembered: false
    });
    setCheckinForm({
      name: "",
      phoneLast4: "",
      password: "",
      confirmPassword: ""
    });
    setResetPasswordForm({
      name: "",
      phoneLast4: "",
      resetCode: "",
      newPassword: "",
      confirmPassword: ""
    });
    setShowResetPassword(false);
    setWifiVerified(false);
    setCheckinStatus("not_checked_in");
    setCheckedInAt("");
    setCheckedInService("");
    setConfirmedStation("");
    hasManuallySwitchedRef.current = false;
    setPersonalSettings(prev => ({ ...prev, name: "" }));
  };

  const handleCreateCheckinProfile = () => {
    const name = checkinForm.name.trim();
    const phoneLast4 = checkinForm.phoneLast4.trim();

    if (!name) {
      setCustomAlert({ isOpen: true, message: "請輸入姓名。" });
      return;
    }

    if (!isValidPhoneLast4(phoneLast4)) {
      setCustomAlert({ isOpen: true, message: "手機後四碼請輸入 4 位數字。" });
      return;
    }

    if (!isValidPassword(checkinForm.password)) {
      setCustomAlert({ isOpen: true, message: "密碼請至少設定 10 個字元。" });
      return;
    }

    if (checkinForm.password !== checkinForm.confirmPassword) {
      setCustomAlert({ isOpen: true, message: "兩次輸入的密碼不一致。" });
      return;
    }

    // V1 前端先記住身分與可信裝置；正式版密碼需交由後端雜湊儲存，不放 localStorage。
    setCheckinProfile({
      name,
      phoneLast4,
      deviceRemembered: true
    });
    setPersonalSettings(prev => ({
      ...prev,
      name
    }));
    setCheckinForm({
      name: "",
      phoneLast4: "",
      password: "",
      confirmPassword: ""
    });
    setCustomAlert({ isOpen: true, message: "已建立服事身分。這台手機下次會自動記住您。" });
  };

  const handleResetPassword = () => {
    const name = resetPasswordForm.name.trim();
    const phoneLast4 = resetPasswordForm.phoneLast4.trim();

    if (!name) {
      setCustomAlert({ isOpen: true, message: "請輸入姓名。" });
      return;
    }

    if (!isValidPhoneLast4(phoneLast4)) {
      setCustomAlert({ isOpen: true, message: "手機後四碼請輸入 4 位數字。" });
      return;
    }

    if (!isValidPassword(resetPasswordForm.newPassword)) {
      setCustomAlert({ isOpen: true, message: "新密碼請至少設定 10 個字元。" });
      return;
    }

    if (resetPasswordForm.newPassword !== resetPasswordForm.confirmPassword) {
      setCustomAlert({ isOpen: true, message: "兩次輸入的新密碼不一致。" });
      return;
    }

    const isSameTrustedDevice = checkinProfile.deviceRemembered
      && checkinProfile.name === name
      && checkinProfile.phoneLast4 === phoneLast4;

    if (!isSameTrustedDevice && resetPasswordForm.resetCode.trim().length < 4) {
      setCustomAlert({
        isOpen: true,
        message: "這不是原本可信裝置，請輸入總招或管理員提供的一次性重設碼。"
      });
      return;
    }

    setCheckinProfile({
      name,
      phoneLast4,
      deviceRemembered: true
    });
    setPersonalSettings(prev => ({
      ...prev,
      name
    }));
    setResetPasswordForm({
      name: "",
      phoneLast4: "",
      resetCode: "",
      newPassword: "",
      confirmPassword: ""
    });
    setShowResetPassword(false);
    setCustomAlert({ isOpen: true, message: "已重新設定新密碼。請使用新密碼進入系統。" });
  };

  const handleWifiCheck = () => {
    // V1 前端先提供流程按鈕；正式版會由後端檢查來源 IP 是否屬於教會現場 Wi-Fi。
    setWifiVerified(true);
    setCustomAlert({ isOpen: true, message: "已通過現場 Wi-Fi 驗證。正式版會改由後端自動檢查。" });
  };

  const handleLocalCheckin = () => {
    if (!hasCheckinProfile) {
      setCustomAlert({ isOpen: true, message: "請先建立服事身分，再進行報到。" });
      return;
    }

    if (!wifiVerified) {
      setCustomAlert({ isOpen: true, message: "尚未通過現場 Wi-Fi 驗證，請先連上教會 Wi-Fi 後按「重新檢查」。" });
      return;
    }

    const now = new Date();
    const timeText = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const serviceForToday = currentService;

    // V1 先用系統目前判斷的堂次鎖定；正式版會優先查今日排班/分派名單。
    setCheckedInAt(timeText);
    setCheckedInService(serviceForToday);
    setCurrentService(serviceForToday);
    hasManuallySwitchedRef.current = true;
    setCheckinStatus("checked_in");
    triggerVibration([200, 100, 200]);
    setCustomAlert({ isOpen: true, message: `已完成 ${serviceForToday} 報到。請等候總招分派崗位名牌。` });
  };

  const handleOpenStationScanner = () => {
    setCustomAlert({
      isOpen: true,
      message: "崗位名牌掃描介面已預留。下一階段會接上後置鏡頭與 AprilTag / 視覺碼辨識。"
    });
  };

  const handleDemoStationConfirm = () => {
    setConfirmedStation(personalSettings.role === "牧招" ? "2C 區塊牧招" : personalSettings.role);
    setCheckinStatus("station_confirmed");
    triggerVibration([200, 100, 200]);
  };


  useEffect(() => {
    if (!isLoading && !fetchError && filteredNodes.length > 0 && activeTab === 'timeline' && activeNodeRef.current) {
      setTimeout(() => {
        activeNodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [activeTab, isLoading, fetchError, filteredNodes.length, currentService, activeNodeId]);

  const toggleChecklist = async (nodeId: string, checkId: string) => {
    const nodeToUpdate = nodes.find(n => n.id === nodeId);
    const itemToUpdate = nodeToUpdate?.checklist.find((c: any) => c.id === checkId);
    if (!itemToUpdate) return;

    const willBeCompleted = !itemToUpdate.is_completed;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newCompletedAt = willBeCompleted ? timeStr : null;

    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        checklist: node.checklist.map((item: any) => 
          item.id === checkId 
            ? { ...item, is_completed: willBeCompleted, completed_at: newCompletedAt } 
            : item
        )
      };
    }));

    try {
      if (!hasValidKeys) return;
      await supabaseFetch(`checklist_items?id=eq.${checkId}`, 'PATCH', {
        is_completed: willBeCompleted,
        completed_at: newCompletedAt
      });
      fetchData(true);
    } catch (error) {
      console.error("更新資料庫失敗:", error);
      fetchData(true); 
    }
  };

  const handleAddNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNode.title || !newNode.time) {
      setCustomAlert({ isOpen: true, message: "請務必填寫時間與標題！" });
      return;
    }
    setIsAdding(true);
    const newId = 'n_' + Math.random().toString(36).substr(2, 9);
    try {
      await supabaseFetch('timeline_nodes', 'POST', {
        id: newId,
        service_type: newNode.service_type,
        time: newNode.time,
        title: newNode.title,
        assignee: newNode.assignee || '未指定',
        location: newNode.location || '未指定',
        details: newNode.details || ''
      });
      setNewNode({ service_type: currentService, time: '08:00', title: '', assignee: '', location: '', details: '' });
      await fetchData(true);
      setCustomAlert({ isOpen: true, message: "任務建立成功！" });
    } catch (error: any) {
      setCustomAlert({ isOpen: true, message: "新增失敗：" + error.message });
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdateNode = async (id: string) => {
    if (!editForm.title || !editForm.time) {
      setCustomAlert({ isOpen: true, message: "請填寫時間與標題！" });
      return;
    }
    try {
      await supabaseFetch(`timeline_nodes?id=eq.${id}`, 'PATCH', {
        service_type: editForm.service_type,
        time: editForm.time,
        title: editForm.title,
        assignee: editForm.assignee || '未指定',
        location: editForm.location || '未指定',
        details: editForm.details || ''
      });
      setEditingNodeId(null);
      await fetchData(true);
      setCustomAlert({ isOpen: true, message: "任務編輯成功，已同步至雲端！" });
    } catch (error: any) {
      setCustomAlert({ isOpen: true, message: "更新雲端失敗：" + error.message });
    }
  };

  const startEditing = (node: any) => {
    setEditingNodeId(node.id);
    setEditForm({
      service_type: node.service_type,
      time: node.time,
      title: node.title,
      assignee: node.assignee,
      location: node.location,
      details: node.details || ''
    });
  };

  const handleDeleteNode = async (id: string, title: string) => {
    setCustomConfirm({
      isOpen: true,
      message: `確定要刪除「${title}」這個任務嗎？\n此動作將會一併刪除底下的所有 Checklist！`,
      onConfirm: async () => {
        try {
          await supabaseFetch(`timeline_nodes?id=eq.${id}`, 'DELETE');
          await fetchData(true);
          setCustomAlert({ isOpen: true, message: "任務已成功刪除！" });
        } catch (error: any) {
          setCustomAlert({ isOpen: true, message: "刪除失敗：" + error.message });
        }
      }
    });
  };

  const handleInlineClick = (type: 'node' | 'checklist', id: string, field: string, currentValue: string) => {
    if (!isAdminUnlocked) return; 
    setActiveInlineEdit({ type, id, field });
    setInlineEditValue(currentValue);
  };

  const handleInlineBlur = async () => {
    if (!activeInlineEdit) return;
    const { type, id, field } = activeInlineEdit;
    const updatedValue = inlineEditValue.trim();

    if (type === 'node') {
      setNodes(prev => prev.map(node => {
        if (node.id !== id) return node;
        return { ...node, [field]: updatedValue };
      }));
    } else if (type === 'checklist') {
      setNodes(prev => prev.map(node => ({
        ...node,
        checklist: node.checklist.map((item: any) => 
          item.id === id ? { ...item, [field]: updatedValue } : item
        )
      })));
    }

    setActiveInlineEdit(null);

    try {
      if (type === 'node') {
        await supabaseFetch(`timeline_nodes?id=eq.${id}`, 'PATCH', { [field]: updatedValue });
      } else if (type === 'checklist') {
        await supabaseFetch(`checklist_items?id=eq.${id}`, 'PATCH', { [field]: updatedValue });
      }
      fetchData(true); 
    } catch (err: any) {
      console.error("行內修改同步失敗:", err);
      setCustomAlert({ isOpen: true, message: "行內即時同步失敗，正在復原最新雲端數據..." });
      fetchData(true);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, nodeId: string, targetId: string) => {
    e.preventDefault();
    if (!draggedItemId || draggedItemId === targetId) return;

    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.checklist) return;

    const items = [...node.checklist].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const draggedIndex = items.findIndex(item => item.id === draggedItemId);
    const targetIndex = items.findIndex(item => item.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [removed] = items.splice(draggedIndex, 1);
    items.splice(targetIndex, 0, removed);

    const updatedItems = items.map((item, index) => ({
      ...item,
      sort_order: index
    }));

    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n;
      return { ...n, checklist: updatedItems };
    }));

    setDraggedItemId(null);

    try {
      for (const item of updatedItems) {
        await supabaseFetch(`checklist_items?id=eq.${item.id}`, 'PATCH', {
          sort_order: item.sort_order
        });
      }
      fetchData(true);
    } catch (err) {
      console.error("更新排序失敗:", err);
    }
  };

  const moveChecklistItem = async (nodeId: string, index: number, direction: 'up' | 'down') => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.checklist) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= node.checklist.length) return;

    const items = [...node.checklist].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    const temp = items[index];
    items[index] = items[targetIndex];
    items[targetIndex] = temp;

    const updatedItems = items.map((item, idx) => ({
      ...item,
      sort_order: idx
    }));

    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n;
      return { ...n, checklist: updatedItems };
    }));

    try {
      for (const item of updatedItems) {
        await supabaseFetch(`checklist_items?id=eq.${item.id}`, 'PATCH', {
          sort_order: item.sort_order
        });
      }
      fetchData(true);
    } catch (err) {
      console.error("箭頭移動更新失敗:", err);
    }
  };

  const handleAddChecklistItem = async (nodeId: string) => {
    if (!newChecklistItem.text.trim()) {
      setCustomAlert({ isOpen: true, message: "請輸入確認項目的標題！" });
      return;
    }

    const node = nodes.find(n => n.id === nodeId);
    const maxOrder = node?.checklist && node.checklist.length > 0 
      ? Math.max(...node.checklist.map((c: any) => c.sort_order || 0)) 
      : -1;

    const newItemId = 'c_' + Math.random().toString(36).substr(2, 9);
    try {
      await supabaseFetch('checklist_items', 'POST', {
        id: newItemId,
        node_id: nodeId,
        text: newChecklistItem.text.trim(),
        details: newChecklistItem.details.trim() || '',
        is_completed: false,
        sort_order: maxOrder + 1
      });
      setNewChecklistItem({ text: "", details: "" });
      fetchData(true);
    } catch (err: any) {
      setCustomAlert({ isOpen: true, message: "新增確認項目失敗：" + err.message });
    }
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    setCustomConfirm({
      isOpen: true,
      message: "確定要刪除這筆任務清單細項嗎？",
      onConfirm: async () => {
        try {
          await supabaseFetch(`checklist_items?id=eq.${itemId}`, 'DELETE');
          fetchData(true);
        } catch (err: any) {
          setCustomAlert({ isOpen: true, message: "刪除清單細項失敗：" + err.message });
        }
      }
    });
  };

  const getReminderSettings = (_node: any) => ({
    voiceReminderEnabled: true,
    reminderPre5Enabled: true,
    reminderNowEnabled: true
  });


  const handleVerifyPassword = () => {
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAdminUnlocked(true);
      setShowPasswordModal(false);
      setActiveTab('admin');
      setPasswordError("");
      setPasswordInput("");
    } else {
      setPasswordError("密碼錯誤，請重新輸入！");
      setPasswordInput("");
    }
  };

  const renderInlineEdit = (type: 'node' | 'checklist', id: string, field: string, currentValue: string, styleClass: string, inputType: 'text' | 'time' | 'textarea' = 'text') => {
    const isEditing = activeInlineEdit?.type === type && activeInlineEdit?.id === id && activeInlineEdit?.field === field;

    if (!isAdminUnlocked) {
      return <span className={styleClass}>{currentValue || "(未填寫)"}</span>;
    }

    if (isEditing) {
      if (inputType === 'textarea') {
        return (
          <textarea
            value={inlineEditValue}
            onChange={e => setInlineEditValue(e.target.value)}
            onBlur={handleInlineBlur}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleInlineBlur();
              }
            }}
            className="border-2 border-[#6D55A3] rounded-lg p-2 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 w-full resize-none"
            autoFocus
          />
        );
      }
      return (
        <input
          type={inputType}
          value={inlineEditValue}
          onChange={e => setInlineEditValue(e.target.value)}
          onBlur={handleInlineBlur}
          onKeyDown={e => {
            if (e.key === 'Enter') handleInlineBlur();
            if (e.key === 'Escape') setActiveInlineEdit(null);
          }}
          className="border-2 border-[#6D55A3] rounded-lg px-2 py-1 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 w-full"
          autoFocus
        />
      );
    }

    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          handleInlineClick(type, id, field, currentValue);
        }}
        className={`${styleClass} border-b-2 border-dashed border-[#6D55A3]/30 hover:border-[#6D55A3] hover:bg-[#F3EEFF]/80 cursor-pointer px-1 rounded transition-colors inline-block`}
        title="點擊直接修改，將同步更新雲端"
      >
        {currentValue || "(點選填寫)"}
      </span>
    );
  };

  const renderCheckinView = () => {
    const isCheckedIn = checkinStatus !== "not_checked_in";
    const stationReady = checkinStatus === "station_confirmed";
    const todayService = checkedInService || currentService;

    return (
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
        <div className="mb-6 px-1">
          <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">報到</h2>
          <p className="text-sm font-medium text-[#7B7B74] mt-1.5 flex items-center gap-1.5">
            <Check className="w-4 h-4 text-[#6D55A3]" />
            首頁｜建立身分、現場報到、等待分派
          </p>
        </div>

        {!hasCheckinProfile ? (
          <div className="space-y-5">
            <div className="bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5">
              <div className="w-14 h-14 rounded-[22px] bg-[#F3EEFF] flex items-center justify-center mb-4">
                <User className="w-7 h-7 text-[#6D55A3]" />
              </div>
              <h3 className="text-[18px] font-black text-[#1F2937] mb-2">第一次使用</h3>
              <p className="text-sm font-medium leading-relaxed text-[#7B7B74] mb-5">
                請先建立您的服事身分。正式版會將密碼交由後端雜湊儲存；這一版先建立前端報到流程。堂次會在報到時依今日排班決定並鎖定。
              </p>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-black text-[#7B7B74] mb-2 tracking-widest">姓名</label>
                  <input
                    type="text"
                    value={checkinForm.name}
                    onChange={e => setCheckinForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="例如：陳姊妹"
                    className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-[#7B7B74] mb-2 tracking-widest">手機後四碼</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={4}
                    value={checkinForm.phoneLast4}
                    onChange={e => setCheckinForm(prev => ({ ...prev, phoneLast4: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    placeholder="例如：6820"
                    className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-[#7B7B74] mb-2 tracking-widest">建立密碼</label>
                  <input
                    type="password"
                    value={checkinForm.password}
                    onChange={e => setCheckinForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="至少 10 個字元"
                    className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-[#7B7B74] mb-2 tracking-widest">再次輸入密碼</label>
                  <input
                    type="password"
                    value={checkinForm.confirmPassword}
                    onChange={e => setCheckinForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="再次確認密碼"
                    className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCreateCheckinProfile}
                  className="w-full py-4 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-black rounded-[18px] shadow-lg shadow-[#F25D6B]/20 hover:opacity-90 transition-opacity"
                >
                  建立服事身分
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowResetPassword(prev => !prev)}
              className="w-full text-center text-[12px] font-black text-[#6D55A3] hover:text-[#F25D6B] transition-colors"
            >
              忘記密碼？重新設定新密碼
            </button>

            {showResetPassword && (
              <div className="bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5">
                <h3 className="text-[16px] font-black text-[#1F2937] mb-2">重新設定新密碼</h3>
                <p className="text-xs font-medium leading-relaxed text-[#7B7B74] mb-4">
                  姓名與手機後四碼用來辨識身分；若不是原本可信裝置，需輸入一次性重設碼。
                </p>

                <div className="space-y-3.5">
                  <input
                    type="text"
                    value={resetPasswordForm.name}
                    onChange={e => setResetPasswordForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="姓名"
                    className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                  />
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={4}
                    value={resetPasswordForm.phoneLast4}
                    onChange={e => setResetPasswordForm(prev => ({ ...prev, phoneLast4: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    placeholder="手機後四碼"
                    className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                  />
                  <input
                    type="text"
                    value={resetPasswordForm.resetCode}
                    onChange={e => setResetPasswordForm(prev => ({ ...prev, resetCode: e.target.value }))}
                    placeholder="一次性重設碼，新裝置才需要"
                    className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                  />
                  <input
                    type="password"
                    value={resetPasswordForm.newPassword}
                    onChange={e => setResetPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="新密碼，至少 10 個字元"
                    className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                  />
                  <input
                    type="password"
                    value={resetPasswordForm.confirmPassword}
                    onChange={e => setResetPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="再次輸入新密碼"
                    className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                  />
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="w-full py-3.5 bg-[#F3EEFF] text-[#6D55A3] border border-[#6D55A3]/20 font-black rounded-[18px] hover:bg-[#EDE6FF] transition-colors"
                  >
                    重新設定
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] font-black text-[#7B7B74] tracking-widest mb-1">今日服事</div>
                  <h3 className="text-xl font-black text-[#1F2937]">{displayCheckinName || "服事同工"}</h3>
                  <p className="text-sm font-bold text-[#6D55A3] mt-1">{todayService}｜{personalSettings.role || "未設定角色"}</p>
                  <p className="text-[11px] font-bold text-[#7B7B74] mt-1">
                    手機後四碼：{checkinProfile.phoneLast4}
                  </p>
                  <p className="text-[11px] font-bold text-[#00B8B8] mt-1">
                    今日堂次：{todayService} {checkedInService ? "已鎖定" : "待報到確認"}
                  </p>
                </div>
                <div className={`px-3 py-1.5 rounded-full text-[11px] font-black border ${
                  isCheckedIn
                    ? "bg-[#00B8B8]/10 text-[#00B8B8] border-[#00B8B8]/20"
                    : "bg-[#FFF2F4] text-[#F25D6B] border-[#F25D6B]/20"
                }`}>
                  {isCheckedIn ? "已報到" : "尚未報到"}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="p-4 rounded-[20px] bg-[#F3EEFF]/60 border border-[#6D55A3]/10">
                  <div className="text-[10px] font-black text-[#7B7B74] tracking-widest mb-1">現在時間</div>
                  <div className="text-2xl font-black font-mono text-[#1F2937]">{currentTime || "--:--"}</div>
                </div>
                <div className={`p-4 rounded-[20px] border ${
                  wifiVerified
                    ? "bg-[#00B8B8]/10 border-[#00B8B8]/20"
                    : "bg-[#FFF2F4]/60 border-[#F25D6B]/10"
                }`}>
                  <div className="text-[10px] font-black text-[#7B7B74] tracking-widest mb-1">現場 Wi-Fi</div>
                  <div className={`text-sm font-black ${wifiVerified ? "text-[#00B8B8]" : "text-[#F25D6B]"}`}>
                    {wifiVerified ? "已通過" : "尚未通過"}
                  </div>
                </div>
              </div>
            </div>

            {!wifiVerified && !isCheckedIn && (
              <div className="mb-5 p-4 rounded-[20px] bg-[#FFF2F4] border border-[#F25D6B]/20">
                <h3 className="text-sm font-black text-[#F25D6B] mb-1">尚未通過現場 Wi-Fi 驗證</h3>
                <p className="text-xs font-bold leading-relaxed text-[#7B7B74] mb-3">
                  請開啟手機 Wi-Fi，連上教會現場 Wi-Fi 後，再按「重新檢查」。
                </p>
                <button
                  type="button"
                  onClick={handleWifiCheck}
                  className="w-full py-3 bg-white text-[#F25D6B] border border-[#F25D6B]/20 font-black rounded-[16px] hover:bg-[#FFF2F4] transition-colors"
                >
                  重新檢查 Wi-Fi
                </button>
              </div>
            )}

            <div className="bg-gradient-to-br from-white to-[#F3EEFF]/50 p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-5">
              {!isCheckedIn ? (
                <>
                  <h3 className="text-[16px] font-black text-[#1F2937] mb-2">請完成今日報到</h3>
                  <p className="text-sm font-medium leading-relaxed text-[#7B7B74] mb-5">
                    報到只用現場 Wi-Fi 驗證，確認同工人在教會現場。AprilTag / 視覺碼會留到崗位確認使用。
                  </p>
                  <button
                    type="button"
                    onClick={handleLocalCheckin}
                    className={`w-full py-4 font-black rounded-[18px] transition-all ${
                      wifiVerified
                        ? "bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white shadow-lg shadow-[#F25D6B]/20 hover:opacity-90"
                        : "bg-[#E6EAF0] text-[#7B7B74] cursor-not-allowed"
                    }`}
                  >
                    立即報到
                  </button>
                </>
              ) : stationReady ? (
                <>
                  <h3 className="text-[16px] font-black text-[#1F2937] mb-2">崗位確認完成</h3>
                  <p className="text-sm font-medium leading-relaxed text-[#7B7B74] mb-5">
                    今日崗位：<span className="font-black text-[#6D55A3]">{confirmedStation || personalSettings.role}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("timeline")}
                    className="w-full py-4 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-black rounded-[18px] shadow-lg shadow-[#F25D6B]/20 hover:opacity-90 transition-opacity"
                  >
                    進入今日流程
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-[16px] font-black text-[#1F2937] mb-2">您已於 {checkedInAt || "--:--"} 報到</h3>
                  <p className="text-sm font-medium leading-relaxed text-[#7B7B74] mb-5">
                    目前狀態：已報到，等待分派崗位。拿到總招發的崗位名牌後，可直接在本頁掃描確認。
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      type="button"
                      onClick={handleOpenStationScanner}
                      className="w-full py-4 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-black rounded-[18px] shadow-lg shadow-[#F25D6B]/20 hover:opacity-90 transition-opacity"
                    >
                      掃描崗位名牌
                    </button>
                    <button
                      type="button"
                      onClick={handleDemoStationConfirm}
                      className="w-full py-3.5 bg-white text-[#6D55A3] border border-[#6D55A3]/20 font-black rounded-[18px] hover:bg-[#F3EEFF] transition-colors"
                    >
                      先用目前角色模擬確認
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={clearCheckinIdentity}
              className="w-full text-center text-[12px] font-black text-[#7B7B74] hover:text-[#F25D6B] transition-colors"
            >
              不是我？請重新輸入
            </button>
          </>
        )}
      </div>
    );
  };


  const renderStationView = () => {
    const isCheckedIn = checkinStatus !== "not_checked_in";
    const stationReady = checkinStatus === "station_confirmed";

    return (
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
        <div className="mb-6 px-1">
          <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">崗位</h2>
          <p className="text-sm font-medium text-[#7B7B74] mt-1.5 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#6D55A3]" />
            掃描 / 確認崗位名牌
          </p>
        </div>

        <div className="bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-5">
          <div className={`w-14 h-14 rounded-[22px] flex items-center justify-center mb-4 ${
            stationReady ? "bg-[#00B8B8]/10" : "bg-[#F3EEFF]"
          }`}>
            <MapPin className={`w-7 h-7 ${stationReady ? "text-[#00B8B8]" : "text-[#6D55A3]"}`} />
          </div>
          <h3 className="text-[18px] font-black text-[#1F2937] mb-2">
            {stationReady ? "已確認今日崗位" : "等待掃描崗位名牌"}
          </h3>
          <p className="text-sm font-medium leading-relaxed text-[#7B7B74]">
            {stationReady
              ? `今日崗位：${confirmedStation || personalSettings.role}。系統會依此切換個人流程。`
              : "總招分配崗位時會發崗位名牌。拿到名牌後，掃描名牌上的 AprilTag / 視覺碼確認崗位。"}
          </p>
        </div>

        {!isCheckedIn && (
          <div className="mb-5 p-4 rounded-[20px] bg-[#FFF2F4] border border-[#F25D6B]/20 text-sm font-bold text-[#F25D6B]">
            尚未完成報到。請先回到「報到」頁完成報到。
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            disabled={!isCheckedIn}
            onClick={handleOpenStationScanner}
            className={`w-full py-4 font-black rounded-[18px] transition-all ${
              isCheckedIn
                ? "bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white shadow-lg shadow-[#F25D6B]/20 hover:opacity-90"
                : "bg-[#E6EAF0] text-[#7B7B74] cursor-not-allowed"
            }`}
          >
            掃描崗位名牌
          </button>

          <button
            type="button"
            disabled={!isCheckedIn}
            onClick={handleDemoStationConfirm}
            className={`w-full py-3.5 rounded-[18px] border text-sm font-black transition-all ${
              isCheckedIn
                ? "bg-white text-[#6D55A3] border-[#6D55A3]/20 hover:bg-[#F3EEFF]"
                : "bg-white text-[#7B7B74] border-[#E6EAF0] cursor-not-allowed opacity-60"
            }`}
          >
            先用目前角色模擬確認
          </button>
        </div>
      </div>
    );
  };

  const renderControlView = () => {
    const controlCards = [
      { title: "今日分派", desc: "調整同工崗位、處理臨時支援", action: "前往狀態", tab: "status" },
      { title: "任務調整", desc: "修改今日任務節點與確認清單", action: "前往管理", tab: "admin" },
      { title: "異常處理", desc: "查看漏排、多排、未確認崗位", action: "查看狀態", tab: "status" }
    ];

    return (
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
        <div className="mb-6 px-1">
          <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">控場</h2>
          <p className="text-sm font-medium text-[#7B7B74] mt-1.5 flex items-center gap-1.5">
            <HeartHandshake className="w-4 h-4 text-[#6D55A3]" />
            總招今日現場操作
          </p>
        </div>

        <div className="p-5 rounded-[24px] bg-gradient-to-br from-white to-[#F3EEFF]/50 border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-5">
          <div className="text-[12px] font-black text-[#7B7B74] tracking-widest mb-1">目前權限</div>
          <h3 className="text-xl font-black text-[#1F2937]">{personalSettings.role || "未設定"}</h3>
          <p className="text-sm font-medium text-[#7B7B74] mt-2">
            控場頁負責「今天現場」的調整；系統長期資料請到「管理」處理。
          </p>
        </div>

        <div className="space-y-3">
          {controlCards.map(card => (
            <div key={card.title} className="bg-white p-5 rounded-[24px] border border-[#E6EAF0] shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[16px] font-black text-[#1F2937] mb-1">{card.title}</h3>
                  <p className="text-sm font-medium text-[#7B7B74] leading-relaxed">{card.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (card.tab === "admin" && !isAdminUnlocked) {
                      setShowPasswordModal(true);
                      setPasswordInput("");
                      setPasswordError("");
                      return;
                    }
                    setActiveTab(card.tab);
                  }}
                  className="px-3 py-2 rounded-xl bg-[#F3EEFF] text-[#6D55A3] border border-[#6D55A3]/20 text-[11px] font-black whitespace-nowrap hover:bg-[#EDE6FF] transition-colors"
                >
                  {card.action}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTimelineView = () => {
    return (
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
        {(voiceResultText || isThinking) && (
          <div className="mb-4 p-3 bg-[#F3EEFF] border border-[#6D55A3]/20 rounded-2xl flex items-center gap-2.5 text-xs font-bold text-[#6D55A3] animate-bounce shadow-md">
            {isThinking ? (
              <Loader2 className="w-4.5 h-4.5 text-[#6D55A3] animate-spin shrink-0" />
            ) : (
              <Sparkles className="w-4.5 h-4.5 text-[#F25D6B] shrink-0" />
            )}
            <span>
              {isThinking ? "智慧助理正在思考您的問題..." : `語音指令辨識為：「${voiceResultText}」`}
            </span>
          </div>
        )}

        {taskBlockNotice && (
          <div className="mb-4 p-3 bg-[#FFF2F4] border border-[#F25D6B]/20 rounded-2xl flex items-center gap-2.5 text-xs font-black text-[#F25D6B] shadow-md shadow-[#F25D6B]/10">
            <AlertCircle className="w-4.5 h-4.5 shrink-0" />
            <span>{taskBlockNotice}</span>
          </div>
        )}

        {filteredNodes.length === 0 ? (
          <div className="text-center text-[#7B7B74] mt-16 text-sm bg-white p-7 rounded-[24px] shadow-sm border border-[#E6EAF0]">
            <Sparkles className="w-9 h-9 text-[#E6EAF0] mx-auto mb-3" />
            <div className="text-[16px] font-black text-[#1F2937] mb-2">
              {serviceNodes.length === 0 ? "此堂次目前尚未安排服事任務" : "目前角色沒有相關任務"}
            </div>
            <div className="text-[13px] font-medium leading-relaxed">
              {serviceNodes.length === 0 ? (
                <span>請至「任務管理」新增此堂次的服事流程。</span>
              ) : personalSettings.role === "副總招" ? (
                <span>你目前的角色是：副總招。此堂次暫無三樓相關任務。</span>
              ) : (
                <span>你目前的角色是：{personalSettings.role}。若服事角色選擇錯誤，請至「個人設定」調整。</span>
              )}
            </div>
          </div>
        ) : (
          <div ref={timelineContainerRef} className="relative mt-2">
            <div className="absolute left-[20px] top-6 bottom-6 w-[2px] bg-gradient-to-b from-[#F3EEFF] via-[#E6EAF0] to-[#FFF9F3]" />

            {currentTimeCursorTop !== null && (
              <div
                className="absolute left-[20px] z-30 pointer-events-none transition-all duration-700 ease-linear"
                style={{ top: `${currentTimeCursorTop}px`, transform: "translate(-50%, -50%)" }}
              >
                <div className="relative flex items-center justify-center">
                  <span className="absolute inline-flex w-6 h-6 rounded-full opacity-30 bg-[#F25D6B] animate-ping" />
                  <span className="relative inline-flex w-4 h-4 rounded-full bg-[#F25D6B] shadow-sm shadow-[#F25D6B]/50" />
                  <span className="absolute left-1/2 -translate-x-1/2 -top-7 px-2 py-0.5 rounded-full bg-white border border-[#F25D6B]/20 shadow-sm text-[10px] font-black font-mono text-[#F25D6B] whitespace-nowrap">
                    {currentTime || "--:--"}
                  </span>
                </div>
              </div>
            )}
            
            {filteredNodes.map((node) => {
              const completed = isNodeCompleted(node);
              const active = node.id === activeNodeId;
              return (
                <div key={node.id} className="relative mb-8 transition-all duration-500" ref={active ? activeNodeRef : null}>
                  
                  <div
                    ref={(el) => {
                      nodeMarkerRefs.current[node.id] = el;
                    }}
                    className="absolute left-0 top-4 flex items-center justify-center w-10 h-10 bg-[#FFF9F3] z-10"
                  >
                    {completed ? (
                      <div className="w-7 h-7 rounded-full bg-[#00B8B8] flex items-center justify-center shadow-sm shadow-[#00B8B8]/30">
                         <Check className="w-4 h-4 text-white" strokeWidth={3} />
                      </div>
                    ) : active ? (
                      <div className="w-5 h-5 rounded-full border-[3px] border-[#F25D6B]/60 bg-white shadow-sm shadow-[#F25D6B]/20" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-[3px] border-[#E6EAF0] bg-white" />
                    )}
                  </div>

                  <div className={`ml-12 rounded-[24px] p-5 transition-all duration-300 ${
                    completed ? 'bg-white/60 border border-[#E6EAF0] opacity-70' : 
                    active ? 'bg-[#FFF2F4] ring-2 ring-[#F25D6B] shadow-lg shadow-[#F25D6B]/15' : 
                    'bg-white border border-[#E6EAF0] shadow-sm'
                  }`}>
                    
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-full">
                        <h3 className={`text-lg font-bold tracking-tight mb-1.5 ${completed ? 'text-[#7B7B74] line-through decoration-[#E6EAF0]' : 'text-[#1F2937]'}`}>
                          {renderInlineEdit('node', node.id, 'title', node.title, "w-full")}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-[#7B7B74]">
                          <span className="flex items-center gap-1 bg-[#F3EEFF] text-[#6D55A3] px-2 py-0.5 rounded-md">
                            <Clock className="w-3 h-3" />
                            {renderInlineEdit('node', node.id, 'time', node.time, "font-mono", "time")}
                          </span>
                          {active && (
                            <span className="px-2 py-0.5 text-white bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] rounded-md font-bold shadow-sm">
                              進行中
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5 mt-2 text-[13px] text-[#7B7B74]">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#F25D6B]/70 shrink-0" />
                        <span className="font-medium text-[#1F2937]">
                          {renderInlineEdit('node', node.id, 'location', node.location, "w-full")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-[#6D55A3]/70 shrink-0" />
                        <span className="font-medium text-[#1F2937]">
                          {renderInlineEdit('node', node.id, 'assignee', node.assignee, "w-full")}
                        </span>
                      </div>
                    </div>
                    
                    {node.checklist && node.checklist.length > 0 && (
                      <div className="mt-5 space-y-3">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-px bg-[#E6EAF0] flex-1"></div>
                          <div className="text-[10px] font-black text-[#6D55A3]/40 uppercase tracking-widest">任務清單</div>
                          <div className="h-px bg-[#E6EAF0] flex-1"></div>
                        </div>

                        {node.checklist.map((item: any) => {
                          return (
                            <div key={item.id} className={`flex items-start gap-3 p-3.5 rounded-[16px] transition-all duration-200 ${
                              item.is_completed ? 'bg-[#00B8B8]/5 border border-[#00B8B8]/20' : 'bg-white border border-[#E6EAF0] shadow-sm hover:border-[#6D55A3]/30'
                            }`}>
                              
                              <label className="relative flex items-center justify-center shrink-0 mt-0.5 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  className="peer sr-only" 
                                  checked={item.is_completed} 
                                  onChange={() => toggleChecklist(node.id, item.id)}
                                />
                                <div className={`w-5 h-5 rounded-[6px] border-2 transition-all flex items-center justify-center ${
                                  item.is_completed ? 'bg-[#00B8B8] border-[#00B8B8]' : 'bg-white border-[#E6EAF0] peer-focus:ring-2 ring-[#6D55A3]/30'
                                }`}>
                                  {item.is_completed && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                                </div>
                              </label>
                              
                              <div className="flex-1">
                                <div 
                                  className={`flex items-start gap-1.5 ${item.details ? 'cursor-pointer group' : ''}`}
                                  onClick={() => {
                                    if (!isAdminUnlocked && item.details) {
                                      setDetailModal({ isOpen: true, title: item.text, details: item.details });
                                    }
                                  }}
                                >
                                  <span className={`text-[14px] font-semibold leading-relaxed transition-all ${
                                    item.is_completed ? 'text-[#7B7B74] line-through opacity-70' : 'text-[#1F2937]'
                                  } ${(!isAdminUnlocked && item.details) ? 'group-hover:text-[#F25D6B]' : ''}`}>
                                    {renderInlineEdit('checklist', item.id, 'text', item.text, "w-full")}
                                  </span>
                                  
                                  {!isAdminUnlocked && item.details && (
                                    <div className={`mt-0.5 shrink-0 transition-colors ${item.is_completed ? 'text-[#E6EAF0]' : 'text-[#00B8B8] group-hover:text-[#F25D6B]'}`}>
                                      <Info className="w-4 h-4" />
                                    </div>
                                  )}
                                </div>

                                {isAdminUnlocked && (
                                  <div className="mt-1 text-xs text-slate-500 bg-slate-50 p-1.5 rounded-lg border border-dashed border-slate-200">
                                    <span className="font-bold text-[10px] text-[#6D55A3] block mb-0.5">備註細節：</span>
                                    {renderInlineEdit('checklist', item.id, 'details', item.details, "w-full text-xs text-slate-600 block", "textarea")}
                                  </div>
                                )}
                                
                                {item.is_completed && item.completed_at && (
                                  <span className="text-[10px] text-[#00B8B8] font-bold block mt-1.5 tracking-wider">
                                    DONE AT {item.completed_at}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderReviewView = () => {
    const allTasks = filteredNodes.flatMap(n => n.checklist || []);
    const completedTasks = allTasks.filter(t => t.is_completed);
    const completionRate = calculateRate(completedTasks.length, allTasks.length);
    const missedTasks = allTasks.filter(t => !t.is_completed);

    const groupedMissed: { [key: string]: any[] } = {};
    missedTasks.forEach((task: any) => {
      const parentNode = filteredNodes.find(n => n.checklist && n.checklist.some((c: any) => c.id === task.id));
      const role = parentNode?.assignee || '未指定角色';
      if (!groupedMissed[role]) {
        groupedMissed[role] = [];
      }
      groupedMissed[role].push({
        ...task,
        nodeTitle: parentNode?.title,
        nodeTime: parentNode?.time
      });
    });

    return (
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
        <div className="mb-6 px-1">
          <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">狀態</h2>
          <p className="text-sm font-medium text-[#7B7B74] mt-1.5 flex items-center gap-1.5">
            <BarChart2 className="w-4 h-4 text-[#6D55A3]" /> 服事動態與現場控場資訊 ({currentService})
          </p>
        </div>
        
        <div className="p-6 mb-8 bg-gradient-to-br from-white to-[#F3EEFF]/50 border shadow-lg shadow-[#6D55A3]/5 rounded-[24px] border-[#E6EAF0]">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-black tracking-widest text-[#6D55A3] uppercase">目前任務完成率</h3>
            <span className="px-3 py-1 text-[10px] font-bold text-[#00B8B8] bg-[#00B8B8]/10 rounded-full border border-[#00B8B8]/20">
              雲端即時同步中
            </span>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-5xl font-black tracking-tighter text-[#F25D6B]">{allTasks.length === 0 ? 0 : completionRate}%</span>
            <span className="mb-1.5 text-sm font-bold text-[#7B7B74]">({completedTasks.length}/{allTasks.length} 任務)</span>
          </div>
          <div className="w-full h-3 mt-6 overflow-hidden rounded-full bg-[#E6EAF0] shadow-inner">
            <div className="h-full transition-all duration-1000 ease-out bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] rounded-full relative" style={{ width: `${allTasks.length === 0 ? 0 : completionRate}%` }}>
               <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]"></div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="flex items-center gap-2 mb-4 text-sm font-black tracking-widest text-[#F25D6B] uppercase px-1">
            <AlertCircle className="w-4 h-4" /> 待處理服事動態（依角色分組）
          </h3>
          
          {Object.keys(groupedMissed).length === 0 ? (
            <div className="text-center text-[#7B7B74] py-8 bg-white/60 rounded-[24px] border border-[#E6EAF0] text-sm">
              🎉 恭喜！當前場次的所有任務均已圓滿完成！
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedMissed).map(([role, tasks]) => {
                return (
                  <div key={role} className="bg-white p-5 rounded-[24px] border border-[#E6EAF0] shadow-sm">
                    <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#F3EEFF]">
                      <span className="font-extrabold text-[15px] text-[#6D55A3] flex items-center gap-1.5">
                        <User className="w-4 h-4 text-[#F25D6B]" /> {role}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-[#FFF2F4] text-[#F25D6B] rounded-full">
                        待辦 {tasks.length} 項
                      </span>
                    </div>
                    
                    <div className="space-y-2.5">
                      {tasks.map((task: any) => {
                        return (
                          <div 
                            key={task.id}
                            onClick={() => {
                              setDetailModal({
                                isOpen: true,
                                title: task.text,
                                details: task.details || '本項目目前沒有額外的詳細提醒說明。'
                              });
                            }}
                            className="p-3 bg-[#FFF2F4]/40 hover:bg-[#FFF2F4]/80 border border-[#F25D6B]/10 rounded-[16px] cursor-pointer transition-colors"
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <span className="text-[14px] font-bold text-[#1F2937] leading-relaxed">
                                {task.text}
                              </span>
                              <div className="mt-0.5 shrink-0 text-[#00B8B8]">
                                <Info className="w-3.5 h-3.5" />
                              </div>
                            </div>
                            <div className="flex items-center gap-1 mt-1 text-[11px] text-[#7B7B74] font-medium">
                              <Clock className="w-3 h-3" /> {task.nodeTime} - {task.nodeTitle}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPersonalSettingsView = () => {
    const previewNode = filteredNodes[0] || {
      title: "服事任務提醒",
      assignee: personalSettings.role || "未指定",
      location: "服事現場",
      details: "請依照現場流程與主責指示進行。",
      checklist: [
        { text: "確認服事位置" },
        { text: "確認需要物品" },
        { text: "留意會友需要" }
      ]
    };

    return (
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
        <div className="mb-6 px-1">
          <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">個人設定</h2>
          <p className="text-sm font-medium text-[#7B7B74] mt-1.5 flex items-center gap-1.5">
            <User className="w-4 h-4 text-[#6D55A3]" />
            個人服事提醒設定會自動記憶在這台裝置
          </p>
        </div>

        <div className="bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 space-y-6">
          <div>
            <label className="block text-xs font-black text-[#7B7B74] mb-2 tracking-widest">我的名稱</label>
            <input
              type="text"
              value={personalSettings.name}
              onChange={e => updatePersonalSettings({ name: e.target.value })}
              placeholder="例如：陳姊妹"
              className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-[#7B7B74] mb-2 tracking-widest">我的服事角色</label>
            <select
              value={personalSettings.role}
              onChange={e => updatePersonalSettings({ role: e.target.value })}
              className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
            >
              {roleOptions.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>

            <div className="mt-3 p-3 rounded-2xl bg-[#FFF9F3] border border-[#E6EAF0] text-[12px] leading-relaxed text-[#7B7B74] font-medium">
              {personalSettings.role === "總招" ? (
                <span>總招會看到並接收全場任務提醒。</span>
              ) : personalSettings.role === "副總招" ? (
                <span>副總招會看到並接收三樓相關任務提醒。</span>
              ) : personalSettings.role === "聖餐助手" ? (
                <span>聖餐助手只會在每月第一週聖餐週出現，系統會顯示聖餐相關任務。</span>
              ) : (
                <span>系統會自動只顯示並提醒與「{personalSettings.role}」相關的任務。</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-[#7B7B74] mb-3 tracking-widest">提醒方式</label>
            <div className="space-y-2.5">
              {[
                { key: "voiceReminderEnabled", label: "語音提醒", description: "開啟後，自動報時才會出聲提醒。" },
                { key: "vibrationReminderEnabled", label: "震動提醒", description: "進入下一個任務區塊時震動提醒。" },
                { key: "reminderPre5Enabled", label: "5分鐘前", description: "任務前五分鐘先提醒一次。" },
                { key: "reminderNowEnabled", label: "準點", description: "任務時間到時提醒一次。" }
              ].map(item => {
                const active = personalSettings[item.key as keyof typeof personalSettings] as boolean;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => updatePersonalSettings({ [item.key]: !active } as any)}
                    className={`w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition-all ${
                      active
                        ? "bg-[#F3EEFF] border-[#6D55A3]/20 text-[#6D55A3]"
                        : "bg-white border-[#E6EAF0] text-[#7B7B74]"
                    }`}
                  >
                    <div className="text-left">
                      <div className="text-sm font-black">{active ? "✓ " : ""}{item.label}</div>
                      <div className="text-[11px] font-medium opacity-75 mt-0.5">{item.description}</div>
                    </div>
                    <div className={`w-10 h-6 rounded-full p-1 transition-all ${active ? "bg-[#6D55A3]" : "bg-[#E6EAF0]"}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${active ? "translate-x-4" : "translate-x-0"}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-[#7B7B74] mb-3 tracking-widest">語音內容</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "simple", label: "極簡" },
                { value: "standard", label: "標準" },
                { value: "detailed", label: "詳細" }
              ].map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updatePersonalSettings({ voiceDetailLevel: option.value as any })}
                  className={`py-2.5 rounded-2xl border text-xs font-black transition-all ${
                    personalSettings.voiceDetailLevel === option.value
                      ? "bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white border-transparent shadow-md shadow-[#F25D6B]/15"
                      : "bg-white text-[#7B7B74] border-[#E6EAF0]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-3 p-3 rounded-2xl bg-[#FFF9F3] border border-[#E6EAF0] text-[12px] leading-relaxed text-[#7B7B74] font-medium">
              {personalSettings.voiceDetailLevel === "simple" && "極簡：只播報任務名稱，適合現場忙碌時使用。"}
              {personalSettings.voiceDetailLevel === "standard" && "標準：播報任務、負責人與地點，適合一般使用。"}
              {personalSettings.voiceDetailLevel === "detailed" && "詳細：會加上任務提示與前三項確認清單，適合任務不多的崗位。"}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => speak(buildReminderSpeechText(previewNode, "pre5"))}
              className="w-full py-3.5 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-bold rounded-[16px] hover:opacity-90 transition-opacity shadow-md shadow-[#F25D6B]/20"
            >
              測試語音
            </button>
            <button
              type="button"
              onClick={() => triggerVibration([200, 100, 200])}
              className="w-full py-3.5 bg-[#F3EEFF] text-[#6D55A3] border border-[#6D55A3]/20 font-bold rounded-[16px] hover:bg-[#EDE6FF] transition-colors"
            >
              測試震動
            </button>
          </div>

          <p className="text-center text-[11px] font-bold text-[#00B8B8]">
            設定已自動儲存在這台裝置
          </p>
        </div>
      </div>
    );
  };


  const renderAdminView = () => {
    return (
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
        <div className="mb-6 px-1 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">管理服事任務</h2>
            <p className="text-sm font-medium text-[#7B7B74] mt-1.5">目前管理區塊：<span className="text-[#6D55A3] font-bold">{currentService}</span></p>
          </div>
          
          <div className="flex items-center gap-2">

            <button
              type="button"
              onClick={() => {
                setIsAdminUnlocked(false);
                setActiveTab('checkin');
              }}
              className="px-3 py-1.5 bg-[#F25D6B]/10 hover:bg-[#F25D6B]/25 text-[#F25D6B] border border-[#F25D6B]/20 text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
            >
              <Lock className="w-3.5 h-3.5" />
              鎖定登出
            </button>
          </div>
        </div>

        {/* 新增任務節點表單 */}
        <form onSubmit={handleAddNode} className="bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-8">
          <h3 className="text-[13px] font-black text-[#6D55A3] uppercase tracking-widest mb-5 flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#F25D6B]" /> 新增任務節點
          </h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-1/3">
                <label className="block text-xs font-bold text-[#7B7B74] mb-1.5">所屬場次</label>
                <select 
                  value={newNode.service_type} 
                  onChange={e => setNewNode({...newNode, service_type: e.target.value})}
                  className="w-full px-3 py-2.5 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[12px] text-sm font-medium text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 transition-shadow"
                >
                  {serviceOptions.map(srv => <option key={srv} value={srv}>{srv}</option>)}
                </select>
              </div>
              <div className="w-2/3">
                <label className="block text-xs font-bold text-[#7B7B74] mb-1.5">時間</label>
                <input type="time" required value={newNode.time} onChange={e => setNewNode({...newNode, time: e.target.value})} className="w-full px-3 py-2.5 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[12px] text-sm font-medium text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 transition-shadow" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#7B7B74] mb-1.5">任務標題</label>
              <input type="text" required placeholder="例如：招待同工就位" value={newNode.title} onChange={e => setNewNode({...newNode, title: e.target.value})} className="w-full px-3 py-2.5 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[12px] text-sm font-medium text-[#1F2937] focus:outline-none" />
            </div>
            <div className="flex gap-4">
              <div className="w-1/2">
                <label className="block text-xs font-bold text-[#7B7B74] mb-1.5">負責角色</label>
                <input type="text" placeholder="例如：大堂專招" value={newNode.assignee} onChange={e => setNewNode({...newNode, assignee: e.target.value})} className="w-full px-3 py-2.5 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[12px] text-sm font-medium text-[#1F2937] focus:outline-none" />
              </div>
              <div className="w-1/2">
                <label className="block text-xs font-bold text-[#7B7B74] mb-1.5">服事地點</label>
                <input type="text" placeholder="例如：大會堂" value={newNode.location} onChange={e => setNewNode({...newNode, location: e.target.value})} className="w-full px-3 py-2.5 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[12px] text-sm font-medium text-[#1F2937] focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#7B7B74] mb-1.5">備註細節 (選填)</label>
              <textarea rows={2} value={newNode.details} onChange={e => setNewNode({...newNode, details: e.target.value})} className="w-full px-3 py-2.5 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[12px] text-sm font-medium text-[#1F2937] focus:outline-none resize-none" />
            </div>
            <button disabled={isAdding} type="submit" className="w-full mt-4 py-3.5 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-bold rounded-[14px] text-sm hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-[#F25D6B]/20">
              {isAdding ? '新增至雲端中...' : '確認建立任務'}
            </button>
          </div>
        </form>

        {/* 任務總覽區 */}
        <div>
          <h3 className="text-[11px] font-black text-[#7B7B74] mb-3 tracking-widest uppercase px-1">任務總覽與編輯 ({currentService})</h3>
          <div className="space-y-4">
            {adminNodes.length === 0 && <p className="text-sm font-medium text-[#7B7B74] text-center py-6 bg-white rounded-[20px] border border-[#E6EAF0]">尚無任務資料</p>}
            {adminNodes.map(node => {
              const isEditing = editingNodeId === node.id;
              const isChecklistExpanded = expandedChecklistNodeId === node.id;
              return (
                <div key={node.id} className="p-4 bg-white border border-[#E6EAF0] rounded-[24px] shadow-sm transition-all duration-300">
                  {isEditing ? (
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between pb-2 border-b border-[#F3EEFF] mb-1">
                        <span className="text-xs font-black text-[#6D55A3]">編輯任務節點</span>
                        <span className="text-[10px] font-mono text-[#7B7B74]">ID: {node.id}</span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-[#7B7B74] mb-1">時間</label>
                          <input 
                            type="time" 
                            value={editForm.time} 
                            onChange={e => setEditForm({...editForm, time: e.target.value})} 
                            className="w-full px-2 py-1.5 bg-[#F3EEFF]/40 border border-[#E6EAF0] rounded-[10px] text-xs font-bold text-[#1F2937] focus:outline-none" 
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-[#7B7B74] mb-1">標題</label>
                          <input 
                            type="text" 
                            value={editForm.title} 
                            onChange={e => setEditForm({...editForm, title: e.target.value})} 
                            className="w-full px-2 py-1.5 bg-[#F3EEFF]/40 border border-[#E6EAF0] rounded-[10px] text-xs font-bold text-[#1F2937] focus:outline-none" 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-[#7B7B74] mb-1">角色</label>
                          <input 
                            type="text" 
                            value={editForm.assignee} 
                            onChange={e => setEditForm({...editForm, assignee: e.target.value})} 
                            className="w-full px-2 py-1.5 bg-[#F3EEFF]/40 border border-[#E6EAF0] rounded-[10px] text-xs font-bold text-[#1F2937] focus:outline-none" 
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-[#7B7B74] mb-1">地點</label>
                          <input 
                            type="text" 
                            value={editForm.location} 
                            onChange={e => setEditForm({...editForm, location: e.target.value})} 
                            className="w-full px-2 py-1.5 bg-[#F3EEFF]/40 border border-[#E6EAF0] rounded-[10px] text-xs font-bold text-[#1F2937] focus:outline-none" 
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-[#7B7B74] mb-1">詳細備註</label>
                        <textarea 
                          rows={2} 
                          value={editForm.details} 
                          onChange={e => setEditForm({...editForm, details: e.target.value})} 
                          className="w-full px-2 py-1.5 bg-[#F3EEFF]/40 border border-[#E6EAF0] rounded-[10px] text-xs font-bold text-[#1F2937] focus:outline-none resize-none" 
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button 
                          type="button" 
                          onClick={() => setEditingNodeId(null)}
                          className="px-3 py-1.5 bg-[#7B7B74]/10 hover:bg-[#7B7B74]/20 text-[#7B7B74] text-xs font-bold rounded-lg transition-all"
                        >
                          取消
                        </button>
                        <button 
                          type="button" 
                          onClick={() => handleUpdateNode(node.id)}
                          className="px-4 py-1.5 bg-gradient-to-r from-[#00B8B8] to-[#6D55A3] text-white text-xs font-bold rounded-lg shadow-sm hover:opacity-90 transition-all"
                        >
                          儲存更新
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-[14px] font-bold text-[#1F2937] mb-1 flex items-center gap-2">
                             <span className="text-[#6D55A3] font-mono">{renderInlineEdit('node', node.id, 'time', node.time, "font-mono", "time")}</span> 
                             {renderInlineEdit('node', node.id, 'title', node.title, "flex-1")}
                          </div>
                          <div className="text-xs font-medium text-[#7B7B74] flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3 text-[#6D55A3]/70" /> 
                              {renderInlineEdit('node', node.id, 'assignee', node.assignee, "")}
                            </span>
                            <span className="text-[#E6EAF0]">|</span> 
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-[#F25D6B]/70" /> 
                              {renderInlineEdit('node', node.id, 'location', node.location, "")}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button 
                            type="button"
                            onClick={() => startEditing(node)}
                            className="p-2 text-[#6D55A3]/60 hover:text-[#6D55A3] hover:bg-[#F3EEFF] rounded-[12px] transition-colors"
                            title="開啟詳細編輯"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleDeleteNode(node.id, node.title)}
                            className="p-2 text-[#F25D6B]/50 hover:text-[#F25D6B] hover:bg-[#FFF2F4] rounded-[12px] transition-colors"
                            title="刪除任務"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 border-t border-slate-100 pt-2">
                        <button
                          type="button"
                          onClick={() => setExpandedChecklistNodeId(isChecklistExpanded ? null : node.id)}
                          className="text-xs font-bold text-[#6D55A3] hover:text-[#F25D6B] flex items-center gap-1 transition-colors"
                        >
                          {isChecklistExpanded ? "▲ 收起確認清單項目" : `▼ 管理確認項目 (${node.checklist?.length || 0})`}
                        </button>

                        {isChecklistExpanded && (
                          <div className="mt-3 pl-2 border-l-2 border-[#6D55A3]/30 space-y-3">
                            <div className="bg-[#F3EEFF]/30 p-3 rounded-2xl border border-[#E6EAF0]">
                              <p className="text-[10px] font-black text-[#6D55A3] mb-1.5">＋新增確認項目細項</p>
                              <div className="space-y-2">
                                <input 
                                  type="text"
                                  placeholder="項目名稱 (例如：準備對講機)"
                                  value={newChecklistItem.text}
                                  onChange={e => setNewChecklistItem({ ...newChecklistItem, text: e.target.value })}
                                  className="w-full px-2.5 py-1.5 bg-white border border-[#E6EAF0] rounded-xl text-xs font-bold text-[#1F2937] focus:outline-none"
                                />
                                <input 
                                  type="text"
                                  placeholder="細節備註 (可選)"
                                  value={newChecklistItem.details}
                                  onChange={e => setNewChecklistItem({ ...newChecklistItem, details: e.target.value })}
                                  className="w-full px-2.5 py-1.5 bg-white border border-[#E6EAF0] rounded-xl text-xs font-bold text-[#1F2937] focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddChecklistItem(node.id)}
                                  className="w-full py-1.5 bg-[#6D55A3] hover:bg-[#6D55A3]/90 text-white font-bold rounded-xl text-[11px] shadow-sm transition-colors"
                                >
                                  新增此確認細項
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2.5">
                              <button
                                type="button"
                                disabled={isGeneratingSuggestions === node.id}
                                onClick={() => handleGenerateAIChecklist(node)}
                                className="w-full py-2 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-bold rounded-xl text-[10px] shadow-sm transition-all flex items-center justify-center gap-1 hover:opacity-90 disabled:opacity-50"
                              >
                                {isGeneratingSuggestions === node.id ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    正在生成服事建議...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                                    ✨ AI 智慧推薦服事細項
                                  </>
                                )}
                              </button>

                              {aiSuggestions[node.id] && aiSuggestions[node.id].length > 0 && (
                                <div className="bg-[#FFF9F3] p-3 rounded-2xl border border-dashed border-[#6D55A3]/30 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-[#6D55A3] flex items-center gap-1">
                                      <Sparkles className="w-3 h-3 text-[#F25D6B]" /> AI 建議清單
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleAddAllSuggestions(node.id)}
                                      className="text-[9px] font-bold text-[#00B8B8] hover:underline"
                                    >
                                      一鍵全加
                                    </button>
                                  </div>
                                  <div className="space-y-1.5">
                                    {aiSuggestions[node.id].map((sug, sIdx) => (
                                      <div key={sIdx} className="p-2 bg-white rounded-xl border border-[#E6EAF0] flex items-start justify-between gap-1 shadow-sm">
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[11px] font-bold text-slate-800 leading-tight">{sug.text}</p>
                                          <p className="text-[9px] text-slate-500 leading-normal mt-0.5">{sug.details}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleAddSuggestedItem(node.id, sug)}
                                          className="p-1 text-[#00B8B8] hover:bg-[#00B8B8]/10 rounded-lg text-[10px] font-bold shrink-0 ml-1.5"
                                        >
                                          新增
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              {node.checklist && node.checklist.length > 0 ? (
                                node.checklist.map((item: any, idx: number) => {
                                  return (
                                    <div 
                                      key={item.id}
                                      draggable={true}
                                      onDragStart={(e) => handleDragStart(e, item.id)}
                                      onDragOver={handleDragOver}
                                      onDrop={(e) => handleDrop(e, node.id, item.id)}
                                      className="flex items-center justify-between p-2 bg-[#FFF9F3]/60 hover:bg-[#FFF2F4]/60 border border-[#E6EAF0] rounded-xl transition-all shadow-sm"
                                    >
                                      <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                                        <div 
                                          className="cursor-grab text-slate-400 hover:text-[#6D55A3] shrink-0" 
                                          title="拖曳上下移動排序"
                                        >
                                          <GripVertical className="w-4 h-4" />
                                        </div>

                                        <div className="flex flex-col shrink-0">
                                          <button 
                                            type="button"
                                            disabled={idx === 0}
                                            onClick={() => moveChecklistItem(node.id, idx, 'up')}
                                            className="text-[10px] text-slate-400 hover:text-[#6D55A3] disabled:opacity-30 disabled:hover:text-slate-400"
                                          >
                                            <ArrowUp className="w-3 h-3" />
                                          </button>
                                          <button 
                                            type="button"
                                            disabled={idx === node.checklist.length - 1}
                                            onClick={() => moveChecklistItem(node.id, idx, 'down')}
                                            className="text-[10px] text-slate-400 hover:text-[#6D55A3] disabled:opacity-30 disabled:hover:text-slate-400"
                                          >
                                            <ArrowDown className="w-3 h-3" />
                                          </button>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-bold text-slate-800">
                                            {renderInlineEdit('checklist', item.id, 'text', item.text, "w-full")}
                                          </div>
                                          <div className="text-[10px] text-slate-500 font-medium">
                                            {renderInlineEdit('checklist', item.id, 'details', item.details || "點選填寫詳細細節說明", "w-full block", "textarea")}
                                          </div>
                                        </div>
                                      </div>

                                      <button 
                                        type="button"
                                        onClick={() => handleDeleteChecklistItem(item.id)}
                                        className="p-1.5 text-[#F25D6B]/50 hover:text-[#F25D6B] hover:bg-[#FFF2F4] rounded-lg transition-colors shrink-0"
                                        title="刪除此確認細項"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="text-[11px] text-slate-400 text-center py-2">目前沒有確認事項，可在上方新增</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex justify-center w-full min-h-screen bg-[#F3EEFF] sm:p-6 md:p-10 font-sans">
      <div className="relative flex flex-col w-full max-w-[420px] bg-[#FFF9F3] sm:rounded-[40px] sm:border-[10px] border-[#6D55A3]/5 overflow-hidden shadow-2xl shadow-[#6D55A3]/20">
        
        {/* 全新品牌風格 - 頂部 Header */}
        <header className="sticky top-0 z-20 px-5 pt-6 pb-5 bg-gradient-to-br from-[#FFF9F3] via-[#F7F1FF] to-[#FFF2F4] border-b border-[#E6EAF0] rounded-b-[32px] shadow-sm mb-2">

  {/* 第一層：品牌與時間 */}
  <div className="flex items-start justify-between gap-4">
    <div className="flex items-start gap-3 min-w-0">
      <div className="w-11 h-11 rounded-2xl bg-white flex items-center justify-center shadow-md shadow-[#6D55A3]/10 border border-[#E6EAF0] shrink-0 overflow-hidden">
        <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
        <span className="text-[11px] font-black text-[#6D55A3] hidden">
          SHK
        </span>
      </div>

      <div className="min-w-0 pt-0.5">
        <h1 className="text-[24px] leading-tight font-black tracking-tight text-[#1F2937]">
          主日崇拜招待
        </h1>
        <p className="text-[13px] font-bold text-[#6D55A3] mt-2 flex items-center gap-1.5 opacity-90">
          <HeartHandshake className="w-4 h-4 shrink-0" />
          <span className="truncate">今天，我們一起歡迎家人回家</span>
        </p>
      </div>
    </div>

    <div className="bg-white/80 border border-[#E6EAF0] rounded-2xl px-3 py-2 text-right shadow-sm shrink-0 min-w-[86px]">
      <div className="text-[10px] font-black text-[#7B7B74] tracking-widest mb-0.5">
        目前時間
      </div>
      <div className="text-[24px] leading-none font-black font-mono text-[#1F2937] tracking-tighter">
        {currentTime || "載入中"}
      </div>
    </div>
  </div>

  {activeTab !== "checkin" && (
    <>
      {/* 第二層：狀態與語音控制 */}
      <div className="grid grid-cols-3 gap-2 mt-5">
        <div className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-full bg-white/80 border border-[#00B8B8]/20 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00B8B8] animate-pulse"></span>
          <span className="text-[10px] font-black text-[#00B8B8] tracking-wider">
            已連線
          </span>
        </div>

        <button
          type="button"
          onClick={handleToggleVoiceReminder}
          className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-full border text-[10px] font-black transition-all ${
            isVoiceEnabled
              ? "bg-[#F25D6B]/10 text-[#F25D6B] border-[#F25D6B]/20 shadow-sm"
              : "bg-white/80 text-[#7B7B74] border-[#E6EAF0] hover:bg-[#F3EEFF]"
          }`}
          title="開啟或關閉自動任務語音廣播"
        >
          {isVoiceEnabled ? (
            <Volume2 className="w-3.5 h-3.5" />
          ) : (
            <VolumeX className="w-3.5 h-3.5" />
          )}
          自動報時
        </button>

        <button
          type="button"
          onClick={toggleListening}
          disabled={isThinking}
          className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-full border text-[10px] font-black transition-all ${
            isListening
              ? "bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white border-transparent animate-pulse shadow-md shadow-[#F25D6B]/25"
              : isThinking
                ? "bg-amber-100 text-amber-700 border-amber-300"
                : "bg-white/80 text-[#6D55A3] border-[#E6EAF0] hover:bg-[#F3EEFF]"
          }`}
          title="點擊開始對話問答"
        >
          {isListening ? (
            <Mic className="w-3.5 h-3.5 text-white animate-bounce" />
          ) : isThinking ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
          ) : (
            <MicOff className="w-3.5 h-3.5" />
          )}
          {isListening ? "聆聽中" : isThinking ? "思考中" : "問助理"}
        </button>
      </div>

      {isAdminUnlocked && (
        <div className="grid grid-cols-3 gap-2.5 mt-5">
          {serviceOptions.map((srv) => (
            <button
              key={srv}
              onClick={() => {
                setCurrentService(srv);
                setCheckedInService(srv);
                hasManuallySwitchedRef.current = true;
                setNewNode((prev) => ({ ...prev, service_type: srv }));
              }}
              className={`px-4 py-3 rounded-full text-[15px] font-black transition-all duration-300 ${
                currentService === srv
                  ? "bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white shadow-lg shadow-[#F25D6B]/20 scale-[1.03]"
                  : "bg-white text-[#7B7B74] border border-[#E6EAF0] hover:bg-[#F3EEFF] hover:text-[#6D55A3]"
              }`}
            >
              {srv}
            </button>
          ))}
        </div>
      )}
    </>
  )}
</header>
        {/* 主內容區 */}
        {fetchError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#FFF9F3] text-center overflow-y-auto pb-28">
            <div className="w-16 h-16 bg-[#FFF2F4] rounded-full flex items-center justify-center mb-4">
               <AlertCircle className="w-8 h-8 text-[#F25D6B]" />
            </div>
            <h3 className="text-lg font-black text-[#1F2937] mb-2">無法讀取雲端資料</h3>
            <p className="text-sm font-medium text-[#7B7B74] bg-white p-4 rounded-[20px] border border-[#E6EAF0] shadow-sm break-all">{fetchError}</p>
            <button onClick={() => { setIsLoading(true); fetchData(); }} className="mt-6 px-8 py-3 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white rounded-full text-sm font-bold shadow-md hover:opacity-90 transition-opacity">
              重新連線
            </button>
          </div>
        ) : activeTab === 'checkin' ? (
          renderCheckinView()
        ) : activeTab === 'timeline' ? (
          renderTimelineView()
        ) : activeTab === 'status' ? (
          renderReviewView()
        ) : activeTab === 'settings' ? (
          renderPersonalSettingsView()
        ) : activeTab === 'control' ? (
          renderControlView()
        ) : (
          renderAdminView()
        )}

        {/* 全新品牌風格 - 彈跳視窗 */}
        {detailModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-[#1F2937]/40 backdrop-blur-sm" onClick={() => setDetailModal({isOpen: false, title: '', details: ''})}>
            <div className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-[#E6EAF0]/50 transform transition-all" onClick={e => e.stopPropagation()}>
              
              <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-br from-[#FFF9F3] to-[#F3EEFF] border-b border-[#E6EAF0]">
                <h3 className="font-extrabold text-[#1F2937] flex items-center gap-2.5 text-[15px]">
                  <div className="w-6 h-6 rounded-full bg-[#00B8B8]/10 flex items-center justify-center">
                    <Info className="w-3.5 h-3.5 text-[#00B8B8]" />
                  </div>
                  任務提醒
                </h3>
                <button onClick={() => setDetailModal({isOpen: false, title: '', details: ''})} className="p-2 text-[#7B7B74] hover:text-[#F25D6B] hover:bg-[#FFF2F4] rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto bg-white">
                <h4 className="text-[16px] font-bold text-[#6D55A3] mb-4 pb-3 border-b border-[#E6EAF0]">{detailModal.title}</h4>
                <div className="text-[15px] font-medium text-[#1F2937] leading-loose whitespace-pre-wrap">
                  {detailModal.details}
                </div>
              </div>
              
              <div className="p-4 bg-white border-t border-[#E6EAF0]">
                <button 
                  onClick={() => setDetailModal({isOpen: false, title: '', details: ''})}
                  className="w-full py-3.5 bg-[#F3EEFF] text-[#6D55A3] font-bold rounded-[16px] hover:bg-[#6D55A3] hover:text-white transition-colors"
                >
                  我知道了
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 密碼驗證解鎖彈窗 */}
        {showPasswordModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-[#1F2937]/50 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)}>
            <div className="bg-white rounded-[32px] w-full max-w-sm p-6 shadow-2xl border border-[#E6EAF0]/50 text-center" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-2xl bg-[#F3EEFF] flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6 text-[#6D55A3]" />
              </div>
              <h3 className="text-lg font-bold text-[#1F2937] mb-1">管理員身分驗證</h3>
              <p className="text-xs text-[#7B7B74] mb-4">請輸入任務 management 驗證密碼</p>
              
              <input 
                type="password" 
                placeholder="請輸入密碼" 
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleVerifyPassword();
                }}
                className="w-full text-center px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-2xl text-base font-bold text-[#1F2937] tracking-widest focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/40 mb-2"
                autoFocus
              />
              
              {passwordError && (
                <p className="text-xs font-bold text-[#F25D6B] mb-3">{passwordError}</p>
              )}

              <div className="flex gap-3 mt-4">
                <button 
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-3 bg-[#7B7B74]/10 hover:bg-[#7B7B74]/20 text-[#7B7B74] font-bold rounded-2xl text-sm transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={handleVerifyPassword}
                  className="flex-1 py-3 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-bold rounded-2xl text-sm shadow-md shadow-[#F25D6B]/25 hover:opacity-95 transition-all"
                >
                  確認解鎖
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 自訂 brand 質感通知視窗 */}
        {customAlert.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-5 bg-[#1F2937]/50 backdrop-blur-sm">
            <div className="bg-white rounded-[32px] w-full max-w-sm p-6 shadow-2xl border border-[#E6EAF0] text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#00B8B8]/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-[#00B8B8]" />
              </div>
              <p className="text-[15px] font-bold text-[#1F2937] leading-relaxed mb-6 whitespace-pre-line">
                {customAlert.message}
              </p>
              <button 
                onClick={() => setCustomAlert({ isOpen: false, message: "" })}
                className="w-full py-3.5 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-bold rounded-[16px] hover:opacity-90 transition-opacity"
              >
                我知道了
              </button>
            </div>
          </div>
        )}

        {/* 自訂 brand 質感確認視窗 */}
        {customConfirm.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-5 bg-[#1F2937]/50 backdrop-blur-sm">
            <div className="bg-white rounded-[32px] w-full max-w-sm p-6 shadow-2xl border border-[#E6EAF0] text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#F25D6B]/10 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 text-[#F25D6B]" />
              </div>
              <p className="text-[15px] font-bold text-[#1F2937] leading-relaxed mb-6 whitespace-pre-line">
                {customConfirm.message}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setCustomConfirm({ isOpen: false, message: "", onConfirm: () => {} })}
                  className="flex-1 py-3 bg-[#7B7B74]/10 hover:bg-[#7B7B74]/20 text-[#7B7B74] font-bold rounded-[16px] text-sm transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    customConfirm.onConfirm();
                    setCustomConfirm({ isOpen: false, message: "", onConfirm: () => {} });
                  }}
                  className="flex-1 py-3 bg-[#F25D6B] hover:bg-[#F25D6B]/90 text-white font-bold rounded-[16px] text-sm shadow-md shadow-[#F25D6B]/20 transition-all"
                >
                  確認執行
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 底部功能導覽列：保留原品牌配色與圓角風格，改為新現場流程架構 */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-1.5 px-2 py-3 bg-white/90 backdrop-blur-xl border-t border-[#E6EAF0] shadow-[0_-10px_40px_rgba(0,0,0,0.03)] pb-safe rounded-t-[32px] sm:rounded-t-[32px] sm:w-[420px] sm:mx-auto overflow-x-auto">
          {[
            { key: "checkin", label: "報到", icon: Check, color: "rose" },
            { key: "timeline", label: "流程", icon: ListTodo, color: "rose" },
            { key: "status", label: "狀態", icon: BarChart2, color: "purple" },
            { key: "control", label: "控場", icon: HeartHandshake, color: "purple" },
            { key: "settings", label: "設定", icon: User, color: "purple" },
            { key: "admin", label: "管理", icon: isAdminUnlocked ? Unlock : Settings, color: "purple", locked: !isAdminUnlocked }
          ].map((item) => {
            const NavIcon = item.icon;
            const active = activeTab === item.key;
            const activeClass = item.color === "rose"
              ? "text-[#F25D6B] bg-[#FFF2F4]"
              : "text-[#6D55A3] bg-[#F3EEFF]";

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  if (item.key === "admin" && !isAdminUnlocked) {
                    setShowPasswordModal(true);
                    setPasswordInput("");
                    setPasswordError("");
                    return;
                  }
                  setActiveTab(item.key);
                }}
                className={`flex flex-col items-center justify-center gap-1.5 transition-all duration-300 min-w-[58px] px-2 py-2 rounded-2xl ${
                  active ? activeClass : "text-[#7B7B74] hover:bg-[#F3EEFF]"
                }`}
              >
                <NavIcon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-black tracking-widest whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
