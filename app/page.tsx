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
  HeartHandshake
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

export default function ServantTimelineApp() {
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

  const [isAdding, setIsAdding] = useState(false);
  const [newNode, setNewNode] = useState({
    service_type: '主一堂', 
    time: '08:00',
    title: '',
    assignee: '',
    location: '',
    details: ''
  });

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

  // 背景自動同步雲端資料 (維持原樣)
  const fetchData = async (isBackgroundSync = false) => {
    try {
      if (!isBackgroundSync) setFetchError("");
      const nodesData = await supabaseFetch('timeline_nodes?order=time.asc');
      const checklistData = await supabaseFetch('checklist_items?order=id.asc');

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
    if (!newNode.title || !newNode.time) return alert("請至少填寫時間與標題");
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
      alert("新增成功！");
    } catch (error: any) {
      alert("新增失敗：" + error.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteNode = async (id: string, title: string) => {
    const confirmDelete = window.confirm(`確定要刪除「${title}」這個任務嗎？\n此動作將會一併刪除底下的所有 Checklist！`);
    if (!confirmDelete) return;
    try {
      await supabaseFetch(`timeline_nodes?id=eq.${id}`, 'DELETE');
      await fetchData(true);
    } catch (error: any) {
      alert("刪除失敗：" + error.message);
    }
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
          {/* 溫暖紫灰色的主時間軸 */}
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
                    <div>
                      <h3 className={`text-lg font-bold tracking-tight mb-1.5 ${completed ? 'text-[#7B7B74] line-through decoration-[#E6EAF0]' : 'text-[#1F2937]'}`}>
                        {node.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-[#7B7B74]">
                        <span className="flex items-center gap-1 bg-[#F3EEFF] text-[#6D55A3] px-2 py-0.5 rounded-md">
                          <Clock className="w-3 h-3" />{node.time}
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
                      <span className="font-medium text-[#1F2937]">{node.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-[#6D55A3]/70 shrink-0" />
                      <span>{node.assignee}</span>
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
                                if (item.details) {
                                  setDetailModal({ isOpen: true, title: item.text, details: item.details });
                                }
                              }}
                            >
                              <span className={`text-[14px] font-semibold leading-relaxed transition-all ${
                                item.is_completed ? 'text-[#7B7B74] line-through opacity-70' : 'text-[#1F2937]'
                              } ${item.details ? 'group-hover:text-[#F25D6B]' : ''}`}>
                                {item.text}
                              </span>
                              
                              {/* Info Icon */}
                              {item.details && (
                                <div className={`mt-0.5 shrink-0 transition-colors ${item.is_completed ? 'text-[#E6EAF0]' : 'text-[#00B8B8] group-hover:text-[#F25D6B]'}`}>
                                  <Info className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                            
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

  // 全新品牌風格 - 復盤畫面
  const renderReviewView = () => {
    const allTasks = filteredNodes.flatMap(n => n.checklist || []);
    const completedTasks = allTasks.filter(t => t.is_completed);
    const completionRate = Math.round((completedTasks.length / (allTasks.length || 1)) * 100);
    const missedTasks = allTasks.filter(t => !t.is_completed);

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

        {missedTasks.length > 0 && (
          <div className="mb-6">
            <h3 className="flex items-center gap-2 mb-4 text-sm font-bold tracking-widest text-[#F25D6B] uppercase px-1">
              <AlertCircle className="w-4 h-4" /> 待完成項目
            </h3>
            <div className="space-y-3">
              {missedTasks.map((task: any) => {
                const parentNode = filteredNodes.find(n => n.checklist.some((c: any) => c.id === task.id));
                return (
                  <div key={task.id} className="flex flex-col p-4 bg-[#FFF2F4] border border-[#F25D6B]/20 shadow-sm rounded-[20px]">
                    <span className="text-[14px] font-bold text-[#1F2937] leading-relaxed">{task.text}</span>
                    <span className="text-xs font-medium text-[#F25D6B]/70 mt-2 flex items-center gap-1.5">
                       <Clock className="w-3 h-3" /> {parentNode?.time} - {parentNode?.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // 全新品牌風格 - 管理畫面
  const renderAdminView = () => (
    <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
      <div className="mb-6 px-1">
        <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">管理服事任務</h2>
        <p className="text-sm font-medium text-[#7B7B74] mt-1.5">目前管理區塊：<span className="text-[#6D55A3] font-bold">{currentService}</span></p>
      </div>

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

      <div>
        <h3 className="text-[11px] font-black text-[#7B7B74] mb-3 tracking-widest uppercase px-1">任務總覽 ({currentService})</h3>
        <div className="space-y-3">
          {filteredNodes.length === 0 && <p className="text-sm font-medium text-[#7B7B74] text-center py-6 bg-white rounded-[20px] border border-[#E6EAF0]">尚無任務資料</p>}
          {filteredNodes.map(node => (
            <div key={node.id} className="flex items-center justify-between p-4 bg-white border border-[#E6EAF0] rounded-[20px] shadow-sm">
              <div>
                <div className="text-[14px] font-bold text-[#1F2937] mb-1 flex items-center gap-2">
                   <span className="text-[#6D55A3] font-mono">{node.time}</span> {node.title}
                </div>
                <div className="text-xs font-medium text-[#7B7B74] flex items-center gap-1.5">
                  <User className="w-3 h-3" /> {node.assignee} 
                  <span className="text-[#E6EAF0]">|</span> 
                  <MapPin className="w-3 h-3" /> {node.location}
                </div>
              </div>
              <button 
                onClick={() => handleDeleteNode(node.id, node.title)}
                className="p-2.5 text-[#F25D6B]/50 hover:text-[#F25D6B] hover:bg-[#FFF2F4] rounded-[12px] transition-colors"
                title="刪除任務"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
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
                {/* 品牌幾何 Logo 意象 */}
                <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-[#F25D6B] to-[#6D55A3] flex items-center justify-center shadow-md shadow-[#F25D6B]/20 rotate-3">
                  <Sparkles className="w-5 h-5 text-white -rotate-3" />
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

        {/* 底部功能導覽列 */}
        <nav className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-around px-2 py-3 bg-white/90 backdrop-blur-xl border-t border-[#E6EAF0] shadow-[0_-10px_40px_rgba(0,0,0,0.03)] pb-safe rounded-b-[40px] sm:rounded-b-[32px]">
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
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center gap-1.5 transition-all duration-300 w-1/3 py-2 rounded-2xl ${activeTab === 'admin' ? 'text-[#6D55A3] bg-[#F3EEFF]' : 'text-[#7B7B74] hover:bg-[#F3EEFF]'}`}
          >
            <Settings className="w-5 h-5" strokeWidth={activeTab === 'admin' ? 2.5 : 2} />
            <span className="text-[10px] font-black tracking-widest">任務管理</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
