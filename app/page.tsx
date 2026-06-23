'use client';

import React, { Suspense, useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { 
  Layers, 
  Settings, 
  ShieldAlert, 
  Info, 
  Sparkles, 
  X, 
  RotateCcw, 
  Compass, 
  Activity,
  Trash2,
  MapPin,
  HeartHandshake
} from 'lucide-react';

// 自訂的線性插值函數，確保跨版本 WebGL 穩定度
const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

// --- 型別與資料結構定義 ---
type Mode = 'service' | 'safety' | 'all';
type ViewMode = 'hybrid' | 'exterior' | 'interior' | 'hall';
type FloorKey = '1F' | '2F' | '3F' | '4F' | '主會堂';

interface HotspotData {
  id: string;
  floor: FloorKey;
  position: [number, number, number];
  color: string;
  label: string;
  kind: 'service' | 'safety';
  desc: string;
}

// --- 夏凱納實測 Hotspots 完整資料庫 ---
const HOTSPOTS_DB: HotspotData[] = [
  // --- 1F 共享大廳及周邊 ---
  {
    id: '1f-wc',
    floor: '1F',
    position: [2, 0.8, -2],
    color: '#a855f7', // 青春紫
    label: '男女洗手間',
    kind: 'service',
    desc: '位於 1F 共享空間後側通道，備有寬敞的男、女洗手間區域。'
  },
  {
    id: '1f-recycle',
    floor: '1F',
    position: [3, 0.8, 1],
    color: '#fbbf24', // 淡金色
    label: '不鏽鋼分類回收',
    kind: 'service',
    desc: '設於 1F 大廳手扶梯與地下室樓梯旁，提供便捷的垃圾分類與資源回收點。'
  },
  {
    id: '1f-lobby-sofa',
    floor: '1F',
    position: [-1.5, 0.8, -2],
    color: '#fbbf24',
    label: '落地窗交誼沙發區',
    kind: 'service',
    desc: '在大片採光落地玻璃窗旁，配有舒適的橘、灰雙色長椅及茶几，供同工與新友接待休憩。'
  },
  {
    id: '1f-desk',
    floor: '1F',
    position: [-3.5, 0.8, 1.5],
    color: '#fbbf24',
    label: '島型前台保全台',
    kind: 'service',
    desc: '1F 大門進場最核心的島型立體保全服務台，設有圓角設計，配備訪客登記與社區諮詢。'
  },
  {
    id: '1f-aed',
    floor: '1F',
    position: [-2.5, 0.8, 3],
    color: '#dc2626', // 消防紅
    label: '1F 大廳 AED 裝置',
    kind: 'safety',
    desc: '【實測新發現】位於一樓大門旁、緊鄰落地窗玻璃處，配置直立式自動體外心臟電擊去顫器。'
  },
  {
    id: '1f-fire',
    floor: '1F',
    position: [4, 0.8, 0],
    color: '#dc2626',
    label: '1F 牆體消火栓',
    kind: 'safety',
    desc: '位於 1F 手扶梯下側白牆轉角，配置標準消火栓箱與高壓手提式滅火器。'
  },

  // --- 2F 主會堂低層及大堂 ---
  {
    id: '2f-wc',
    floor: '2F',
    position: [-3, 0.8, 3],
    color: '#a855f7',
    label: '女廁與無障礙廁所',
    kind: 'service',
    desc: '2F 公共走道大堂西側，備有女廁與無障礙洗手間，保障行動不便會友的使用需求。'
  },
  {
    id: '2f-box',
    floor: '2F',
    position: [0, 0.8, 4],
    color: '#fbbf24',
    label: '大會堂入口奉獻箱',
    kind: 'service',
    desc: '座落於 2F 主會堂雙開玻璃管制大門旁、木質弧形裝飾牆前，方便會友主日奉獻。'
  },
  {
    id: '2f-fire-wall',
    floor: '2F',
    position: [4, 0.8, -4],
    color: '#dc2626',
    label: '北 1 號梯間消防栓',
    kind: 'safety',
    desc: '2F 北側 1 號逃生梯出口旁，設有嵌牆式消防箱與高頻緊急警報喇叭。'
  },
  {
    id: '2f-aed',
    floor: '2F',
    position: [2, 0.8, 2],
    color: '#dc2626',
    label: '3 號電梯旁 AED 裝置',
    kind: 'safety',
    desc: '精確座落於 2F 大堂 3 號電梯旁的流線型木牆面上，配有發光外盒與語音警報引導。'
  },

  // --- 3F 主會堂中層看台及大堂 ---
  {
    id: '3f-wc-men',
    floor: '3F',
    position: [-3, 0.8, 3],
    color: '#a855f7',
    label: '3F 大堂男洗手間',
    kind: 'service',
    desc: '3F 大廳走道旁，本樓層僅配置男洗手間（無女廁），請同工與會友留意。'
  },
  {
    id: '3f-wooden-cabinet',
    floor: '3F',
    position: [0, 0.8, -4],
    color: '#fbbf24',
    label: '電梯對面招待新人櫃',
    kind: 'service',
    desc: '精確座落於 3F 客梯正對面之弧形木飾牆內，為招待同工存放新人迎賓禮、宣傳 DM 的核心資材櫃。'
  },
  {
    id: '3f-welcome-desk',
    floor: '3F',
    position: [3.5, 0.8, -2],
    color: '#fbbf24',
    label: '大落地窗招待集合桌',
    kind: 'service',
    desc: '座落於 3F 大落地窗面外側，配有長條形接待桌與三座蔚藍色招待物資置物櫃。'
  },
  {
    id: '3f-escape-lever',
    floor: '3F',
    position: [4, 0.8, 4],
    color: '#ffffff', // 純白避難光點
    label: '3F 落地窗避難緩降機',
    kind: 'safety',
    desc: '靠近大堂面外落地窗之特定開窗格邊緣，配備標準鋼製避難緩降器具與垂掛繩索。'
  },

  // --- 4F 行政區及最上層看台 ---
  {
    id: '4f-wc-women',
    floor: '4F',
    position: [-2, 0.5, 2],
    color: '#a855f7',
    label: '行政走廊女洗手間',
    kind: 'service',
    desc: '位於 4F 行政辦公走廊最深處通道內，專供行政同工與會友使用之女洗手間。'
  },
  {
    id: '4f-escape-lever',
    floor: '4F',
    position: [3, 0.5, -3],
    color: '#ffffff',
    label: '4F 高空避難緩降機',
    kind: 'safety',
    desc: '位於 4F 東側大面高空採光窗旁，裝設高空緊急逃生緩降固定鋼架與金屬器具。'
  }
];

// --- 鏡頭與 OrbitControls 控制器 ---
const CameraController = ({ 
  viewMode, 
  controlsRef 
}: { 
  viewMode: ViewMode; 
  controlsRef: React.RefObject<any>; 
}) => {
  useFrame((state) => {
    const cam = state.camera;
    const targetPos = new THREE.Vector3();
    const targetLook = new THREE.Vector3(0, 2, 0);

    switch (viewMode) {
      case 'exterior':
        targetPos.set(18, 14, 18);
        targetLook.set(0, 2, 0);
        break;
      case 'interior':
        targetPos.set(0, 15, 15);
        targetLook.set(0, 3, 0);
        break;
      case 'hall':
        targetPos.set(0, 4.5, -7.5);
        targetLook.set(0, 2.5, 4);
        break;
      case 'hybrid':
      default:
        targetPos.set(14, 9, 14);
        targetLook.set(0, 2, 0);
        break;
    }

    cam.position.lerp(targetPos, 0.05);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLook, 0.05);
      controlsRef.current.update();
    }
  });

  return null;
};

