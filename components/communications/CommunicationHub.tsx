"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  Paperclip,
  Phone,
  PhoneOff,
  Send,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SystemAvatar } from "@/components/profile/SystemAvatar";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizeAvatarConfig, type AvatarConfig } from "@/lib/profile/avatar";

type Peer = {
  id: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  unreadCount: number;
};

type ChatMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  messageType: "text" | "image" | "file";
  body: string;
  attachmentName: string;
  attachmentMime: string;
  attachmentSize: number;
  attachmentUrl: string;
  editedAt: string | null;
  retractedAt: string | null;
  readAt: string | null;
  createdAt: string;
};

type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string;
  status: "ringing" | "accepted" | "declined" | "ended" | "missed";
  answered_at: string | null;
  ended_at: string | null;
  created_at: string;
};

type IceServerResponse = {
  iceServers?: RTCIceServer[];
  relayAvailable?: boolean;
  relayReason?: string;
  turnUsagePercent?: number;
  warning?: string;
};

type CallSignal = {
  id: number;
  call_id: string;
  sender_id: string;
  signal_type: "offer" | "answer" | "ice";
  payload: Record<string, unknown>;
};

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function apiHeaders(accessToken: string, json = false) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

type RealtimeMessageEvent = "INSERT" | "UPDATE";

function realtimeRowToMessage(
  row: Record<string, unknown>,
  existing?: ChatMessage
): ChatMessage {
  const rawType = String(row.message_type ?? existing?.messageType ?? "text");
  const messageType: ChatMessage["messageType"] =
    rawType === "image" || rawType === "file" ? rawType : "text";
  const retractedAt = row.retracted_at === undefined
    ? existing?.retractedAt ?? null
    : row.retracted_at
      ? String(row.retracted_at)
      : null;

  return {
    id: String(row.id ?? existing?.id ?? ""),
    senderId: String(row.sender_id ?? existing?.senderId ?? ""),
    recipientId: String(row.recipient_id ?? existing?.recipientId ?? ""),
    messageType,
    body: retractedAt ? "" : String(row.body ?? existing?.body ?? ""),
    attachmentName: retractedAt ? "" : String(row.attachment_name ?? existing?.attachmentName ?? ""),
    attachmentMime: retractedAt ? "" : String(row.attachment_mime ?? existing?.attachmentMime ?? ""),
    attachmentSize: retractedAt ? 0 : Number(row.attachment_size ?? existing?.attachmentSize ?? 0),
    attachmentUrl: retractedAt ? "" : existing?.attachmentUrl ?? "",
    editedAt: row.edited_at === undefined
      ? existing?.editedAt ?? null
      : row.edited_at
        ? String(row.edited_at)
        : null,
    retractedAt,
    readAt: row.read_at === undefined
      ? existing?.readAt ?? null
      : row.read_at
        ? String(row.read_at)
        : null,
    createdAt: String(row.created_at ?? existing?.createdAt ?? new Date().toISOString()),
  };
}

function upsertMessage(current: ChatMessage[], message: ChatMessage) {
  const index = current.findIndex((item) => item.id === message.id);
  if (index < 0) {
    return [...current, message].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    );
  }

  const next = [...current];
  next[index] = message;
  return next;
}

function renderLinkedText(text: string) {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  return text.split(urlPattern).map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return <span key={index}>{part}</span>;
    return (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        className="break-all font-bold underline underline-offset-2"
      >
        {part}
      </a>
    );
  });
}

