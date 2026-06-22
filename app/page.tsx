"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  MapPin, 
  User, 
  BarChart2, 
  ListTodo,
  AlertCircle,
  Settings, 
  Plus,     
  Trash2,
  X,        /* 新增 X 圖示用來關閉視窗 */
  Info      /* 新增 Info 圖示用來提示有詳細內容 */
} from 'lucide-react';

// 1. 您的專屬雲端鑰匙 (維持原樣)
const supabaseUrl = 'https://mhltzoirtzoiinuaauwy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obHR6b2lydHpvaWludWFhdXd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3Njk5NTcsImV4cCI6MjA5NzM0NTk1N30.eS_ZJlyDGuAMjBmAA8gxHcSgjxgzm9PdID8Zolvxdtc';

const hasValidKeys = supabaseUrl.startsWith('http') && supabaseAnonKey.startsWith('eyJ');

// 使用原生 fetch 方法連線雲端
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

  // --- 新增：詳細內容彈跳視窗的狀態 ---
  const [detailModal, setDetailModal] = useState<{isOpen: boolean, title: string, details: string}>({isOpen: false, title: '', details: ''});

  // --- 當前選擇的場次狀態 ---
  const [currentService, setCurrentService] = useState('主一堂'); 
  const serviceOptions = ['六晚崇', '主一堂', '主二堂'];
  
  // --- 新增：智慧判斷是否手動切換過 ---
  const hasManuallySwitchedRef = useRef(false);

  // --- 管理員表單的狀態 ---
  const [isAdding, setIsAdding] = useState(false);
  const [newNode, setNewNode] = useState({
    service_type: '主一堂', 
    time: '08:00',
    title: '',
    assignee: '',
    location: '',
    details: ''
  });

  // 確保時鐘即時更新，並加入自動切換邏輯
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);

      // 如果使用者還沒有「手動」按過上面的切換按鈕，我們就幫他自動判斷
      if (!hasManuallySwitchedRef.current) {
        const day = now.getDay(); // 0 是週日，6 是週六
        const timeValue = now.getHours() + now.getMinutes() / 60; // 將時間轉為小數方便判斷 (例如 10:30 = 10.5)

        if (day === 6) {
          setCurrentService('六晚崇');
        } else if (day === 0) {
          if (timeValue < 10.5) { // 早上 10:30 之前
            setCurrentService('主一堂');
          } else { // 早上 10:30 之後
            setCurrentService('主二堂');
          }
        }
      }
    };
    
    updateTime(); // 載入時先執行一次
    const timer = setInterval(updateTime, 60000); // 每分鐘檢查一次
    return () => clearInterval(timer);
  }, []);

  // 從 Supabase 雲端抓取真實資料
  const fetchData = async () => {
    try {
      setFetchError("");
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
      setFetchError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (hasValidKeys) fetchData();
    else setIsLoading(false);
  }, []);

  // 只挑選當前場次的節點
  const filteredNodes = nodes.filter(n => n.service_type === currentService);

  // 決定節點狀態與自動定位
  const isNodeCompleted = (node: any) => node.checklist && node.checklist.length > 0 && node.checklist.every((c: any) => c.is_completed);
  const activeNodeId = filteredNodes.find(n => !isNodeCompleted(n))?.id;

  useEffect(() => {
    if (!isLoading && !fetchError && filteredNodes.length > 0 && activeTab === 'timeline' && activeNodeRef.current) {
      setTimeout(() => {
        activeNodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [activeTab, isLoading, fetchError, filteredNodes.length, currentService]);

  // 處理 Checklist 勾選
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
    } catch (error) {
      console.error("更新資料庫失敗:", error);
      fetchData(); 
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
      await fetchData();
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
      await fetchData();
    } catch (error: any) {
      alert("刪除失敗：" + error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-white flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-bold tracking-wider animate-pulse">正在連線至 Supabase 雲端資料庫...</p>
        </div>
      </div>
    );
  }

  if (!hasValidKeys) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 p-6">
        <div className="bg-white p-8 rounded-2xl max-w-md w-full shadow-2xl">
          <h2 className="text-xl font-bold text-red-600 mb-4 flex items-center gap-2">
            <AlertCircle /> 系統警告：雲端鑰匙錯誤
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed">請確認程式碼中的網址與鑰匙設定正確。</p>
        </div>
      </div>
    );
  }

  const renderTimelineView = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-6 pt-6 bg-slate-50">
      {filteredNodes.length === 0 ? (
        <div className="text-center text-slate-500 mt-10 text-sm">
          此場次目前沒有任務，請至「管理任務」新增。
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[15px] top-4 bottom-4 w-px bg-slate-200" />
          {filteredNodes.map((node) => {
            const completed = isNodeCompleted(node);
            const active = node.id === activeNodeId;
            return (
              <div key={node.id} className="relative mb-8 transition-all duration-500" ref={active ? activeNodeRef : null}>
                <div className="absolute left-0 top-1.5 flex items-center justify-center w-8 h-8 bg-slate-50 z-10">
                  {completed ? (
                    <CheckCircle2 className="w-6 h-6 text-slate-300 bg-white rounded-full" />
                  ) : active ? (
                    <div className="relative flex items-center justify-center w-6 h-6">
                      <span className="absolute inline-flex w-full h-full rounded-full opacity-75 bg-blue-400 animate-ping" />
                      <span className="relative inline-flex w-4 h-4 rounded-full bg-blue-600" />
                    </div>
                  ) : (
                    <Circle className="w-5 h-5 text-slate-300 fill-white" />
                  )}
                </div>
                <div className={`ml-10 rounded-2xl p-5 border transition-all duration-300 ${completed ? 'bg-transparent border-slate-200/60 opacity-60' : active ? 'bg-white border-blue-500 shadow-lg ring-4 ring-blue-50/50' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className={`text-lg font-semibold tracking-tight ${completed ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}>{node.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs font-medium text-slate-500">
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{node.time}</span>
                        {active && <span className="px-2 py-0.5 text-blue-700 bg-blue-50 rounded-full font-semibold">進行中</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 mt-4 text-sm text-slate-600">
                    <div className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" /><span>{node.location}</span></div>
                    <div className="flex items-start gap-2"><User className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" /><span>{node.assignee}</span></div>
                    {/* 我們把原本佔版面的 inline details 移除了，改用彈跳視窗 */}
                  </div>
                  
                  {node.checklist && node.checklist.length > 0 && (
                    <div className="mt-5 space-y-2.5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Checklist</div>
                      </div>
                      {node.checklist.map((item: any) => (
                        <div key={item.id} className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${item.is_completed ? 'bg-slate-50/80' : 'bg-white border border-slate-100 shadow-sm'}`}>
                          {/* 左側：純粹用來打勾的區域 */}
                          <label className="relative flex items-center justify-center shrink-0 mt-0.5 cursor-pointer">
                            <input type="checkbox" className="w-5 h-5 transition-colors border-2 rounded-md appearance-none cursor-pointer border-slate-300 checked:bg-blue-600 checked:border-blue-600 focus:ring-blue-500 focus:outline-none" checked={item.is_completed} onChange={() => toggleChecklist(node.id, item.id)}/>
                            {item.is_completed && <CheckCircle2 className="absolute w-4 h-4 text-white pointer-events-none" />}
                          </label>
                          
                          {/* 右側：點擊會跳出詳細視窗的文字區域 */}
                          <div className="flex-1">
                            <div 
                              className={`flex items-start gap-1.5 ${item.details ? 'cursor-pointer group' : ''}`}
                              onClick={() => {
                                if (item.details) {
                                  setDetailModal({ isOpen: true, title: item.text, details: item.details });
                                }
                              }}
                            >
                              <span className={`text-sm font-medium transition-all ${item.is_completed ? 'text-slate-400 line-through' : 'text-slate-700'} ${item.details ? 'group-hover:text-blue-600' : ''}`}>
                                {item.text}
                              </span>
                              {/* 如果該任務有詳細內容，就顯示一個藍色的 ⓘ 提示圖示 */}
                              {item.details && (
                                <Info className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${item.is_completed ? 'text-slate-300' : 'text-blue-400 group-hover:text-blue-600'}`} />
                              )}
                            </div>
                            {item.is_completed && item.completed_at && <span className="text-[11px] text-slate-400 font-medium block mt-1">{item.completed_at}</span>}
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

  // 2. 原有的復盤畫面 (改用 filteredNodes 統計當前場次)
  const renderReviewView = () => {
    const allTasks = filteredNodes.flatMap(n => n.checklist || []);
    const completedTasks = allTasks.filter(t => t.is_completed);
    const completionRate = Math.round((completedTasks.length / (allTasks.length || 1)) * 100);
    const missedTasks = allTasks.filter(t => !t.is_completed);

    return (
      <div className="flex-1 overflow-y-auto pb-24 px-6 pt-6 bg-slate-50">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">活動復盤分析</h2>
          <p className="text-sm text-slate-500 mt-1">即時執行數據與檢討 ({currentService})</p>
        </div>
        <div className="p-5 mb-6 bg-white border shadow-sm rounded-2xl border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold tracking-wider text-slate-500">總體完成率</h3>
            <span className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 rounded-full">雲端資料即時統計</span>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-extrabold tracking-tighter text-slate-900">{allTasks.length === 0 ? 0 : completionRate}%</span>
            <span className="mb-1 text-sm font-medium text-slate-500">({completedTasks.length}/{allTasks.length} 任務)</span>
          </div>
          <div className="w-full h-2.5 mt-4 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full transition-all duration-1000 ease-out bg-blue-600 rounded-full" style={{ width: `${allTasks.length === 0 ? 0 : completionRate}%` }} />
          </div>
        </div>
        {missedTasks.length > 0 && (
          <div className="mb-6">
            <h3 className="flex items-center gap-2 mb-3 text-sm font-bold tracking-wider text-rose-500"><AlertCircle className="w-4 h-4" />未完成 / 漏掉項目</h3>
            <div className="space-y-2">
              {missedTasks.map((task: any) => {
                const parentNode = filteredNodes.find(n => n.checklist.some((c: any) => c.id === task.id));
                return (
                  <div key={task.id} className="flex flex-col p-3 bg-white border border-rose-100 shadow-sm rounded-xl">
                    <span className="text-sm font-semibold text-slate-800">{task.text}</span>
                    <span className="text-xs text-slate-500 mt-1">所屬節點：{parentNode?.time} {parentNode?.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAdminView = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-6 pt-6 bg-slate-50">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">管理服事任務</h2>
        <p className="text-sm text-slate-500 mt-1">目前正在管理：{currentService}</p>
      </div>

      <form onSubmit={handleAddNode} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-8">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-600" /> 新增任務節點
        </h3>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-1/3">
              <label className="block text-xs font-semibold text-slate-500 mb-1">所屬場次</label>
              <select 
                value={newNode.service_type} 
                onChange={e => setNewNode({...newNode, service_type: e.target.value})}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              >
                {serviceOptions.map(srv => <option key={srv} value={srv}>{srv}</option>)}
              </select>
            </div>
            <div className="w-2/3">
              <label className="block text-xs font-semibold text-slate-500 mb-1">時間</label>
              <input type="time" required value={newNode.time} onChange={e => setNewNode({...newNode, time: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">標題</label>
            <input type="text" required placeholder="例如：敬拜團彩排" value={newNode.title} onChange={e => setNewNode({...newNode, title: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex gap-3">
            <div className="w-1/2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">負責人</label>
              <input type="text" placeholder="例如：李大華" value={newNode.assignee} onChange={e => setNewNode({...newNode, assignee: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div className="w-1/2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">地點</label>
              <input type="text" placeholder="例如：大會堂" value={newNode.location} onChange={e => setNewNode({...newNode, location: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">備註細節 (選填)</label>
            <textarea rows={2} value={newNode.details} onChange={e => setNewNode({...newNode, details: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none" />
          </div>
          <button disabled={isAdding} type="submit" className="w-full mt-2 py-2.5 bg-blue-600 text-white font-bold rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {isAdding ? '新增中...' : '確認新增到雲端'}
          </button>
        </div>
      </form>

      <div>
        <h3 className="text-sm font-bold text-slate-500 mb-3 tracking-wider uppercase">目前的任務列表 ({currentService})</h3>
        <div className="space-y-3">
          {filteredNodes.length === 0 && <p className="text-sm text-slate-400">目前沒有資料。</p>}
          {filteredNodes.map(node => (
            <div key={node.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div>
                <div className="text-sm font-bold text-slate-800">{node.time} - {node.title}</div>
                <div className="text-xs text-slate-500">{node.assignee} · {node.location}</div>
              </div>
              <button 
                onClick={() => handleDeleteNode(node.id, node.title)}
                className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
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
    <div className="flex justify-center w-full min-h-screen bg-slate-900 sm:p-4 md:p-8">
      <div className="relative flex flex-col w-full max-w-md bg-white sm:rounded-[2.5rem] sm:border-[8px] border-slate-800 overflow-hidden shadow-2xl">
        <header className="sticky top-0 z-20 px-6 py-4 bg-white/90 backdrop-blur-xl border-b border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                主日崇拜招待
              </h1>
              <p className="text-xs font-medium text-slate-500 mt-0.5 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                已連線至雲端
              </p>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs font-semibold tracking-wider text-blue-600 uppercase">
                當前時間
              </span>
              <span className="text-xl font-bold font-mono text-slate-800 tracking-tighter">
                {currentTime || "載入中"}
              </span>
            </div>
          </div>
          
          {/* --- 場次切換列 (包含三顆按鈕) --- */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
            {serviceOptions.map(srv => (
              <button
                key={srv}
                onClick={() => {
                  setCurrentService(srv);
                  // 標記為手動切換，系統就會停止自動幫您跳轉場次
                  hasManuallySwitchedRef.current = true;
                  setNewNode(prev => ({...prev, service_type: srv}));
                }}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  currentService === srv 
                    ? 'bg-slate-800 text-white shadow-md' 
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {srv}
              </button>
            ))}
          </div>
        </header>

        {fetchError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 text-center overflow-y-auto pb-24">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
            <h3 className="text-lg font-bold text-slate-800 mb-2">無法讀取雲端資料</h3>
            <p className="text-sm text-slate-600 bg-white p-4 rounded-xl border shadow-sm break-all">{fetchError}</p>
            <button onClick={() => { setIsLoading(true); fetchData(); }} className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700">重新整理</button>
          </div>
        ) : activeTab === 'timeline' ? (
          renderTimelineView()
        ) : activeTab === 'review' ? (
          renderReviewView()
        ) : (
          renderAdminView()
        )}

        {/* --- 新增：詳細內容彈出視窗 (Modal) --- */}
        {detailModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDetailModal({isOpen: false, title: '', details: ''})}>
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
              
              {/* 彈跳視窗的標題列 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  {detailModal.title}
                </h3>
                <button onClick={() => setDetailModal({isOpen: false, title: '', details: ''})} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 彈跳視窗的詳細內容區塊 */}
              <div className="p-5 overflow-y-auto">
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {detailModal.details}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 導覽列 */}
        <nav className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-around px-2 py-4 bg-white border-t pb-safe border-slate-200">
          <button 
            onClick={() => setActiveTab('timeline')}
            className={`flex flex-col items-center gap-1.5 transition-colors w-1/3 ${activeTab === 'timeline' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <ListTodo className="w-5 h-5" strokeWidth={activeTab === 'timeline' ? 2.5 : 2} />
            <span className="text-[10px] font-bold tracking-wider">我的服事</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('review')}
            className={`flex flex-col items-center gap-1.5 transition-colors w-1/3 border-l border-r border-slate-100 ${activeTab === 'review' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <BarChart2 className="w-5 h-5" strokeWidth={activeTab === 'review' ? 2.5 : 2} />
            <span className="text-[10px] font-bold tracking-wider">復盤數據</span>
          </button>

          <button 
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center gap-1.5 transition-colors w-1/3 ${activeTab === 'admin' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Settings className="w-5 h-5" strokeWidth={activeTab === 'admin' ? 2.5 : 2} />
            <span className="text-[10px] font-bold tracking-wider">管理任務</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
