"use client";

import React, { useState, useEffect, useRef } from 'react';
import * as Icons from 'lucide-react';

// 強制類型轉換以適應環境，並維持所有圖示功能
const { 
  Check, Clock, MapPin, User, BarChart2, ListTodo, AlertCircle, Settings, Plus, 
  Trash2, X, Info, Sparkles, HeartHandshake, Lock, Edit2, Save 
} = Icons as any;

const supabaseUrl = 'https://mhltzoirtzoiinuaauwy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obHR6b2lydHpvaWludWFhdXd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3Njk5NTcsImV4cCI6MjA5NzM0NTk1N30.eS_ZJlyDGuAMjBmAA8gxHcSgjxgzm9PdID8Zolvxdtc';

const hasValidKeys = supabaseUrl.startsWith('http') && supabaseAnonKey.startsWith('eyJ');

const supabaseFetch = async (endpoint: string, method = 'GET', body: any = null) => {
  const headers: any = {
    'apikey': supabaseAnonKey,
    'Authorization': `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${supabaseUrl}/rest/v1/${endpoint}`, options);
  if (!res.ok) throw new Error(res.statusText);
  if (method === 'DELETE') return true;
  return await res.json();
};

export default function ServantTimelineApp() {
  const [nodes, setNodes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('timeline');
  const [currentTime, setCurrentTime] = useState("");
  const [detailModal, setDetailModal] = useState<any>({isOpen: false, title: '', details: ''});
  const [currentService, setCurrentService] = useState('主一堂'); 
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = async () => {
    try {
      const nodesData = await supabaseFetch('timeline_nodes?order=time.asc');
      const checklistData = await supabaseFetch('checklist_items?order=id.asc');
      const formattedNodes = nodesData.map((node: any) => ({
        ...node,
        checklist: checklistData.filter((c: any) => c.node_id === node.id)
      }));
      setNodes(formattedNodes);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredNodes = nodes.filter(n => n.service_type === currentService);

  return (
    <div className="flex justify-center w-full min-h-screen bg-[#F3EEFF] font-sans">
      <div className="relative flex flex-col w-full max-w-[420px] bg-[#FFF9F3] overflow-hidden shadow-2xl">
        
        {/* 頂部 Header */}
        <header className="sticky top-0 z-20 px-5 pt-8 pb-4 bg-white shadow-sm border-b border-[#E6EAF0]">
          <h1 className="text-2xl font-black text-[#1F2937] flex items-center gap-2">
            主日崇拜招待
          </h1>
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
            {['六晚崇', '主一堂', '主二堂'].map(srv => (
              <button key={srv} onClick={() => setCurrentService(srv)} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap ${currentService === srv ? 'bg-[#6D55A3] text-white' : 'bg-gray-100 text-[#7B7B74]'}`}>
                {srv}
              </button>
            ))}
          </div>
        </header>

        {/* 主要內容區塊 */}
        <div className="flex-1 p-5 overflow-y-auto pb-32">
          {activeTab === 'timeline' && filteredNodes.map((node: any) => (
            <div key={node.id} className="p-4 mb-4 bg-white rounded-2xl shadow-sm border border-[#E6EAF0]">
              <h3 className="font-bold text-[#1F2937]">{node.title}</h3>
              <p className="text-xs text-[#7B7B74] mt-1">{node.time} | {node.location}</p>
              {node.checklist?.map((item: any) => (
                <div key={item.id} className="text-sm mt-2 flex items-center gap-2">
                  <div className={`w-4 h-4 rounded border ${item.is_completed ? 'bg-[#00B8B8] border-[#00B8B8]' : 'border-gray-300'}`} />
                  <span className={item.is_completed ? 'line-through text-gray-400' : ''}>{item.text}</span>
                </div>
              ))}
            </div>
          ))}

          {activeTab === 'review' && (
             <div className="text-center py-10">
               <BarChart2 className="w-12 h-12 mx-auto text-[#6D55A3] mb-4" />
               <p className="font-bold">服事動態分析</p>
             </div>
          )}

          {activeTab === 'admin' && (
             !isAdminUnlocked ? (
               <div className="p-6 bg-white rounded-2xl border">
                 <h2 className="font-bold mb-4">管理員解鎖</h2>
                 <input type="password" placeholder="輸入密碼" className="w-full p-3 border rounded-lg mb-2" onChange={e => setPasswordInput(e.target.value)} />
                 <button className="w-full p-3 bg-[#6D55A3] text-white rounded-lg font-bold" onClick={() => { if(passwordInput === '1234') setIsAdminUnlocked(true); }}>確認解鎖</button>
               </div>
            ) : (
              <div className="space-y-4">
                <p className="font-bold text-center text-[#6D55A3]">已進入完整管理模式</p>
                {filteredNodes.map((node: any) => (
                  <div key={node.id} className="p-4 bg-white border rounded-2xl flex justify-between items-center">
                    <span>{node.title}</span>
                    <Trash2 className="text-red-500 cursor-pointer" />
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* 底部導覽列 */}
        <nav className="fixed bottom-0 w-full max-w-[420px] bg-white border-t flex justify-around p-4 z-50">
          <button className="flex flex-col items-center gap-1" onClick={() => setActiveTab('timeline')}><ListTodo className={activeTab === 'timeline' ? 'text-[#F25D6B]' : ''} /><span className="text-[10px]">流程</span></button>
          <button className="flex flex-col items-center gap-1" onClick={() => setActiveTab('review')}><BarChart2 className={activeTab === 'review' ? 'text-[#F25D6B]' : ''} /><span className="text-[10px]">動態</span></button>
          <button className="flex flex-col items-center gap-1" onClick={() => setActiveTab('admin')}><Settings className={activeTab === 'admin' ? 'text-[#6D55A3]' : ''} /><span className="text-[10px]">管理</span></button>
        </nav>
      </div>
    </div>
  );
}
