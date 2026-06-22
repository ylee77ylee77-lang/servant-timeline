"use client";

import React, { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';

const { 
  BarChart2, ListTodo, Settings, Trash2 
} = Icons as any;

const supabaseUrl = 'https://mhltzoirtzoiinuaauwy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obHR6b2lydHpvaWludWFhdXd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3Njk5NTcsImV4cCI6MjA5NzM0NTk1N30.eS_ZJlyDGuAMjBmAA8gxHcSgjxgzm9PdID8Zolvxdtc';

const supabaseFetch = async (endpoint: string) => {
  const res = await fetch(`${supabaseUrl}/rest/v1/${endpoint}`, {
    headers: { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` }
  });
  return await res.json();
};

export default function ServantTimelineApp() {
  const [nodes, setNodes] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('timeline');
  const [currentService, setCurrentService] = useState('主一堂');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      const nodesData = await supabaseFetch('timeline_nodes?order=time.asc');
      const checklistData = await supabaseFetch('checklist_items?order=id.asc');
      setNodes(nodesData.map((n: any) => ({
        ...n,
        checklist: checklistData.filter((c: any) => c.node_id === n.id)
      })));
    };
    fetchData();
  }, []);

  const filteredNodes = nodes.filter(n => n.service_type === currentService);

  return (
    <div className="flex justify-center w-full min-h-screen bg-[#F3EEFF] sm:p-10 font-sans">
      <div className="relative flex flex-col w-full max-w-[420px] bg-[#FFF9F3] sm:rounded-[40px] border-[#6D55A3]/5 overflow-hidden shadow-2xl shadow-[#6D55A3]/20">
        
        {/* 精緻的漸層 Header */}
        <header className="sticky top-0 z-20 px-5 pt-8 pb-4 bg-gradient-to-br from-[#FFF9F3] via-[#F3EEFF] to-[#FFF2F4] border-b border-[#E6EAF0] shadow-sm mb-2">
          <h1 className="text-2xl font-black text-[#1F2937] flex items-center gap-2.5">
            主日崇拜招待
          </h1>
          <div className="flex gap-2.5 mt-6 overflow-x-auto pb-2 scrollbar-hide">
            {['六晚崇', '主一堂', '主二堂'].map(srv => (
              <button key={srv} onClick={() => setCurrentService(srv)} className={`whitespace-nowrap px-5 py-2.5 rounded-full text-[14px] font-bold ${currentService === srv ? 'bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white shadow-lg' : 'bg-white text-[#7B7B74] border border-[#E6EAF0]'}`}>
                {srv}
              </button>
            ))}
          </div>
        </header>

        {/* 內容區塊 */}
        <div className="flex-1 overflow-y-auto pb-32 px-5 pt-6">
          {activeTab === 'timeline' && filteredNodes.map((node: any) => (
            <div key={node.id} className="mb-6 p-5 bg-white rounded-[24px] shadow-sm border border-[#E6EAF0]">
              <h3 className="font-bold text-[#1F2937]">{node.title}</h3>
              <p className="text-sm text-[#7B7B74] mt-1">{node.time} | {node.location}</p>
            </div>
          ))}
          {activeTab === 'admin' && (
             !isAdminUnlocked ? (
               <div className="p-6 bg-white rounded-[24px] border border-[#E6EAF0]">
                 <h2 className="font-bold mb-4">管理員解鎖</h2>
                 <input type="password" className="w-full p-3 border rounded-xl mb-3" onChange={e => setPasswordInput(e.target.value)} />
                 <button className="w-full p-3 bg-[#6D55A3] text-white rounded-xl font-bold" onClick={() => { if(passwordInput === '1234') setIsAdminUnlocked(true); }}>確認解鎖</button>
               </div>
            ) : <p className="text-center font-bold text-[#6D55A3]">已進入完整管理模式</p>
          )}
        </div>

        {/* 恢復您原先要求的底部固定導覽列 */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-4 bg-white/90 backdrop-blur-xl border-t border-[#E6EAF0] shadow-[0_-10px_40px_rgba(0,0,0,0.03)] sm:rounded-t-[32px] sm:w-[420px] sm:mx-auto">
          <button onClick={() => setActiveTab('timeline')} className="flex flex-col items-center gap-1"><ListTodo className={activeTab === 'timeline' ? 'text-[#F25D6B]' : ''} /><span className="text-[10px] font-black">今日流程</span></button>
          <button onClick={() => setActiveTab('review')} className="flex flex-col items-center gap-1"><BarChart2 className={activeTab === 'review' ? 'text-[#F25D6B]' : ''} /><span className="text-[10px] font-black">服事動態</span></button>
          <button onClick={() => setActiveTab('admin')} className="flex flex-col items-center gap-1"><Settings className={activeTab === 'admin' ? 'text-[#6D55A3]' : ''} /><span className="text-[10px] font-black">任務管理</span></button>
        </nav>
      </div>
    </div>
  );
}