// --- 3D 樓層組件 ---
// 採用純淨的原生 3D Group 控制，不包含 Html Portal，徹底根絕 React Reconciler 崩潰
const FloorBlock = ({ 
  floorNum, 
  yOffset, 
  baseHeight, 
  children, 
  isExploded 
}: FloorBlockProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.y = lerp(groupRef.current.position.y, yOffset, 0.1);
    }
    if (matRef.current) {
      const targetOpacity = isExploded ? 0.25 : 0.8;
      matRef.current.opacity = lerp(matRef.current.opacity, targetOpacity, 0.1);
    }
  });

  return (
    <group ref={groupRef}>
      {/* 樓層主體外殼 (金輪白半透明質感) */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[10, baseHeight, 10]} />
        <meshStandardMaterial 
          ref={matRef}
          color="#f1f5f9" // 金輪白
          transparent={true}
          opacity={0.8}
          roughness={0.2}
          metalness={0.1}
          wireframe={isExploded}
        />
      </mesh>
      
      {/* 該樓層的 Hotspots 及 3D 結構模擬點 */}
      {children}
    </group>
  );
};

// --- 3D 裝飾細節元件 ---
const FloorInteriorDecoration = ({ floor }: { floor: FloorKey }) => {
  if (floor === '1F') {
    return (
      <group>
        {/* 島型前台 */}
        <mesh position={[-3.5, -0.4, 1.5]}>
          <boxGeometry args={[1.2, 0.6, 2.2]} />
          <meshStandardMaterial color="#64748b" roughness={0.8} />
        </mesh>
        {/* 沙發交誼桌 */}
        <mesh position={[-1.5, -0.5, -2]}>
          <cylinderGeometry args={[0.8, 0.8, 0.3, 16]} />
          <meshStandardMaterial color="#f97316" />
        </mesh>
        {/* 不鏽鋼垃圾桶 */}
        <mesh position={[3, -0.4, 1]}>
          <cylinderGeometry args={[0.2, 0.2, 0.7, 12]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} />
        </mesh>
      </group>
    );
  }

  if (floor === '2F') {
    return (
      <group position={[0, 0, 0]}>
        {/* 半圓弧大舞台 */}
        <mesh position={[0, -0.6, -3]}>
          <boxGeometry args={[8, 0.2, 3]} />
          <meshStandardMaterial color="#1e1b4b" roughness={0.5} />
        </mesh>
        {/* 舞台 LED 背景發光牆 */}
        <mesh position={[0, 0.4, -4.6]}>
          <boxGeometry args={[9, 2.0, 0.15]} />
          <meshStandardMaterial color="#1e293b" emissive="#1e1b4b" emissiveIntensity={0.5} />
        </mesh>
        {/* 發光金黃色十字架 */}
        <group position={[0, 0.7, -4.5]}>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.12, 1.6, 0.05]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[1.0, 0.12, 0.05]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
        </group>
        {/* 2F 主會堂珊瑚紅放射狀座席模擬 */}
        <group position={[0, -0.5, 1.5]}>
          <mesh position={[-2.2, 0, 0]}>
            <boxGeometry args={[1.8, 0.3, 2]} />
            <meshStandardMaterial color="#dc2626" roughness={0.9} />
          </mesh>
          <mesh position={[2.2, 0, 0]}>
            <boxGeometry args={[1.8, 0.3, 2]} />
            <meshStandardMaterial color="#dc2626" roughness={0.9} />
          </mesh>
        </group>
      </group>
    );
  }

  if (floor === '3F') {
    return (
      <group>
        {/* 3F 招待團隊新人木櫃 */}
        <mesh position={[0, -0.3, -4.5]}>
          <boxGeometry args={[2.0, 0.8, 0.5]} />
          <meshStandardMaterial color="#b45309" roughness={0.9} />
        </mesh>
        {/* 3F 後側音/光控中控台 */}
        <mesh position={[0, -0.3, 3]}>
          <boxGeometry args={[2.5, 0.6, 1.0]} />
          <meshStandardMaterial color="#334155" roughness={0.4} />
        </mesh>
      </group>
    );
  }

  if (floor === '4F') {
    return (
      <group>
        {/* 行政區白屏風 / 辦公桌模擬 */}
        <mesh position={[-3, -0.2, -2]}>
          <boxGeometry args={[2, 0.6, 1.5]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
        <mesh position={[-3, 0.4, -2.7]}>
          <boxGeometry args={[2, 0.6, 0.05]} />
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.6} />
        </mesh>
      </group>
    );
  }

  return null;
};