export function CommunicationHub() {
  const { session, isAdmin, isCoordinator } = useAuth();
  const canUse = isAdmin || isCoordinator;
  const [open, setOpen] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingPeers, setLoadingPeers] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [incomingCall, setIncomingCall] = useState<CallRow | null>(null);
  const [activeCall, setActiveCall] = useState<CallRow | null>(null);
  const [callState, setCallState] = useState<"idle" | "ringing" | "connecting" | "connected">("idle");
  const [muted, setMuted] = useState(false);

  const selectedPeer = peers.find((peer) => peer.id === selectedPeerId) ?? null;
  const totalUnread = useMemo(
    () => peers.reduce((sum, peer) => sum + peer.unreadCount, 0),
    [peers]
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneContextRef = useRef<AudioContext | null>(null);
  const ringtoneTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCallRef = useRef<CallRow | null>(null);
  const isCallerRef = useRef(false);
  const processedSignalsRef = useRef(new Set<number>());
  const processedMessageInsertIdsRef = useRef(new Set<string>());
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  const requestJson = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...apiHeaders(session.access_token, init?.body != null && !(init.body instanceof FormData)),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "目前無法完成操作。");
    return data;
  }, [session.access_token]);

  const ensureRingtoneAudio = useCallback(async () => {
    if (typeof window === "undefined") return null;

    const audioWindow = window as AudioWindow;
    const AudioContextClass = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextClass) return null;

    let context = ringtoneContextRef.current;
    if (!context || context.state === "closed") {
      context = new AudioContextClass();
      ringtoneContextRef.current = context;
    }

    if (context.state !== "running") {
      await context.resume().catch(() => undefined);
    }

    return context.state === "running" ? context : null;
  }, []);

  const playRingtonePulse = useCallback(async () => {
    const context = await ensureRingtoneAudio();
    if (!context) return;

    const now = context.currentTime;
    const gain = context.createGain();
    const firstTone = context.createOscillator();
    const secondTone = context.createOscillator();

    firstTone.type = "sine";
    secondTone.type = "sine";
    firstTone.frequency.setValueAtTime(523.25, now);
    secondTone.frequency.setValueAtTime(659.25, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.025);
    gain.gain.setValueAtTime(0.075, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    firstTone.connect(gain);
    secondTone.connect(gain);
    gain.connect(context.destination);

    firstTone.start(now);
    secondTone.start(now);
    firstTone.stop(now + 0.45);
    secondTone.stop(now + 0.45);

    window.setTimeout(() => {
      firstTone.disconnect();
      secondTone.disconnect();
      gain.disconnect();
    }, 650);

    if ("vibrate" in navigator) {
      navigator.vibrate([180, 90, 180]);
    }
  }, [ensureRingtoneAudio]);

  const stopRingtone = useCallback(() => {
    if (ringtoneTimerRef.current) {
      clearInterval(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(0);
    }
  }, []);

  const startRingtone = useCallback(() => {
    stopRingtone();
    void playRingtonePulse();
    ringtoneTimerRef.current = setInterval(() => {
      void playRingtonePulse();
    }, 1600);
  }, [playRingtonePulse, stopRingtone]);

  useEffect(() => {
    const unlockAudio = () => {
      void ensureRingtoneAudio();
    };

    window.addEventListener("pointerdown", unlockAudio, { capture: true, once: true });
    window.addEventListener("keydown", unlockAudio, { capture: true, once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
    };
  }, [ensureRingtoneAudio]);

  useEffect(() => {
    if (!incomingCall) {
      stopRingtone();
      return;
    }

    startRingtone();

    const resumeWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void ensureRingtoneAudio().then(() => startRingtone());
      }
    };
    document.addEventListener("visibilitychange", resumeWhenVisible);

    return () => {
      document.removeEventListener("visibilitychange", resumeWhenVisible);
      stopRingtone();
    };
  }, [ensureRingtoneAudio, incomingCall?.id, startRingtone, stopRingtone]);

  useEffect(() => () => {
    stopRingtone();
    const context = ringtoneContextRef.current;
    ringtoneContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => undefined);
    }
  }, [stopRingtone]);

  const loadPeers = useCallback(async () => {
    if (!canUse) return;
    setLoadingPeers(true);
    try {
      const data = await requestJson("/api/communications/peers");
      setPeers(
        Array.isArray(data?.peers)
          ? data.peers.map((peer: Peer) => ({
              ...peer,
              avatarConfig: normalizeAvatarConfig(peer.avatarConfig),
            }))
          : []
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "無法讀取聯絡人。");
    } finally {
      setLoadingPeers(false);
    }
  }, [canUse, requestJson]);

  const markRead = useCallback(async (peerId: string) => {
    if (!peerId) return;
    await requestJson("/api/communications/messages", {
      method: "PATCH",
      body: JSON.stringify({ action: "read", peerId }),
    }).catch(() => undefined);
  }, [requestJson]);

  const loadMessages = useCallback(async (
    peerId: string,
    markAsRead = true,
    showLoading = true
  ) => {
    if (!peerId) return;
    if (showLoading) setLoadingMessages(true);
    try {
      const data = await requestJson(`/api/communications/messages?peerId=${encodeURIComponent(peerId)}`);
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      if (markAsRead) {
        setPeers((current) => current.map((peer) =>
          peer.id === peerId ? { ...peer, unreadCount: 0 } : peer
        ));
        void markRead(peerId);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "無法讀取訊息。");
    } finally {
      if (showLoading) setLoadingMessages(false);
    }
  }, [markRead, requestJson]);

  const handleRealtimeMessage = useCallback((
    row: Record<string, unknown>,
    eventType: RealtimeMessageEvent
  ) => {
    const messageId = String(row.id || "");
    const senderId = String(row.sender_id || "");
    const recipientId = String(row.recipient_id || "");
    const currentUserId = session.user.id;

    if (
      !messageId
      || (senderId !== currentUserId && recipientId !== currentUserId)
    ) {
      return;
    }

    const peerId = senderId === currentUserId ? recipientId : senderId;
    if (!peerId) return;

    if (eventType === "INSERT") {
      if (processedMessageInsertIdsRef.current.has(messageId)) return;
      if (processedMessageInsertIdsRef.current.size >= 500) {
        processedMessageInsertIdsRef.current.clear();
      }
      processedMessageInsertIdsRef.current.add(messageId);
    }

    const isSelectedConversation = selectedPeerId === peerId;
    if (isSelectedConversation) {
      setMessages((current) => {
        const existing = current.find((message) => message.id === messageId);
        return upsertMessage(current, realtimeRowToMessage(row, existing));
      });
    }

    if (eventType === "INSERT" && recipientId === currentUserId) {
      if (open && isSelectedConversation) {
        setPeers((current) => current.map((peer) =>
          peer.id === peerId ? { ...peer, unreadCount: 0 } : peer
        ));
        void markRead(peerId);
      } else {
        setPeers((current) => current.map((peer) =>
          peer.id === peerId
            ? { ...peer, unreadCount: peer.unreadCount + 1 }
            : peer
        ));
      }
    }

    if (
      eventType === "INSERT"
      && isSelectedConversation
      && String(row.message_type || "") !== "text"
    ) {
      void loadMessages(peerId, false, false);
    }
  }, [loadMessages, markRead, open, selectedPeerId, session.user.id]);

  useEffect(() => {
    if (!canUse) return;
    const timer = window.setTimeout(() => {
      void loadPeers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canUse, loadPeers]);

  useEffect(() => {
    if (!open || !selectedPeerId) return;
    const timer = window.setTimeout(() => {
      void loadMessages(selectedPeerId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, selectedPeerId, loadMessages]);

  useEffect(() => {
    if (open && selectedPeerId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, selectedPeerId]);

  const cleanupPeerConnection = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    pendingIceRef.current = [];
    processedSignalsRef.current.clear();
    setMuted(false);
    setCallState("idle");
    setActiveCall(null);
    activeCallRef.current = null;
  }, []);

  const sendSignal = useCallback(async (
    callId: string,
    signalType: "offer" | "answer" | "ice",
    payload: Record<string, unknown>
  ) => {
    await requestJson("/api/communications/calls", {
      method: "POST",
      body: JSON.stringify({ action: "signal", callId, signalType, payload }),
    });
  }, [requestJson]);

  const flushPendingIce = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc?.remoteDescription) return;
    const pending = [...pendingIceRef.current];
    pendingIceRef.current = [];
    for (const candidate of pending) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }, []);

  const processSignal = useCallback(async (signal: CallSignal) => {
    const call = activeCallRef.current;
    const pc = peerConnectionRef.current;
    if (!call || !pc || signal.call_id !== call.id || signal.sender_id === session.user.id) return;
    if (processedSignalsRef.current.has(Number(signal.id))) return;
    processedSignalsRef.current.add(Number(signal.id));

    if (signal.signal_type === "offer" && !isCallerRef.current) {
      await pc.setRemoteDescription(signal.payload as unknown as RTCSessionDescriptionInit);
      await flushPendingIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(call.id, "answer", {
        type: answer.type,
        sdp: answer.sdp,
      });
      return;
    }

    if (signal.signal_type === "answer" && isCallerRef.current) {
      await pc.setRemoteDescription(signal.payload as unknown as RTCSessionDescriptionInit);
      await flushPendingIce();
      return;
    }

    if (signal.signal_type === "ice") {
      const candidate = signal.payload as unknown as RTCIceCandidateInit;
      if (pc.remoteDescription) {
        await pc.addIceCandidate(candidate).catch(() => undefined);
      } else {
        pendingIceRef.current.push(candidate);
      }
    }
  }, [flushPendingIce, sendSignal, session.user.id]);

  const loadCallSignals = useCallback(async (callId: string) => {
    const data = await requestJson(`/api/communications/calls?callId=${encodeURIComponent(callId)}`);
    for (const signal of (data?.signals ?? []) as CallSignal[]) {
      await processSignal(signal);
    }
  }, [processSignal, requestJson]);

  const loadIceServers = useCallback(async (): Promise<RTCIceServer[]> => {
    try {
      const data = await requestJson("/api/communications/ice-servers") as IceServerResponse;

      if (data.warning) {
        setErrorMessage(data.warning);
      } else if (!data.relayAvailable && data.relayReason === "free-tier-95-percent") {
        setErrorMessage("TURN 已達免費額度 95% 保護門檻，已自動改用 P2P／STUN，避免產生費用。");
      } else if (
        !data.relayAvailable
        && ["cost-guard-unconfigured", "cost-guard-unavailable"].includes(data.relayReason || "")
      ) {
        setErrorMessage("TURN 成本保護已啟用：目前無法確認免費額度，因此暫停 TURN relay，改用 P2P／STUN。");
      }

      if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        return data.iceServers;
      }
    } catch {
      // Keep calling available even when the TURN credential service is unavailable.
    }

    return [{ urls: ["stun:stun.cloudflare.com:3478"] }];
  }, [requestJson]);

  const setupPeerConnection = useCallback(async (call: CallRow, caller: boolean) => {
    cleanupPeerConnection();
    isCallerRef.current = caller;
    processedSignalsRef.current.clear();
    pendingIceRef.current = [];

    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      throw new Error("此瀏覽器不支援 App 內語音通話。");
    }

    const [stream, iceServers] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
      loadIceServers(),
    ]);
    localStreamRef.current = stream;
    const pc = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: "all",
    });
    peerConnectionRef.current = pc;
    activeCallRef.current = call;
    setActiveCall(call);
    setCallState(caller ? "ringing" : "connecting");

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const json = event.candidate.toJSON();
      void sendSignal(call.id, "ice", json as unknown as Record<string, unknown>).catch(() => undefined);
    };

    pc.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        void remoteAudioRef.current.play().catch(() => undefined);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setCallState("connected");
      if (["failed", "closed"].includes(pc.connectionState)) cleanupPeerConnection();
    };

    if (caller) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(call.id, "offer", {
        type: offer.type,
        sdp: offer.sdp,
      });

      ringTimeoutRef.current = setTimeout(() => {
        const current = activeCallRef.current;
        if (current?.id === call.id && peerConnectionRef.current?.connectionState !== "connected") {
          void requestJson("/api/communications/calls", {
            method: "POST",
            body: JSON.stringify({ action: "end", callId: call.id }),
          }).catch(() => undefined);
          cleanupPeerConnection();
        }
      }, 45000);
    } else {
      await loadCallSignals(call.id);
    }
  }, [cleanupPeerConnection, loadCallSignals, loadIceServers, requestJson, sendSignal]);

  const loadActiveCalls = useCallback(async () => {
    if (!canUse) return;
    try {
      const data = await requestJson("/api/communications/calls");
      const calls = (data?.calls ?? []) as CallRow[];
      const incoming = calls.find(
        (call) => call.status === "ringing" && call.callee_id === session.user.id
      );
      setIncomingCall(incoming ?? null);

      const current = activeCallRef.current;
      if (current) {
        const latest = calls.find((call) => call.id === current.id);
        if (!latest || ["declined", "ended", "missed"].includes(latest.status)) {
          cleanupPeerConnection();
        } else if (latest.status === "accepted" && isCallerRef.current && callState === "ringing") {
          setCallState("connecting");
          setActiveCall(latest);
          activeCallRef.current = latest;
          void loadCallSignals(latest.id);
        }
      }
    } catch {
      // Realtime/poll refresh failures should not block the rest of the app.
    }
  }, [callState, canUse, cleanupPeerConnection, loadCallSignals, requestJson, session.user.id]);

  useEffect(() => {
    if (!canUse) return;
    const initialRefreshTimer = window.setTimeout(() => {
      void loadActiveCalls();
    }, 0);

    const supabase = getSupabaseBrowserClient();
    const userId = session.user.id;
    const channel = supabase
      .channel(`communication-user-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "communication_messages",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => handleRealtimeMessage(
          payload.new as Record<string, unknown>,
          "INSERT"
        )
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "communication_messages",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => handleRealtimeMessage(
          payload.new as Record<string, unknown>,
          "UPDATE"
        )
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "communication_messages",
          filter: `sender_id=eq.${userId}`,
        },
        (payload) => handleRealtimeMessage(
          payload.new as Record<string, unknown>,
          "UPDATE"
        )
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "communication_calls",
          filter: `caller_id=eq.${userId}`,
        },
        () => void loadActiveCalls()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "communication_calls",
          filter: `callee_id=eq.${userId}`,
        },
        () => void loadActiveCalls()
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialRefreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [canUse, handleRealtimeMessage, loadActiveCalls, session.user.id]);

  useEffect(() => {
    if (!canUse) return;

    const supabase = getSupabaseBrowserClient();
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void requestJson("/api/communications/broadcast-topic")
      .then((data) => {
        if (disposed || typeof data?.topic !== "string" || !data.topic) return;

        channel = supabase
          .channel(data.topic)
          .on(
            "broadcast",
            { event: "message-insert" },
            (event) => {
              const row = (
                event && typeof event === "object" && "payload" in event
                  ? event.payload
                  : event
              ) as Record<string, unknown>;
              handleRealtimeMessage(row, "INSERT");
            }
          )
          .subscribe();
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [canUse, handleRealtimeMessage, requestJson]);

  const signalCallId = activeCall?.id ?? "";

  useEffect(() => {
    if (!canUse || !signalCallId) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`communication-call-signals-${signalCallId}-${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "communication_call_signals",
          filter: `call_id=eq.${signalCallId}`,
        },
        (payload) => void processSignal(payload.new as CallSignal)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canUse, processSignal, session.user.id, signalCallId]);

  useEffect(() => () => cleanupPeerConnection(), [cleanupPeerConnection]);

  const sendText = async () => {
    if (!selectedPeerId || !draft.trim() || sending) return;
    setSending(true);
    setErrorMessage("");
    try {
      const data = await requestJson("/api/communications/messages", {
        method: "POST",
        body: JSON.stringify({ peerId: selectedPeerId, body: draft }),
      });
      const message = data?.message as ChatMessage | undefined;
      if (message?.id) {
        setMessages((current) => upsertMessage(current, message));
      }
      setDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "訊息傳送失敗。");
    } finally {
      setSending(false);
    }
  };

  const editMessage = async (message: ChatMessage) => {
    if (message.messageType !== "text" || message.retractedAt) return;
    const next = window.prompt("修改訊息", message.body);
    if (next == null || !next.trim() || next.trim() === message.body) return;
    try {
      await requestJson("/api/communications/messages", {
        method: "PATCH",
        body: JSON.stringify({ action: "edit", messageId: message.id, body: next }),
      });
      await loadMessages(selectedPeerId, false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "修改訊息失敗。");
    }
  };

  const retractMessage = async (message: ChatMessage) => {
    if (message.retractedAt || !window.confirm("確定要收回這則訊息嗎？")) return;
    try {
      await requestJson("/api/communications/messages", {
        method: "PATCH",
        body: JSON.stringify({ action: "retract", messageId: message.id }),
      });
      await loadMessages(selectedPeerId, false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "收回訊息失敗。");
    }
  };

  const uploadFile = async (file: File) => {
    if (!selectedPeerId) return;
    setUploading(true);
    setErrorMessage("");
    try {
      const form = new FormData();
      form.append("peerId", selectedPeerId);
      form.append("file", file);
      await requestJson("/api/communications/attachments", {
        method: "POST",
        body: form,
      });
      await loadMessages(selectedPeerId, false);
      await loadPeers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "檔案傳送失敗。");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startCall = async () => {
    if (!selectedPeer || activeCall) return;
    setErrorMessage("");
    try {
      const data = await requestJson("/api/communications/calls", {
        method: "POST",
        body: JSON.stringify({ action: "start", peerId: selectedPeer.id }),
      });
      await setupPeerConnection(data.call as CallRow, true);
    } catch (error) {
      cleanupPeerConnection();
      setErrorMessage(error instanceof Error ? error.message : "無法開始通話。");
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    const call = incomingCall;
    stopRingtone();
    setIncomingCall(null);
    setOpen(true);
    const peerId = call.caller_id;
    setSelectedPeerId(peerId);
    try {
      const data = await requestJson("/api/communications/calls", {
        method: "POST",
        body: JSON.stringify({ action: "accept", callId: call.id }),
      });
      await setupPeerConnection(data.call as CallRow, false);
    } catch (error) {
      cleanupPeerConnection();
      setErrorMessage(error instanceof Error ? error.message : "無法接聽通話。");
    }
  };

  const declineCall = async () => {
    if (!incomingCall) return;
    const callId = incomingCall.id;
    stopRingtone();
    setIncomingCall(null);
    await requestJson("/api/communications/calls", {
      method: "POST",
      body: JSON.stringify({ action: "decline", callId }),
    }).catch(() => undefined);
  };

  const endCall = async () => {
    const call = activeCallRef.current;
    if (call) {
      await requestJson("/api/communications/calls", {
        method: "POST",
        body: JSON.stringify({ action: "end", callId: call.id }),
      }).catch(() => undefined);
    }
    cleanupPeerConnection();
  };

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  };

  if (!canUse) return null;

  const incomingPeer = incomingCall
    ? peers.find((peer) => peer.id === incomingCall.caller_id) ?? null
    : null;
  const callPeerId = activeCall
    ? (activeCall.caller_id === session.user.id ? activeCall.callee_id : activeCall.caller_id)
    : "";
  const callPeer = peers.find((peer) => peer.id === callPeerId) ?? selectedPeer;

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setErrorMessage("");
          if (!open) void loadPeers();
        }}
        aria-label="訊息"
        className="fixed bottom-24 right-4 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-[#6D55A3] text-white shadow-xl shadow-[#6D55A3]/30 active:scale-95"
      >
        <MessageCircle className="h-6 w-6" />
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#F25D6B] px-1.5 py-0.5 text-[10px] font-black text-white">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-[9.5rem] right-3 z-[75] flex h-[min(72vh,620px)] w-[calc(100vw-1.5rem)] max-w-[420px] flex-col overflow-hidden rounded-[28px] border border-[#E6EAF0] bg-white shadow-2xl">
          <div className="flex items-center gap-3 border-b border-[#E6EAF0] bg-[#FFF9F3] px-4 py-3">
            {selectedPeer && (
              <button type="button" onClick={() => setSelectedPeerId("")} className="rounded-full p-2 text-[#6D55A3]">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            {selectedPeer ? (
              <>
                <SystemAvatar config={selectedPeer.avatarConfig} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-[#1F2937]">{selectedPeer.displayName}</div>
                  <div className="text-[11px] font-bold text-[#7B7B74]">私人對話</div>
                </div>
                <button
                  type="button"
                  onClick={() => void startCall()}
                  disabled={Boolean(activeCall)}
                  aria-label="語音通話"
                  className="rounded-full bg-[#F3EEFF] p-2.5 text-[#6D55A3] disabled:opacity-40"
                >
                  <Phone className="h-5 w-5" />
                </button>
              </>
            ) : (
              <div className="flex-1">
                <div className="text-base font-black text-[#1F2937]">訊息</div>
                <div className="text-[11px] font-bold text-[#7B7B74]">不受崇拜時段限制</div>
              </div>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="關閉訊息" className="rounded-full p-2 text-[#7B7B74]">
              <X className="h-5 w-5" />
            </button>
          </div>

          {errorMessage && (
            <div className="border-b border-[#F25D6B]/15 bg-[#FFF2F4] px-4 py-2 text-xs font-bold text-[#D73A49]">
              {errorMessage}
            </div>
          )}

          {!selectedPeer ? (
            <div className="flex-1 overflow-y-auto p-3">
              {loadingPeers ? (
                <div className="flex h-full items-center justify-center text-[#6D55A3]">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : peers.length === 0 ? (
                <div className="p-8 text-center text-sm font-bold text-[#7B7B74]">目前沒有可聯絡的帳號。</div>
              ) : (
                <div className="space-y-1.5">
                  {peers.map((peer) => (
                    <button
                      key={peer.id}
                      type="button"
                      onClick={() => setSelectedPeerId(peer.id)}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-[#FFF9F3]"
                    >
                      <SystemAvatar config={peer.avatarConfig} size={46} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-[#1F2937]">{peer.displayName}</div>
                        <div className="truncate text-xs font-medium text-[#7B7B74]">私人對話</div>
                      </div>
                      {peer.unreadCount > 0 && (
                        <span className="min-w-6 rounded-full bg-[#F25D6B] px-2 py-1 text-center text-[10px] font-black text-white">
                          {peer.unreadCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto bg-[#FFF9F3]/60 px-3 py-4">
                {loadingMessages ? (
                  <div className="flex h-full items-center justify-center text-[#6D55A3]">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center text-xs font-bold text-[#7B7B74]">還沒有訊息，可以直接開始對話。</div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((message) => {
                      const mine = message.senderId === session.user.id;
                      return (
                        <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className="max-w-[82%]">
                            <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${mine ? "rounded-br-md bg-[#6D55A3] text-white" : "rounded-bl-md border border-[#E6EAF0] bg-white text-[#1F2937]"}`}>
                              {message.retractedAt ? (
                                <span className="italic opacity-70">此訊息已收回</span>
                              ) : message.messageType === "text" ? (
                                <div className="whitespace-pre-wrap break-words">{renderLinkedText(message.body)}</div>
                              ) : message.messageType === "image" ? (
                                <a href={message.attachmentUrl} target="_blank" rel="noreferrer noopener" className="block">
                                  {/* Signed attachment URLs are dynamic and intentionally rendered without Next Image optimization. */}
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={message.attachmentUrl} alt={message.attachmentName || "聊天圖片"} className="max-h-52 rounded-xl object-contain" />
                                  <div className="mt-1 break-all text-[11px] font-bold">{message.attachmentName}</div>
                                </a>
                              ) : (
                                <a href={message.attachmentUrl} target="_blank" rel="noreferrer noopener" className="flex items-center gap-2">
                                  <FileText className="h-5 w-5 shrink-0" />
                                  <div className="min-w-0">
                                    <div className="break-all text-xs font-black">{message.attachmentName}</div>
                                    <div className="text-[10px] opacity-70">{formatFileSize(message.attachmentSize)}</div>
                                  </div>
                                </a>
                              )}
                            </div>
                            <div className={`mt-1 flex items-center gap-2 px-1 text-[10px] font-medium text-[#7B7B74] ${mine ? "justify-end" : "justify-start"}`}>
                              <span>{formatTime(message.createdAt)}</span>
                              {message.editedAt && !message.retractedAt && <span>已編輯</span>}
                              {mine && !message.retractedAt && <span>{message.readAt ? "已讀" : "未讀"}</span>}
                              {mine && !message.retractedAt && (
                                <>
                                  {message.messageType === "text" && (
                                    <button type="button" onClick={() => void editMessage(message)} className="font-bold text-[#6D55A3]">編輯</button>
                                  )}
                                  <button type="button" onClick={() => void retractMessage(message)} className="font-bold text-[#F25D6B]">收回</button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="border-t border-[#E6EAF0] bg-white p-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                  }}
                />
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    aria-label="上傳照片或檔案"
                    className="mb-0.5 rounded-full p-2.5 text-[#6D55A3] disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
                  </button>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendText();
                      }
                    }}
                    rows={1}
                    placeholder="輸入訊息…"
                    className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-[#D9DEE7] px-3 py-2.5 text-sm outline-none focus:border-[#6D55A3]"
                  />
                  <button
                    type="button"
                    onClick={() => void sendText()}
                    disabled={sending || !draft.trim()}
                    aria-label="傳送訊息"
                    className="mb-0.5 rounded-full bg-[#6D55A3] p-2.5 text-white disabled:opacity-40"
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </div>
                <div className="mt-1 px-11 text-[10px] font-medium text-[#7B7B74]">照片／文件單檔最多 10MB</div>
              </div>
            </>
          )}
        </div>
      )}

      {incomingCall && (
        <div className="fixed inset-x-3 top-20 z-[90] mx-auto max-w-sm rounded-[28px] border border-[#E6EAF0] bg-white p-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <SystemAvatar config={incomingPeer?.avatarConfig} size={58} />
            <div className="flex-1">
              <div className="text-base font-black text-[#1F2937]">{incomingPeer?.displayName || "管理員／總招"}</div>
              <div className="mt-1 text-xs font-bold text-[#7B7B74]">App 內語音來電</div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => void declineCall()} className="flex items-center justify-center gap-2 rounded-2xl bg-[#FFF2F4] py-3 font-black text-[#D73A49]">
              <PhoneOff className="h-5 w-5" /> 拒接
            </button>
            <button type="button" onClick={() => void acceptCall()} className="flex items-center justify-center gap-2 rounded-2xl bg-[#008A7A] py-3 font-black text-white">
              <Phone className="h-5 w-5" /> 接聽
            </button>
          </div>
        </div>
      )}

      {activeCall && (
        <div className="fixed inset-x-3 bottom-24 z-[95] mx-auto max-w-sm rounded-[28px] bg-[#1F2937] p-5 text-white shadow-2xl">
          <div className="flex items-center gap-3">
            <SystemAvatar config={callPeer?.avatarConfig} size={58} />
            <div className="flex-1">
              <div className="text-base font-black">{callPeer?.displayName || "通話中"}</div>
              <div className="mt-1 text-xs font-bold text-white/70">
                {callState === "ringing" ? "撥號中…" : callState === "connected" ? "通話中" : "正在連線…"}
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-center gap-4">
            <button type="button" onClick={toggleMute} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15" aria-label={muted ? "開啟麥克風" : "靜音"}>
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button type="button" onClick={() => void endCall()} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D73A49]" aria-label="掛斷">
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
