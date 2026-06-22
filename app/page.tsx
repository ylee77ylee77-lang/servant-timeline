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
  ArrowDown
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

export default function App() {
  const [nodes, setNodes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [activeTab, setActiveTab] = useState('timeline');
  const [currentTime, setCurrentTime] = useState("");
  const activeNodeRef = useRef<HTMLDivElement>(null);

  const [detailModal, setDetailModal] = useState<{isOpen: boolean, title: string, details: string}>({isOpen: false, title: '', details: ''});

  const [currentService, setCurrentService] = useState('主一堂'); 
  const serviceOptions = ['六晚崇', '主一堂', '主二堂'];
  
  const hasManuallySwitchedRef = useRef(false);

  // --- 權限鎖定相關狀態 ---
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const ADMIN_PASSWORD = '1234'; // 管理員驗證密碼

  // --- 自訂精美 Modal 提示框狀態 (取代冷冰冰的 alert & confirm) ---
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

  // 確保時鐘即時更新，並加入自動切換邏輯 (維持原樣)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);

      if (!hasManuallySwitchedRef.current) {
        const day = now.getDay(); 
        const timeValue = now.getHours() + now.getMinutes() / 60; 

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
    const timer = setInterval(updateTime, 60000); 
    return () => clearInterval(timer);
  }, []);

  // 背景自動同步雲端資料，改由 sort_order 升序排序
  const fetchData = async (isBackgroundSync = false) => {
    try {
      if (!isBackgroundSync) setFetchError("");
      const nodesData = await supabaseFetch('timeline_nodes?order=time.asc');
      const checklistData = await supabaseFetch('checklist_items?order=sort_order.asc,id.asc');

      if (nodesData && checklistData) {
        const formattedNodes = nodesData.map((node: any) => ({
          ...node,
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

  const filteredNodes = nodes.filter(n => n.service_type === currentService);
  const isNodeCompleted = (node: any) => node.checklist && node.checklist.length > 0 && node.checklist.every((c: any) => c.is_completed);
  const activeNodeId = filteredNodes.find(n => !isNodeCompleted(n))?.id;

  useEffect(() => {
    if (!isLoading && !fetchError && filteredNodes.length > 0 && activeTab === 'timeline' && activeNodeRef.current) {
      setTimeout(() => {
        activeNodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [activeTab, isLoading, fetchError, filteredNodes.length, currentService]);

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

  // 即時編輯儲存功能 (擴充管理功能，同步更新 Supabase)
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

  // --- 行內即時修改（Inline Editing）核心邏輯 ---
  const handleInlineClick = (type: 'node' | 'checklist', id: string, field: string, currentValue: string) => {
    if (!isAdminUnlocked) return; // 沒密碼解鎖就當作防誤觸唯讀狀態
    setActiveInlineEdit({ type, id, field });
    setInlineEditValue(currentValue);
  };

  const handleInlineBlur = async () => {
    if (!activeInlineEdit) return;
    const { type, id, field } = activeInlineEdit;
    const updatedValue = inlineEditValue.trim();

    // 先在前端 UI 即時反應
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

    // 同步到 Supabase 雲端
    try {
      if (type === 'node') {
        await supabaseFetch(`timeline_nodes?id=eq.${id}`, 'PATCH', { [field]: updatedValue });
      } else if (type === 'checklist') {
        await supabaseFetch(`checklist_items?id=eq.${id}`, 'PATCH', { [field]: updatedValue });
      }
      fetchData(true); // 背景安靜同步
    } catch (err: any) {
      console.error("行內修改同步失敗:", err);
      setCustomAlert({ isOpen: true, message: "行內即時同步失敗，正在復原最新雲端數據..." });
      fetchData(true);
    }
  };

  // --- Checklist 拖曳與排序核心功能 (Drag & Drop) ---
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

    // 搬移
    const [removed] = items.splice(draggedIndex, 1);
    items.splice(targetIndex, 0, removed);

    // 重新編排 sort_order
    const updatedItems = items.map((item, index) => ({
      ...item,
      sort_order: index
    }));

    // 本地預先渲染
    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n;
      return { ...n, checklist: updatedItems };
    }));

    setDraggedItemId(null);

    // 依序寫入雲端
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

  // 提供給手機端的箭頭一鍵移位功能 (完美補位 HTML5 Drag&Drop)
  const moveChecklistItem = async (nodeId: string, index: number, direction: 'up' | 'down') => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.checklist) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= node.checklist.length) return;

    const items = [...node.checklist].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    // 交換
    const temp = items[index];
    items[index] = items[targetIndex];
    items[targetIndex] = temp;

    // 重新排序
    const updatedItems = items.map((item, idx) => ({
      ...item,
      sort_order: idx
    }));

    // 本地預先渲染
    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n;
      return { ...n, checklist: updatedItems };
    }));

    // 雲端同步
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

  // --- 新增、刪除 Checklist 子項目邏輯 ---
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

  // 驗證管理密碼並進入管理面板
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

  // 渲染行內即時編輯輸入欄位
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

  // 全新品牌風格 - 載入畫面
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3EEFF]">
        <div className="flex flex-col items-center gap-6 p-8 bg-white/80 backdrop-blur-xl rounded-[32px] shadow-2xl shadow-[#6D55A3]/10">
          <div className="relative flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#F25D6B] to-[#6D55A3] rounded-2xl shadow-lg animate-pulse">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <p className="text-[#6D55A3] font-bold tracking-widest text-sm uppercase">正在連線至夏凱納雲端...</p>
        </div>
      </div>
    );
  }

  if (!hasValidKeys) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FFF9F3] p-6">
        <div className="bg-white p-8 rounded-[24px] max-w-md w-full shadow-xl shadow-[#F25D6B]/5 border border-[#FFE8A3]">
          <h2 className="text-xl font-bold text-[#F25D6B] mb-4 flex items-center gap-2">
            <AlertCircle /> 系統警告：雲端鑰匙錯誤
          </h2>
          <p className="text-[#7B7B74] text-sm leading-relaxed">請確認程式碼中的網址與鑰匙設定正確。</p>
        </div>
      </div>
    );
  }

  // 全新品牌風格 - 時間軸畫面
  const renderTimelineView = () => (
    <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
      {filteredNodes.length === 0 ? (
        <div className="text-center text-[#7B7B74] mt-16 text-sm bg-white p-6 rounded-[24px] shadow-sm border border-[#E6EAF0]">
          <Sparkles className="w-8 h-8 text-[#E6EAF0] mx-auto mb-3" />
          此堂次目前尚未安排服事任務
        </div>
      ) : (
        <div className="relative mt-2">
          {/* 溫慢主時間軸 */}
          <div className="absolute left-[20px] top-6 bottom-6 w-[2px] bg-gradient-to-b from-[#F3EEFF] via-[#E6EAF0] to-[#FFF9F3]" />
          
          {filteredNodes.map((node) => {
            const completed = isNodeCompleted(node);
            const active = node.id === activeNodeId;
            return (
              <div key={node.id} className="relative mb-8 transition-all duration-500" ref={active ? activeNodeRef : null}>
                
                {/* 節點圓點 */}
                <div className="absolute left-0 top-4 flex items-center justify-center w-10 h-10 bg-[#FFF9F3] z-10">
                  {completed ? (
                    <div className="w-7 h-7 rounded-full bg-[#00B8B8] flex items-center justify-center shadow-sm shadow-[#00B8B8]/30">
                       <Check className="w-4 h-4 text-white" strokeWidth={3} />
                    </div>
                  ) : active ? (
                    <div className="relative flex items-center justify-center w-8 h-8">
                      <span className="absolute inline-flex w-full h-full rounded-full opacity-30 bg-[#F25D6B] animate-ping" />
                      <span className="relative inline-flex w-4 h-4 rounded-full bg-[#F25D6B] shadow-sm shadow-[#F25D6B]/50" />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-full border-[3px] border-[#E6EAF0] bg-white" />
                  )}
                </div>

                {/* 任務卡片 */}
                <div className={`ml-12 rounded-[24px] p-5 transition-all duration-300 ${
                  completed ? 'bg-white/60 border border-[#E6EAF0] opacity-70' : 
                  active ? 'bg-[#FFF2F4] ring-2 ring-[#F25D6B] shadow-lg shadow-[#F25D6B]/15' : 
                  'bg-white border border-[#E6EAF0] shadow-sm'
                }`}>
                  
                  {/* 標題與時間列 */}
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

                  {/* 角色與地點資訊 */}
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
                  
                  {/* Checklist 區域 */}
                  {node.checklist && node.checklist.length > 0 && (
                    <div className="mt-5 space-y-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-px bg-[#E6EAF0] flex-1"></div>
                        <div className="text-[10px] font-black text-[#6D55A3]/40 uppercase tracking-widest">任務清單</div>
                        <div className="h-px bg-[#E6EAF0] flex-1"></div>
                      </div>

                      {node.checklist.map((item: any) => (
                        <div key={item.id} className={`flex items-start gap-3 p-3.5 rounded-[16px] transition-all duration-200 ${
                          item.is_completed ? 'bg-[#00B8B8]/5 border border-[#00B8B8]/20' : 'bg-white border border-[#E6EAF0] shadow-sm hover:border-[#6D55A3]/30'
                        }`}>
                          
                          {/* 圓角自訂 Checkbox */}
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
                                // 如果管理員解鎖了，就不觸發 Modal，直接讓他們點擊修改
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
                              
                              {/* Info Icon */}
                              {!isAdminUnlocked && item.details && (
                                <div className={`mt-0.5 shrink-0 transition-colors ${item.is_completed ? 'text-[#E6EAF0]' : 'text-[#00B8B8] group-hover:text-[#F25D6B]'}`}>
                                  <Info className="w-4 h-4" />
                                </div>
                              )}
                            </div>

                            {/* 管理員解鎖時，Checklist 的備註 details 也可以直接行內修改 */}
                            {isAdminUnlocked && (
                              <div className="mt-1 text-xs text-slate-500 bg-slate-50 p-1.5 rounded-lg border border-dashed border-slate-200">
                                <span className="font-bold text-[10px] text-[#6D55A3] block mb-0.5">備註細節：</span>
                                {renderInlineEdit('checklist', item.id, 'details', item.details, "w-full text-xs text-slate-600 block", "textarea")}
                              </div>
                            )}
                            
                            {/* 完成時間戳記 */}
                            {item.is_completed && item.completed_at && (
                              <span className="text-[10px] text-[#00B8B8] font-bold block mt-1.5 tracking-wider">
                                DONE AT {item.completed_at}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
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

  // 全新品牌風格 - 服事動態（方案 B：依負責角色分組）
  const renderReviewView = () => {
    const allTasks = filteredNodes.flatMap(n => n.checklist || []);
    const completedTasks = allTasks.filter(t => t.is_completed);
    const completionRate = Math.round((completedTasks.length / (allTasks.length || 1)) * 100);
    const missedTasks = allTasks.filter(t => !t.is_completed);

    // 依負責角色（assignee）進行任務分組
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
          <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">活動復盤分析</h2>
          <p className="text-sm font-medium text-[#7B7B74] mt-1.5 flex items-center gap-1.5">
            <BarChart2 className="w-4 h-4 text-[#6D55A3]" /> 即時執行數據 ({currentService})
          </p>
        </div>
        
        <div className="p-6 mb-8 bg-gradient-to-br from-white to-[#F3EEFF]/50 border shadow-lg shadow-[#6D55A3]/5 rounded-[24px] border-[#E6EAF0]">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-black tracking-widest text-[#6D55A3] uppercase">總體完成率</h3>
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

        {/* 方案 B：分組待完成清單 */}
        <div className="mb-6">
          <h3 className="flex items-center gap-2 mb-4 text-sm font-black tracking-widest text-[#F25D6B] uppercase px-1">
            <AlertCircle className="w-4 h-4" /> 待完成服事清單（依角色分組）
          </h3>
          
          {Object.keys(groupedMissed).length === 0 ? (
            <div className="text-center text-[#7B7B74] py-8 bg-white/60 rounded-[24px] border border-[#E6EAF0] text-sm">
              🎉 恭喜！當前場次的所有任務均已圓滿完成！
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedMissed).map(([role, tasks]) => (
                <div key={role} className="bg-white p-5 rounded-[24px] border border-[#E6EAF0] shadow-sm">
                  {/* 分組標題 */}
                  <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#F3EEFF]">
                    <span className="font-extrabold text-[15px] text-[#6D55A3] flex items-center gap-1.5">
                      <User className="w-4 h-4 text-[#F25D6B]" /> {role}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-[#FFF2F4] text-[#F25D6B] rounded-full">
                      待辦 {tasks.length} 項
                    </span>
                  </div>
                  
                  {/* 任務卡片內列表 */}
                  <div className="space-y-2.5">
                    {tasks.map((task: any) => (
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
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 全新品牌風格 - 管理畫面 (擴充即時編輯更新、子任務拖曳排序與手動上下移位)
  const renderAdminView = () => (
    <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
      <div className="mb-6 px-1 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">管理服事任務</h2>
          <p className="text-sm font-medium text-[#7B7B74] mt-1.5">目前管理區塊：<span className="text-[#6D55A3] font-bold">{currentService}</span></p>
        </div>
        
        {/* 一鍵重新鎖定按鈕 */}
        <button
          onClick={() => {
            setIsAdminUnlocked(false);
            setActiveTab('timeline');
          }}
          className="px-3 py-1.5 bg-[#F25D6B]/10 hover:bg-[#F25D6B]/25 text-[#F25D6B] border border-[#F25D6B]/20 text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
        >
          <Lock className="w-3.5 h-3.5" />
          鎖定登出
        </button>
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
            <input type="text" required placeholder="例如：招待同工就位" value={newNode.title} onChange={e => setNewNode({...newNode, title: e.target.value})} className="w-full px-3 py-2.5 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[12px] text-sm font-medium text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 transition-shadow" />
          </div>
          <div className="flex gap-4">
            <div className="w-1/2">
              <label className="block text-xs font-bold text-[#7B7B74] mb-1.5">負責角色</label>
              <input type="text" placeholder="例如：大堂專招" value={newNode.assignee} onChange={e => setNewNode({...newNode, assignee: e.target.value})} className="w-full px-3 py-2.5 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[12px] text-sm font-medium text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 transition-shadow" />
            </div>
            <div className="w-1/2">
              <label className="block text-xs font-bold text-[#7B7B74] mb-1.5">服事地點</label>
              <input type="text" placeholder="例如：大會堂" value={newNode.location} onChange={e => setNewNode({...newNode, location: e.target.value})} className="w-full px-3 py-2.5 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[12px] text-sm font-medium text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 transition-shadow" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#7B7B74] mb-1.5">備註細節 (選填)</label>
            <textarea rows={2} value={newNode.details} onChange={e => setNewNode({...newNode, details: e.target.value})} className="w-full px-3 py-2.5 bg-[#F3EEFF]/50 border border-[#E6EAF0] rounded-[12px] text-sm font-medium text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 transition-shadow resize-none" />
          </div>
          <button disabled={isAdding} type="submit" className="w-full mt-4 py-3.5 bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white font-bold rounded-[14px] text-sm hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-[#F25D6B]/20">
            {isAdding ? '新增至雲端中...' : '確認建立任務'}
          </button>
        </div>
      </form>

      {/* 任務總覽區 (新增即時編輯、展開子清單拖曳排序) */}
      <div>
        <h3 className="text-[11px] font-black text-[#7B7B74] mb-3 tracking-widest uppercase px-1">任務總覽與編輯 ({currentService})</h3>
        <div className="space-y-4">
          {filteredNodes.length === 0 && <p className="text-sm font-medium text-[#7B7B74] text-center py-6 bg-white rounded-[20px] border border-[#E6EAF0]">尚無任務資料</p>}
          {filteredNodes.map(node => {
            const isEditing = editingNodeId === node.id;
            const isChecklistExpanded = expandedChecklistNodeId === node.id;
            return (
              <div key={node.id} className="p-4 bg-white border border-[#E6EAF0] rounded-[24px] shadow-sm transition-all duration-300">
                {isEditing ? (
                  /* 編輯模式表單 */
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
                  /* 唯讀與行內編輯模式展示 */
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
                        {/* 即時編輯按鈕 */}
                        <button 
                          onClick={() => startEditing(node)}
                          className="p-2 text-[#6D55A3]/60 hover:text-[#6D55A3] hover:bg-[#F3EEFF] rounded-[12px] transition-colors"
                          title="開啟詳細編輯"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteNode(node.id, node.title)}
                          className="p-2 text-[#F25D6B]/50 hover:text-[#F25D6B] hover:bg-[#FFF2F4] rounded-[12px] transition-colors"
                          title="刪除任務"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Accordion 折疊控制：Checklist 拖曳排序管理區 */}
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
                          {/* 新增 Checklist 項目的迷你表單 */}
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

                          {/* 拖曳與排序清單 */}
                          <div className="space-y-2">
                            {node.checklist && node.checklist.length > 0 ? (
                              node.checklist.map((item: any, idx: number) => (
                                <div 
                                  key={item.id}
                                  draggable={true}
                                  onDragStart={(e) => handleDragStart(e, item.id)}
                                  onDragOver={handleDragOver}
                                  onDrop={(e) => handleDrop(e, node.id, item.id)}
                                  className="flex items-center justify-between p-2 bg-[#FFF9F3]/60 hover:bg-[#FFF2F4]/60 border border-[#E6EAF0] rounded-xl transition-all shadow-sm"
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                                    {/* 拖曳握把 */}
                                    <div 
                                      className="cursor-grab text-slate-400 hover:text-[#6D55A3] shrink-0" 
                                      title="拖曳上下移動排序"
                                    >
                                      <GripVertical className="w-4 h-4" />
                                    </div>

                                    {/* 手動向上、向下移動按鈕（完美適應手機端） */}
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

                                    {/* 項目文字即時行內編輯 */}
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
                              ))
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

  return (
    <div className="flex justify-center w-full min-h-screen bg-[#F3EEFF] sm:p-6 md:p-10 font-sans">
      <div className="relative flex flex-col w-full max-w-[420px] bg-[#FFF9F3] sm:rounded-[40px] sm:border-[10px] border-[#6D55A3]/5 overflow-hidden shadow-2xl shadow-[#6D55A3]/20">
        
        {/* 全新品牌風格 - 頂部 Header */}
        <header className="sticky top-0 z-20 px-5 pt-8 pb-4 bg-gradient-to-br from-[#FFF9F3] via-[#F3EEFF] to-[#FFF2F4] border-b border-[#E6EAF0] rounded-b-[32px] shadow-sm mb-2">
          
          <div className="flex items-start justify-between relative">
            {/* 品牌星芒裝飾 */}
            <Sparkles className="absolute -top-4 -right-2 w-20 h-20 text-[#6D55A3] opacity-[0.03] rotate-12 pointer-events-none" />
            
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#1F2937] flex items-center gap-2.5">
                {/* 新版品牌 Logo */}
                <div className="w-9 h-9 rounded-[10px] bg-white flex items-center justify-center shadow-md shadow-[#6D55A3]/10">
                  <img 
                    src="/Logo.png" 
                    alt="Logo" 
                    className="w-7 h-7 object-contain" 
                  />
                </div>
                主日崇拜招待
              </h1>
              <p className="text-[13px] font-bold text-[#6D55A3] mt-2.5 flex items-center gap-1.5 opacity-90">
                <HeartHandshake className="w-4 h-4" />
                今天，我們一起歡迎人回家
              </p>
            </div>

            {/* 時間與雲端狀態 */}
            <div className="flex flex-col items-end pt-1">
              <span className="text-[10px] font-black tracking-widest text-[#7B7B74] uppercase mb-0.5 opacity-70">
                目前時間
              </span>
              <span className="text-2xl font-black font-mono text-[#1F2937] tracking-tighter">
                {currentTime || "載入中"}
              </span>
              <div className="flex items-center gap-1.5 mt-2 bg-white/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-[#00B8B8]/20 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00B8B8] animate-pulse"></span>
                <span className="text-[9px] font-black text-[#00B8B8] tracking-wider">已連線至雲端</span>
              </div>
            </div>
          </div>
          
          {/* 堂次切換膠囊按鈕 */}
          <div className="flex gap-2.5 mt-6 overflow-x-auto pb-2 scrollbar-hide px-1">
            {serviceOptions.map(srv => (
              <button
                key={srv}
                onClick={() => {
                  setCurrentService(srv);
                  hasManuallySwitchedRef.current = true;
                  setNewNode(prev => ({...prev, service_type: srv}));
                }}
                className={`whitespace-nowrap px-5 py-2.5 rounded-full text-[14px] font-bold transition-all duration-300 ${
                  currentService === srv 
                    ? 'bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white shadow-md shadow-[#F25D6B]/20 transform scale-105' 
                    : 'bg-white text-[#7B7B74] border border-[#E6EAF0] hover:bg-[#F3EEFF] hover:text-[#6D55A3]'
                }`}
              >
                {srv}
              </button>
            ))}
          </div>
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
        ) : activeTab === 'timeline' ? (
          renderTimelineView()
        ) : activeTab === 'review' ? (
          renderReviewView()
        ) : (
          renderAdminView()
        )}

        {/* 全新品牌風格 - 彈跳視窗 */}
        {detailModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-[#1F2937]/40 backdrop-blur-sm" onClick={() => setDetailModal({isOpen: false, title: '', details: ''})}>
            <div className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-[#E6EAF0]/50 transform transition-all" onClick={e => e.stopPropagation()}>
              
              <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-r from-[#FFF9F3] to-[#F3EEFF] border-b border-[#E6EAF0]">
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
              <p className="text-xs text-[#7B7B74] mb-4">請輸入任務管理驗證密碼</p>
              
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

        {/* 自訂品牌質感通知視窗 (取代原生 alert) */}
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

        {/* 自訂品牌質感確認視窗 (取代原生 confirm) */}
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

        {/* 底部功能導覽列 */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-3 bg-white/90 backdrop-blur-xl border-t border-[#E6EAF0] shadow-[0_-10px_40px_rgba(0,0,0,0.03)] pb-safe rounded-t-[32px] sm:rounded-t-[32px] sm:w-[420px] sm:mx-auto">
          <button 
            onClick={() => setActiveTab('timeline')}
            className={`flex flex-col items-center gap-1.5 transition-all duration-300 w-1/3 py-2 rounded-2xl ${activeTab === 'timeline' ? 'text-[#F25D6B] bg-[#FFF2F4]' : 'text-[#7B7B74] hover:bg-[#F3EEFF]'}`}
          >
            <ListTodo className="w-5 h-5" strokeWidth={activeTab === 'timeline' ? 2.5 : 2} />
            <span className="text-[10px] font-black tracking-widest">今日流程</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('review')}
            className={`flex flex-col items-center gap-1.5 transition-all duration-300 w-1/3 py-2 rounded-2xl ${activeTab === 'review' ? 'text-[#F25D6B] bg-[#FFF2F4]' : 'text-[#7B7B74] hover:bg-[#F3EEFF]'}`}
          >
            <BarChart2 className="w-5 h-5" strokeWidth={activeTab === 'review' ? 2.5 : 2} />
            <span className="text-[10px] font-black tracking-widest">服事動態</span>
          </button>

          <button 
            onClick={() => {
              if (isAdminUnlocked) {
                setActiveTab('admin');
              } else {
                setShowPasswordModal(true);
                setPasswordInput("");
                setPasswordError("");
              }
            }}
            className={`flex flex-col items-center gap-1.5 transition-all duration-300 w-1/3 py-2 rounded-2xl ${activeTab === 'admin' ? 'text-[#6D55A3] bg-[#F3EEFF]' : 'text-[#7B7B74] hover:bg-[#F3EEFF]'}`}
          >
            {isAdminUnlocked ? (
              <Unlock className="w-5 h-5" strokeWidth={activeTab === 'admin' ? 2.5 : 2} />
            ) : (
              <Settings className="w-5 h-5" strokeWidth={activeTab === 'admin' ? 2.5 : 2} />
            )}
            <span className="text-[10px] font-black tracking-widest">任務管理</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
