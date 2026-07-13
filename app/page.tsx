"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
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
  Unlock,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Volume2,
  VolumeX,
  Mic,    
  MicOff,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { useAuth } from '@/components/auth/AuthProvider';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getPublicSupabaseConfig } from '@/lib/supabase/config';
import { isServiceType, SERVICE_TYPES, STATION_OPTIONS_BY_SERVICE } from '@/lib/services/catalog';

// 第一階段 PWA 完成版：報到、堂次、QR Code 崗位確認、總招控場
const { url: supabaseUrl, publishableKey: supabasePublishableKey } = getPublicSupabaseConfig();
const hasValidKeys = Boolean(supabaseUrl && supabasePublishableKey);
const CHECKIN_PROFILE_STORAGE_PREFIX = "shekinah_checkin_profile_v2";
const LEGACY_CHECKIN_PROFILE_STORAGE_KEY = "shekinah_checkin_profile_v1";

// 使用原生 fetch 方法連線雲端 (維持原樣)
const supabaseFetch = async (endpoint: string, method = 'GET', body: any = null) => {
  if (!hasValidKeys) throw new Error("Missing keys");
  const { data: sessionData } = await getSupabaseBrowserClient().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("請重新登入");
  const headers: any = {
    'apikey': supabasePublishableKey,
    'Authorization': `Bearer ${accessToken}`,
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

const DEFAULT_GLOBAL_VOICE_SETTINGS = {
  voice_gender: "female",
  speaking_rate: 0.92,
  pitch: 1.5,
  volume_gain_db: 0,
  cache_version: "v1",
  updated_by: "",
  updated_at: ""
};

const DEFAULT_TTS_USAGE = {
  month: "",
  primary: { usedChars: 0, limitChars: 1000000, remainingChars: 1000000 },
  backup: { usedChars: 0, limitChars: 1000000, remainingChars: 1000000 },
  total: { usedChars: 0, limitChars: 2000000, remainingChars: 2000000, usageRate: 0 }
};

const formatNumber = (value: any) => Number(value || 0).toLocaleString("zh-TW");

const toFixedVoiceNumber = (value: any, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const cleanTextForTtsBilling = (value: any) => {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export default function App() {
  const { displayName: authDisplayName, isAdmin, isCoordinator, session } = useAuth();
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

  const [currentService, setCurrentService] = useState(''); 
  const serviceOptions = [...SERVICE_TYPES];
  const stationOptionsByService: Record<string, readonly string[]> = STATION_OPTIONS_BY_SERVICE;

  const stationQrCodeExamples = [
    { label: "主一堂 聖餐助手", value: "SHK|service=主一堂|station=聖餐助手|role=聖餐助手|tag=101C" },
    { label: "主二堂 2C 區塊牧招", value: "SHK|service=主二堂|station=2C 區塊牧招|role=牧招|tag=202C" },
    { label: "主二堂 2樓大堂專招", value: "主二堂｜2樓大堂專招" },
    { label: "主一堂 電梯專招", value: "SHK|service=主一堂|station=電梯專招|role=專招|tag=101E" },
    { label: "六晚崇 2樓大堂專招", value: "SHK|service=六晚崇|station=2樓大堂專招|role=專招|tag=602H" }
  ];

  const getStationOptionsForService = (service: string) => stationOptionsByService[service] || stationOptionsByService["主一堂"];

  const inferRoleFromStation = (station: string) => {
    if (!station) return "";
    if (station.includes("總招")) return station.includes("副") ? "副總招" : "總招";
    if (station.includes("聖餐")) return "聖餐助手";
    if (station.includes("區塊牧招")) return "牧招";
    if (station.includes("專招")) return "專招";
    return personalSettings.role || "專招";
  };


  // --- 報到 / 崗位 UI 狀態 ---
  // 報到顯示名稱由已驗證的 Supabase Auth 帳號提供；手機後四碼只作現場聯絡辨識。
  const checkinProfileStorageKey = `${CHECKIN_PROFILE_STORAGE_PREFIX}:${session.user.id}`;

  const [checkinProfile, setCheckinProfile] = useState({
    name: "",
    phoneLast4: "",
    deviceRemembered: false
  });
  const [checkinForm, setCheckinForm] = useState({
    phoneLast4: ""
  });
  const [phoneChangeForm, setPhoneChangeForm] = useState({
    newPhoneLast4: "",
    confirmPhoneLast4: ""
  });
  const [showPhoneChange, setShowPhoneChange] = useState(false);
  const [wifiVerified, setWifiVerified] = useState(false);
  const [wifiChecking, setWifiChecking] = useState(false);
  const [wifiCheckMessage, setWifiCheckMessage] = useState("目前不在教會網路，請確認連上 Wi-Fi：Slllc 後重試");
  const [isCheckinSyncing, setIsCheckinSyncing] = useState(false);
  const [checkinStatus, setCheckinStatus] = useState<"not_checked_in" | "checked_in" | "station_confirmed">("not_checked_in");
  const [checkedInAt, setCheckedInAt] = useState("");
  const [checkedInDay, setCheckedInDay] = useState<number | null>(null);
  const [checkedInService, setCheckedInService] = useState("");
  const [confirmedStation, setConfirmedStation] = useState("");
  const [stationScannerOpen, setStationScannerOpen] = useState(false);
  const [stationManualCode, setStationManualCode] = useState("");
  const [stationScannerMessage, setStationScannerMessage] = useState("可掃描崗位名牌上的 QR Code，或手動輸入崗位碼內容。");
  const [stationCameraActive, setStationCameraActive] = useState(false);
  const [assignedStation, setAssignedStation] = useState("");
  const [controlSelectedStation, setControlSelectedStation] = useState("");
  const [controlNote, setControlNote] = useState("");
  const checkinCompletedCardRef = useRef<HTMLDivElement>(null);
  const stationScanVideoRef = useRef<HTMLVideoElement>(null);
  const stationScanStreamRef = useRef<MediaStream | null>(null);
  const stationQrReaderRef = useRef<BrowserQRCodeReader | null>(null);
  const stationQrControlsRef = useRef<any>(null);
  const stationAutoStartAttemptedRef = useRef(false);

  const hasManuallySwitchedRef = useRef(false);


  // --- 管理權限相關狀態 ---
  // V1 先用本機身分名稱判斷是否顯示管理頁；正式版會改由後端帳號權限判斷。
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [isTimelineEditMode, setIsTimelineEditMode] = useState(false);

  // --- 自訂精美 Modal 提示框狀態 ---
  const [customAlert, setCustomAlert] = useState<{isOpen: boolean, message: string}>({ isOpen: false, message: "" });
  const [customConfirm, setCustomConfirm] = useState<{isOpen: boolean, message: string, onConfirm: () => void, confirmLabel?: string}>({ isOpen: false, message: "", onConfirm: () => {} });

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

  // --- 展開折疊管理任務清單狀態 (Accordion) ---
  const [expandedChecklistNodeId, setExpandedChecklistNodeId] = useState<string | null>(null);
  const [newChecklistItem, setNewChecklistItem] = useState({ text: "", details: "" });
  const CHECKLIST_SYNC_STORAGE_KEY = "shekinah_checklist_sync_modes_v1";
  const SPECIAL_TASK_BLOCK_STORAGE_KEY = "shekinah_special_task_blocks_v1";
  const [checklistSyncModeByNode, setChecklistSyncModeByNode] = useState<Record<string, "sync_all" | "special_only">>({});
  const [specialTaskBlocks, setSpecialTaskBlocks] = useState<Record<string, boolean>>({});
  const SPECIAL_CHECKLIST_ITEM_STORAGE_KEY = "shekinah_special_checklist_items_v1";
  const [specialChecklistItems, setSpecialChecklistItems] = useState<Record<string, boolean>>({});
  const [checklistUndoSnapshot, setChecklistUndoSnapshot] = useState<any | null>(null);
  const [checklistDraftEdit, setChecklistDraftEdit] = useState<any | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedSyncModes = window.localStorage.getItem(CHECKLIST_SYNC_STORAGE_KEY);
      if (savedSyncModes) setChecklistSyncModeByNode(JSON.parse(savedSyncModes));

      const savedSpecialBlocks = window.localStorage.getItem(SPECIAL_TASK_BLOCK_STORAGE_KEY);
      if (savedSpecialBlocks) setSpecialTaskBlocks(JSON.parse(savedSpecialBlocks));

      const savedSpecialChecklistItems = window.localStorage.getItem(SPECIAL_CHECKLIST_ITEM_STORAGE_KEY);
      if (savedSpecialChecklistItems) setSpecialChecklistItems(JSON.parse(savedSpecialChecklistItems));
    } catch (err) {
      console.error("讀取任務清單連動設定失敗:", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(CHECKLIST_SYNC_STORAGE_KEY, JSON.stringify(checklistSyncModeByNode));
      window.localStorage.setItem(SPECIAL_TASK_BLOCK_STORAGE_KEY, JSON.stringify(specialTaskBlocks));
      window.localStorage.setItem(SPECIAL_CHECKLIST_ITEM_STORAGE_KEY, JSON.stringify(specialChecklistItems));
    } catch (err) {
      console.error("儲存任務清單連動設定失敗:", err);
    }
  }, [checklistSyncModeByNode, specialTaskBlocks, specialChecklistItems]);

  // --- 【語音與語音助理相關狀態】 ---
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false); // 預設關閉語音助理
  const [isListening, setIsListening] = useState(false); // 麥克風聆聽狀態
  const [isThinking, setIsThinking] = useState(false); // AI 思考狀態
  const [voiceResultText, setVoiceResultText] = useState(""); // 語音指令解析文字回饋
  const [voiceAssistantMessage, setVoiceAssistantMessage] = useState(""); // 語音助理最新提醒文字
  const [globalVoiceSettings, setGlobalVoiceSettings] = useState<any>(DEFAULT_GLOBAL_VOICE_SETTINGS); // 全站共用語音設定
  const [voiceSettingsDraft, setVoiceSettingsDraft] = useState<any>(DEFAULT_GLOBAL_VOICE_SETTINGS); // 管理員調音草稿
  const [ttsUsage, setTtsUsage] = useState<any>(DEFAULT_TTS_USAGE); // Google TTS 本月用量
  const [isVoiceSettingsLoading, setIsVoiceSettingsLoading] = useState(false);
  const [isVoiceSettingsSaving, setIsVoiceSettingsSaving] = useState(false);
  const [isVoicePreviewing, setIsVoicePreviewing] = useState(false);
  const [recognition, setRecognition] = useState<any>(null); // SpeechRecognition 實例
  const voiceCommandBufferRef = useRef("");
  const recognitionShouldSubmitRef = useRef(false);
  const announcedNodesRef = useRef<Set<string>>(new Set()); // 紀錄已報時的任務，避免重複提醒
  const voiceAudioContextRef = useRef<any>(null);
  const voiceHtmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceHtmlAudioUnlockedRef = useRef(false);
  const voiceBufferCacheRef = useRef<Map<string, any>>(new Map());
  const voiceQueueRef = useRef<string[]>([]);
  const voiceProcessingRef = useRef(false);
  const voiceWakeLockRef = useRef<any>(null);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);

  // 語音快取版本：只更新語音 Cache Storage，不會清除 localStorage 的身分、手機後四碼或密碼雜湊。
  const VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v12";
  const VOICE_AUDIO_CACHE_VERSION = "v12-chirp3-unlocked-audio";
  useEffect(() => {
    if (typeof window === "undefined" || !("caches" in window)) return;
    void caches.keys().then(xs => Promise.all(xs.filter(x => x.startsWith("shekinah_voice_audio_") && x !== VOICE_AUDIO_CACHE_NAME).map(x => caches.delete(x)))).catch(err => console.warn("清除舊語音快取失敗:", err));
  }, []);

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
    voiceDetailLevel: "standard" as "simple" | "standard" | "detailed",
    voiceProfile: "zephyr" as "zephyr" | "iapetus"
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
          name: authDisplayName,
          role: parsed.role === "總召"
            ? "總招"
            : parsed.role === "副總召"
              ? "副總招"
              : (parsed.role || "總招"),
          vibrationReminderEnabled: parsed.vibrationReminderEnabled !== false,
          voiceDetailLevel: parsed.voiceDetailLevel || "standard",
          voiceProfile: parsed.voiceProfile === "iapetus" || parsed.voiceProfile === "mature_male" ? "iapetus" : "zephyr"
        }));
      }
    } catch (err) {
      console.error("讀取個人提醒設定失敗:", err);
    }
  }, [authDisplayName]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      // Remove obsolete client-side identity credentials from older releases.
      window.localStorage.removeItem("shekinah_checkin_registry_v1");
      window.localStorage.removeItem(LEGACY_CHECKIN_PROFILE_STORAGE_KEY);
      const saved = window.localStorage.getItem(checkinProfileStorageKey);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      const phoneLast4 = String(parsed.phoneLast4 || "").trim();
      if (!/^\d{4}$/.test(phoneLast4)) {
        window.localStorage.removeItem(checkinProfileStorageKey);
        return;
      }

      setCheckinProfile({
        name: authDisplayName,
        phoneLast4,
        deviceRemembered: parsed.deviceRemembered === true
      });
      setPersonalSettings(prev => ({ ...prev, name: authDisplayName }));
    } catch (err) {
      console.error("讀取報到身分失敗:", err);
    }
  }, [authDisplayName, checkinProfileStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!checkinProfile.name || !checkinProfile.phoneLast4) return;

    try {
      window.localStorage.setItem(checkinProfileStorageKey, JSON.stringify({
        phoneLast4: checkinProfile.phoneLast4,
        deviceRemembered: checkinProfile.deviceRemembered
      }));
    } catch (err) {
      console.error("儲存報到身分失敗:", err);
    }
  }, [checkinProfile, checkinProfileStorageKey]);

  const restorePersistentCheckin = useCallback(async () => {
    try {
      const response = await fetch("/api/check-in", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!response.ok) return;
      const result = await response.json();
      const record = result?.checkIn;
      if (!record?.id || !record?.serviceType) return;

      const checkedInDate = new Date(record.checkedInAt);
      setCheckedInAt(new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(checkedInDate));
      setCheckedInDay(checkedInDate.getDay());
      setCheckedInService(String(record.serviceType));
      setCurrentService(String(record.serviceType));
      setConfirmedStation(String(record.stationName || ""));
      setCheckinStatus(record.stationName || record.status === "station_confirmed" ? "station_confirmed" : "checked_in");
    } catch (error) {
      console.warn("恢復持久報到紀錄失敗:", error);
    }
  }, [session.access_token]);

  useEffect(() => {
    void restorePersistentCheckin();
  }, [restorePersistentCheckin]);

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
      "專招": ["專招", "總招", "副總招", "聖餐助手", "電梯專招", "手扶梯專招", "外場專招", "大堂專招"],
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


  const serviceNodes = nodes.filter(n => n.service_type === currentService);
  const filteredNodes = serviceNodes.filter(isNodeForCurrentPerson);
  const adminNodes = serviceNodes;
  const isNodeCompleted = (node: any) => node.checklist && node.checklist.length > 0 && node.checklist.every((c: any) => c.is_completed);

  const normalizeTaskBlockText = (value: any) => String(value || "")
    .replace(/\s/g, "")
    .replace(/[：:｜|,，、。.!！\-＿_]/g, "")
    .toLowerCase();

  const getTaskBlockKey = (node: any, includeAssignee = true) => {
    const titleKey = normalizeTaskBlockText(node?.title || "");
    if (!includeAssignee) return titleKey;
    return titleKey + "|" + normalizeTaskBlockText(node?.assignee || "");
  };

  const isSpecialTaskBlock = (nodeId: string) => specialTaskBlocks[nodeId] === true;

  const getTaskBlockSyncMode = (nodeId: string) => {
    if (isSpecialTaskBlock(nodeId)) return "special_only";
    return checklistSyncModeByNode[nodeId] || "sync_all";
  };

  const setTaskBlockSyncMode = (node: any, mode: "sync_all" | "special_only") => {
    if (!node?.id) return;

    setChecklistSyncModeByNode(prev => ({ ...prev, [node.id]: mode }));
    setSpecialTaskBlocks(prev => ({ ...prev, [node.id]: mode === "special_only" }));
  };

  const getServiceSpecialStyle = (serviceType: string) => {
    const styles: Record<string, any> = {
      "六晚崇": {
        panel: "bg-[#FFF7E6] border-[#F59E0B]/25",
        badge: "bg-[#F59E0B]/12 text-[#B45309] border-[#F59E0B]/25",
        activeButton: "bg-[#F59E0B] text-white border-[#F59E0B]"
      },
      "主一堂": {
        panel: "bg-[#EFFFFD] border-[#00B8B8]/25",
        badge: "bg-[#00B8B8]/12 text-[#008C8C] border-[#00B8B8]/25",
        activeButton: "bg-[#00B8B8] text-white border-[#00B8B8]"
      },
      "主二堂": {
        panel: "bg-[#F3EEFF] border-[#6D55A3]/20",
        badge: "bg-[#6D55A3]/12 text-[#6D55A3] border-[#6D55A3]/20",
        activeButton: "bg-[#6D55A3] text-white border-[#6D55A3]"
      }
    };

    return styles[serviceType] || styles["主一堂"];
  };

  const findLinkedTaskBlocks = (sourceNode: any) => {
    if (!sourceNode) return [];

    const strictKey = getTaskBlockKey(sourceNode, true);
    const titleKey = getTaskBlockKey(sourceNode, false);
    const candidates = nodes.filter((node: any) =>
      node.id !== sourceNode.id &&
      serviceOptions.includes(node.service_type) &&
      node.service_type !== sourceNode.service_type
    );

    const strictMatches = candidates.filter((node: any) => getTaskBlockKey(node, true) === strictKey);
    if (strictMatches.length > 0) return strictMatches;

    return candidates.filter((node: any) => getTaskBlockKey(node, false) === titleKey);
  };

  const getChecklistItemMatch = (targetNode: any, sourceItem: any) => {
    const checklist = targetNode?.checklist || [];
    if (!sourceItem) return null;

    return checklist.find((item: any) => item.sort_order === sourceItem.sort_order)
      || checklist.find((item: any) => normalizeTaskBlockText(item.text) === normalizeTaskBlockText(sourceItem.text))
      || null;
  };

  const buildChecklistUndoSnapshot = (sourceNode: any) => {
    if (!sourceNode) return null;

    const shouldIncludeLinked = getTaskBlockSyncMode(sourceNode.id) === "sync_all";
    const snapshotNodes = shouldIncludeLinked
      ? [sourceNode, ...findLinkedTaskBlocks(sourceNode).filter((node: any) => !isSpecialTaskBlock(node.id))]
      : [sourceNode];

    return {
      label: (sourceNode.service_type || "本堂") + "｜" + (sourceNode.title || "任務清單"),
      createdAt: new Date().toISOString(),
      nodes: snapshotNodes.map((node: any) => ({
        id: node.id,
        service_type: node.service_type,
        title: node.title,
        checklist: (node.checklist || []).map((item: any) => ({
          text: item.text || "",
          details: item.details || "",
          is_completed: item.is_completed === true,
          completed_at: item.completed_at || null,
          sort_order: item.sort_order || 0
        }))
      }))
    };
  };

  const saveChecklistUndoSnapshot = (sourceNode: any) => {
    const snapshot = buildChecklistUndoSnapshot(sourceNode);
    if (snapshot) setChecklistUndoSnapshot(snapshot);
  };

  const restoreChecklistUndoSnapshot = async () => {
    if (!checklistUndoSnapshot) {
      setCustomAlert({ isOpen: true, message: "目前沒有可回復的上一步。" });
      return;
    }

    const normalizeUndoText = (value: any) => String(value || "")
      .replace(/\s/g, "")
      .replace(/[：:｜|,，、。.!！\-＿_]/g, "")
      .toLowerCase();

    const dedupeSnapshotItems = (items: any[]) => {
      const seen = new Set<string>();
      return [...items]
        .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
        .filter((item: any) => {
          const key = normalizeUndoText(item.text) + "|" + normalizeUndoText(item.details);
          if (!key || key === "|") return false;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((item: any, index: number) => ({
          ...item,
          sort_order: index
        }));
    };

    setCustomConfirm({
      isOpen: true,
      message: "要回到上一步嗎？\n系統會先清除這個任務區塊目前的任務清單，再用去重後的上一步資料重建，避免重複清單。\n" + checklistUndoSnapshot.label,
      confirmLabel: "回上一步",
      onConfirm: async () => {
        try {
          for (const snapshotNode of checklistUndoSnapshot.nodes) {
            const restoredChecklist = dedupeSnapshotItems(snapshotNode.checklist || []);

            // 用 node_id 一次清空該任務區塊所有任務清單，避免逐筆刪除時因雲端回寫時間差造成重複。
            await supabaseFetch("checklist_items?node_id=eq." + snapshotNode.id, 'DELETE');

            for (const item of restoredChecklist) {
              await supabaseFetch('checklist_items', 'POST', {
                id: 'c_' + Math.random().toString(36).substr(2, 9),
                node_id: snapshotNode.id,
                text: item.text,
                details: item.details,
                is_completed: item.is_completed === true,
                completed_at: item.completed_at || null,
                sort_order: item.sort_order
              });
            }
          }

          setChecklistUndoSnapshot(null);
          setChecklistDraftEdit(null);
          await fetchData(true);
          setCustomAlert({ isOpen: true, message: "已回到上一步，並自動去除重複任務清單。" });
        } catch (err: any) {
          setCustomAlert({ isOpen: true, message: "回上一步失敗：" + err.message });
        }
      }
    });
  };

  const cancelChecklistEditing = () => {
    setActiveInlineEdit(null);
    setInlineEditValue("");
    setChecklistDraftEdit(null);
    setNewChecklistItem({ text: "", details: "" });
    void fetchData(true);
  };

  const isSpecialChecklistItem = (itemId: string) => specialChecklistItems[itemId] === true;

  const setChecklistItemSyncMode = (itemId: string, mode: "sync_all" | "special_only") => {
    if (!itemId) return;
    setSpecialChecklistItems(prev => ({ ...prev, [itemId]: mode === "special_only" }));
  };

  const openChecklistDraftEdit = (itemId: string) => {
    const sourceNode = nodes.find((node: any) => (node.checklist || []).some((item: any) => item.id === itemId));
    const sourceItem = sourceNode?.checklist?.find((item: any) => item.id === itemId) || null;
    if (!sourceNode || !sourceItem) return;

    setActiveInlineEdit(null);
    setInlineEditValue("");
    setChecklistDraftEdit({
      nodeId: sourceNode.id,
      itemId,
      text: sourceItem.text || "",
      details: sourceItem.details || "",
      mode: isSpecialChecklistItem(itemId) ? "special_only" : "sync_all"
    });
  };

  const saveChecklistDraftEdit = async () => {
    if (!checklistDraftEdit) return;

    const sourceNode = nodes.find((node: any) => node.id === checklistDraftEdit.nodeId);
    const sourceItem = sourceNode?.checklist?.find((item: any) => item.id === checklistDraftEdit.itemId) || null;
    const nextText = String(checklistDraftEdit.text || "").trim();
    const nextDetails = String(checklistDraftEdit.details || "").trim();
    const nextMode = checklistDraftEdit.mode === "special_only" ? "special_only" : "sync_all";

    if (!sourceNode || !sourceItem) return;
    if (!nextText) {
      setCustomAlert({ isOpen: true, message: "請輸入任務清單內容。" });
      return;
    }

    try {
      saveChecklistUndoSnapshot(sourceNode);
      setChecklistItemSyncMode(sourceItem.id, nextMode);

      await supabaseFetch("checklist_items?id=eq." + sourceItem.id, 'PATCH', {
        text: nextText,
        details: nextDetails
      });

      let syncedCount = 0;
      if (nextMode === "sync_all") {
        const linkedNodes = findLinkedTaskBlocks(sourceNode).filter((node: any) => !isSpecialTaskBlock(node.id));

        for (const targetNode of linkedNodes) {
          const targetItem = getChecklistItemMatch(targetNode, sourceItem);
          if (!targetItem || isSpecialChecklistItem(targetItem.id)) continue;

          setChecklistItemSyncMode(targetItem.id, "sync_all");
          await supabaseFetch("checklist_items?id=eq." + targetItem.id, 'PATCH', {
            text: nextText,
            details: nextDetails
          });
          syncedCount += 1;
        }
      }

      setChecklistDraftEdit(null);
      await fetchData(true);
      setCustomAlert({
        isOpen: true,
        message: nextMode === "sync_all"
          ? "任務清單已套用，並同步到另外 " + syncedCount + " 堂。"
          : "已套用為此堂特殊任務清單，這一項會以特殊顏色標示。"
      });
    } catch (err: any) {
      setCustomAlert({ isOpen: true, message: "套用任務清單失敗：" + err.message });
    }
  };

  const syncChecklistEditAcrossServices = async (sourceNode: any, sourceItem: any, field: string, updatedValue: string) => {
    if (!sourceNode || !sourceItem) return 0;
    if (getTaskBlockSyncMode(sourceNode.id) !== "sync_all") return 0;

    const linkedNodes = findLinkedTaskBlocks(sourceNode).filter((node: any) => !isSpecialTaskBlock(node.id));
    let syncedCount = 0;

    for (const targetNode of linkedNodes) {
      const targetItem = getChecklistItemMatch(targetNode, sourceItem);
      if (!targetItem) continue;

      await supabaseFetch("checklist_items?id=eq." + targetItem.id, 'PATCH', { [field]: updatedValue });
      syncedCount += 1;
    }

    return syncedCount;
  };

  const syncChecklistAddAcrossServices = async (sourceNode: any, itemText: string, itemDetails: string, sourceSortOrder: number) => {
    if (!sourceNode) return 0;
    if (getTaskBlockSyncMode(sourceNode.id) !== "sync_all") return 0;

    const linkedNodes = findLinkedTaskBlocks(sourceNode).filter((node: any) => !isSpecialTaskBlock(node.id));
    let syncedCount = 0;

    for (const targetNode of linkedNodes) {
      const checklist = targetNode.checklist || [];
      const alreadyExists = checklist.some((item: any) => normalizeTaskBlockText(item.text) === normalizeTaskBlockText(itemText));
      if (alreadyExists) continue;

      const maxOrder = checklist.length > 0 ? Math.max(...checklist.map((c: any) => c.sort_order || 0)) : -1;
      await supabaseFetch('checklist_items', 'POST', {
        id: 'c_' + Math.random().toString(36).substr(2, 9),
        node_id: targetNode.id,
        text: itemText,
        details: itemDetails,
        is_completed: false,
        sort_order: Number.isFinite(sourceSortOrder) ? sourceSortOrder : maxOrder + 1
      });
      syncedCount += 1;
    }

    return syncedCount;
  };

  const syncChecklistDeleteAcrossServices = async (sourceNode: any, sourceItem: any) => {
    if (!sourceNode || !sourceItem) return 0;
    if (getTaskBlockSyncMode(sourceNode.id) !== "sync_all") return 0;

    const linkedNodes = findLinkedTaskBlocks(sourceNode).filter((node: any) => !isSpecialTaskBlock(node.id));
    let syncedCount = 0;

    for (const targetNode of linkedNodes) {
      const targetItem = getChecklistItemMatch(targetNode, sourceItem);
      if (!targetItem) continue;

      await supabaseFetch("checklist_items?id=eq." + targetItem.id, 'DELETE');
      syncedCount += 1;
    }

    return syncedCount;
  };

  const timeToMinutes = (tStr: string) => {
    if (!tStr) return 0;
    const [h, m] = tStr.split(':').map(Number);
    return h * 60 + m;
  };

  const getVoiceCloseMinutesForService = (service: string) => {
    const map: Record<string, number> = {
      "六晚崇": 21 * 60 + 45,
      "主一堂": 10 * 60 + 15,
      "主二堂": 12 * 60 + 45
    };

    return map[service] ?? null;
  };

  const isCurrentServiceVoiceClosed = () => {
    const closeMinutes = getVoiceCloseMinutesForService(currentService);
    if (closeMinutes === null) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return currentMinutes >= closeMinutes;
  };

  const stopVoiceAssistantForServiceEnd = () => {
    setIsVoiceEnabled(false);
    voiceQueueRef.current = [];
    voiceProcessingRef.current = false;
    setVoiceAssistantMessage("本場服事已結束，語音助理已自動關閉。");
    void releaseVoiceWakeLock();
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

  // 溫柔女聲報時函數
  const getVoiceAudioContext = () => {
    if (typeof window === "undefined") return null;

    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!voiceAudioContextRef.current) {
      voiceAudioContextRef.current = new AudioContextClass();
    }

    return voiceAudioContextRef.current;
  };

  const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

  const playSoftDing = async () => {
    const ctx = getVoiceAudioContext();
    if (!ctx) return;

    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      gain.connect(ctx.destination);

      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(987.77, now);
      osc1.frequency.exponentialRampToValueAtTime(1318.51, now + 0.12);
      osc1.connect(gain);
      osc1.start(now);
      osc1.stop(now + 0.44);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1567.98, now + 0.04);
      osc2.connect(gain);
      osc2.start(now + 0.04);
      osc2.stop(now + 0.34);
    } catch (err) {
      console.warn("語音助理提示音播放失敗:", err);
    }
  };

  const speakWithBrowserVoiceFallback = async (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const cleanText = String(text || "").trim();
    if (!cleanText) return;

    await new Promise<void>((resolve) => {
      try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = "zh-TW";
        utterance.rate = toFixedVoiceNumber(globalVoiceSettings.speaking_rate, 0.92);
        utterance.pitch = globalVoiceSettings.voice_gender === "male" ? 0.92 : 1.08;
        utterance.volume = 1;

        const voices = window.speechSynthesis.getVoices?.() || [];
        const zhVoice = voices.find((voice) =>
          voice.lang?.toLowerCase().startsWith("zh") ||
          voice.name?.toLowerCase().includes("chinese") ||
          voice.name?.includes("國語") ||
          voice.name?.includes("中文")
        );

        if (zhVoice) utterance.voice = zhVoice;

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();

        window.speechSynthesis.speak(utterance);
        window.setTimeout(() => resolve(), Math.max(3500, cleanText.length * 180));
      } catch (err) {
        console.warn("瀏覽器語音備援播放失敗:", err);
        resolve();
      }
    });
  };

  const voiceProfileOptions = [
    { value: "zephyr", label: "女聲 Zephyr", description: "自然、明亮、溫柔，適合一般提醒。" },
    { value: "iapetus", label: "男聲 Iapetus", description: "自然、穩重、清楚，適合現場指令。" }
  ];
  const getVoiceProfile = () => personalSettings.voiceProfile === "iapetus" ? "iapetus" : "zephyr";

  const requestVoiceWakeLock = useCallback(async () => {
    if (typeof window === "undefined") return;

    const wakeLockApi = (navigator as any).wakeLock;
    if (!wakeLockApi?.request) return;

    if (voiceWakeLockRef.current) return;

    try {
      const sentinel = await wakeLockApi.request("screen");
      voiceWakeLockRef.current = sentinel;
      setIsWakeLockActive(true);

      sentinel.addEventListener?.("release", () => {
        voiceWakeLockRef.current = null;
        setIsWakeLockActive(false);
      });
    } catch (err) {
      console.warn("語音助理保持螢幕喚醒失敗:", err);
      setIsWakeLockActive(false);
    }
  }, []);

  const releaseVoiceWakeLock = useCallback(async () => {
    const sentinel = voiceWakeLockRef.current;
    voiceWakeLockRef.current = null;
    setIsWakeLockActive(false);

    try {
      await sentinel?.release?.();
    } catch (err) {
      console.warn("語音助理解除螢幕喚醒失敗:", err);
    }
  }, []);

  useEffect(() => {
    if (!isVoiceEnabled) {
      void releaseVoiceWakeLock();
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestVoiceWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void requestVoiceWakeLock();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isVoiceEnabled, requestVoiceWakeLock, releaseVoiceWakeLock]);

  useEffect(() => {
    return () => {
      void releaseVoiceWakeLock();
    };
  }, [releaseVoiceWakeLock]);

  const createVoiceCacheId = (text: string, voiceProfile = getVoiceProfile()) => {
    const cleanedText = cleanTextForTtsBilling(text);
    const voiceFingerprint = [
      globalVoiceSettings.cache_version || "v1",
      getVoiceProfile(),
      toFixedVoiceNumber(globalVoiceSettings.speaking_rate, 0.92),
      toFixedVoiceNumber(globalVoiceSettings.pitch, 1.5),
      toFixedVoiceNumber(globalVoiceSettings.volume_gain_db, 0)
    ].join("|");

    const input = `${VOICE_AUDIO_CACHE_VERSION}|${voiceProfile}|${voiceFingerprint}|${cleanedText}`;
    let hash = 2166136261;

    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return `${voiceProfile}-${(hash >>> 0).toString(16)}-${input.length}`;
  };

  const fetchVoiceBlob = async (text: string) => {
    if (typeof window === "undefined") return null;

    const cleanText = cleanTextForTtsBilling(text);
    if (!cleanText) return null;

    const voiceProfile = getVoiceProfile();
    const cacheId = createVoiceCacheId(cleanText, voiceProfile);
    const cacheUrl = `${window.location.origin}/voice-cache/${cacheId}.mp3`;

    if ("caches" in window) {
      const cache = await caches.open(VOICE_AUDIO_CACHE_NAME);
      const cached = await cache.match(cacheUrl);
      if (cached) {
        return cached.blob();
      }

      const response = await fetch("/api/voice", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: cleanText, voiceProfile, serviceType: currentService, checkinDay: checkedInDay })
      });

      if (!response.ok) {
        const contentType = response.headers.get("Content-Type") || "";
        let errorPayload: any = null;

        if (contentType.includes("application/json")) {
          errorPayload = await response.json().catch(() => null);
        } else {
          const errorText = await response.text().catch(() => "");
          errorPayload = { error: errorText || "語音產生失敗" };
        }

        const error: any = new Error(errorPayload?.error || "語音產生失敗");
        error.fallbackToBrowser = errorPayload?.fallbackToBrowser === true;
        error.reason = errorPayload?.reason || "";
        throw error;
      }

      const blob = await response.blob();
      await cache.put(cacheUrl, new Response(blob, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=31536000, immutable"
        }
      }));

      return blob;
    }

    const response = await fetch("/api/voice", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: cleanText, voiceProfile, serviceType: currentService, checkinDay: checkedInDay })
    });

    if (!response.ok) {
      const contentType = response.headers.get("Content-Type") || "";
      let errorPayload: any = null;

      if (contentType.includes("application/json")) {
        errorPayload = await response.json().catch(() => null);
      } else {
        const errorText = await response.text().catch(() => "");
        errorPayload = { error: errorText || "語音產生失敗" };
      }

      const error: any = new Error(errorPayload?.error || "語音產生失敗");
      error.fallbackToBrowser = errorPayload?.fallbackToBrowser === true;
      throw error;
    }

    return response.blob();
  };

  const getVoiceHtmlAudio = () => {
    if (typeof window === "undefined") return null;
    if (!voiceHtmlAudioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.volume = 1;
      voiceHtmlAudioRef.current = audio;
    }
    return voiceHtmlAudioRef.current;
  };

  const unlockVoiceHtmlAudio = async () => {
    const audio = getVoiceHtmlAudio();
    if (!audio || voiceHtmlAudioUnlockedRef.current) return;
    const silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA==";
    try {
      audio.src = silentWav;
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      voiceHtmlAudioUnlockedRef.current = true;
      console.info("語音播放器已解鎖");
    } catch (err) {
      audio.muted = false;
      console.warn("語音播放器尚未解鎖:", err);
    }
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    const unlock = () => { void unlockVoiceHtmlAudio(); };
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("touchend", unlock, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("touchend", unlock);
    };
  }, []);

  const playVoiceBlob = async (blob: Blob) => {
    const audio = getVoiceHtmlAudio();
    if (!audio) throw new Error("此裝置無法建立語音播放器。");
    if (!blob || blob.size === 0) throw new Error("語音音檔內容為空。");

    const objectUrl = URL.createObjectURL(blob);
    try {
      audio.pause();
      audio.src = objectUrl;
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = 1;
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          audio.onended = null;
          audio.onerror = null;
          audio.onplaying = null;
        };
        audio.onended = () => { cleanup(); resolve(); };
        audio.onerror = () => { cleanup(); reject(new Error("瀏覽器無法播放語音音檔。")); };
        audio.onplaying = () => {
          voiceHtmlAudioUnlockedRef.current = true;
          console.info("語音開始播放", { bytes: blob.size, type: blob.type || "audio/mpeg" });
        };
        const p = audio.play();
        if (p && typeof p.catch === "function") {
          p.catch(err => { cleanup(); reject(err); });
        }
      });
    } finally {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
    }
  };

  const loadVoiceBuffer = async (text: string) => {
    const ctx = getVoiceAudioContext();
    if (!ctx) return null;

    const cleanText = cleanTextForTtsBilling(text);
    if (!cleanText) return null;

    const cacheId = createVoiceCacheId(cleanText);
    const existingBuffer = voiceBufferCacheRef.current.get(cacheId);
    if (existingBuffer) return existingBuffer;

    const blob = await fetchVoiceBlob(cleanText);
    if (!blob) return null;

    const arrayBuffer = await blob.arrayBuffer();
    const decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    voiceBufferCacheRef.current.set(cacheId, decodedBuffer);
    return decodedBuffer;
  };

  const preloadVoiceText = async (text: string) => {
    try {
      await loadVoiceBuffer(text);
    } catch (err) {
      console.warn("語音助理預載失敗:", err);
    }
  };

  const playVoiceBuffer = async (buffer: any) => {
    const ctx = getVoiceAudioContext();
    if (!ctx || !buffer) return;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    await new Promise<void>((resolve, reject) => {
      try {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => resolve();
        source.start(ctx.currentTime);
      } catch (err) {
        reject(err);
      }
    });
  };

  const processVoiceQueue = async () => {
    if (voiceProcessingRef.current) return;
    voiceProcessingRef.current = true;

    try {
      while (voiceQueueRef.current.length > 0) {
        const nextText = voiceQueueRef.current.shift();
        if (!nextText) continue;

        try {
          await playSoftDing();
          await wait(360);
          const blob = await fetchVoiceBlob(nextText);
          if (!blob) throw new Error("語音音檔不存在。");
          await playVoiceBlob(blob);
          await wait(850);
        } catch (err: any) {
          // 已經播放過第一次提示音；若雲端 TTS 超過月用量或暫時不可用，退回瀏覽器語音，不再補第二聲。
          console.error("語音助理播放失敗:", err);

          if (err?.reason === "service_closed" || err?.reason === "service_date_expired") {
            stopVoiceAssistantForServiceEnd();
            continue;
          }

          if (err?.fallbackToBrowser) {
            await speakWithBrowserVoiceFallback(nextText);
            await wait(650);
          }
        }
      }
    } finally {
      voiceProcessingRef.current = false;
    }
  };

  const speak = (text: string) => {
    const cleanText = String(text || "").trim();
    const billableCleanText = cleanTextForTtsBilling(cleanText);
    if (!billableCleanText) return;

    // 真正人聲由 /api/voice 產生 MP3，前端以版本化 Cache Storage 與 Web Audio 預載播放。
    // 介面不顯示播報文字，避免耳機提醒變成多餘視覺干擾。
    setVoiceAssistantMessage("");
    voiceQueueRef.current.push(cleanText);
    void processVoiceQueue();
  };

  const previewVoiceDraft = async () => {
    if (isVoicePreviewing) return;

    const ctx = getVoiceAudioContext();
    if (!ctx) {
      setCustomAlert({ isOpen: true, message: "此裝置暫時無法播放試聽音訊。" });
      return;
    }

    const sampleText = "提醒您，五分鐘後，18點，要集合專招。";

    try {
      setIsVoicePreviewing(true);

      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      await unlockVoiceHtmlAudio();

      const response = await fetch("/api/voice", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: sampleText,
          preview: true,
          voiceProfile: voiceSettingsDraft.voice_gender === "male" ? "iapetus" : "zephyr",
          voiceTuning: {
            speakingRate: toFixedVoiceNumber(voiceSettingsDraft.speaking_rate, 0.92),
            pitch: toFixedVoiceNumber(voiceSettingsDraft.pitch, 1.5),
            volumeGainDb: toFixedVoiceNumber(voiceSettingsDraft.volume_gain_db, 0)
          }
        })
      });

      if (!response.ok) {
        const contentType = response.headers.get("Content-Type") || "";
        let errorPayload: any = null;

        if (contentType.includes("application/json")) {
          errorPayload = await response.json().catch(() => null);
        } else {
          const errorText = await response.text().catch(() => "");
          errorPayload = { error: errorText || "試聽語音產生失敗" };
        }

        if (errorPayload?.fallbackToBrowser) {
          await speakWithBrowserVoiceFallback(sampleText);
          return;
        }

        throw new Error(errorPayload?.error || "試聽語音產生失敗");
      }

      const blob = await response.blob();
      await playVoiceBlob(blob);
    } catch (err: any) {
      console.error("全站語音試聽失敗:", err);
      setCustomAlert({ isOpen: true, message: err?.message || "試聽語音失敗，請稍後再試。" });
    } finally {
      setIsVoicePreviewing(false);
    }
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
2. 只能根據上方即時系統數據與招待處專業知識庫回答；資料中找不到答案時，請說「目前資料裡沒有這項資訊，請確認任務內容」。
3. 回答必須非常短，最多 60 個中文字，因為回答會被語音朗讀。
4. 絕對不要使用任何 Markdown 標記（如 **、*、###、- 等），請輸出乾淨的純文字。`;
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
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
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

      請自動推薦 3 個最具體、最重要的現場任務清單（Checklist items）。
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
      setCustomAlert({ isOpen: true, message: "新增任務清單失敗：" + err.message });
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
      speak(`目前服事進度：總共 ${allTasks.length} 個任務清單，已完成 ${completedTasks.length} 項，整體完成率為百分之 ${rate}。`);
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
      const response = await callGeminiWithRetry(commandText, instruction, 1, 400);
      speak(response);
    } catch (err) {
      console.error("Gemini AI 語音理解失敗，改用本地關鍵字比對 fallback", err);
      handleLocalVoiceCommandFallback(commandText);
    } finally {
      setIsThinking(false);
    }
  };

  // --- 語音辨識初始化與控制邏輯 ---
  // 問助理採「按一下開始錄音，再按一下停止錄音」；停止後才送 AI 分析。
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        const rec = new SpeechRecognitionClass();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'zh-TW';

        rec.onstart = () => {
          voiceCommandBufferRef.current = "";
          recognitionShouldSubmitRef.current = false;
          setVoiceResultText("正在聆聽，講完後請再按一次停止錄音。");
          setIsListening(true);
        };

        rec.onend = () => {
          setIsListening(false);

          if (!recognitionShouldSubmitRef.current) return;

          const finalText = voiceCommandBufferRef.current.trim();
          voiceCommandBufferRef.current = "";
          recognitionShouldSubmitRef.current = false;

          if (!finalText) {
            setVoiceResultText("");
            setCustomAlert({ isOpen: true, message: "沒有聽到清楚的內容，請再試一次。" });
            return;
          }

          setVoiceResultText(finalText);
          void handleVoiceCommand(finalText);

          window.setTimeout(() => {
            setVoiceResultText("");
          }, 4000);
        };

        rec.onerror = (event: any) => {
          console.error("語音辨識出錯", event.error);
          recognitionShouldSubmitRef.current = false;
          setIsListening(false);
          if (event.error === 'not-allowed') {
            setCustomAlert({ isOpen: true, message: "語音助理需要麥克風使用權限，請於瀏覽器中允許麥克風權限後重試！" });
          }
        };

        rec.onresult = (event: any) => {
          let finalText = "";
          let interimText = "";

          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const transcript = event.results[i][0].transcript || "";

            if (event.results[i].isFinal) {
              finalText += transcript;
            } else {
              interimText += transcript;
            }
          }

          if (finalText.trim()) {
            voiceCommandBufferRef.current = `${voiceCommandBufferRef.current} ${finalText}`.trim();
          }

          const displayText = `${voiceCommandBufferRef.current} ${interimText}`.trim();
          if (displayText) setVoiceResultText(displayText);
        };

        setRecognition(rec);
      }
    }
  }, []);

  const toggleListening = () => {
    if (!canUseQuestionAssistant) {
      setCustomAlert({ isOpen: true, message: "問助理功能目前只開放總招與管理員使用。" });
      return;
    }

    if (!recognition) {
      setCustomAlert({ isOpen: true, message: "您的裝置或瀏覽器不支援語音助理功能。建議使用 Google Chrome 或 Edge 瀏覽器！" });
      return;
    }

    if (isThinking) return;

    if (isListening) {
      recognitionShouldSubmitRef.current = true;
      try {
        recognition.stop();
      } catch (err) {
        console.error(err);
      }
      return;
    }

    try {
      voiceCommandBufferRef.current = "";
      recognitionShouldSubmitRef.current = false;
      recognition.start();
    } catch (err) {
      console.error(err);
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
        } else {
          setCurrentService('');
        }
      }
    };
    
    updateTime(); 
    const timer = setInterval(updateTime, 1000); 
    return () => clearInterval(timer);
  }, []);

  // --- 【整合自動化】語音助理提醒核心觸發邏輯 ---
  // 語音助理開啟時，會同時尊重：
  // 1. 個人設定：角色篩選、語音提醒、5分鐘前、準點、提醒內容
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
    if (minutes < 60) return `${minutes}分鐘後`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours}小時後`;
    return `${hours}小時${mins}分鐘後`;
  };

  const formatTaskTimeForVoice = (timeText: string) => {
    if (!timeText || !timeText.includes(":")) return "";
    const [hourRaw, minuteRaw] = timeText.split(":");
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);

    if (Number.isNaN(hour) || Number.isNaN(minute)) return timeText;
    if (minute === 0) return `${hour}點`;
    return `${hour}點${String(minute).padStart(2, "0")}分`;
  };

  const simplifyTaskPhrase = (node: any) => {
    let phrase = String(node.title || node.details || "服事任務").trim();
    const roleLabels = [
      personalSettings.role,
      node.assignee,
      "總招",
      "副總招",
      "電梯專招",
      "手扶梯專招",
      "2樓外場專招",
      "2樓大堂專招",
      "3樓大堂專招",
      "專招",
      "牧招",
      "聖餐助手"
    ]
      .filter(Boolean)
      .map((item: string) => String(item).trim())
      .sort((a, b) => b.length - a.length);

    roleLabels.forEach((label) => {
      if (!label) return;
      phrase = phrase.replace(new RegExp(`^${label}[，,、\s]*`), "");
      phrase = phrase.replace(new RegExp(`^請${label}[，,、\s]*`), "");
    });

    phrase = phrase
      .replace(/^請[您你]?/, "")
      .replace(/^負責/, "")
      .replace(/^至/, "前往")
      .replace(/^到/, "到")
      .replace(/[。.!！]+$/g, "")
      .trim();

    return phrase || "進行服事任務";
  };

  const buildDetailedVoiceHint = (node: any) => {
    if (personalSettings.voiceDetailLevel !== "detailed") return "";

    const hints: string[] = [];

    if (node.details) {
      const cleanDetails = String(node.details)
        .replace(/\s+/g, " ")
        .replace(/[。.!！]+$/g, "")
        .trim();

      if (cleanDetails) hints.push(cleanDetails);
    }

    const checklistItems = (node.checklist || [])
      .map((item: any) => String(item.text || "").trim())
      .filter(Boolean)
      .slice(0, 3);

    hints.push(...checklistItems);

    const uniqueHints = Array.from(new Set(hints))
      .filter(Boolean)
      .slice(0, 3);

    if (uniqueHints.length === 0) return "";

    return `記得${uniqueHints.join("、")}。`;
  };

  const buildReminderSpeechText = (node: any, reminderType: "pre5" | "now") => {
    const phrase = simplifyTaskPhrase(node);
    const detailHint = buildDetailedVoiceHint(node);

    if (reminderType === "pre5") {
      const taskTime = formatTaskTimeForVoice(node.time);

      if (personalSettings.voiceDetailLevel === "simple") {
        return taskTime
          ? `提醒您，五分鐘後，${taskTime}，${phrase}。`
          : `提醒您，五分鐘後，${phrase}。`;
      }

      return taskTime
        ? `提醒您，五分鐘後，${taskTime}，要${phrase}。${detailHint}`
        : `提醒您，五分鐘後，要${phrase}。${detailHint}`;
    }

    if (personalSettings.voiceDetailLevel === "simple") {
      return `可以${phrase}了。`;
    }

    return `可以${phrase}了。${detailHint}`;
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
    const nextReminder = getNextReminderInfo();

    if (!nextReminder) {
      return "語音助理已開啟。";
    }

    if (nextReminder.reminderType === "pre5") {
      return buildReminderSpeechText(nextReminder.node, "pre5");
    }

    return "語音助理已開啟。";
  };

  const announceVoiceReminderStatus = () => {
    speak(buildVoiceReminderStatusText());
  };

  const handleToggleVoiceReminder = () => {
    const nextEnabled = !isVoiceEnabled;

    if (nextEnabled && isCurrentServiceVoiceClosed()) {
      setCustomAlert({ isOpen: true, message: "本場服事已結束，語音助理已關閉。" });
      stopVoiceAssistantForServiceEnd();
      return;
    }

    setIsVoiceEnabled(nextEnabled);

    if (nextEnabled) {
      // 一定要在使用者點擊事件當下直接播放提示音，以解鎖手機音訊權限。
      void requestVoiceWakeLock();
      speak(buildVoiceReminderStatusText());
    } else {
      setVoiceAssistantMessage("");
      void releaseVoiceWakeLock();
    }
  };

  useEffect(() => {
    if (!isVoiceEnabled) return;

    const checkVoiceClose = () => {
      if (isCurrentServiceVoiceClosed()) {
        stopVoiceAssistantForServiceEnd();
      }
    };

    checkVoiceClose();
    const timer = window.setInterval(checkVoiceClose, 60_000);
    return () => window.clearInterval(timer);
  }, [isVoiceEnabled, currentService]);

  const hasCheckinProfile = Boolean(checkinProfile.name && checkinProfile.phoneLast4);
  const displayCheckinName = authDisplayName;
  const isCurrentUserAdmin = isAdmin;
  const canManageTimeline = isCoordinator;
  const canUseQuestionAssistant = canManageTimeline;

  useEffect(() => {
    setIsAdminUnlocked(canManageTimeline);

    if (!canManageTimeline && activeTab === "admin") {
      setActiveTab("checkin");
    }
  }, [canManageTimeline, activeTab]);

  const refreshVoiceSettingsAndUsage = useCallback(async () => {
    try {
      setIsVoiceSettingsLoading(true);
      const response = await fetch("/api/voice-settings", {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "讀取語音設定失敗");
      }

      const nextSettings = {
        ...DEFAULT_GLOBAL_VOICE_SETTINGS,
        ...(data?.settings || {})
      };

      const nextUsage = {
        ...DEFAULT_TTS_USAGE,
        ...(data?.usage || {})
      };

      setGlobalVoiceSettings(nextSettings);
      setVoiceSettingsDraft(nextSettings);
      setTtsUsage(nextUsage);
    } catch (err) {
      console.error("讀取全站語音設定失敗:", err);
    } finally {
      setIsVoiceSettingsLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    void refreshVoiceSettingsAndUsage();
  }, [refreshVoiceSettingsAndUsage]);

  const saveGlobalVoiceSettings = async () => {
    if (!isCurrentUserAdmin) return;

    try {
      setIsVoiceSettingsSaving(true);

      const response = await fetch("/api/voice-settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          settings: {
            voice_gender: voiceSettingsDraft.voice_gender === "male" ? "male" : "female",
            speaking_rate: toFixedVoiceNumber(voiceSettingsDraft.speaking_rate, 0.92),
            pitch: toFixedVoiceNumber(voiceSettingsDraft.pitch, 1.5),
            volume_gain_db: toFixedVoiceNumber(voiceSettingsDraft.volume_gain_db, 0)
          }
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "儲存語音設定失敗");
      }

      const nextSettings = {
        ...DEFAULT_GLOBAL_VOICE_SETTINGS,
        ...(data?.settings || {})
      };

      setGlobalVoiceSettings(nextSettings);
      setVoiceSettingsDraft(nextSettings);
      voiceBufferCacheRef.current.clear();
      setCustomAlert({ isOpen: true, message: "全站語音設定已套用。所有同工會使用這一組聲音。" });
      void refreshVoiceSettingsAndUsage();
    } catch (err: any) {
      console.error("儲存全站語音設定失敗:", err);
      setCustomAlert({ isOpen: true, message: err?.message || "儲存語音設定失敗，請稍後再試。" });
    } finally {
      setIsVoiceSettingsSaving(false);
    }
  };

  const isValidPhoneLast4 = (value: string) => /^\d{4}$/.test(value.trim());

  const clearCheckinIdentity = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(checkinProfileStorageKey);
      window.localStorage.removeItem(LEGACY_CHECKIN_PROFILE_STORAGE_KEY);
    }

    setCheckinProfile({
      name: "",
      phoneLast4: "",
      deviceRemembered: false
    });
    setCheckinForm({
      phoneLast4: ""
    });
    setPhoneChangeForm({
      newPhoneLast4: "",
      confirmPhoneLast4: ""
    });
    setShowPhoneChange(false);
    setWifiVerified(false);
    setWifiChecking(false);
    setWifiCheckMessage("目前不在教會網路，請確認連上 Wi-Fi：Slllc 後重試");
    setCheckinStatus("not_checked_in");
    setCheckedInAt("");
    setCheckedInDay(null);
    setCheckedInService("");
    setConfirmedStation("");
    setAssignedStation("");
    setControlSelectedStation("");
    setControlNote("");
    setStationScannerOpen(false);
    setStationManualCode("");
    setStationScannerMessage("可掃描崗位名牌上的 QR Code，或手動輸入崗位碼內容。");
    hasManuallySwitchedRef.current = false;
    setPersonalSettings(prev => ({ ...prev, name: authDisplayName }));
  };

  const handleCreateCheckinProfile = () => {
    const name = authDisplayName.trim();
    const phoneLast4 = checkinForm.phoneLast4.trim();

    if (!name) {
      setCustomAlert({ isOpen: true, message: "請輸入姓名。" });
      return;
    }

    if (!isValidPhoneLast4(phoneLast4)) {
      setCustomAlert({ isOpen: true, message: "手機後四碼請輸入 4 位數字。" });
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
    setCheckinForm({
      phoneLast4: ""
    });
    setCustomAlert({ isOpen: true, message: "已建立服事身分。這台手機下次會自動記住您。" });
  };

  const handleChangePhoneLast4 = () => {
    if (!checkinProfile.name || !checkinProfile.phoneLast4) {
      setCustomAlert({ isOpen: true, message: "請先建立服事身分。" });
      return;
    }

    const newPhoneLast4 = phoneChangeForm.newPhoneLast4.trim();
    const confirmPhoneLast4 = phoneChangeForm.confirmPhoneLast4.trim();

    if (!isValidPhoneLast4(newPhoneLast4) || !isValidPhoneLast4(confirmPhoneLast4)) {
      setCustomAlert({ isOpen: true, message: "新的手機後四碼請輸入 4 位數字。" });
      return;
    }

    if (newPhoneLast4 !== confirmPhoneLast4) {
      setCustomAlert({ isOpen: true, message: "兩次輸入的新手機後四碼不一致。" });
      return;
    }

    if (newPhoneLast4 === checkinProfile.phoneLast4) {
      setCustomAlert({ isOpen: true, message: "新的手機後四碼與目前相同，不需要更換。" });
      return;
    }

    setCheckinProfile(prev => ({
      ...prev,
      phoneLast4: newPhoneLast4,
      deviceRemembered: true
    }));
    setPhoneChangeForm({
      newPhoneLast4: "",
      confirmPhoneLast4: ""
    });
    setShowPhoneChange(false);
    setCustomAlert({ isOpen: true, message: "手機後四碼已更新完成。" });
  };

  const checkWifiConnection = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    setWifiChecking(true);

    if (!silent) {
      setWifiCheckMessage("正在重新檢查 Wi-Fi 連線...");
    }

    try {
      const response = await fetch(`/api/check-wifi?t=${Date.now()}`, {
        method: "GET",
        cache: "no-store"
      });

      const result = await response.json();

      if (response.ok && result.connected) {
        setWifiVerified(true);
        setWifiCheckMessage("目前您在教會網路，可進行點選簽到");
      } else {
        setWifiVerified(false);
        setWifiCheckMessage("目前不在教會網路，請確認連上 Wi-Fi：Slllc 後重試");
      }
    } catch (err) {
      console.error("檢查 Wi-Fi 連線失敗:", err);
      setWifiVerified(false);
      setWifiCheckMessage("目前不在教會網路，請確認連上 Wi-Fi：Slllc 後重試");
    } finally {
      setWifiChecking(false);
    }
  }, []);

  const handleWifiCheck = () => {
    void checkWifiConnection({ silent: false });
  };

  useEffect(() => {
    if (activeTab !== "checkin") return;
    if (!hasCheckinProfile) return;
    if (checkinStatus !== "not_checked_in") return;
    if (wifiVerified) return;

    void checkWifiConnection({ silent: true });

    const autoCheckTimer = window.setInterval(() => {
      void checkWifiConnection({ silent: true });
    }, 10000);

    const handleOnline = () => {
      void checkWifiConnection({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkWifiConnection({ silent: true });
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(autoCheckTimer);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeTab, hasCheckinProfile, checkinStatus, checkWifiConnection]);


  const handleLocalCheckin = async () => {
    if (!hasCheckinProfile) {
      setCustomAlert({ isOpen: true, message: "請先建立服事身分，再進行報到。" });
      return;
    }

    if (!wifiVerified) {
      setCustomAlert({ isOpen: true, message: "請確認連接上 Wi-Fi：Slllc 後重試。" });
      return;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const activeWindow = serviceTimeWindows.find((window) =>
      window.day === now.getDay()
      && currentMinutes >= timeTextToMinutes(window.start)
      && currentMinutes <= timeTextToMinutes(window.end)
    );
    const serviceType = activeWindow?.service || currentService;
    if (!isServiceType(serviceType)) {
      setCustomAlert({ isOpen: true, message: "目前無法判斷服事堂次，請聯絡總招確認。" });
      return;
    }

    setIsCheckinSyncing(true);
    try {
      const response = await fetch("/api/check-in", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "check_in", serviceType }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "報到失敗，請稍後再試。");

      const checkedInDate = new Date(result.checkIn.checked_in_at);
      const timeText = new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(checkedInDate);
      setCheckedInAt(timeText);
      setCheckedInDay(checkedInDate.getDay());
      setCheckedInService(serviceType);
      setCurrentService(serviceType);
      setConfirmedStation("");
      setCheckinStatus(result.checkIn.status === "station_confirmed" ? "station_confirmed" : "checked_in");
      triggerVibration([200, 100, 200]);
    } catch (error) {
      setCustomAlert({ isOpen: true, message: error instanceof Error ? error.message : "報到失敗，請稍後再試。" });
      return;
    } finally {
      setIsCheckinSyncing(false);
    }

    window.setTimeout(() => {
      checkinCompletedCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 180);
  };

  const handleCorrectCheckedInService = (newService: string) => {
    if (!isServiceType(newService)) return;

    if (checkinStatus === "not_checked_in") {
      setCurrentService(newService);
      hasManuallySwitchedRef.current = true;
      setNewNode((prev) => ({ ...prev, service_type: newService }));
      return;
    }

    setCustomAlert({
      isOpen: true,
      message: "堂次已寫入報到紀錄並鎖定。若需要更正，請總招協助處理。"
    });
  };

  const serviceTimeWindows = [
    { service: "六晚崇", day: 6, start: "17:30", end: "21:30", label: "週六 17:30–21:30" },
    { service: "主一堂", day: 0, start: "07:30", end: "09:59", label: "週日 07:30–09:59" },
    { service: "主二堂", day: 0, start: "10:00", end: "12:30", label: "週日 10:00–12:30" }
  ];

  const weekdayLabels = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

  const timeTextToMinutes = (timeText: string) => {
    const [hours = "0", minutes = "0"] = timeText.split(":");
    return Number(hours) * 60 + Number(minutes);
  };

  const getQrServiceTimeCheck = (badgeService: string) => {
    const now = new Date();
    const checkinDay = checkedInDay ?? now.getDay();
    const checkinMinutes = checkedInAt ? timeTextToMinutes(checkedInAt) : (now.getHours() * 60 + now.getMinutes());
    const checkinLabel = `${weekdayLabels[checkinDay]} ${checkedInAt || `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`}`;

    const activeWindows = serviceTimeWindows.filter((window) => {
      return window.day === checkinDay
        && checkinMinutes >= timeTextToMinutes(window.start)
        && checkinMinutes <= timeTextToMinutes(window.end);
    });

    const isReasonable = activeWindows.some((window) => window.service === badgeService);

    if (isReasonable) {
      return {
        isReasonable: true,
        checkinLabel,
        reason: `報到時間符合「${badgeService}」報到時段。`,
        activeServices: activeWindows.map((window) => window.service)
      };
    }

    const reason = activeWindows.length > 0
      ? `報到時間較接近「${activeWindows.map((window) => window.service).join("、")}」報到時段。`
      : "報到時間不在任何堂次的主要報到時段內。";

    return {
      isReasonable: false,
      checkinLabel,
      reason,
      activeServices: activeWindows.map((window) => window.service)
    };
  };

  const parseStationQrCode = (rawCode: string) => {
    const value = String(rawCode || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[：]/g, ":")
      .replace(/[｜]/g, "|")
      .replace(/\s+/g, " ")
      .trim();
    if (!value) return null;

    if (value.startsWith("SHK|")) {
      const pairs = value
        .split("|")
        .slice(1)
        .reduce((acc: Record<string, string>, item) => {
          const [key, ...rest] = item.split("=");
          if (key && rest.length > 0) acc[key.trim()] = rest.join("=").trim();
          return acc;
        }, {});

      const station = pairs.station || pairs.area || pairs.stn || "";
      if (!station) return null;

      return {
        service: pairs.service || pairs.svc || "",
        station,
        role: pairs.role || "",
        tag: pairs.tag || "",
        raw: value
      };
    }

    if (value.startsWith("SHK:")) {
      const [, service = "", station = "", role = "", tag = ""] = value.split(":");
      if (!station.trim()) return null;

      return {
        service: service.trim(),
        station: station.trim(),
        role: role.trim(),
        tag: tag.trim(),
        raw: value
      };
    }

    if (value.includes("|")) {
      const separator = "|";
      const [maybeService = "", maybeStation = ""] = value.split(separator).map(part => part.trim());

      if (isServiceType(maybeService) && maybeStation) {
        return {
          service: maybeService,
          station: maybeStation,
          role: inferRoleFromStation(maybeStation),
          tag: "",
          raw: value
        };
      }
    }

    const directService = checkedInService || currentService;
    const directOptions = getStationOptionsForService(directService);
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

    const simpleStation = value.toUpperCase();
    if (/^[1-9][0A-C]?$|^10$/.test(simpleStation)) {
      return {
        service: checkedInService || currentService,
        station: `${simpleStation} 區塊牧招`,
        role: "牧招",
        tag: "",
        raw: value
      };
    }

    return null;
  };

  const stopStationScanner = useCallback(() => {
    if (stationQrControlsRef.current) {
      try {
        stationQrControlsRef.current.stop();
      } catch (err) {
        console.warn("停止 ZXing 掃描失敗", err);
      }
      stationQrControlsRef.current = null;
    }

    stationQrReaderRef.current = null;

    if (stationScanStreamRef.current) {
      stationScanStreamRef.current.getTracks().forEach(track => track.stop());
      stationScanStreamRef.current = null;
    }

    if (stationScanVideoRef.current) {
      const stream = stationScanVideoRef.current.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      stationScanVideoRef.current.srcObject = null;
    }

    setStationCameraActive(false);
  }, []);

  const handleCloseStationScanner = () => {
    stopStationScanner();
    stationAutoStartAttemptedRef.current = false;
    setStationScannerOpen(false);
    setStationManualCode("");
    setStationScannerMessage("可掃描崗位名牌上的 QR Code，或手動輸入崗位碼內容。");
  };

  const confirmStationFromQrCode = (rawCode: string, source: "qr" | "manual" = "qr") => {
    const parsed = parseStationQrCode(rawCode);

    if (!parsed) {
      setStationScannerMessage("無法辨識此崗位碼。請確認格式為 SHK|service=主二堂|station=2C 區塊牧招|role=牧招，或主二堂｜2樓大堂專招。");
      return;
    }

    const badgeService = parsed.service || checkedInService || currentService;
    const existingLockedService = checkedInService;

    if (assignedStation && parsed.station !== assignedStation) {
      setStationScannerMessage(`這張名牌是「${parsed.station}」，但總招指定給您的是「${assignedStation}」。請確認是否拿錯名牌。`);
      triggerVibration([80, 80, 80]);
      return;
    }

    const applyBadgeStation = async () => {
      if (!isServiceType(badgeService)) {
        setStationScannerMessage("無法確認這張名牌的堂次。");
        return;
      }

      setIsCheckinSyncing(true);
      try {
        const response = await fetch("/api/check-in", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "confirm_station",
            serviceType: badgeService,
            stationName: parsed.station,
            source,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "崗位確認失敗。");

        setCheckedInService(badgeService);
        setCurrentService(badgeService);
        hasManuallySwitchedRef.current = true;
        setNewNode((prev) => ({ ...prev, service_type: badgeService }));
        setAssignedStation(prev => prev || parsed.station);
        setConfirmedStation(parsed.station);
        setCheckinStatus("station_confirmed");
        triggerVibration([200, 100, 200]);
        handleCloseStationScanner();
        setCustomAlert({
          isOpen: true,
          message: `崗位確認完成：${parsed.station}\n堂次：${badgeService}`
        });
      } catch (error) {
        setStationScannerMessage(error instanceof Error ? error.message : "崗位確認失敗。");
      } finally {
        setIsCheckinSyncing(false);
      }
    };

    if (parsed.service && existingLockedService && parsed.service !== existingLockedService) {
      triggerVibration([80, 80, 80]);
      setCustomConfirm({
        isOpen: true,
        message: `這張名牌屬於「${parsed.service}」，但您的持久報到紀錄已鎖定為「${existingLockedService}」。請向總招確認是否拿錯名牌。`,
        confirmLabel: "我知道了",
        onConfirm: () => {}
      });
      return;
    }

    if (parsed.service) {
      const timeCheck = getQrServiceTimeCheck(parsed.service);

      if (!timeCheck.isReasonable) {
        triggerVibration([80, 80, 80]);
        setCustomConfirm({
          isOpen: true,
          message: `報到時間與名牌堂次不一致。\n\n這張名牌顯示：${parsed.service}\n報到時間：${timeCheck.checkinLabel}\n系統判斷：${timeCheck.reason}\n\n請確認服事時段或名牌堂次是否正確。若這是總招發給您的名牌，請以名牌堂次完成確認。`,
          confirmLabel: `確認名牌堂次：${parsed.service}`,
          onConfirm: () => void applyBadgeStation()
        });
        return;
      }
    }

    void applyBadgeStation();
  };

  const handleStartStationCameraScanner = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStationScannerMessage("此瀏覽器不支援相機權限。請改用 Safari / Chrome 開啟，或使用手動輸入崗位碼。");
        return;
      }

      const video = stationScanVideoRef.current;
      if (!video) {
        setStationScannerMessage("相機畫面尚未準備好，請關閉視窗後再重新開啟掃描。");
        return;
      }

      stopStationScanner();

      const codeReader = new BrowserQRCodeReader();
      stationQrReaderRef.current = codeReader;
      setStationCameraActive(true);
      setStationScannerMessage("");

      const controls = await codeReader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" }
          },
          audio: false
        },
        video,
        (result, error, controls) => {
          if (result) {
            const rawValue = (result as any).getText?.() || (result as any).text || String(result);

            try {
              controls.stop();
            } catch (stopError) {
              console.warn("停止 ZXing 掃描失敗", stopError);
            }

            stationQrControlsRef.current = null;
            setStationCameraActive(false);
            confirmStationFromQrCode(rawValue, "qr");
            return;
          }
        }
      );

      stationQrControlsRef.current = controls;
      setStationScannerMessage("相機已開啟，請將 QR Code 放入畫面中央。");
    } catch (error: any) {
      console.error("ZXing 開啟相機失敗", error);
      stopStationScanner();

      const errorMessage = String(error?.message || error || "");
      if (errorMessage.includes("Permission") || errorMessage.includes("NotAllowed")) {
        setStationScannerMessage("相機權限被拒絕。請到瀏覽器設定允許相機權限，或改用手動輸入崗位碼。");
        return;
      }

      if (errorMessage.includes("NotFound") || errorMessage.includes("DevicesNotFound")) {
        setStationScannerMessage("找不到可用相機。請確認裝置有相機，或改用手動輸入崗位碼。");
        return;
      }

      setStationScannerMessage("無法開啟 ZXing QR 掃描。請確認使用 HTTPS 網址與 Safari / Chrome，或改用手動輸入崗位碼。");
    }
  };

  const handleManualStationCodeSubmit = (event?: any) => {
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
      confirmStationFromQrCode(manualCode, "manual");
    }, 0);
  };

  const handleOpenStationScanner = () => {
    if (checkinStatus === "not_checked_in") {
      setCustomAlert({ isOpen: true, message: "請先完成報到，再掃描崗位名牌。" });
      return;
    }

    if (checkinStatus === "station_confirmed") {
      setCustomConfirm({
        isOpen: true,
        message: `如需調整服事崗位，請重新掃描新的崗位 QR Code。\n\n目前崗位：${confirmedStation || personalSettings.role}\n\n重新掃描只會更新崗位，不會更改報到時間。`,
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

    stationAutoStartAttemptedRef.current = false;
    setStationScannerOpen(true);
    setStationScannerMessage("");
  };

  useEffect(() => {
    if (!stationScannerOpen) {
      stationAutoStartAttemptedRef.current = false;
      return;
    }

    if (stationAutoStartAttemptedRef.current) return;

    const autoStartTimer = window.setTimeout(() => {
      stationAutoStartAttemptedRef.current = true;
      void handleStartStationCameraScanner();
    }, 250);

    return () => window.clearTimeout(autoStartTimer);
  }, [stationScannerOpen]);

  const handleDemoStationConfirm = () => {
    const demoStation = assignedStation || (personalSettings.role === "牧招" ? "2C 區塊牧招" : personalSettings.role);
    confirmStationFromQrCode(`SHK|service=${checkedInService || currentService}|station=${demoStation}|role=${inferRoleFromStation(demoStation)}`, "manual");
  };

  useEffect(() => {
    return () => stopStationScanner();
  }, [stopStationScanner]);


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
      await supabaseFetch('rpc/set_checklist_item_completion', 'POST', {
        p_item_id: checkId,
        p_is_completed: willBeCompleted
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
    if (!isAdminUnlocked || !isTimelineEditMode) return;

    if (type === 'checklist') {
      openChecklistDraftEdit(id);
      return;
    }

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
        const sourceNode = nodes.find((node: any) => (node.checklist || []).some((item: any) => item.id === id));
        const sourceChecklistItem = sourceNode?.checklist?.find((item: any) => item.id === id) || null;
        saveChecklistUndoSnapshot(sourceNode);
        await supabaseFetch(`checklist_items?id=eq.${id}`, 'PATCH', { [field]: updatedValue });
        const syncedCount = await syncChecklistEditAcrossServices(sourceNode, sourceChecklistItem, field, updatedValue);
        if (syncedCount > 0) {
          setCustomAlert({ isOpen: true, message: "已同步更新另外 " + syncedCount + " 堂的相同任務清單。" });
        }
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
      setCustomAlert({ isOpen: true, message: "請輸入任務清單的標題！" });
      return;
    }

    const node = nodes.find(n => n.id === nodeId);
    const maxOrder = node?.checklist && node.checklist.length > 0 
      ? Math.max(...node.checklist.map((c: any) => c.sort_order || 0)) 
      : -1;

    const newItemId = 'c_' + Math.random().toString(36).substr(2, 9);
    try {
      saveChecklistUndoSnapshot(node);
      await supabaseFetch('checklist_items', 'POST', {
        id: newItemId,
        node_id: nodeId,
        text: newChecklistItem.text.trim(),
        details: newChecklistItem.details.trim() || '',
        is_completed: false,
        sort_order: maxOrder + 1
      });
      const syncedCount = await syncChecklistAddAcrossServices(node, newChecklistItem.text.trim(), newChecklistItem.details.trim() || '', maxOrder + 1);
      setNewChecklistItem({ text: "", details: "" });
      await fetchData(true);
      if (syncedCount > 0) {
        setCustomAlert({ isOpen: true, message: "已新增，並同步到另外 " + syncedCount + " 堂的相同任務清單。" });
      }
    } catch (err: any) {
      setCustomAlert({ isOpen: true, message: "新增任務清單失敗：" + err.message });
    }
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    const sourceNode = nodes.find((node: any) => (node.checklist || []).some((item: any) => item.id === itemId));
    const sourceItem = sourceNode?.checklist?.find((item: any) => item.id === itemId) || null;
    const willSync = sourceNode && getTaskBlockSyncMode(sourceNode.id) === "sync_all" && findLinkedTaskBlocks(sourceNode).length > 0;

    setCustomConfirm({
      isOpen: true,
      message: willSync
        ? "確定要刪除這筆任務清單嗎？\n目前設定為連動三堂，會同步刪除另外兩堂相同任務清單。"
        : "確定要刪除這筆任務清單嗎？",
      confirmLabel: willSync ? "刪除並同步" : "確認刪除",
      onConfirm: async () => {
        try {
          saveChecklistUndoSnapshot(sourceNode);
          const syncedCount = await syncChecklistDeleteAcrossServices(sourceNode, sourceItem);
          await supabaseFetch(`checklist_items?id=eq.${itemId}`, 'DELETE');
          await fetchData(true);
          if (syncedCount > 0) {
            setCustomAlert({ isOpen: true, message: "已刪除，並同步刪除另外 " + syncedCount + " 堂的對應任務清單。" });
          }
        } catch (err: any) {
          setCustomAlert({ isOpen: true, message: "刪除任務清單失敗：" + err.message });
        }
      }
    });
  };

  const getReminderSettings = (_node: any) => ({
    voiceReminderEnabled: true,
    reminderPre5Enabled: true,
    reminderNowEnabled: true
  });


  const handleToggleTimelineEditMode = () => {
    if (isTimelineEditMode) {
      setActiveInlineEdit(null);
      setInlineEditValue("");
      setChecklistDraftEdit(null);
      setIsTimelineEditMode(false);
      setActiveTab("timeline");
      return;
    }

    setIsTimelineEditMode(true);
    setActiveTab("timeline");
  };

  const insertInlineLineBreak = () => {
    setInlineEditValue(prev => prev ? prev + "\n" : "");
  };

  const renderInlineEdit = (type: 'node' | 'checklist', id: string, field: string, currentValue: string, styleClass: string, inputType: 'text' | 'time' | 'textarea' = 'text') => {
    const isEditing = activeInlineEdit?.type === type && activeInlineEdit?.id === id && activeInlineEdit?.field === field;

    if (!isAdminUnlocked || !isTimelineEditMode) {
      return <span className={styleClass}>{currentValue || "(未填寫)"}</span>;
    }

    if (type === 'checklist' && field === 'text' && checklistDraftEdit?.itemId === id) {
      const sourceNodeForDraft = nodes.find((node: any) => (node.checklist || []).some((item: any) => item.id === id));
      const draftSpecialStyle = getServiceSpecialStyle(sourceNodeForDraft?.service_type || currentService);

      return (
        <div className={"w-full p-3 rounded-2xl border space-y-2 " + (checklistDraftEdit?.mode === "special_only" ? draftSpecialStyle.panel : "bg-white border-[#E6EAF0]")}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-black text-[#6D55A3] tracking-widest">流程上修改任務清單</div>
            {checklistDraftEdit?.mode === "special_only" && (
              <span className={"px-2 py-0.5 rounded-full border text-[9px] font-black " + draftSpecialStyle.badge}>此堂特殊</span>
            )}
          </div>
          <input
            type="text"
            value={checklistDraftEdit.text}
            onChange={e => setChecklistDraftEdit((prev: any) => prev ? { ...prev, text: e.target.value } : prev)}
            className="w-full px-2.5 py-2 bg-white border border-[#E6EAF0] rounded-xl text-xs font-bold text-[#1F2937] focus:outline-none"
            placeholder="任務清單"
            autoFocus
          />
          <textarea
            rows={4}
            value={checklistDraftEdit.details}
            onChange={e => setChecklistDraftEdit((prev: any) => prev ? { ...prev, details: e.target.value } : prev)}
            className="w-full px-2.5 py-2 bg-white border border-[#E6EAF0] rounded-xl text-[11px] font-bold leading-relaxed text-[#1F2937] focus:outline-none resize-y whitespace-pre-wrap"
            placeholder="任務細節，可分段輸入"
          />
          <button
            type="button"
            onClick={() => setChecklistDraftEdit((prev: any) => prev ? { ...prev, details: prev.details ? prev.details + "\n" : "" } : prev)}
            className="w-full py-2 rounded-xl bg-[#F3EEFF] text-[#6D55A3] border border-[#6D55A3]/20 text-xs font-black"
          >
            插入換行
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setChecklistDraftEdit((prev: any) => prev ? { ...prev, mode: "sync_all" } : prev)}
              className={"py-2 rounded-xl border text-[11px] font-black " + (checklistDraftEdit.mode === "sync_all" ? "bg-[#00B8B8] text-white border-[#00B8B8]" : "bg-white text-[#00B8B8] border-[#00B8B8]/20")}
            >
              連動三堂
            </button>
            <button
              type="button"
              onClick={() => setChecklistDraftEdit((prev: any) => prev ? { ...prev, mode: "special_only" } : prev)}
              className={"py-2 rounded-xl border text-[11px] font-black " + (checklistDraftEdit.mode === "special_only" ? draftSpecialStyle.activeButton : "bg-white text-[#7B7B74] border-[#E6EAF0]")}
            >
              此堂特殊
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void restoreChecklistUndoSnapshot()}
              disabled={!checklistUndoSnapshot}
              className="py-2 rounded-xl bg-white text-[#F25D6B] border border-[#F25D6B]/20 text-[11px] font-black disabled:opacity-40"
            >
              回上一步
            </button>
            <button
              type="button"
              onClick={() => void saveChecklistDraftEdit()}
              className="py-2 rounded-xl bg-gradient-to-r from-[#00B8B8] to-[#6D55A3] text-white text-[11px] font-black"
            >
              套用
            </button>
          </div>
        </div>
      );
    }

    if (isEditing) {
      if (inputType === 'textarea') {
        return (
          <div className="w-full space-y-2">
            <textarea
              value={inlineEditValue}
              onChange={e => setInlineEditValue(e.target.value)}
              onBlur={handleInlineBlur}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleInlineBlur();
                }
                if (e.key === 'Escape') setActiveInlineEdit(null);
              }}
              className="border-2 border-[#6D55A3] rounded-lg p-2 bg-white text-slate-800 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 w-full min-h-[96px] resize-y whitespace-pre-wrap"
              rows={4}
              autoFocus
            />
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={insertInlineLineBreak}
              className="w-full py-2 rounded-xl bg-[#F3EEFF] text-[#6D55A3] border border-[#6D55A3]/20 text-xs font-black"
            >
              插入換行
            </button>
          </div>
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
        className={`${styleClass} border-b-2 border-dashed border-[#6D55A3]/30 hover:border-[#6D55A3] hover:bg-[#F3EEFF]/80 cursor-pointer px-1 rounded transition-colors inline-block whitespace-pre-line`}
        title="點擊直接修改，將同步更新雲端"
      >
        {currentValue || "(點選填寫)"}
      </span>
    );
  };

  const renderCheckinView = () => {
    const isCheckedIn = checkinStatus !== "not_checked_in";
    const stationReady = checkinStatus === "station_confirmed";
    const todayService = isCheckedIn ? (checkedInService || currentService || "待確認") : "待報到";

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
                請先確認您的服事身分。報到會安全寫入今日場次；拿到名牌後，再掃描 QR Code 確認崗位。
              </p>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-black text-[#7B7B74] mb-2 tracking-widest">姓名</label>
                  <input
                    type="text"
                    value={authDisplayName}
                    readOnly
                    className="w-full px-4 py-3 bg-[#E6EAF0]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937]"
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

                <button
                  type="button"
                  onClick={handleCreateCheckinProfile}
                  className="w-full py-4 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-black rounded-[18px] shadow-lg shadow-[#F25D6B]/20 hover:opacity-90 transition-opacity"
                >
                  建立服事身分
                </button>
              </div>
            </div>

          </div>
        ) : (
          <>
            <div className="bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] font-black text-[#7B7B74] tracking-widest mb-1">今日服事</div>
                  <h3 className="text-xl font-black text-[#1F2937]">{displayCheckinName || "服事同工"}</h3>
                  <p className="text-sm font-bold text-[#6D55A3] mt-1">
                    今日堂次：{todayService} {checkedInService ? "已鎖定" : "待確認"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className={`px-3 py-1.5 rounded-full text-[11px] font-black border ${
                    isCheckedIn
                      ? "bg-[#00B8B8]/10 text-[#00B8B8] border-[#00B8B8]/20"
                      : "bg-[#FFF2F4] text-[#F25D6B] border-[#F25D6B]/20"
                  }`}>
                    {isCheckedIn ? "已報到" : "尚未報到"}
                  </div>
                  <button
                    type="button"
                    onClick={clearCheckinIdentity}
                    className="text-[11px] font-black text-[#7B7B74] hover:text-[#F25D6B] transition-colors whitespace-nowrap"
                  >
                    不是我？重新輸入
                  </button>
                </div>
              </div>

            </div>

            <div className="bg-gradient-to-br from-white to-[#F3EEFF]/50 p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-5">
              <h3 className="text-[16px] font-black text-[#1F2937] mb-2">請完成報到</h3>
              <div className={`text-xs font-bold leading-relaxed mb-4 ${
                wifiVerified ? "text-[#00B8B8]" : "text-[#F25D6B]"
              }`}>
                {wifiVerified ? (
                  <>
                    <p>目前您在教會網路</p>
                    <p className="flex flex-wrap items-center gap-2">
                      <span>可進行點選簽到</span>
                      <button
                        type="button"
                        onClick={handleWifiCheck}
                        disabled={wifiChecking}
                        aria-label="重新檢查 Wi-Fi"
                        className={`wifi-action-enter wifi-check-button inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black ${
                          wifiChecking
                            ? "wifi-check-button-checking bg-white text-[#00B8B8] border-[#00B8B8]/40 cursor-wait"
                            : "bg-white text-[#00B8B8] border-[#00B8B8]/25 hover:bg-[#00B8B8]/10 hover:shadow-[0_0_14px_rgba(0,184,184,0.16)]"
                        }`}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${wifiChecking ? "wifi-refresh-icon-active" : ""}`} strokeWidth={2.7} />
                        <span key={wifiChecking ? "wifi-checking" : "wifi-ready"} className="wifi-check-label">
                          {wifiChecking ? "檢查中…" : "重新檢查"}
                        </span>
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
                        className={`wifi-action-enter wifi-check-button inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black ${
                          wifiChecking
                            ? "wifi-check-button-checking bg-white text-[#00B8B8] border-[#00B8B8]/40 cursor-wait"
                            : "bg-white text-[#F25D6B] border-[#F25D6B]/25 hover:bg-[#FFF2F4] hover:shadow-[0_0_14px_rgba(242,93,107,0.14)]"
                        }`}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${wifiChecking ? "wifi-refresh-icon-active" : ""}`} strokeWidth={2.7} />
                        <span key={wifiChecking ? "wifi-checking" : "wifi-ready"} className="wifi-check-label">
                          {wifiChecking ? "檢查中…" : "重新檢查"}
                        </span>
                      </button>
                    </p>
                  </>
                )}
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3 items-stretch">
                <div className={`min-h-[64px] p-3.5 rounded-[18px] border flex items-center justify-center ${
                  wifiVerified
                    ? "bg-[#00B8B8]/10 border-[#00B8B8]/20 text-[#00B8B8]"
                    : "bg-white border-[#F25D6B]/25 text-[#F25D6B]"
                }`}>
                  <div className="text-sm font-black">
                    {wifiVerified ? "Wi-Fi：已連結" : "Wi-Fi：未連結"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleLocalCheckin()}
                  disabled={!wifiVerified || isCheckedIn || isCheckinSyncing}
                  className={`min-w-[108px] px-5 rounded-[18px] text-sm font-black transition-all ${
                    isCheckedIn
                      ? "bg-[#F3EEFF] text-[#6D55A3] border border-[#6D55A3]/20 cursor-default"
                      : wifiVerified
                        ? "bg-[#F25D6B] text-white shadow-lg shadow-[#F25D6B]/20 hover:bg-[#E44F5E]"
                        : "bg-[#E6EAF0] text-[#9CA3AF] cursor-not-allowed"
                  }`}
                >
                  {isCheckedIn ? "已完成報到" : isCheckinSyncing ? "同步中…" : "立即報到"}
                </button>
              </div>
            </div>

            {stationReady ? (
              <div className="bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-5">
                <h3 className="text-[16px] font-black text-[#1F2937] mb-2">崗位確認完成</h3>
                <p className="text-sm font-medium leading-relaxed text-[#7B7B74] mb-2">
                  今日崗位：<span className="font-black text-[#6D55A3]">{confirmedStation || personalSettings.role}</span>
                </p>
                <p className="text-xs font-bold leading-relaxed text-[#7B7B74] mb-5">
                  今日堂次：<span className="font-black text-[#00B8B8]">{checkedInService || todayService}</span>。如需調整服事崗位，可使用「崗位更新」重新掃描新的名牌。堂次若需更正，請總招協助處理。
                </p>
                <div className="grid grid-cols-1 gap-3">
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
              </div>
            ) : isCheckedIn ? (
              <div ref={checkinCompletedCardRef} className="bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-5 scroll-mt-6">
                <h3 className="text-[16px] font-black text-[#1F2937] mb-2">
                  您已於 <span className="text-[#F25D6B]">{checkedInAt || "--:--"}</span> 完成報到
                </h3>
                <p className="text-sm font-medium leading-relaxed text-[#7B7B74] mb-5">
                  目前狀態：等待總招分派崗位
                </p>

                {assignedStation && (
                  <div className="mb-5 p-4 rounded-[20px] bg-[#00B8B8]/10 border border-[#00B8B8]/20">
                    <div className="text-[11px] font-black text-[#00B8B8] tracking-widest mb-1">總招指定崗位</div>
                    <div className="text-[16px] font-black text-[#1F2937]">{assignedStation}</div>
                    <p className="text-xs font-bold text-[#7B7B74] mt-1 leading-relaxed">
                      請掃描這張崗位名牌上的 QR Code。若掃到不同崗位，系統會提醒可能拿錯名牌。
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleOpenStationScanner}
                  className="w-full py-4 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-black rounded-[18px] shadow-lg shadow-[#F25D6B]/20 hover:opacity-90 transition-opacity"
                >
                  掃描崗位名牌 QR code
                </button>
              </div>
            ) : null}

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
            掃描 / 確認 QR 崗位名牌
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
              : "總招分配崗位時會發崗位名牌。拿到名牌後，掃描名牌上的 QR Code 確認崗位。"}
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

        </div>
      </div>
    );
  };

  const handleControlAssignStation = () => {
    if (!controlSelectedStation) {
      setCustomAlert({ isOpen: true, message: "請先選擇要分派的崗位。" });
      return;
    }

    setAssignedStation(controlSelectedStation);
    setConfirmedStation("");

    if (checkinStatus === "station_confirmed") {
      setCheckinStatus("checked_in");
    }

    setCustomAlert({
      isOpen: true,
      message: controlNote.trim()
        ? `已分派：${controlSelectedStation}\n備註：${controlNote.trim()}`
        : `已分派：${controlSelectedStation}`
    });
  };

  const handleControlConfirmAssignedStation = () => {
    if (!assignedStation) {
      setCustomAlert({ isOpen: true, message: "目前尚未分派崗位，請先選擇崗位。" });
      return;
    }

    confirmStationFromQrCode(`SHK|service=${checkedInService || currentService}|station=${assignedStation}|role=${inferRoleFromStation(assignedStation)}`, "manual");
  };

  const handleControlResetStation = () => {
    setConfirmedStation("");

    if (checkinStatus === "station_confirmed") {
      setCheckinStatus("checked_in");
    }

    setCustomAlert({ isOpen: true, message: "已重設崗位確認狀態。同工可重新掃描名牌確認。" });
  };

  const renderControlView = () => {
    const serviceForControl = checkedInService || currentService || "待確認";
    const stationOptions = getStationOptionsForService(serviceForControl);
    const controlCards = [
      {
        title: "報到",
        value: checkinStatus === "not_checked_in" ? "尚未報到" : "已報到",
        desc: checkedInAt ? `${checkedInAt} 完成報到` : "等待同工完成報到"
      },
      {
        title: "堂次",
        value: serviceForControl,
        desc: checkedInService ? "已鎖定" : "待確認"
      },
      {
        title: "分派",
        value: assignedStation || "未分派",
        desc: assignedStation ? "等待掃描名牌確認" : "可由總招先指定崗位"
      },
      {
        title: "崗位",
        value: confirmedStation || "未確認",
        desc: confirmedStation ? "已完成崗位確認" : "尚未確認崗位"
      }
    ];

    return (
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
        <div className="mb-6 px-1">
          <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">控場</h2>
          <p className="text-sm font-medium text-[#7B7B74] mt-1.5 flex items-center gap-1.5">
            <HeartHandshake className="w-4 h-4 text-[#6D55A3]" />
            總招今日現場操作｜分派、確認、異常處理
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          {controlCards.map(card => (
            <div key={card.title} className="p-4 rounded-[22px] bg-white border border-[#E6EAF0] shadow-sm">
              <div className="text-[10px] font-black text-[#7B7B74] tracking-widest mb-1">{card.title}</div>
              <div className={`text-[15px] font-black leading-snug ${
                card.value.includes("未") || card.value.includes("待") || card.value.includes("尚")
                  ? "text-[#F25D6B]"
                  : "text-[#00B8B8]"
              }`}>
                {card.value}
              </div>
              <div className="text-[10px] font-bold text-[#7B7B74] mt-1 leading-relaxed">{card.desc}</div>
            </div>
          ))}
        </div>

        <div className="p-5 rounded-[24px] bg-gradient-to-br from-white to-[#F3EEFF]/50 border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[16px] font-black text-[#1F2937] mb-1">同工狀態</h3>
              <p className="text-sm font-bold text-[#6D55A3]">{displayCheckinName || "尚未建立身分"}</p>
              <p className="text-xs font-bold text-[#7B7B74] mt-1">
                堂次：{serviceForControl}｜角色：{personalSettings.role || "未設定"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("checkin")}
              className="px-3 py-2 rounded-xl bg-[#FFF2F4] text-[#F25D6B] border border-[#F25D6B]/20 text-[11px] font-black whitespace-nowrap hover:bg-[#FFE8EC] transition-colors"
            >
              回報到頁
            </button>
          </div>

          {checkinStatus === "not_checked_in" ? (
            <div className="p-4 rounded-[20px] bg-[#FFF2F4] border border-[#F25D6B]/20 text-sm font-bold text-[#F25D6B]">
              同工尚未完成報到。請先完成 Wi-Fi 與堂次確認，再進行分派或崗位確認。
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-black text-[#7B7B74] tracking-widest mb-2">分派崗位</label>
                <select
                  value={controlSelectedStation}
                  onChange={e => setControlSelectedStation(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                >
                  <option value="">請選擇崗位</option>
                  {stationOptions.map(station => (
                    <option key={station} value={station}>{station}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-[#7B7B74] tracking-widest mb-2">臨時備註</label>
                <input
                  type="text"
                  value={controlNote}
                  onChange={e => setControlNote(e.target.value)}
                  placeholder="例如：先支援 2樓大堂，散場後到手扶梯"
                  className="w-full px-4 py-3 bg-white border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleControlAssignStation}
                  className="w-full py-3.5 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-black rounded-[18px] shadow-lg shadow-[#F25D6B]/20 hover:opacity-90 transition-opacity"
                >
                  分派給此同工
                </button>
                <button
                  type="button"
                  onClick={handleOpenStationScanner}
                  className="w-full py-3.5 bg-white text-[#6D55A3] border border-[#6D55A3]/20 font-black rounded-[18px] hover:bg-[#F3EEFF] transition-colors"
                >
                  掃描 QR 名牌
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 rounded-[24px] bg-white border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-5">
          <h3 className="text-[16px] font-black text-[#1F2937] mb-3">崗位確認處理</h3>
          <div className="space-y-3">
            <div className="p-4 rounded-[20px] bg-[#FFF9F3] border border-[#E6EAF0]">
              <div className="text-[11px] font-black text-[#7B7B74] tracking-widest mb-1">總招指定</div>
              <div className="text-sm font-black text-[#1F2937]">{assignedStation || "尚未分派"}</div>
            </div>
            <div className="p-4 rounded-[20px] bg-[#F3EEFF]/60 border border-[#6D55A3]/10">
              <div className="text-[11px] font-black text-[#7B7B74] tracking-widest mb-1">同工已確認</div>
              <div className="text-sm font-black text-[#6D55A3]">{confirmedStation || "尚未確認"}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleControlConfirmAssignedStation}
                disabled={!assignedStation}
                className={`w-full py-3.5 font-black rounded-[18px] transition-colors ${
                  assignedStation
                    ? "bg-[#00B8B8] text-white hover:opacity-90"
                    : "bg-[#E6EAF0] text-[#7B7B74] cursor-not-allowed"
                }`}
              >
                直接確認分派
              </button>
              <button
                type="button"
                onClick={handleControlResetStation}
                disabled={checkinStatus !== "station_confirmed"}
                className={`w-full py-3.5 font-black rounded-[18px] border transition-colors ${
                  checkinStatus === "station_confirmed"
                    ? "bg-white text-[#F25D6B] border-[#F25D6B]/20 hover:bg-[#FFF2F4]"
                    : "bg-[#E6EAF0] text-[#7B7B74] border-[#E6EAF0] cursor-not-allowed"
                }`}
              >
                重設確認
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-[24px] bg-white border border-[#E6EAF0] shadow-sm">
          <h3 className="text-[16px] font-black text-[#1F2937] mb-2">第一階段 PWA 已涵蓋</h3>
          <div className="grid grid-cols-2 gap-2 text-[12px] font-bold">
            {["報到", "堂次鎖定", "QR 崗位確認", "總招控場"].map(item => (
              <div key={item} className="p-3 rounded-[16px] bg-[#00B8B8]/10 text-[#00B8B8] border border-[#00B8B8]/20">
                ✓ {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderTimelineView = () => {
    return (
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
        {isTimelineEditMode && (
          <>
            <div className="fixed top-[calc(env(safe-area-inset-top)+12px)] left-5 right-5 z-[120] mx-auto max-w-md p-4 bg-[#F3EEFF]/95 backdrop-blur border border-[#6D55A3]/20 rounded-[20px] flex items-center justify-between gap-3 shadow-2xl shadow-[#6D55A3]/20">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-black text-[#6D55A3]">
                  <Edit className="w-4 h-4 text-[#F25D6B]" />
                  修正模式
                </div>
                <p className="text-[11px] font-bold text-[#7B7B74] leading-relaxed mt-1">
                  所有可修改內容已展開，點選文字即可修改。
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleTimelineEditMode}
                className="px-3 py-2 rounded-[14px] bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white text-xs font-black flex items-center gap-1 shadow-md shadow-[#F25D6B]/20 shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
                完成修改
              </button>
            </div>
            <div className="h-[94px] mb-4" />
          </>
        )}

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
                          const itemIsSpecial = isSpecialChecklistItem(item.id);
                          const specialStyle = getServiceSpecialStyle(node.service_type || currentService);
                          return (
                            <div key={item.id} className={`flex items-start gap-3 p-3.5 rounded-[16px] transition-all duration-200 ${
                              itemIsSpecial
                                ? specialStyle.panel + ' shadow-sm'
                                : item.is_completed
                                  ? 'bg-[#00B8B8]/5 border border-[#00B8B8]/20'
                                  : 'bg-white border border-[#E6EAF0] shadow-sm hover:border-[#6D55A3]/30'
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
                                    if (!isTimelineEditMode && item.details) {
                                      setDetailModal({ isOpen: true, title: item.text, details: item.details });
                                    }
                                  }}
                                >
                                  <span className={`text-[14px] font-semibold leading-relaxed transition-all ${
                                    item.is_completed ? 'text-[#7B7B74] line-through opacity-70' : 'text-[#1F2937]'
                                  } ${(!isTimelineEditMode && item.details) ? 'group-hover:text-[#F25D6B]' : ''}`}>
                                    {renderInlineEdit('checklist', item.id, 'text', item.text, "w-full")}
                                  </span>
                                  {itemIsSpecial && (
                                    <span className={"ml-1.5 mt-0.5 shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-black " + specialStyle.badge}>
                                      此堂特殊
                                    </span>
                                  )}
                                  
                                  {!isTimelineEditMode && item.details && (
                                    <div className={`mt-0.5 shrink-0 transition-colors ${item.is_completed ? 'text-[#E6EAF0]' : 'text-[#00B8B8] group-hover:text-[#F25D6B]'}`}>
                                      <Info className="w-4 h-4" />
                                    </div>
                                  )}
                                </div>

                                {isTimelineEditMode && (
                                  <div className={"mt-1 text-xs text-[#7B7B74] p-2 rounded-lg border border-dashed " + (itemIsSpecial ? specialStyle.panel : "bg-[#F3EEFF]/40 border-[#6D55A3]/20")}>
                                    <span className="font-bold text-[10px] text-[#6D55A3] block mb-0.5">任務細節：</span>
                                    {renderInlineEdit('checklist', item.id, 'details', item.details, "w-full text-xs text-[#7B7B74] block", "textarea")}
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
    const allTasks = filteredNodes.flatMap((node: any) => node.checklist || []);
    const completedTasks = allTasks.filter((task: any) => task.is_completed);
    const completionRate = calculateRate(completedTasks.length, allTasks.length);
    const isCheckedIn = checkinStatus !== "not_checked_in";
    const stationReady = checkinStatus === "station_confirmed";
    const targetService = checkedInService || currentService || "今日堂次";
    const currentStation = confirmedStation || assignedStation || personalSettings.role || "尚未確認";
    const currentMinute = timeToMinutes(currentTime || "00:00");
    const todayForRules = currentDate || new Date();
    const isCommunionWeek = todayForRules.getDate() <= 7;
    const communionScheduleByService: Record<string, any> = {
      "六晚崇": { doorClose: "19:12", communionStart: "19:25", communionEnd: "19:37", newsStart: "19:37", newsEnd: "19:42", reportStart: "19:42", reportEnd: "19:46" },
      "主一堂": { doorClose: "09:12", communionStart: "09:25", communionEnd: "09:37", newsStart: "09:37", newsEnd: "09:42", reportStart: "09:42", reportEnd: "09:46" },
      "主二堂": { doorClose: "11:12", communionStart: "11:25", communionEnd: "11:37", newsStart: "11:37", newsEnd: "11:42", reportStart: "11:42", reportEnd: "11:46" }
    };
    const communionSchedule = communionScheduleByService[targetService];
    const isCommunionMode = Boolean(isCommunionWeek && communionSchedule);
    const isEightDoorClosed = isCommunionMode && currentMinute >= timeToMinutes(communionSchedule.doorClose);
    const communionFlowItems = isCommunionMode
      ? [
          { id: "communion-service", time: communionSchedule.communionStart, end: communionSchedule.communionEnd, title: "領聖餐", location: "大堂", assignee: "聖餐助手、專招、牧招" },
          { id: "communion-news", time: communionSchedule.newsStart, end: communionSchedule.newsEnd, title: "News", location: "大堂", assignee: "控場與招待團隊" },
          { id: "communion-report", time: communionSchedule.reportStart, end: communionSchedule.reportEnd, title: "特別報告", location: "大堂", assignee: "控場與招待團隊" }
        ]
      : [];
    const nextCommunionStep = communionFlowItems.find((item) => currentMinute <= timeToMinutes(item.end));
    const sortedNodes = [...filteredNodes].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    const nextNode = sortedNodes.find((node: any) => timeToMinutes(node.time) >= currentMinute) || sortedNodes[0] || null;
    const nextDisplay = nextCommunionStep || nextNode;
    const nextDisplayChecklist = nextNode?.checklist || [];
    const nextNodeIncompleteCount = nextDisplayChecklist.filter((item: any) => !item.is_completed).length;
    const nextDisplayRoles = nextDisplay
      ? String((nextDisplay as any).assignee || "未指定")
          .split(/[、,，/]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .join("、")
      : "尚無流程";
    const nextDisplayTime = nextCommunionStep
      ? nextCommunionStep.time + "-" + nextCommunionStep.end
      : nextNode
        ? nextNode.time
        : "尚無流程";
    const nextDisplayTitle = nextDisplay ? (nextDisplay as any).title : "目前沒有後續流程";
    const stationOptions = getStationOptionsForService(targetService);
    const specialistStations = stationOptions.filter((station) => station.includes("專招"));
    const communionSpecialItems = isCommunionMode
      ? [
          { id: "communion-2f-outside", title: "2樓外場專招", time: "聖餐週", assignee: "二樓1號門", description: "聖餐週站位：二樓1號門" },
          { id: "communion-3f-hall", title: "3樓大堂專招", time: "聖餐週", assignee: "三樓1號門", description: "聖餐週站位：三樓1號門" },
          {
            id: "communion-2c-3c",
            title: "牧招2C、3C",
            time: communionSchedule.doorClose,
            assignee: isEightDoorClosed ? "回原崗位2C、3C" : "二樓8號門",
            description: isEightDoorClosed
              ? "8號門已關閉，請回到原服事崗位2C、3C"
              : "先站位二樓8號門，" + communionSchedule.doorClose + "關閉後回原崗位2C、3C"
          }
        ]
      : [];
    const specialistTaskGapItems = filteredNodes
      .filter((node: any) => String(node.assignee || "").includes("專招"))
      .filter((node: any) => {
        const checklist = node.checklist || [];
        const hasIncompleteChecklist = checklist.length > 0 && checklist.some((item: any) => !item.is_completed);
        const isNextSpecialistNode = nextNode && nextNode.id === node.id;
        return hasIncompleteChecklist || isNextSpecialistNode;
      })
      .map((node: any) => ({
        id: node.id,
        title: node.title,
        time: node.time,
        assignee: node.assignee || "未指定專招",
        description: node.location || node.details || "請總招留意此專招相關任務"
      }));
    const specialistGapItems = [...communionSpecialItems, ...specialistTaskGapItems].slice(0, 6);

    const statusCards = [
      {
        title: "報到狀態",
        value: isCheckedIn ? "已報到" : "尚未報到",
        meta: isCheckedIn ? ((displayCheckinName || "服事同工") + (checkedInAt ? "｜" + checkedInAt : "")) : "請先完成 Wi-Fi 報到",
        accent: isCheckedIn ? "text-[#00B8B8]" : "text-[#F25D6B]",
        bg: isCheckedIn ? "bg-[#00B8B8]/10 border-[#00B8B8]/20" : "bg-[#FFF2F4] border-[#F25D6B]/20"
      },
      {
        title: "崗位確認",
        value: stationReady ? "已確認" : isCheckedIn ? "待確認" : "未報到",
        meta: stationReady ? currentStation : "掃描崗位名牌後確認",
        accent: stationReady ? "text-[#00B8B8]" : "text-[#F25D6B]",
        bg: stationReady ? "bg-[#00B8B8]/10 border-[#00B8B8]/20" : "bg-[#FFF2F4] border-[#F25D6B]/20"
      },
      {
        title: "專招缺口",
        value: specialistGapItems.length === 0 ? "目前穩定" : specialistGapItems.length + " 項待注意",
        meta: isCommunionMode ? "聖餐週特殊站位已啟用" : specialistStations.length > 0 ? "專招崗位 " + specialistStations.length + " 個" : "本堂次未設定專招崗位",
        accent: specialistGapItems.length === 0 ? "text-[#00B8B8]" : "text-[#F25D6B]",
        bg: specialistGapItems.length === 0 ? "bg-[#00B8B8]/10 border-[#00B8B8]/20" : "bg-[#FFF2F4] border-[#F25D6B]/20"
      },
      {
        title: "下一個流程",
        value: nextDisplayTime,
        meta: nextDisplayTitle,
        accent: isCommunionMode ? "text-[#F25D6B]" : "text-[#6D55A3]",
        bg: isCommunionMode ? "bg-[#FFF2F4] border-[#F25D6B]/20" : "bg-[#F3EEFF] border-[#6D55A3]/20"
      }
    ];

    return (
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
        <div className="mb-6 px-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">現場狀態</h2>
              <p className="text-sm font-medium text-[#7B7B74] mt-1.5 flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-[#6D55A3]" /> 總招快速掌握現場重點（{targetService}）
              </p>
            </div>
            {isCommunionMode && (
              <span className="shrink-0 px-3 py-1.5 rounded-full bg-[#FFF2F4] text-[#F25D6B] text-[11px] font-black border border-[#F25D6B]/20">
                聖餐週
              </span>
            )}
          </div>
        </div>

        {isCommunionMode && (
          <div className="mb-5 p-4 rounded-[22px] bg-gradient-to-r from-[#FFF2F4] to-[#F3EEFF] border border-[#F25D6B]/15 shadow-sm">
            <div className="text-[12px] font-black text-[#F25D6B] tracking-widest mb-1">聖餐週規則</div>
            <div className="text-sm font-black text-[#1F2937] leading-relaxed">
              2樓外場：二樓1號門｜3樓大堂：三樓1號門｜牧招2C、3C：{isEightDoorClosed ? "回原崗位2C、3C" : "先站二樓8號門，" + communionSchedule.doorClose + "後回原崗位"}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          {statusCards.map((item) => (
            <div key={item.title} className={"p-4 rounded-[22px] border shadow-sm " + item.bg}>
              <div className="text-[11px] font-black tracking-widest text-[#7B7B74] mb-2">{item.title}</div>
              <div className={"text-[20px] leading-tight font-black " + item.accent}>{item.value}</div>
              <div className="mt-1.5 text-[11px] leading-relaxed font-bold text-[#7B7B74] line-clamp-2">{item.meta}</div>
            </div>
          ))}
        </div>

        <div className="p-5 mb-5 bg-white rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[15px] font-black text-[#1F2937] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#F25D6B]" /> 專招缺口
              </h3>
              <p className="text-[11px] font-bold text-[#7B7B74] mt-1">只列需要總招立刻注意的專招與聖餐週站位</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-[#FFF2F4] text-[#F25D6B] text-[10px] font-black border border-[#F25D6B]/15">
              {specialistGapItems.length === 0 ? "穩定" : "待處理"}
            </span>
          </div>

          {specialistGapItems.length === 0 ? (
            <div className="p-4 rounded-[18px] bg-[#00B8B8]/10 border border-[#00B8B8]/20 text-[#00B8B8] text-sm font-black text-center">
              目前沒有明顯專招缺口
            </div>
          ) : (
            <div className="space-y-2.5">
              {specialistGapItems.map((item: any) => (
                <div key={item.id} className="p-3.5 rounded-[18px] bg-[#FFF2F4]/70 border border-[#F25D6B]/15">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-[#1F2937] leading-snug">{item.title}</div>
                      <div className="text-[11px] font-bold text-[#7B7B74] mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {item.time}｜{item.assignee}
                      </div>
                      <div className="text-[11px] font-bold text-[#7B7B74] mt-1 leading-relaxed">{item.description}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-white text-[#F25D6B] text-[10px] font-black border border-[#F25D6B]/10 shrink-0">
                      注意
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 mb-5 bg-gradient-to-br from-white to-[#F3EEFF]/55 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[15px] font-black text-[#1F2937] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#6D55A3]" /> 下一個流程
              </h3>
              <p className="text-[11px] font-bold text-[#7B7B74] mt-1">聖餐週會優先顯示領聖餐、News、特別報告</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-white text-[#6D55A3] text-[12px] font-black border border-[#6D55A3]/15">
              {nextDisplayTime === "尚無流程" ? "--:--" : nextDisplayTime}
            </span>
          </div>

          {nextDisplay ? (
            <div className="space-y-3">
              <div className="p-4 rounded-[18px] bg-white border border-[#E6EAF0]">
                <div className="text-base font-black text-[#1F2937] leading-snug">{nextDisplayTitle}</div>
                <div className="mt-2 grid grid-cols-1 gap-1.5 text-[12px] font-bold text-[#7B7B74]">
                  <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-[#F25D6B]" /> {(nextDisplay as any).location || "未指定地點"}</div>
                  <div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-[#6D55A3]" /> {nextDisplayRoles}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[12px] font-black text-[#7B7B74]">
                <span>任務完成率</span>
                <span>{completedTasks.length}/{allTasks.length}</span>
              </div>
              <div className="w-full h-2.5 overflow-hidden rounded-full bg-[#E6EAF0]">
                <div className="h-full bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] rounded-full transition-all duration-700" style={{ width: String(allTasks.length === 0 ? 0 : completionRate) + "%" }} />
              </div>
              {nextNodeIncompleteCount > 0 && !nextCommunionStep && (
                <div className="text-[11px] font-bold text-[#F25D6B] bg-[#FFF2F4] border border-[#F25D6B]/10 rounded-[14px] px-3 py-2">
                  下一個流程仍有 {nextNodeIncompleteCount} 項任務清單未完成
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-[18px] bg-white border border-[#E6EAF0] text-center text-sm font-bold text-[#7B7B74]">
              目前沒有後續流程
            </div>
          )}
        </div>

        <div className="p-4 rounded-[20px] bg-white/70 border border-[#E6EAF0] text-[11px] leading-relaxed font-bold text-[#7B7B74]">
          現場狀態不再依角色分組；需要查個別人員時，請使用「同工狀態」。{isCommunionMode ? " 本週已套用聖餐週規則。" : ""}
        </div>
      </div>
    );
  };

  const renderPersonalSettingsView = () => {
    return (
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
        <div className="mb-6 px-1">
          <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">個人設定</h2>
          <p className="text-sm font-medium text-[#7B7B74] mt-1.5 flex items-center gap-1.5">
            <User className="w-4 h-4 text-[#6D55A3]" />
            個人提醒設定會自動記憶在這台裝置
          </p>
        </div>

        <div className="bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 space-y-6">
          <div className="p-4 rounded-[18px] bg-[#FFF9F3] border border-[#E6EAF0]">
            <div className="text-xs font-black text-[#6D55A3] tracking-widest mb-1">語音風格</div>
            <div className="text-sm font-black text-[#1F2937]">
              個人選擇｜{personalSettings.voiceProfile === "iapetus" ? "男聲 Iapetus" : "女聲 Zephyr"}
            </div>
            <div className="text-[11px] font-bold text-[#7B7B74] mt-1">
              每位同工可在本機選擇自己的語音；開啟語音助理時會盡量保持畫面亮起，服事結束後會自動關閉。
            </div>
            <div className={`mt-2 text-[10px] font-black ${isWakeLockActive ? "text-[#00B8B8]" : "text-[#7B7B74]"}`}>
              {isVoiceEnabled
                ? isWakeLockActive
                  ? "螢幕保持喚醒：已啟用"
                  : "螢幕保持喚醒：此裝置可能不支援"
                : "語音助理關閉時不會保持螢幕喚醒"}
            </div>
          </div>

          <div data-voice-profile-selector="chirp3">
            <label className="block text-xs font-black text-[#7B7B74] mb-3 tracking-widest">語音選擇</label>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {voiceProfileOptions.map(option => (
                <button key={option.value} type="button"
                  onClick={() => updatePersonalSettings({ voiceProfile: option.value as "zephyr" | "iapetus" })}
                  className={"p-3 rounded-2xl border text-left transition-all " + (personalSettings.voiceProfile === option.value ? "bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white border-transparent" : "bg-white text-[#7B7B74] border-[#E6EAF0]")}>
                  <div className="text-sm font-black">{personalSettings.voiceProfile === option.value ? "✓ " : ""}{option.label}</div>
                  <div className="text-[10px] font-bold opacity-80 mt-1">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-[#7B7B74] mb-3 tracking-widest">提醒設定</label>
            <div className="space-y-2.5">
              {[
                { key: "voiceReminderEnabled", label: "語音助理", description: "開啟後，才會播放個人耳機提醒。" },
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
            <label className="block text-xs font-black text-[#7B7B74] mb-3 tracking-widest">提醒內容</label>
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
              {personalSettings.voiceDetailLevel === "simple" && "極簡：提醒更短，適合服事中快速聽懂。"}
              {personalSettings.voiceDetailLevel === "standard" && "標準：預告含時間，即時提醒更短。"}
              {personalSettings.voiceDetailLevel === "detailed" && "詳細：會加上任務提示與前三項確認清單，適合任務不多的崗位。"}
            </div>
          </div>

          {hasCheckinProfile && (
            <div>
              <button
                type="button"
                onClick={() => setShowPhoneChange(prev => !prev)}
                className="w-full p-4 rounded-[18px] bg-[#FFF9F3] border border-[#E6EAF0] text-left hover:bg-[#F3EEFF]/50 transition-colors"
              >
                <div className="text-xs font-black text-[#6D55A3] tracking-widest mb-1">報到身分</div>
                <div className="text-sm font-black text-[#1F2937]">更換手機後四碼</div>
                <div className="text-[11px] font-bold text-[#7B7B74] mt-1">
                  目前綁定：{checkinProfile.name}｜後四碼 {checkinProfile.phoneLast4}
                </div>
              </button>

              {showPhoneChange && (
                <div className="mt-3 p-4 rounded-[18px] bg-white border border-[#E6EAF0] space-y-3">
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={4}
                    value={phoneChangeForm.newPhoneLast4}
                    onChange={e => setPhoneChangeForm(prev => ({ ...prev, newPhoneLast4: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    placeholder="新的手機後四碼"
                    className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                  />

                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={4}
                    value={phoneChangeForm.confirmPhoneLast4}
                    onChange={e => setPhoneChangeForm(prev => ({ ...prev, confirmPhoneLast4: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    placeholder="再次輸入新的手機後四碼"
                    className="w-full px-4 py-3 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[16px] text-sm font-bold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30"
                  />

                  <button
                    type="button"
                    onClick={handleChangePhoneLast4}
                    className="w-full py-3.5 bg-[#F3EEFF] text-[#6D55A3] border border-[#6D55A3]/20 font-black rounded-[18px] hover:bg-[#EDE6FF] transition-colors"
                  >
                    確認更換
                  </button>
                </div>
              )}
            </div>
          )}

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
            {canManageTimeline && (
              <Link
                href="/admin/services"
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white text-[#00A6A6] border border-[#00A6A6]/20"
              >
                場次管理
              </Link>
            )}
            {isCurrentUserAdmin && (
              <Link
                href="/admin/users"
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white text-[#6D55A3] border border-[#6D55A3]/20"
              >
                帳號管理
              </Link>
            )}
            <button
              type="button"
              onClick={handleToggleTimelineEditMode}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1 transition-all ${
                isTimelineEditMode
                  ? "bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white shadow-md shadow-[#F25D6B]/20 hover:opacity-90"
                  : "bg-[#F3EEFF] hover:bg-[#EDE6FF] text-[#6D55A3] border border-[#6D55A3]/20"
              }`}
            >
              {isTimelineEditMode ? <Check className="w-3.5 h-3.5" /> : <Edit className="w-3.5 h-3.5" />}
              {isTimelineEditMode ? "完成修改" : "修改內容"}
            </button>
          </div>
        </div>

        {isCurrentUserAdmin && (
          <div className="bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-6">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h3 className="text-[16px] font-black text-[#1F2937] mb-1 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-[#F25D6B]" />
                  全站語音設定
                </h3>
                <p className="text-xs font-bold leading-relaxed text-[#7B7B74]">
                  語音助理由 Google Cloud Chirp 3 HD 的 Zephyr／Iapetus 產生。全站管理員可調整共用語音設定。
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshVoiceSettingsAndUsage()}
                disabled={isVoiceSettingsLoading}
                className="px-3 py-1.5 rounded-xl bg-[#F3EEFF] text-[#6D55A3] text-[11px] font-black border border-[#6D55A3]/10 disabled:opacity-50"
              >
                {isVoiceSettingsLoading ? "讀取中" : "更新用量"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 mb-5">
              <div className="p-4 rounded-[18px] bg-[#FFF9F3] border border-[#E6EAF0]">
                <div className="text-[11px] font-black text-[#7B7B74] tracking-widest mb-2">本月語音字元用量</div>
                <div className="text-2xl font-black text-[#1F2937]">{formatNumber(ttsUsage.total?.remainingChars)} 字元</div>
                <div className="text-[11px] font-bold text-[#7B7B74] mt-1">
                  剩餘 / 總上限 {formatNumber(ttsUsage.total?.limitChars)} 字元
                </div>
                <div className="mt-3 h-2 rounded-full bg-[#E6EAF0] overflow-hidden">
                  <div
                    className="h-full bg-[#6D55A3]"
                    style={{ width: `${Math.min(100, Math.max(0, Number(ttsUsage.total?.usageRate || 0)))}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-[14px] bg-white border border-[#E6EAF0] p-3">
                    <div className="text-[10px] font-black text-[#6D55A3]">主帳號</div>
                    <div className="text-[11px] font-bold text-[#7B7B74] mt-1">
                      {formatNumber(ttsUsage.primary?.usedChars)} / {formatNumber(ttsUsage.primary?.limitChars)}
                    </div>
                  </div>
                  <div className="rounded-[14px] bg-white border border-[#E6EAF0] p-3">
                    <div className="text-[10px] font-black text-[#6D55A3]">備用帳號</div>
                    <div className="text-[11px] font-bold text-[#7B7B74] mt-1">
                      {formatNumber(ttsUsage.backup?.usedChars)} / {formatNumber(ttsUsage.backup?.limitChars)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-[18px] bg-[#F3EEFF]/50 border border-[#6D55A3]/10">
                <div className="text-[11px] font-black text-[#7B7B74] tracking-widest mb-3">管理預設語音</div>

                <label className="block text-xs font-black text-[#1F2937] mb-1.5">聲音</label>
                <select
                  value={voiceSettingsDraft.voice_gender || "female"}
                  onChange={e => setVoiceSettingsDraft((prev: any) => ({ ...prev, voice_gender: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-[#E6EAF0] rounded-[14px] text-sm font-bold text-[#1F2937] focus:outline-none mb-4"
                >
                  <option value="female">女聲 Zephyr</option>
                  <option value="male">男聲 Iapetus</option>
                </select>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-black text-[#1F2937] mb-1.5">
                      <span>語速 speakingRate</span>
                      <span>{Number(voiceSettingsDraft.speaking_rate || 0.92).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.84"
                      max="1.02"
                      step="0.01"
                      value={voiceSettingsDraft.speaking_rate || 0.92}
                      onChange={e => setVoiceSettingsDraft((prev: any) => ({ ...prev, speaking_rate: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-black text-[#1F2937] mb-1.5">
                      <span>音高 pitch</span>
                      <span>{Number(voiceSettingsDraft.pitch || 0).toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={voiceSettingsDraft.voice_gender === "male" ? "-2" : "0"}
                      max={voiceSettingsDraft.voice_gender === "male" ? "2" : "6"}
                      step="0.1"
                      value={voiceSettingsDraft.pitch ?? 1.5}
                      onChange={e => setVoiceSettingsDraft((prev: any) => ({ ...prev, pitch: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-black text-[#1F2937] mb-1.5">
                      <span>柔和度 volumeGainDb</span>
                      <span>{Number(voiceSettingsDraft.volume_gain_db || 0).toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="-3"
                      max="1"
                      step="0.5"
                      value={voiceSettingsDraft.volume_gain_db ?? 0}
                      onChange={e => setVoiceSettingsDraft((prev: any) => ({ ...prev, volume_gain_db: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => void previewVoiceDraft()}
                    disabled={isVoicePreviewing || isVoiceSettingsSaving}
                    className="py-3 rounded-[16px] bg-white border border-[#6D55A3]/20 text-[#6D55A3] text-xs font-black disabled:opacity-50"
                  >
                    {isVoicePreviewing ? "試聽中" : "試聽 Zephyr / Iapetus"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveGlobalVoiceSettings()}
                    disabled={isVoiceSettingsSaving || isVoicePreviewing}
                    className="py-3 rounded-[16px] bg-gradient-to-r from-[#6D55A3] to-[#F25D6B] text-white text-xs font-black disabled:opacity-50"
                  >
                    {isVoiceSettingsSaving ? "套用中" : "套用管理預設聲音"}
                  </button>
                </div>

                <div className="text-[10px] font-bold text-[#7B7B74] mt-3">
                  套用後會更新快取版本，下一次正式提醒會使用新聲音。
                </div>
              </div>
            </div>
          </div>
        )}

        {/* QR 崗位碼設定 */}
        <div className="bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5 mb-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[16px] font-black text-[#1F2937] mb-1 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#F25D6B]" />
                QR 崗位碼設定
              </h3>
              <p className="text-xs font-bold leading-relaxed text-[#7B7B74]">
                第一階段先使用 QR Code。把下方內容貼到 QR Code 產生器，印在對應崗位名牌上。
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-full bg-[#F3EEFF] text-[#6D55A3] text-[11px] font-black border border-[#6D55A3]/10 whitespace-nowrap">
              PWA V1
            </span>
          </div>

          <div className="p-4 rounded-[20px] bg-[#FFF9F3] border border-[#E6EAF0] mb-4">
            <div className="text-[11px] font-black text-[#7B7B74] tracking-widest mb-2">建議格式</div>
            <code className="block text-[11px] leading-relaxed font-black text-[#1F2937] break-all bg-white border border-[#E6EAF0] rounded-[14px] p-3">
              SHK|service=主二堂|station=2樓大堂專招|role=專招|tag=202H
            </code>
          </div>

          <div className="space-y-2.5">
            {stationQrCodeExamples.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(item.value);
                  setCustomAlert({ isOpen: true, message: `${item.label}\nQR 崗位碼內容已複製。可貼到 QR Code 產生器，再印到崗位名牌。` });
                }}
                className="w-full text-left p-3 rounded-[16px] bg-[#F3EEFF]/50 border border-[#6D55A3]/10 hover:bg-[#F3EEFF] transition-colors"
              >
                <div className="text-xs font-black text-[#6D55A3] mb-1">{item.label}</div>
                <div className="text-[10px] font-bold text-[#7B7B74] break-all">{item.value}</div>
              </button>
            ))}
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
              <label className="block text-xs font-bold text-[#7B7B74] mb-1.5">任務細節 (選填)</label>
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
              const linkedTaskBlocks = findLinkedTaskBlocks(node);
              const checklistSyncMode = getTaskBlockSyncMode(node.id);
              const nodeIsSpecial = isSpecialTaskBlock(node.id);
              const specialStyle = getServiceSpecialStyle(node.service_type);
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
                        <label className="block text-[10px] font-bold text-[#7B7B74] mb-1">任務細節</label>
                        <textarea
                          rows={4}
                          value={editForm.details}
                          onChange={e => setEditForm({...editForm, details: e.target.value})}
                          placeholder="可分段輸入，每一行會保留換行"
                          className="w-full px-2 py-2 bg-[#F3EEFF]/40 border border-[#E6EAF0] rounded-[10px] text-xs font-bold leading-relaxed text-[#1F2937] focus:outline-none resize-y whitespace-pre-wrap"
                        />
                        <button
                          type="button"
                          onClick={() => setEditForm(prev => ({ ...prev, details: prev.details ? prev.details + "\n" : "" }))}
                          className="mt-2 w-full py-2 rounded-xl bg-[#F3EEFF] text-[#6D55A3] border border-[#6D55A3]/20 text-xs font-black"
                        >
                          插入換行
                        </button>
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
                          {isChecklistExpanded ? "▲ 收起任務清單" : `▼ 管理任務清單 (${node.checklist?.length || 0})`}
                        </button>

                        {isChecklistExpanded && (
                          <div className="mt-3 pl-2 border-l-2 border-[#6D55A3]/30 space-y-3">
                            <div className={"p-3 rounded-2xl border " + (nodeIsSpecial ? specialStyle.panel : "bg-[#F3EEFF]/30 border-[#E6EAF0]")}>
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div>
                                  <p className="text-[10px] font-black text-[#6D55A3] tracking-widest">任務清單連動</p>
                                  <p className="text-[10px] font-bold text-[#7B7B74] mt-1 leading-relaxed">
                                    {linkedTaskBlocks.length > 0
                                      ? "找到另外 " + linkedTaskBlocks.length + " 堂相同任務區塊：" + linkedTaskBlocks.map((item: any) => item.service_type).join("、")
                                      : "目前沒有找到其他堂的相同任務區塊"}
                                  </p>
                                </div>
                                {nodeIsSpecial && (
                                  <span className={"shrink-0 px-2 py-1 rounded-full border text-[9px] font-black " + specialStyle.badge}>
                                    此堂特殊任務清單
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setTaskBlockSyncMode(node, "sync_all")}
                                  className={"py-2 rounded-xl border text-[11px] font-black transition-all " + (checklistSyncMode === "sync_all" ? "bg-[#00B8B8] text-white border-[#00B8B8]" : "bg-white text-[#00B8B8] border-[#00B8B8]/20")}
                                >
                                  連動三堂
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTaskBlockSyncMode(node, "special_only")}
                                  className={"py-2 rounded-xl border text-[11px] font-black transition-all " + (checklistSyncMode === "special_only" ? specialStyle.activeButton : "bg-white text-[#7B7B74] border-[#E6EAF0]")}
                                >
                                  此堂特殊
                                </button>
                              </div>
                              <div className="grid grid-cols-1 gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => void restoreChecklistUndoSnapshot()}
                                  disabled={!checklistUndoSnapshot}
                                  className="py-2 rounded-xl bg-white text-[#F25D6B] border border-[#F25D6B]/20 text-[11px] font-black disabled:opacity-40"
                                >
                                  回上一步
                                </button>
                              </div>
                            </div>

                            <div className="bg-[#F3EEFF]/30 p-3 rounded-2xl border border-[#E6EAF0]">
                              <p className="text-[10px] font-black text-[#6D55A3] mb-1.5">＋新增任務清單</p>
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
                                  placeholder="任務細節 (可選)"
                                  value={newChecklistItem.details}
                                  onChange={e => setNewChecklistItem({ ...newChecklistItem, details: e.target.value })}
                                  className="w-full px-2.5 py-1.5 bg-white border border-[#E6EAF0] rounded-xl text-xs font-bold text-[#1F2937] focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddChecklistItem(node.id)}
                                  className="w-full py-1.5 bg-[#6D55A3] hover:bg-[#6D55A3]/90 text-white font-bold rounded-xl text-[11px] shadow-sm transition-colors"
                                >
                                  新增此任務清單
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
                                  const isDraftingChecklistItem = checklistDraftEdit?.itemId === item.id;
                                  const itemIsSpecial = isSpecialChecklistItem(item.id);
                                  return (
                                    <div 
                                      key={item.id}
                                      draggable={true}
                                      onDragStart={(e) => handleDragStart(e, item.id)}
                                      onDragOver={handleDragOver}
                                      onDrop={(e) => handleDrop(e, node.id, item.id)}
                                      className={"flex items-center justify-between p-2 border rounded-xl transition-all shadow-sm " + (itemIsSpecial ? specialStyle.panel : "bg-[#FFF9F3]/60 hover:bg-[#FFF2F4]/60 border-[#E6EAF0]")}
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
                                          {isDraftingChecklistItem ? (
                                            <div className={"p-3 rounded-2xl border space-y-2 " + (checklistDraftEdit?.mode === "special_only" ? specialStyle.panel : "bg-white border-[#E6EAF0]")}>
                                              <div className="flex items-center justify-between gap-2">
                                                <div className="text-[10px] font-black text-[#6D55A3] tracking-widest">流程上修改任務清單</div>
                                                {checklistDraftEdit?.mode === "special_only" && (
                                                  <span className={"px-2 py-0.5 rounded-full border text-[9px] font-black " + specialStyle.badge}>此堂特殊</span>
                                                )}
                                              </div>
                                              <input
                                                type="text"
                                                value={checklistDraftEdit.text}
                                                onChange={e => setChecklistDraftEdit((prev: any) => prev ? { ...prev, text: e.target.value } : prev)}
                                                className="w-full px-2.5 py-2 bg-white border border-[#E6EAF0] rounded-xl text-xs font-bold text-[#1F2937] focus:outline-none"
                                                placeholder="任務清單"
                                                autoFocus
                                              />
                                              <textarea
                                                rows={2}
                                                value={checklistDraftEdit.details}
                                                onChange={e => setChecklistDraftEdit((prev: any) => prev ? { ...prev, details: e.target.value } : prev)}
                                                className="w-full px-2.5 py-2 bg-white border border-[#E6EAF0] rounded-xl text-[11px] font-bold text-[#1F2937] focus:outline-none resize-none"
                                                placeholder="任務細節"
                                              />
                                              <div className="grid grid-cols-2 gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => setChecklistDraftEdit((prev: any) => prev ? { ...prev, mode: "sync_all" } : prev)}
                                                  className={"py-2 rounded-xl border text-[11px] font-black " + (checklistDraftEdit.mode === "sync_all" ? "bg-[#00B8B8] text-white border-[#00B8B8]" : "bg-white text-[#00B8B8] border-[#00B8B8]/20")}
                                                >
                                                  連動三堂
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setChecklistDraftEdit((prev: any) => prev ? { ...prev, mode: "special_only" } : prev)}
                                                  className={"py-2 rounded-xl border text-[11px] font-black " + (checklistDraftEdit.mode === "special_only" ? specialStyle.activeButton : "bg-white text-[#7B7B74] border-[#E6EAF0]")}
                                                >
                                                  此堂特殊
                                                </button>
                                              </div>
                                              <div className="grid grid-cols-2 gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => void restoreChecklistUndoSnapshot()}
                                                  disabled={!checklistUndoSnapshot}
                                                  className="py-2 rounded-xl bg-white text-[#F25D6B] border border-[#F25D6B]/20 text-[11px] font-black disabled:opacity-40"
                                                >
                                                  回上一步
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => void saveChecklistDraftEdit()}
                                                  className="py-2 rounded-xl bg-gradient-to-r from-[#00B8B8] to-[#6D55A3] text-white text-[11px] font-black"
                                                >
                                                  套用
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (isAdminUnlocked && isTimelineEditMode) openChecklistDraftEdit(item.id);
                                              }}
                                              className={"w-full text-left rounded-xl px-2 py-1.5 transition-colors " + (itemIsSpecial ? "bg-white/65" : "hover:bg-[#F3EEFF]/70")}
                                              title="點選流程上修改任務清單，儲存時可選擇連動三堂或此堂特殊"
                                            >
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs font-bold text-slate-800 border-b-2 border-dashed border-[#6D55A3]/20 inline-block">
                                                  {item.text || "(點選填寫任務清單)"}
                                                </span>
                                                {itemIsSpecial && (
                                                  <span className={"px-2 py-0.5 rounded-full border text-[9px] font-black " + specialStyle.badge}>此堂特殊</span>
                                                )}
                                              </div>
                                              <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                                                {item.details || "點選填寫任務細節"}
                                              </div>
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      <button 
                                        type="button"
                                        onClick={() => handleDeleteChecklistItem(item.id)}
                                        className="p-1.5 text-[#F25D6B]/50 hover:text-[#F25D6B] hover:bg-[#FFF2F4] rounded-lg transition-colors shrink-0"
                                        title="刪除此任務清單"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="text-[11px] text-slate-400 text-center py-2">目前沒有任務清單，可在上方新增</p>
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
        <style>{`
          .wifi-action-enter { animation: wifiFadeIn 420ms cubic-bezier(0.16, 1, 0.3, 1) both; }
          .wifi-check-button { transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), background-color 240ms ease, border-color 240ms ease, color 240ms ease, opacity 240ms ease, box-shadow 260ms ease; }
          .wifi-check-button:active { transform: scale(0.96); }
          .wifi-check-button-checking { border-color: rgba(0, 184, 184, 0.48) !important; animation: wifiGlowBreath 1200ms cubic-bezier(0.16, 1, 0.3, 1) infinite; }
          .wifi-refresh-icon-active { transform-origin: center; animation: wifiRefreshBurst 980ms cubic-bezier(0.1, 1, 0.1, 1) both; }
          .wifi-check-label { animation: wifiTextFade 260ms ease-out both; }
          @keyframes wifiFadeIn { from { opacity: 0; transform: translateY(4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
          @keyframes wifiTextFade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes wifiRefreshBurst { 0% { transform: rotate(0deg) scale(0.9); filter: drop-shadow(0 0 0 rgba(0, 184, 184, 0)); } 18% { transform: rotate(430deg) scale(1.1); filter: drop-shadow(0 0 8px rgba(0, 184, 184, 0.45)); } 72% { transform: rotate(690deg) scale(1.04); filter: drop-shadow(0 0 5px rgba(0, 184, 184, 0.25)); } 88% { transform: rotate(722deg) scale(1.02); } 100% { transform: rotate(720deg) scale(1); filter: drop-shadow(0 0 0 rgba(0, 184, 184, 0)); } }
          @keyframes wifiGlowBreath { 0% { box-shadow: 0 0 0 1px rgba(0, 184, 184, 0.14), 0 0 8px rgba(0, 184, 184, 0.18), 0 0 18px rgba(0, 184, 184, 0.10); } 50% { box-shadow: 0 0 0 1px rgba(0, 184, 184, 0.38), 0 0 14px rgba(0, 184, 184, 0.34), 0 0 34px rgba(0, 184, 184, 0.20); } 100% { box-shadow: 0 0 0 1px rgba(0, 184, 184, 0.14), 0 0 8px rgba(0, 184, 184, 0.18), 0 0 18px rgba(0, 184, 184, 0.10); } }
        `}</style>
        
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
        <p className="text-[12px] sm:text-[13px] font-bold text-[#6D55A3] mt-2 flex items-center gap-1.5 opacity-90 leading-none whitespace-nowrap">
          <HeartHandshake className="w-4 h-4 shrink-0" />
          <span>今天，我們一起歡迎家人回家</span>
        </p>
      </div>
    </div>

    <div className="bg-white/80 border border-[#E6EAF0] rounded-2xl px-3 py-2 text-right shadow-sm shrink-0 min-w-[74px]">
      <div className="text-[24px] leading-none font-black font-mono text-[#1F2937] tracking-tighter">
        {currentTime || "--:--"}
      </div>
    </div>
  </div>

  {activeTab !== "checkin" && (
    <>
      {/* 第二層：狀態與語音控制 */}
      <div className={`grid gap-2 mt-5 ${canUseQuestionAssistant ? "grid-cols-3" : "grid-cols-2"}`}>
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
          title="開啟或關閉語音助理"
        >
          {isVoiceEnabled ? (
            <Volume2 className="w-3.5 h-3.5" />
          ) : (
            <VolumeX className="w-3.5 h-3.5" />
          )}
          語音助理
        </button>

        {canUseQuestionAssistant && (
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
            title={isListening ? "點擊停止錄音並送出問題" : "點擊開始錄音問答"}
          >
            {isListening ? (
              <Mic className="w-3.5 h-3.5 text-white animate-bounce" />
            ) : isThinking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
            ) : (
              <MicOff className="w-3.5 h-3.5" />
            )}
            {isListening ? "停止錄音" : isThinking ? "思考中" : "問助理"}
          </button>
        )}
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
                  任務細節
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

        {/* QR 崗位碼全螢幕掃描 */}
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
                    onClick={(event) => handleManualStationCodeSubmit(event)}
                    className="mt-3 w-full py-3 bg-white text-[#6D55A3] font-black rounded-[16px] active:scale-[0.99] transition-transform"
                  >
                    確認崗位
                  </button>
                </div>
              </details>
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
                  {customConfirm.confirmLabel || "確認執行"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 底部功能導覽列：保留原品牌配色與圓角風格，改為新現場流程架構 */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around gap-1 px-2 py-1.5 bg-white/90 backdrop-blur-xl border-t border-[#E6EAF0] shadow-[0_-8px_28px_rgba(0,0,0,0.025)] pb-safe rounded-t-[22px] sm:rounded-t-[22px] sm:w-[420px] sm:mx-auto">
          {[
            { key: "checkin", label: "報到", icon: Check, color: "rose" },
            { key: "timeline", label: "流程", icon: ListTodo, color: "rose" },
            { key: "status", label: "現場", icon: BarChart2, color: "purple" },
            { key: "control", label: "控場", icon: HeartHandshake, color: "purple" },
            { key: "settings", label: "設定", icon: User, color: "purple" },
            { key: "admin", label: "管理", icon: Unlock, color: "purple" }
          ].filter((item) => item.key !== "admin" || canManageTimeline).map((item) => {
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
                  setActiveTab(item.key);
                }}
                className={`flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 transition-all duration-300 px-1.5 py-1 rounded-xl ${
                  active ? activeClass : "text-[#7B7B74] hover:bg-[#F3EEFF]"
                }`}
              >
                <NavIcon className="w-4 h-4" strokeWidth={active ? 2.5 : 2} />
                <span className="text-[9px] font-black tracking-widest whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