// --- Hotspot 點擊指示元件 ---
interface HotspotRenderProps extends HotspotProps {
  onClick: () => void;
}

const Hotspot3D = ({ position, color, visible, onClick }: HotspotRenderProps) => {
  // 純 3D 原生幾何結構，確保渲染樹極其穩定，不使用 Html Portal 元件
  return (
    <group position={position} visible={visible}>
      {/* 外部呼吸光暈 */}
      <mesh onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}>
        <sphereGeometry args={[0.34, 16, 16]} />
        <meshBasicMaterial 
          color={color} 
          transparent={true} 
          opacity={0.3} 
        />
      </mesh>
      {/* 核心亮點 */}
      <mesh>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={3} 
        />
      </mesh>
    </group>
  );
};

// --- 主裝載元件 ---
export default function App() {
  const [mounted, setMounted] = useState<boolean>(false);
  const [isExploded, setIsExploded] = useState<boolean>(false);
  const [explosionDistance, setExplosionDistance] = useState<number>(50);
  const [mode, setMode] = useState<Mode>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('hybrid');
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotData | null>(null);

  const controlsRef = useRef<any>(null);

  // 確保只在瀏覽器端渲染 Canvas，防止 Next.js SSR 導致 window / WebGL 報錯
  useEffect(() => {
    setMounted(true);
  }, []);

  // 1F ~ 4F 抽屜位移公式
  const baseSpacing = 4.2 * (explosionDistance / 50);
  const offset1F = 0;
  const offset2F = isExploded ? baseSpacing * 1 : 1.5;
  const offset3F = isExploded ? baseSpacing * 2 : 3.0;
  const offset4F = isExploded ? baseSpacing * 3 : 4.5;

  if (!mounted) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-950 font-sans text-white">
        <Activity className="h-10 w-10 animate-spin text-amber-500 mb-4" />
        <p className="text-sm text-slate-400 tracking-wider">夏凱納全息導覽系統加載中...</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-950 text-white font-sans">
      
      {/* --- 左側懸浮 HUD 面板 (Legend and Info) --- */}
      <div className="absolute top-6 left-6 z-50 flex max-w-sm flex-col gap-4 pointer-events-none">
        
        {/* 系統標題卡片 */}
        <div className="pointer-events-auto flex flex-col gap-1 rounded-3xl border border-slate-700/60 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <h1 className="text-2xl font-extrabold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">
              夏凱納全息導覽
            </h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed mt-1">
            大直堂 1F ~ 4F 實境 3D 疊層全息投影系統。
          </p>
        </div>

        {/* 四大視角切換器 */}
        <div className="pointer-events-auto rounded-3xl border border-slate-700/60 bg-slate-900/80 p-4 shadow-2xl backdrop-blur-md">
          <h3 className="text-xs font-semibold text-slate-400 tracking-wider mb-2.5 flex items-center gap-1.5 uppercase">
            <Compass className="h-3.5 w-3.5 text-amber-400" />
            場景視角控制
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['hybrid', '對角俯瞰 📐'],
              ['exterior', '環繞外牆 🏢'],
              ['interior', '大堂剖切 🔍'],
              ['hall', '舞台視角 🎭'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setViewMode(value as ViewMode)}
                className={`rounded-xl py-2 px-3 text-xs font-semibold transition-all duration-200 border ${
                  viewMode === value
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700/50 hover:bg-slate-700/60 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 2D HUD 指示與樓層層級對照表 (原本 3D 內的 1F~4F 標記已完美整合至此，避開 WebGL 崩潰) */}
        <div className="pointer-events-auto rounded-3xl border border-slate-700/60 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-md">
          <h3 className="text-xs font-semibold text-slate-400 tracking-wider mb-3 flex items-center gap-1.5 uppercase border-b border-slate-800 pb-2">
            <Layers className="h-3.5 w-3.5 text-purple-400" />
            全息圖層與標示對照
          </h3>
          <div className="flex flex-col gap-2.5 text-xs font-medium text-slate-300">
            <div className="flex items-center justify-between">
              <span className="text-amber-400 font-bold">4F 行政看台層</span>
              <span className="text-[10px] text-slate-400">Y 軸偏移: {offset4F.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-amber-400 font-bold">3F 主會堂看台層</span>
              <span className="text-[10px] text-slate-400">Y 軸偏移: {offset3F.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-amber-400 font-bold">2F 主會堂平面層</span>
              <span className="text-[10px] text-slate-400">Y 軸偏移: {offset2F.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-amber-400 font-bold">1F 共享大廳地基</span>
              <span className="text-[10px] text-slate-400">Y 軸偏移: 0.0 (錨定)</span>
            </div>
            <div className="h-px bg-slate-800 my-1" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#a855f7] shadow-[0_0_8px_#a855f7]"></span>
                <span>男女洗手洗手間</span>
              </div>
              <span className="text-[10px] text-slate-500">1F ~ 4F 跨層</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#fbbf24] shadow-[0_0_8px_#fbbf24]"></span>
                <span>奉獻箱 / 招待資材 / 交誼</span>
              </div>
              <span className="text-[10px] text-slate-500">營運節點</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#dc2626] shadow-[0_0_8px_#dc2626]"></span>
                <span>應急 AED / 消防栓</span>
              </div>
              <span className="text-[10px] text-slate-500 text-red-400/80">核心消防</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#ffffff] shadow-[0_0_8px_#ffffff]"></span>
                <span>避難緩降機</span>
              </div>
              <span className="text-[10px] text-slate-500">落地窗邊</span>
            </div>
          </div>
        </div>

        {/* 點選 Hotspot 細節說明視窗 */}
        {selectedHotspot && (
          <div className="pointer-events-auto relative flex flex-col gap-2 rounded-3xl border border-amber-500/40 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-md animate-fade-in">
            <button
              type="button"
              onClick={() => setSelectedHotspot(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
              aria-label="關閉細節"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                {selectedHotspot.floor}
              </span>
              <span className={`rounded-lg px-2 py-0.5 text-[9px] font-extrabold text-white ${
                selectedHotspot.kind === 'service' ? 'bg-purple-600' : 'bg-red-600'
              }`}>
                {selectedHotspot.kind === 'service' ? '營運' : '安全'}
              </span>
            </div>
            <h2 className="text-md font-bold text-white mt-1">{selectedHotspot.label}</h2>
            <p className="text-xs leading-relaxed text-slate-300">{selectedHotspot.desc}</p>
          </div>
        )}
      </div>

      {/* --- 3D WebGL Canvas 渲染引擎 --- */}
      <div className="absolute inset-0">
        <Canvas camera={{ position: [15, 10, 15], fov: 45 }}>
          <ambientLight intensity={0.55} />
          <directionalLight position={[10, 15, 5]} intensity={1.2} />
          <pointLight position={[-10, -10, -10]} intensity={0.5} />
          
          {/* 鏡頭動畫與軌道控制器 */}
          <CameraController viewMode={viewMode} controlsRef={controlsRef} />
          
          <OrbitControls 
            ref={controlsRef}
            enablePan={true} 
            enableZoom={true} 
            enableRotate={true}
            autoRotate={!isExploded && viewMode === 'hybrid'} 
            autoRotateSpeed={0.4}
            maxPolarAngle={Math.PI / 2 - 0.05} // 防止鏡頭穿透地板
          />

          {/* --- 1 樓 (共享空間) --- */}
          <FloorBlock floorNum={1} yOffset={offset1F} isExploded={isExploded} baseHeight={1.5}>
            <FloorInteriorDecoration floor="1F" />
            
            {/* 1F 男女廁 */}
            <Hotspot3D 
              position={[2, 0.8, -2]} 
              color="#a855f7" 
              visible={mode === 'all' || mode === 'service'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '1f-wc') || null)}
            />
            {/* 1F 分類不鏽鋼回收桶 */}
            <Hotspot3D 
              position={[3, 0.8, 1]} 
              color="#fbbf24" 
              visible={mode === 'all' || mode === 'service'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '1f-recycle') || null)}
            />
            {/* 1F 落地沙發交誼區 */}
            <Hotspot3D 
              position={[-1.5, 0.8, -2]} 
              color="#fbbf24" 
              visible={mode === 'all' || mode === 'service'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '1f-lobby-sofa') || null)}
            />
            {/* 1F 保全前台 */}
            <Hotspot3D 
              position={[-3.5, 0.8, 1.5]} 
              color="#fbbf24" 
              visible={mode === 'all' || mode === 'service'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '1f-desk') || null)}
            />
            {/* 1F AED 裝置 */}
            <Hotspot3D 
              position={[-2.5, 0.8, 3]} 
              color="#dc2626" 
              visible={mode === 'all' || mode === 'safety'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '1f-aed') || null)}
            />
            {/* 1F 消火栓 */}
            <Hotspot3D 
              position={[4, 0.8, 0]} 
              color="#dc2626" 
              visible={mode === 'all' || mode === 'safety'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '1f-fire') || null)}
            />
          </FloorBlock>

          {/* --- 2 樓 (大堂與主會堂低層觀眾席) --- */}
          <FloorBlock floorNum={2} yOffset={offset2F} isExploded={isExploded} baseHeight={1.5}>
            <FloorInteriorDecoration floor="2F" />

            {/* 2F 入口女廁 */}
            <Hotspot3D 
              position={[-3, 0.8, 3]} 
              color="#a855f7" 
              visible={mode === 'all' || mode === 'service'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '2f-wc') || null)}
            />
            {/* 2F 大門奉獻箱 */}
            <Hotspot3D 
              position={[0, 0.8, 4]} 
              color="#fbbf24" 
              visible={mode === 'all' || mode === 'service'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '2f-box') || null)}
            />
            {/* 2F 北1號梯間消防栓 */}
            <Hotspot3D 
              position={[4, 0.8, -4]} 
              color="#dc2626" 
              visible={mode === 'all' || mode === 'safety'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '2f-fire-wall') || null)}
            />
            {/* 2F 電梯旁 AED */}
            <Hotspot3D 
              position={[2, 0.8, 2]} 
              color="#dc2626" 
              visible={mode === 'all' || mode === 'safety'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '2f-aed') || null)}
            />
          </FloorBlock>

          {/* --- 3 樓 (大堂與主會堂中層看台) --- */}
          <FloorBlock floorNum={3} yOffset={offset3F} isExploded={isExploded} baseHeight={1.5}>
            <FloorInteriorDecoration floor="3F" />

            {/* 3F 男洗手間 */}
            <Hotspot3D 
              position={[-3, 0.8, 3]} 
              color="#a855f7" 
              visible={mode === 'all' || mode === 'service'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '3f-wc-men') || null)}
            />
            {/* 3F 招待新人櫃 */}
            <Hotspot3D 
              position={[0, 0.8, -4]} 
              color="#fbbf24" 
              visible={mode === 'all' || mode === 'service'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '3f-wooden-cabinet') || null)}
            />
            {/* 3F 招待集合長桌 */}
            <Hotspot3D 
              position={[3.5, 0.8, -2]} 
              color="#fbbf24" 
              visible={mode === 'all' || mode === 'service'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '3f-welcome-desk') || null)}
            />
            {/* 3F 落地窗避難緩降機 */}
            <Hotspot3D 
              position={[4, 0.8, 4]} 
              color="#ffffff" 
              visible={mode === 'all' || mode === 'safety'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '3f-escape-lever') || null)}
            />
          </FloorBlock>

          {/* --- 4 樓 (行政辦公區與頂層看台) --- */}
          <FloorBlock floorNum={4} yOffset={offset4F} isExploded={isExploded} baseHeight={1.0}>
            <FloorInteriorDecoration floor="4F" />

            {/* 4F 行政女廁 */}
            <Hotspot3D 
              position={[-2, 0.5, 2]} 
              color="#a855f7" 
              visible={mode === 'all' || mode === 'service'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '4f-wc-women') || null)}
            />
            {/* 4F 避難緩降機 */}
            <Hotspot3D 
              position={[3, 0.5, -3]} 
              color="#ffffff" 
              visible={mode === 'all' || mode === 'safety'} 
              onClick={() => setSelectedHotspot(HOTSPOTS_DB.find(h => h.id === '4f-escape-lever') || null)}
            />
          </FloorBlock>

          {/* 中心流光引導柱 (串聯垂直通道) */}
          <mesh position={[0, offset4F / 2, 0]} scale={[1, offset4F || 0.1, 1]} visible={isExploded}>
            <cylinderGeometry args={[0.15, 0.15, 1, 16]} />
            <meshBasicMaterial color="#fbbf24" transparent={true} opacity={0.3} />
          </mesh>
        </Canvas>
      </div>

      {/* --- 底部懸浮科技控制面板 (Bottom Interactive Dashboard) --- */}
      <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-6 rounded-full border border-slate-700/60 bg-slate-900/90 px-6 py-4 text-white shadow-2xl backdrop-blur-md transition-all duration-300">
        
        {/* 1. 爆炸拆解控制組 (合併/爆炸與手動微調距離) */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setIsExploded((prev) => {
                if (!prev) setExplosionDistance(50); // 開啟時給予預設 50%
                return !prev;
              });
            }}
            className={`rounded-full px-5 py-2.5 text-xs font-bold transition-all duration-200 ${
              isExploded 
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30' 
                : 'bg-slate-800 hover:bg-slate-700 border border-slate-600/60 hover:text-white'
            }`}
          >
            {isExploded ? '合併全息模型 🏢' : '垂直爆炸拆解 🥞'}
          </button>

          {isExploded && (
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider">層間距離</span>
              <input
                type="range"
                min="10"
                max="100"
                value={explosionDistance}
                onChange={(e) => setExplosionDistance(Number(e.target.value))}
                className="h-1 w-24 cursor-pointer appearance-none rounded-lg bg-slate-700 accent-amber-500 transition-all duration-150"
                aria-label="展開距離"
              />
              <span className="font-mono text-xs font-bold text-amber-400 w-8">{explosionDistance}%</span>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-slate-700/80" />

        {/* 2. 模式切換分類開關 (營運、安全、全部) */}
        <div className="flex rounded-full border border-slate-800 bg-slate-950 p-1 shrink-0">
          <button
            type="button"
            onClick={() => setMode('service')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 ${
              mode === 'service'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>⚙️</span> 營運服事
          </button>

          <button
            type="button"
            onClick={() => setMode('safety')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 ${
              mode === 'safety'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🚨</span> 應急安全
          </button>

          <button
            type="button"
            onClick={() => setMode('all')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 ${
              mode === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            顯示全部
          </button>
        </div>

        {/* 3. 系統重設按鈕 */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => {
              setIsExploded(false);
              setExplosionDistance(50);
              setMode('all');
              setViewMode('hybrid');
              setSelectedHotspot(null);
            }}
            className="rounded-full p-2.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-all border border-transparent hover:border-slate-700/60"
            title="重設全息投影"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
