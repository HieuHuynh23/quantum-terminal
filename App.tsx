
import React, { useState, useEffect, useRef } from 'react';
import { 
  Calculator, Settings, Activity, Target, ArrowLeftRight, 
  TrendingUp, Wallet, Download, ShieldAlert, 
  MousePointerClick, RefreshCw, BarChart3, AlertTriangle, 
  ChevronRight, Layers, DollarSign, Percent, Zap, Minus, Plus
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';

// --- TYPES ---
interface Position {
  id: string;
  type: 'ENTRY' | 'MAIN' | 'DYN' | 'HEDGE';
  level: string; 
  price: number;
  lot: number;
  totalLot: number; 
  avgPrice: number; 
  dist: number;
  indivPnL: number; 
  cumPnL: number;   
}

interface SimulationResult {
  positions: Position[];
  summary: {
    slot: number;
    avgPrice: number; 
    pnl: number; 
    mainPnL: number; 
    hedgePnL: number;
    totalLot: number; 
    hedgeLot: number; 
    netLot: number; 
    rangeCovered: number;
    beDistance: number;
    recoveryGap: number;
    netAvgPrice: number; 
    isHedged: boolean;
    hedgeTriggerPrice: number | null;
  };
}

interface HedgeConfig {
  enabled: boolean;
  stopLossAmount: number; 
  lotMulti: number;
  slMulti: number;
}

// --- HELPERS ---
const formatCurrency = (val: number) => 
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val);

const formatNumber = (val: number, digits = 2) => 
  new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(val);

const formatPercent = (val: number) =>
  new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val / 100);

const normalizeLot = (val: number) => Math.round(val * 100) / 100;

// --- CALCULATION ENGINE ---
function calculateSimulation(
  entryPrice: number,
  maxPrice: number,
  step: number,
  initLot: number,
  multi: number,
  direction: 'LONG' | 'SHORT',
  contractSize: number,
  useDynamic: boolean,
  hedgeConfig: HedgeConfig,
  isWinMode: boolean = false,
  targetProfit: number = 0
): SimulationResult {
  
  const isLong = direction === 'LONG';
  const dirMult = isLong ? 1 : -1;
  
  if (step <= 0 || initLot <= 0 || contractSize <= 0) {
    return { 
      positions: [], 
      summary: { slot:0, avgPrice:0, pnl:0, mainPnL: 0, hedgePnL: 0, totalLot:0, hedgeLot: 0, netLot:0, rangeCovered:0, beDistance:0, recoveryGap:0, netAvgPrice: 0, isHedged: false, hedgeTriggerPrice: null } 
    };
  }

  const distance = Math.abs(entryPrice - maxPrice);
  const calculatedSteps = Math.ceil(distance / step);
  const safetyLimit = 3000; 
  const loopLimit = Math.min(calculatedSteps + 10, safetyLimit);

  let potentialOrders: { type: 'ENTRY' | 'MAIN' | 'DYN', price: number, lot: number, label: string }[] = [];

  for (let i = 0; i < loopLimit; i++) {
      const p = isLong ? entryPrice - (i * step) : entryPrice + (i * step);
      const rawLot = i === 0 ? initLot : initLot * Math.pow(multi, i);
      const l = normalizeLot(rawLot);
      const type = i === 0 ? 'ENTRY' : 'MAIN';
      const label = i === 0 ? 'ENTRY' : `L-${i}`;
      potentialOrders.push({ type, label, price: p, lot: l });
  }

  if (useDynamic) {
      for (let i = 0; i < loopLimit; i++) {
          const offset = (i * step) + (step * 1.5); 
          const p = isLong ? entryPrice - offset : entryPrice + offset;
          const dynExponent = i + 2;
          const rawDynLot = initLot * Math.pow(multi, dynExponent);
          const dynLot = normalizeLot(rawDynLot);
          potentialOrders.push({ type: 'DYN', label: `D-${(i+1.5).toFixed(1)}`, price: p, lot: dynLot });
      }
  }

  potentialOrders.sort((a, b) => Math.abs(entryPrice - a.price) - Math.abs(entryPrice - b.price));
  if (potentialOrders.length > safetyLimit) potentialOrders = potentialOrders.slice(0, safetyLimit);

  const executedPositions: Position[] = [];
  let currentTotalLot = 0;
  let currentTotalCost = 0; 
  let currentAvgPrice = entryPrice; 
  
  let isHedged = false;
  let hedgeTriggerPrice = 0;
  let hedgeLot = 0;
  let hedgeEntryPrice = 0;

  const calcBasketPnL = (atPrice: number, avg: number, lots: number) => (atPrice - avg) * lots * contractSize * dirMult;
  const calcSinglePnL = (atPrice: number, openPrice: number, lot: number) => (atPrice - openPrice) * lot * contractSize * dirMult;

  for (const order of potentialOrders) {
    if (isLong) { if (order.price < maxPrice) break; } 
    else { if (order.price > maxPrice) break; }

    if (hedgeConfig.enabled && !isHedged && hedgeConfig.stopLossAmount < 0 && currentTotalLot > 0) {
       const pnlAtOrderPrice = calcBasketPnL(order.price, currentAvgPrice, currentTotalLot);
       if (pnlAtOrderPrice <= hedgeConfig.stopLossAmount) {
            const exactTriggerPrice = currentAvgPrice + (hedgeConfig.stopLossAmount / (currentTotalLot * contractSize * dirMult));
            isHedged = true;
            hedgeTriggerPrice = exactTriggerPrice;
            hedgeEntryPrice = exactTriggerPrice;
            hedgeLot = normalizeLot(currentTotalLot * hedgeConfig.lotMulti);
            const hedgeIndivPnL = (maxPrice - hedgeEntryPrice) * hedgeLot * contractSize * (-dirMult);
            const netSignedLot = (currentTotalLot * dirMult) + (hedgeLot * -dirMult);
            const netLot = normalizeLot(Math.abs(netSignedLot));
            let netAvgPrice = 0;
            if (Math.abs(currentTotalLot - hedgeLot) > 0.001) {
                netAvgPrice = ((currentAvgPrice * currentTotalLot) - (hedgeEntryPrice * hedgeLot)) / (currentTotalLot - hedgeLot);
            }
            executedPositions.push({
              id: 'hedge-trigger', type: 'HEDGE', level: 'HEDGE', price: hedgeEntryPrice, lot: hedgeLot,
              totalLot: netLot, avgPrice: netAvgPrice, dist: Math.abs(entryPrice - hedgeEntryPrice),
              indivPnL: hedgeIndivPnL, cumPnL: hedgeConfig.stopLossAmount
            });
            break; 
       }
    }

    const prevLot = currentTotalLot;
    currentTotalLot = normalizeLot(prevLot + order.lot);
    currentTotalCost += order.price * order.lot;
    currentAvgPrice = currentTotalCost / currentTotalLot;
    const pnlSnapshot = calcBasketPnL(order.price, currentAvgPrice, currentTotalLot);
    const indivPnL = calcSinglePnL(maxPrice, order.price, order.lot);
    executedPositions.push({
      id: `${order.type}-${order.label}`, type: order.type === 'ENTRY' ? 'ENTRY' : order.type, level: order.label,
      price: order.price, lot: order.lot, totalLot: currentTotalLot, avgPrice: currentAvgPrice,
      dist: Math.abs(entryPrice - order.price), indivPnL: indivPnL, cumPnL: pnlSnapshot
    });
  }

  if (hedgeConfig.enabled && !isHedged && hedgeConfig.stopLossAmount < 0 && currentTotalLot > 0) {
     const pnlAtMax = calcBasketPnL(maxPrice, currentAvgPrice, currentTotalLot);
     if (pnlAtMax <= hedgeConfig.stopLossAmount) {
         const targetP = currentAvgPrice + (hedgeConfig.stopLossAmount / (currentTotalLot * contractSize * dirMult));
         isHedged = true;
         hedgeTriggerPrice = targetP;
         hedgeEntryPrice = targetP;
         hedgeLot = normalizeLot(currentTotalLot * hedgeConfig.lotMulti);
         const hedgeIndivPnL = (maxPrice - hedgeEntryPrice) * hedgeLot * contractSize * (-dirMult);
         const netSignedLot = (currentTotalLot * dirMult) + (hedgeLot * -dirMult);
         const netLot = normalizeLot(Math.abs(netSignedLot));
         let netAvgPrice = 0;
          if (Math.abs(currentTotalLot - hedgeLot) > 0.001) {
              netAvgPrice = ((currentAvgPrice * currentTotalLot) - (hedgeEntryPrice * hedgeLot)) / (currentTotalLot - hedgeLot);
          }
         executedPositions.push({
            id: 'hedge-final', type: 'HEDGE', level: 'HEDGE', price: hedgeEntryPrice, lot: hedgeLot,
            totalLot: netLot, avgPrice: netAvgPrice, dist: Math.abs(entryPrice - hedgeEntryPrice),
            indivPnL: hedgeIndivPnL, cumPnL: hedgeConfig.stopLossAmount
         });
     }
  }

  const netSignedLot = (currentTotalLot * dirMult) + (isHedged ? (hedgeLot * -dirMult) : 0);
  const netLot = normalizeLot(Math.abs(netSignedLot));
  let netAvgPrice = 0;
  if (isHedged) {
     if (Math.abs(currentTotalLot - hedgeLot) > 0.001) {
         netAvgPrice = ((currentAvgPrice * currentTotalLot) - (hedgeEntryPrice * hedgeLot)) / (currentTotalLot - hedgeLot);
     } else { netAvgPrice = 0; }
  } else { netAvgPrice = currentAvgPrice; }

  // --- WIN MODE RECALCULATION ---
  let finalPositions = executedPositions;
  let finalMainPnL = 0;
  let finalHedgePnL = 0;

  if (isWinMode) {
      const exitPrice = netAvgPrice + (targetProfit * dirMult);
      finalPositions = executedPositions.map(p => {
          let pnl = 0;
          if (p.type === 'HEDGE') {
             pnl = (exitPrice - p.price) * p.lot * contractSize * (-dirMult);
          } else {
             pnl = (exitPrice - p.price) * p.lot * contractSize * dirMult;
          }
          return { ...p, indivPnL: pnl };
      });
  }

  finalPositions.forEach(p => {
      if (p.type === 'HEDGE') finalHedgePnL += p.indivPnL;
      else finalMainPnL += p.indivPnL;
  });
  
  const finalNetPnL = finalMainPnL + finalHedgePnL;

  return {
    positions: finalPositions,
    summary: {
      slot: finalPositions.filter(p => p.type !== 'HEDGE').length,
      avgPrice: currentAvgPrice, 
      pnl: finalNetPnL, 
      mainPnL: finalMainPnL, 
      hedgePnL: finalHedgePnL,
      totalLot: currentTotalLot, hedgeLot: isHedged ? hedgeLot : 0, netLot,
      rangeCovered: Math.abs(entryPrice - maxPrice), beDistance: Math.abs(entryPrice - currentAvgPrice),
      recoveryGap: Math.abs(maxPrice - netAvgPrice), netAvgPrice, isHedged,
      hedgeTriggerPrice: isHedged ? hedgeTriggerPrice : null
    }
  };
}

// --- NEW UI COMPONENTS ---
const GridBackground = () => (
  <>
    <div className="scanline-overlay" />
    <div className="scanline-beam" />
    <div className="cyber-grid" />
  </>
);

const SignalPanel = ({ direction }: { direction: 'LONG' | 'SHORT' }) => {
  const isLong = direction === 'LONG';
  const color = isLong ? 'text-emerald-500' : 'text-rose-500';
  const bg = isLong ? 'bg-emerald-500/10' : 'bg-rose-500/10';
  const border = isLong ? 'border-emerald-500/30' : 'border-rose-500/30';
  
  return (
    <div className={`relative overflow-hidden rounded-xl border ${border} ${bg} p-6 flex items-center justify-between cyber-border`}>
      <div className="relative z-10">
        <div className={`text-xs font-bold tracking-[0.2em] ${color} mb-1`}>ACTIVE SIGNAL</div>
        <div className={`text-4xl font-black tracking-tighter ${color} text-glow flex items-center gap-3`}>
          {isLong ? <TrendingUp className="w-8 h-8" /> : <TrendingUp className="w-8 h-8 rotate-180" />}
          {direction}
        </div>
      </div>
      <div className={`absolute right-0 top-0 h-full w-32 bg-gradient-to-l from-${isLong?'emerald':'rose'}-500/20 to-transparent`} />
      
      {/* Animated Pulse Ring */}
      <div className={`absolute right-8 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 ${border} opacity-50 animate-ping`} />
      <div className={`absolute right-8 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full border ${border} flex items-center justify-center`}>
         <Zap className={`w-6 h-6 ${color}`} />
      </div>
    </div>
  );
};

const Ticker = ({ items }: { items: string[] }) => (
  <div className="w-full bg-black border-b border-zinc-800 overflow-hidden py-1.5 flex">
    <div className="animate-[marquee_20s_linear_infinite] whitespace-nowrap flex gap-8 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-zinc-700 rounded-full" />
          {item}
        </span>
      ))}
      {items.map((item, i) => (
        <span key={`dup-${i}`} className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-zinc-700 rounded-full" />
          {item}
        </span>
      ))}
    </div>
  </div>
);

// --- UI COMPONENTS ---

const Card = ({ children, className = '', glow = false, amber = false, critical = false, success = false, sectionColor }: any) => (
  <div 
    className={`
      glass-card relative overflow-hidden rounded-xl
      ${amber ? 'amber' : ''}
      ${critical ? 'critical' : ''}
      ${success ? 'success' : ''}
      ${glow && !critical && !success ? 'glow' : ''}
      ${className}
    `}
    style={sectionColor ? { '--theme-color': sectionColor } as React.CSSProperties : undefined}
  >
    {children}
  </div>
);

const SectionHeader = ({ icon: Icon, title, color = 'text-zinc-400' }: any) => (
  <div className={`flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-widest ${color} border-b border-zinc-800/50 pb-2`}>
    <Icon className="w-4 h-4 opacity-80" />
    <span className="text-glow">{title}</span>
  </div>
);

const InputField = () => null; // Deprecated

const Toggle = ({ active, onToggle, label }: any) => (
  <button 
    onClick={onToggle}
    className={`
      relative w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all duration-300 group overflow-hidden
      ${active 
        ? 'bg-[var(--theme-color)]/10 border-[var(--theme-color)]/50 text-[var(--theme-color)] shadow-[0_0_15px_rgba(0,0,0,0.3)]' 
        : 'bg-zinc-900/30 border-zinc-800 text-zinc-500 hover:border-zinc-700'}
    `}
  >
    <div className={`absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%)] bg-[length:250%_250%] transition-opacity duration-500 ${active ? 'animate-[shimmer_2s_infinite] opacity-100' : 'opacity-0'}`}></div>
    <span className="text-xs font-bold uppercase tracking-wide relative z-10">{label}</span>
    <div className={`w-8 h-4 rounded-full relative transition-colors z-10 ${active ? 'bg-[var(--theme-color)]' : 'bg-zinc-700'}`}>
      <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${active ? 'translate-x-4' : ''}`} />
    </div>
  </button>
);

const StatRow = ({ label, value, subValue, highlight = false, colorClass = "text-zinc-200" }: any) => (
  <div className="flex justify-between items-end py-2 border-b border-zinc-800/30 last:border-0 hover:bg-white/5 px-2 -mx-2 rounded transition-colors group">
    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider group-hover:text-zinc-300 transition-colors">{label}</span>
    <div className="flex-grow mx-2 border-b border-zinc-800/50 border-dotted mb-1.5 opacity-30 group-hover:opacity-50 transition-opacity"></div>
    <div className="text-right">
      <div className={`font-mono text-sm font-bold ${highlight ? 'animate-pulse' : ''} ${colorClass} ${highlight ? 'text-glow' : ''}`}>
        {value}
      </div>
      {subValue && <div className="text-[9px] text-zinc-600 group-hover:text-zinc-500 font-mono">{subValue}</div>}
    </div>
  </div>
);

const AnimatedReferenceLabel = ({ viewBox, labelText, fill, dy = -10 }: any) => {
   const { x, y, width } = viewBox;
   return (
      <text 
         x={x + width - 5} 
         y={y + dy} 
         fill={fill} 
         fontSize={10} 
         fontWeight="bold" 
         textAnchor="end" 
         className="animate-pulse"
         style={{ filter: `drop-shadow(0 0 5px ${fill})` }}
      >
         {labelText}
      </text>
   );
};

// --- MAIN APP ---
export const App = () => {
  // State
  const [entryPrice, setEntryPrice] = useState(2000);
  const [range, setRange] = useState(50);
  const [maxPrice, setMaxPrice] = useState(1950);
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  
  const [step, setStep] = useState(10);
  const [initLot, setInitLot] = useState(0.01);
  const [multi, setMulti] = useState(1.4);
  const [contractSize, setContractSize] = useState(100);
  const [useDynamic, setUseDynamic] = useState(false);
  
  const [balance, setBalance] = useState(10000);
  
  // Hedge
  const [useHedge, setUseHedge] = useState(false);
  const [hedgeStopLoss, setHedgeStopLoss] = useState(-4000); 
  const [hedgeStopLossDisplay, setHedgeStopLossDisplay] = useState("-4000");
  const [hedgeLotMulti, setHedgeLotMulti] = useState(2.0);
  const [hedgeSlMulti, setHedgeSlMulti] = useState(2.0);

  // Solvers
  const [targetBE, setTargetBE] = useState<number | ''>('');
  const [targetPnL, setTargetPnL] = useState<number>(-5000);
  const [pnlInputDisplay, setPnlInputDisplay] = useState<string>("-5000");

  const [desiredPips, setDesiredPips] = useState<string>('20');
  const [isWinMode, setIsWinMode] = useState(false);
  
  // Computed
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  
  // Refs
  const isPnlInputFocused = useRef(false);
  const isBeInputFocused = useRef(false);

  // --- EFFECT: Calculation ---
  useEffect(() => {
    const res = calculateSimulation(
        entryPrice, maxPrice, step, initLot, multi, direction, contractSize, useDynamic,
        { enabled: useHedge, stopLossAmount: hedgeStopLoss, lotMulti: hedgeLotMulti, slMulti: hedgeSlMulti },
        isWinMode,
        Number(desiredPips) || 0
    );
    setSimResult(res);
  }, [entryPrice, maxPrice, step, initLot, multi, direction, contractSize, useDynamic, useHedge, hedgeStopLoss, hedgeLotMulti, hedgeSlMulti, isWinMode, desiredPips]);

  // --- HANDLERS ---
  const handleDirectionChange = (newDir: 'LONG' | 'SHORT') => {
    setDirection(newDir);
    if (newDir === 'LONG') setMaxPrice(entryPrice - range);
    else setMaxPrice(entryPrice + range);
  };

  const handleEntryChange = (val: number) => {
    setEntryPrice(val);
    if (direction === 'LONG') setMaxPrice(val - range);
    else setMaxPrice(val + range);
  };

  const handleRangeChange = (val: number) => {
    setRange(val);
    if (direction === 'LONG') setMaxPrice(entryPrice - val);
    else setMaxPrice(entryPrice + val);
  };
  
  const handleTargetPnLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setPnlInputDisplay(val);
      if (val !== '' && !isNaN(Number(val))) setTargetPnL(Number(val));
  };
  
  // Solvers
  const solveForTargetBE = (tBE: number) => {
    if (!tBE || tBE <= 0) return;
    let low = 0.1, high = 5000, bestMax = maxPrice;
    for(let i=0; i<30; i++) {
        const midRange = (low + high) / 2;
        const testMax = direction === 'LONG' ? entryPrice - midRange : entryPrice + midRange;
        const res = calculateSimulation(entryPrice, testMax, step, initLot, multi, direction, contractSize, useDynamic, { enabled: useHedge, stopLossAmount: hedgeStopLoss, lotMulti: hedgeLotMulti, slMulti: hedgeSlMulti });
        const be = res.summary.isHedged ? res.summary.netAvgPrice : res.summary.avgPrice;
        if (Math.abs(be - tBE) < 0.5) { bestMax = testMax; break; }
        if (direction === 'LONG') { if (be > tBE) low = midRange; else high = midRange; } 
        else { if (be < tBE) low = midRange; else high = midRange; }
    }
    const newRange = Math.abs(entryPrice - bestMax);
    setRange(parseFloat(newRange.toFixed(2)));
    setMaxPrice(parseFloat(bestMax.toFixed(2)));
  };

  const solveForTargetPnL = (target: number) => {
     let low = 0.1, high = 5000, bestMax = maxPrice;
     for(let i=0; i<30; i++) {
        const midRange = (low + high) / 2;
        const testMax = direction === 'LONG' ? entryPrice - midRange : entryPrice + midRange;
        const res = calculateSimulation(entryPrice, testMax, step, initLot, multi, direction, contractSize, useDynamic, { enabled: useHedge, stopLossAmount: hedgeStopLoss, lotMulti: hedgeLotMulti, slMulti: hedgeSlMulti });
        const pnl = res.summary.pnl;
        if (Math.abs(pnl - target) < 10) { bestMax = testMax; break; }
        if (pnl > target) low = midRange; else high = midRange;
     }
     const newRange = Math.abs(entryPrice - bestMax);
     setRange(parseFloat(newRange.toFixed(2)));
     setMaxPrice(parseFloat(bestMax.toFixed(2)));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
        if (isBeInputFocused.current && targetBE !== '' && !isNaN(Number(targetBE))) solveForTargetBE(Number(targetBE));
    }, 600);
    return () => clearTimeout(timer);
  }, [targetBE]);

  useEffect(() => {
    const timer = setTimeout(() => {
        if (isPnlInputFocused.current && !isNaN(targetPnL)) solveForTargetPnL(targetPnL);
    }, 600);
    return () => clearTimeout(timer);
  }, [targetPnL]);

  useEffect(() => {
     if (!simResult) return;
     if (!isPnlInputFocused.current) setPnlInputDisplay(simResult.summary.pnl.toFixed(0));
  }, [simResult]);

  const stats = (() => {
    if (!simResult) return { equity: balance, ddAmount: 0, ddPercent: 0 };
    const pnl = simResult.summary.pnl;
    const equity = balance + pnl;
    const ddAmount = pnl < 0 ? Math.abs(pnl) : 0;
    const ddPercent = (ddAmount / balance) * 100;
    return { equity, ddAmount, ddPercent };
  })();

  const profTgt = (() => {
    if (!simResult) return { targetPrice: 0, profit: 0, move: 0 };
    const pips = parseFloat(desiredPips) || 0;
    const be = simResult.summary.netAvgPrice || simResult.summary.avgPrice;
    const netLot = simResult.summary.netLot;
    const isNetLong = (direction === 'LONG' && simResult.summary.totalLot >= simResult.summary.hedgeLot) ||
                      (direction === 'SHORT' && simResult.summary.hedgeLot > simResult.summary.totalLot);
    const targetPrice = isNetLong ? be + pips : be - pips;
    const profit = pips * netLot * contractSize;
    const move = Math.abs(targetPrice - maxPrice);
    return { targetPrice, profit, move };
  })();

  const handleExportCSV = () => {
    if (!simResult) return;
    const headers = ['Type', 'Level', 'Price', 'Lot', 'Indiv PnL', 'Cumul PnL', 'Total Lot', 'Avg Price'];
    const rows = simResult.positions.map(p => [
       p.type, p.level, p.price, p.lot, p.indivPnL.toFixed(2), p.cumPnL.toFixed(2), p.totalLot.toFixed(2), p.avgPrice.toFixed(2)
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = "dca_simulation.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const mainData = simResult?.positions.filter(p => p.type === 'ENTRY' || p.type === 'MAIN') || [];
  const dynData = simResult?.positions.filter(p => p.type === 'DYN') || [];
  const hedgeData = simResult?.positions.filter(p => p.type === 'HEDGE') || [];

  // Calculate Chart Domain
  const allChartPrices = [
      entryPrice,
      maxPrice,
      profTgt.targetPrice,
      ...(simResult?.positions.map(p => p.price) || [])
  ];
  if (simResult?.summary.hedgeTriggerPrice) allChartPrices.push(simResult.summary.hedgeTriggerPrice);
  
  const minChartPrice = Math.min(...allChartPrices);
  const maxChartPrice = Math.max(...allChartPrices);
  const pricePadding = (maxChartPrice - minChartPrice) * 0.05; // 5% padding
  const yDomain = [minChartPrice - pricePadding, maxChartPrice + pricePadding];

  // --- SPECIAL Y-AXIS TICKS ---
  const specialLevels = [
      { value: entryPrice, label: 'ENTRY', color: '#10b981' },
      { value: maxPrice, label: 'MAX', color: '#ef4444' },
  ];

  if (simResult?.summary.isHedged) {
      if (simResult.summary.netAvgPrice && Math.abs(simResult.summary.netAvgPrice) > 0.001) {
          specialLevels.push({ value: simResult.summary.netAvgPrice, label: 'BE', color: '#3b82f6' });
      }
      if (simResult.summary.hedgeTriggerPrice) {
          specialLevels.push({ value: simResult.summary.hedgeTriggerPrice, label: 'HEDGE', color: '#f59e0b' });
      }
  } else {
      specialLevels.push({ value: simResult?.summary.avgPrice || 0, label: 'BE', color: '#3b82f6' });
  }

  if (profTgt.targetPrice > 0) {
      specialLevels.push({ value: profTgt.targetPrice, label: 'TARGET', color: '#10b981' });
  }

  const CustomYAxisTick = ({ x, y, payload }: any) => {
      if (!payload || typeof payload.value === 'undefined') return null;
      const val = payload.value;
      const level = specialLevels.find(l => Math.abs(l.value - val) < 0.001);
      
      if (!level) return null; 

      return (
          <g transform={`translate(${x},${y})`}>
              {/* Label Background for better contrast */}
              <rect x={-54} y={-13} width={58} height={27} fill="#18181b" rx={4} opacity={0.9} stroke={level.color} strokeWidth={1} strokeOpacity={0.3} />
              
              {/* Label Name (ENTRY, MAX...) */}
              <text x={-4} y={-3} textAnchor="end" fill={level.color} fontSize={9} fontWeight="900" letterSpacing="0.5px">
                  {level.label}
              </text>
              
              {/* Price Value */}
              <text x={-4} y={9} textAnchor="end" fill="#e4e4e7" fontSize={10} fontFamily="monospace" fontWeight="bold">
                  {formatNumber(val)}
              </text>
          </g>
      );
  };

  const CustomTooltip = ({ active, payload }: any) => {
      if (active && payload && payload.length) {
          const d = payload[0].payload;
          const entry = simResult?.positions.find(p => p.type === 'ENTRY')?.price || entryPrice;
          const dist = Math.abs(d.price - entry);
          return (
             <div className="bg-zinc-900/95 border border-zinc-700 p-3 rounded-xl shadow-2xl backdrop-blur-sm z-50">
                <div className="font-bold text-zinc-300 border-b border-zinc-700 pb-2 mb-2 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${d.type==='HEDGE'?'bg-amber-500':d.type==='DYN'?'bg-purple-500':'bg-blue-500'}`}></span>
                    <span className="uppercase tracking-wider text-[10px]">{d.type} Order</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Price:</span> <span className="font-mono text-zinc-200">{formatNumber(d.price)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Lot:</span> <span className="font-mono text-zinc-200">{formatNumber(d.lot)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Dist:</span> <span className="font-mono text-zinc-200">{formatNumber(dist)} pts</span></div>
                  <div className="flex justify-between gap-4 pt-2 mt-2 border-t border-zinc-800">
                    <span className="text-zinc-500">Indiv PnL:</span> 
                    <span className={`font-mono font-bold ${d.indivPnL < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{formatCurrency(d.indivPnL)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-zinc-500">Cumul PnL:</span> 
                    <span className="font-mono text-zinc-400">{formatCurrency(d.cumPnL)}</span>
                  </div>
                </div>
             </div>
          );
      }
      return null;
  };

  if (!simResult) return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500 font-mono text-xs tracking-widest">INITIALIZING SYSTEM...</div>;

  const themeColor = direction === 'LONG' ? '#10b981' : '#f43f5e';

  return (
    <div 
      className="min-h-screen text-zinc-200 font-sans selection:bg-cyan-500/30 relative overflow-hidden"
      style={{ '--theme-color': themeColor } as React.CSSProperties}
    >
      <GridBackground />
      
      {/* Top Navigation / Branding */}
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center cyber-border shadow-[0_0_10px_rgba(6,182,212,0.3)]">
               <Zap className="text-cyan-400 w-4 h-4 fill-cyan-400/20"/>
             </div>
             <div>
               <h1 className="text-sm font-bold text-zinc-100 tracking-wide">QUANTUM <span className="text-cyan-500 text-glow">TERMINAL</span></h1>
               <div className="flex items-center gap-2">
                 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_5px_#10b981]"></span>
                 <span className="text-[9px] text-zinc-500 font-mono tracking-widest">SYSTEM ONLINE</span>
               </div>
             </div>
          </div>
          
          <div className="flex items-center gap-6">
             {/* Health Bar Mini */}
             <div className="hidden md:flex flex-col items-end">
                <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                   Equity Health
                </div>
                <div className="w-32 h-1 bg-zinc-900 rounded-full overflow-hidden">
                   <div 
                      className={`h-full transition-all duration-500 ${stats.ddPercent > 50 ? 'bg-rose-500' : stats.ddPercent > 20 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.max(0, 100 - stats.ddPercent)}%` }}
                   />
                </div>
             </div>

             <button onClick={() => window.location.reload()} className="p-2 hover:bg-zinc-900 rounded transition-colors group">
               <RefreshCw className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-transform group-hover:rotate-180"/>
             </button>
          </div>
        </div>
      </nav>

      <main className="max-w-[1400px] mx-auto p-4 md:p-6 lg:p-8 space-y-6 relative z-10">
        
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
           
           {/* === LEFT COLUMN: CONTROLS === */}
           <div className="xl:col-span-4 space-y-6">
              
              {/* Signal Panel (Replaces simple toggle) */}
              <div className="cursor-pointer" onClick={() => handleDirectionChange(direction === 'LONG' ? 'SHORT' : 'LONG')}>
                 <SignalPanel direction={direction} />
              </div>

              {/* Account Card */}
              <Card sectionColor="#10b981">
                 <div className="p-5">
                    <SectionHeader icon={Wallet} title="Account & Capital" color="text-emerald-500" />
                    <div className="space-y-2 mb-1">
                       <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-2">
                          <DollarSign className="w-3 h-3 text-emerald-500"/>
                          Cash Balance
                       </label>
                       <div className="relative group">
                          <input
                             type="number"
                             value={balance}
                             onChange={(e) => setBalance(Number(e.target.value))}
                             className="glass-input w-full pl-3 pr-3 py-2 text-right font-mono text-emerald-400 font-bold text-lg"
                          />
                          <div className="absolute inset-0 border border-emerald-500/0 group-hover:border-emerald-500/30 rounded-lg pointer-events-none transition-all duration-300"></div>
                       </div>
                    </div>
                 </div>
                 {/* Mini Stats Bar inside Account */}
                 <div className="bg-black/40 px-5 py-3 border-t border-zinc-800 flex justify-between text-xs relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-zinc-700 to-transparent opacity-50"></div>
                    <span className="text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-2">
                       Equity <span className={`font-mono text-sm ${stats.equity < balance ? 'text-rose-400' : 'text-emerald-400 text-glow'}`}>{formatCurrency(stats.equity)}</span>
                    </span>
                    <span className="text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-2">
                       DD <span className="font-mono text-sm text-zinc-300">{formatPercent(stats.ddPercent)}</span>
                    </span>
                 </div>
              </Card>

              {/* Strategy Card */}
              <Card sectionColor="#22d3ee">
                 <div className="p-5 space-y-5">
                    <SectionHeader icon={Settings} title="Grid Configuration" color="text-cyan-400" />
                    
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Entry Price</label>
                          <div className="relative group">
                             <input
                                type="number"
                                value={entryPrice}
                                onChange={(e) => handleEntryChange(Number(e.target.value))}
                                className="glass-input w-full pl-3 pr-3 py-2 text-right font-mono text-zinc-300 focus:text-cyan-400 transition-colors"
                             />
                             <div className="absolute inset-0 border border-cyan-500/0 group-hover:border-cyan-500/30 rounded-lg pointer-events-none transition-all duration-300"></div>
                          </div>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Init Lot</label>
                          <div className="relative group">
                             <input
                                type="number"
                                value={initLot}
                                onChange={(e) => setInitLot(Number(e.target.value))}
                                step={0.01}
                                className="glass-input w-full pl-3 pr-3 py-2 text-right font-mono text-zinc-300 focus:text-cyan-400 transition-colors"
                             />
                             <div className="absolute inset-0 border border-cyan-500/0 group-hover:border-cyan-500/30 rounded-lg pointer-events-none transition-all duration-300"></div>
                          </div>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Grid Step</label>
                          <div className="relative group">
                             <input
                                type="number"
                                value={step}
                                onChange={(e) => setStep(Number(e.target.value))}
                                className="glass-input w-full pl-3 pr-3 py-2 text-right font-mono text-zinc-300 focus:text-cyan-400 transition-colors"
                             />
                             <div className="absolute inset-0 border border-cyan-500/0 group-hover:border-cyan-500/30 rounded-lg pointer-events-none transition-all duration-300"></div>
                          </div>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Multiplier</label>
                          <div className="relative group">
                             <input
                                type="number"
                                value={multi}
                                onChange={(e) => setMulti(Number(e.target.value))}
                                step={0.1}
                                className="glass-input w-full pl-3 pr-3 py-2 text-right font-mono text-zinc-300 focus:text-cyan-400 transition-colors"
                             />
                             <div className="absolute inset-0 border border-cyan-500/0 group-hover:border-cyan-500/30 rounded-lg pointer-events-none transition-all duration-300"></div>
                          </div>
                       </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/50">
                       <Toggle 
                         active={useDynamic} 
                         onToggle={() => setUseDynamic(!useDynamic)} 
                         label="Dynamic Steps (1.5x)" 
                       />
                    </div>
                 </div>
              </Card>

              {/* Solvers Card */}
              <Card sectionColor="#fb7185">
                 <div className="p-5 space-y-5">
                    <SectionHeader icon={Target} title="Simulation Targets" color="text-rose-400" />

                    <div className="space-y-4">
                       <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-2">
                             <ArrowLeftRight className="w-3 h-3"/>
                             Target Floating PnL ($)
                          </label>
                          <div className="relative group">
                             <input
                                type="text"
                                value={pnlInputDisplay}
                                onChange={(e) => { 
                                   setPnlInputDisplay(e.target.value); 
                                   isPnlInputFocused.current=true; 
                                   if(!isNaN(parseFloat(e.target.value))) setTargetPnL(parseFloat(e.target.value)); 
                                }}
                                className="glass-input w-full pl-3 pr-3 py-2 text-right font-mono text-rose-400 font-bold text-lg"
                             />
                             <div className="absolute inset-0 border border-rose-500/0 group-hover:border-rose-500/30 rounded-lg pointer-events-none transition-all duration-300"></div>
                          </div>
                       </div>
                       
                       <div className="pt-4 border-t border-zinc-800/50">
                          <div className="flex justify-between items-end mb-3">
                             <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Manual Range (Pts)</label>
                             <div className="flex items-center gap-2 bg-black/20 rounded-lg p-1 border border-zinc-800/50">
                                <button onClick={() => handleRangeChange(Math.max(1, range - 1))} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-zinc-300 transition-colors">
                                   <Minus className="w-3 h-3"/>
                                </button>
                                <input 
                                   type="number" 
                                   value={range} 
                                   onChange={(e) => handleRangeChange(Number(e.target.value))}
                                   className="w-16 bg-transparent text-center font-mono text-lg font-bold text-[var(--theme-color)] outline-none"
                                />
                                <button onClick={() => handleRangeChange(Math.min(1000, range + 1))} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-zinc-300 transition-colors">
                                   <Plus className="w-3 h-3"/>
                                </button>
                             </div>
                          </div>
                          
                          <div className="relative h-6 flex items-center group cursor-pointer">
                             {/* Track */}
                             <div className="absolute w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                                <div 
                                   className="absolute top-0 left-0 h-full bg-[var(--theme-color)] opacity-50 transition-all duration-75" 
                                   style={{ width: `${(range / 1000) * 100}%` }}
                                />
                             </div>
                             
                             {/* Thumb */}
                             <div 
                                className="absolute h-5 w-5 bg-[var(--theme-color)] rounded-full shadow-[0_0_15px_rgba(0,0,0,0.5)] border-4 border-zinc-950 pointer-events-none transition-all duration-75 z-10"
                                style={{ left: `calc(${(range / 1000) * 100}% - 10px)` }}
                             />

                             <input
                                type="range" min={1} max={1000} step={1}
                                value={range} onChange={(e) => handleRangeChange(Number(e.target.value))}
                                className="absolute w-full h-full opacity-0 cursor-pointer z-20"
                             />
                          </div>
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                          <div className="glass-input rounded px-3 py-2 border border-zinc-800 flex flex-col justify-center">
                             <div className="text-[9px] text-zinc-500 font-bold mb-0.5 uppercase tracking-wider">MAX PRICE</div>
                             <div className="font-mono text-sm text-rose-400 font-bold">{formatNumber(maxPrice)}</div>
                          </div>
                          <div className="glass-input rounded px-3 py-2 border border-zinc-800 flex flex-col justify-center">
                             <div className="text-[9px] text-zinc-500 font-bold mb-0.5 uppercase tracking-wider">GAP TO BE</div>
                             <div className="font-mono text-sm text-blue-400 font-bold">{formatNumber(simResult.summary.recoveryGap, 1)}</div>
                          </div>
                       </div>
                    </div>
                 </div>
              </Card>

              {/* Hedge Card */}
              <Card amber={simResult.summary.isHedged} sectionColor="#fbbf24">
                 <div className="p-5 space-y-4">
                    <div className="flex justify-between items-center">
                       <SectionHeader icon={ShieldAlert} title="Hedge Strategy" color={simResult.summary.isHedged ? 'text-amber-400' : 'text-zinc-400'} />
                       <Toggle active={useHedge} onToggle={() => setUseHedge(!useHedge)} label={useHedge ? "ACTIVE" : "OFF"} />
                    </div>

                    {useHedge && (
                       <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                          <div className="space-y-2">
                             <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-2">
                                <span className="w-1 h-1 bg-amber-500 rounded-full"></span>
                                Stop Loss ($)
                             </label>
                             <div className="relative group">
                                <input
                                   type="text"
                                   value={hedgeStopLossDisplay}
                                   onChange={(e) => {
                                      setHedgeStopLossDisplay(e.target.value);
                                      if (e.target.value === '' || e.target.value === '-') return;
                                      const val = parseFloat(e.target.value);
                                      if (!isNaN(val)) setHedgeStopLoss(val);
                                   }}
                                   className="glass-input w-full pl-3 pr-3 py-2 text-right font-mono text-amber-400 font-bold"
                                />
                                <div className="absolute inset-0 border border-amber-500/0 group-hover:border-amber-500/30 rounded-lg pointer-events-none transition-all duration-300"></div>
                             </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Hedge Lot x</label>
                                <div className="relative group">
                                   <input
                                      type="number"
                                      value={hedgeLotMulti}
                                      onChange={(e) => setHedgeLotMulti(Number(e.target.value))}
                                      step={0.1}
                                      className="glass-input w-full pl-3 pr-3 py-2 text-right font-mono text-zinc-300 focus:text-amber-400 transition-colors"
                                   />
                                   <div className="absolute inset-0 border border-amber-500/0 group-hover:border-amber-500/30 rounded-lg pointer-events-none transition-all duration-300"></div>
                                </div>
                             </div>
                             <div className="space-y-2">
                                <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">SL Expand x</label>
                                <div className="relative group">
                                   <input
                                      type="number"
                                      value={hedgeSlMulti}
                                      onChange={(e) => setHedgeSlMulti(Number(e.target.value))}
                                      step={0.1}
                                      className="glass-input w-full pl-3 pr-3 py-2 text-right font-mono text-zinc-300 focus:text-amber-400 transition-colors"
                                   />
                                   <div className="absolute inset-0 border border-amber-500/0 group-hover:border-amber-500/30 rounded-lg pointer-events-none transition-all duration-300"></div>
                                </div>
                             </div>
                          </div>
                          
                          {simResult.summary.isHedged && (
                             <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3 relative overflow-hidden">
                                <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(245,158,11,0.1)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_2s_infinite]"></div>
                                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 relative z-10 animate-pulse"/>
                                <div className="relative z-10">
                                   <div className="text-xs font-bold text-amber-500 uppercase tracking-wide">Hedge Triggered</div>
                                   <div className="text-sm text-amber-100 mt-1 font-mono font-bold">
                                      Position locked at {formatNumber(simResult.summary.hedgeTriggerPrice || 0)}
                                   </div>
                                </div>
                             </div>
                          )}
                       </div>
                    )}
                 </div>
              </Card>
           </div>

           {/* === RIGHT COLUMN: DATA VISUALIZATION === */}
           <div className="xl:col-span-8 space-y-6">
              
              {/* Summary Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 
                 {/* PnL & Stats */}
                 <Card 
                    glow 
                    critical={simResult.summary.pnl < 0} 
                    success={simResult.summary.pnl >= (targetPnL > 0 ? targetPnL : 99999999)}
                    sectionColor={simResult.summary.pnl < 0 ? '#f43f5e' : simResult.summary.pnl >= (targetPnL > 0 ? targetPnL : 99999999) ? '#10b981' : '#22d3ee'}
                 >
                    <div className="p-6 h-full flex flex-col justify-between">
                       <div className="flex justify-between items-start mb-6">
                          <SectionHeader icon={Activity} title="Simulation Result" color="text-cyan-400" />
                          <div className="flex items-center gap-2">
                              <button
                                onClick={() => setIsWinMode(!isWinMode)}
                                className={`px-3 py-1 rounded text-[10px] font-bold border transition-all duration-300 ${
                                   isWinMode 
                                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]' 
                                      : 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                                }`}
                              >
                                {isWinMode ? 'WIN' : 'LOSS'}
                              </button>
                              <div className={`px-3 py-1 rounded text-[10px] font-bold border transition-all duration-500 flex items-center gap-2 ${simResult.summary.pnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                                 <span className={`w-1.5 h-1.5 rounded-full ${simResult.summary.pnl >= 0 ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`}></span>
                                 {simResult.summary.pnl >= 0 ? 'PROFITABLE' : 'DRAWDOWN'}
                              </div>
                          </div>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-6 mb-6">
                          <div className="bg-black/40 p-4 rounded border border-zinc-800/50 relative overflow-hidden group">
                             <div className="absolute top-0 left-0 w-1 h-full bg-[var(--theme-color)] opacity-50"></div>
                             <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Projected Equity PnL</div>
                             <div className={`text-2xl font-mono font-bold tracking-tight transition-all duration-300 text-glow ${simResult.summary.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {formatCurrency(simResult.summary.pnl)}
                             </div>
                          </div>
                          <div className="bg-black/40 p-4 rounded border border-zinc-800/50 relative overflow-hidden">
                             <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Drawdown Impact</div>
                             <div className="text-2xl font-mono font-bold text-zinc-200 mb-1">
                                {formatPercent(stats.ddPercent)}
                             </div>
                             <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                                <div className={`h-full ${stats.ddPercent > 20 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{width: `${Math.min(stats.ddPercent, 100)}%`}}></div>
                             </div>
                          </div>
                       </div>

                       <div className="space-y-0">
                          <StatRow label="Grid PnL (Floating)" value={formatCurrency(simResult.summary.mainPnL)} colorClass="text-zinc-400" />
                          <StatRow label="Total Grid Lots" value={formatNumber(simResult.summary.totalLot)} colorClass="text-zinc-300" />
                          <StatRow label="Total Positions" value={simResult.summary.slot.toString()} colorClass="text-zinc-300" />
                          {simResult.summary.isHedged && (
                             <>
                                <StatRow label="Hedge Lot Size" value={formatNumber(simResult.summary.hedgeLot)} highlight colorClass="text-amber-400" />
                                <StatRow label="Hedge PnL" value={formatCurrency(simResult.summary.hedgePnL)} highlight colorClass="text-amber-400" />
                             </>
                          )}
                          <StatRow label="Net Avg Price (BE)" value={formatNumber(simResult.summary.netAvgPrice)} colorClass="text-blue-400" />
                          <StatRow label="Dist to Recovery" value={`${formatNumber(simResult.summary.recoveryGap)} pts`} />
                       </div>
                    </div>
                 </Card>

                 {/* Profit Targets */}
                 <Card success={profTgt.profit > 0 && simResult.summary.pnl >= 0} sectionColor="#34d399">
                    <div className="p-6 h-full relative">
                       <div className="absolute top-0 right-0 p-6 opacity-5">
                          <MousePointerClick className="w-24 h-24" />
                       </div>
                       <SectionHeader icon={MousePointerClick} title="Exit Scenario" color="text-emerald-400" />
                       
                       <div className="mb-6 relative z-10">
                          <div className="space-y-2">
                             <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-2">
                                <span className="w-1 h-1 bg-emerald-500 rounded-full"></span>
                                Desired Profit Target (Pips)
                             </label>
                             <div className="relative group">
                                <input
                                   type="text"
                                   value={desiredPips}
                                   onChange={(e) => setDesiredPips(e.target.value)}
                                   className="glass-input w-full pl-3 pr-3 py-2 text-right font-mono text-emerald-400 font-bold text-lg"
                                />
                                <div className="absolute inset-0 border border-emerald-500/0 group-hover:border-emerald-500/30 rounded-lg pointer-events-none transition-all duration-300"></div>
                             </div>
                          </div>
                       </div>

                       <div className="grid grid-cols-2 gap-4 relative z-10 mb-4">
                          <div className="glass-input rounded-xl p-4 border border-emerald-500/20 hover:border-emerald-500/40 transition-colors group">
                             <div className="text-[10px] text-emerald-500 font-bold uppercase mb-1 group-hover:text-emerald-400 transition-colors">Target Price</div>
                             <div className="font-mono text-xl font-bold text-emerald-400 text-glow">{formatNumber(profTgt.targetPrice)}</div>
                          </div>
                          <div className="glass-input rounded-xl p-4 border border-emerald-500/20 hover:border-emerald-500/40 transition-colors group">
                             <div className="text-[10px] text-emerald-500 font-bold uppercase mb-1 group-hover:text-emerald-400 transition-colors">Projected Profit</div>
                             <div className="font-mono text-xl font-bold text-emerald-400 text-glow">{formatCurrency(profTgt.profit)}</div>
                          </div>
                       </div>
                       
                       <div className="text-center relative z-10 bg-emerald-500/5 rounded-lg py-2 border border-emerald-500/10">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                             Requires market move of <span className="text-emerald-400 font-mono text-sm ml-1">{formatNumber(profTgt.move)} pts</span>
                          </span>
                       </div>
                    </div>
                 </Card>
              </div>

              {/* Chart Section */}
              <Card className="overflow-visible" sectionColor="#a78bfa"> 
                 <div className="p-5 border-b border-zinc-800 flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <SectionHeader icon={BarChart3} title="Position Distribution" color="text-violet-400" />
                    
                    {/* Styled Legend */}
                    <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wider">
                       <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                         <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]"></div>
                         Main
                       </div>
                       <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">
                          <div className="w-1.5 h-1.5 rotate-45 bg-purple-500 shadow-[0_0_5px_rgba(168,85,247,0.8)]"></div>
                          Dynamic
                       </div>
                       <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                          <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[6px] border-b-amber-500 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]"></div>
                          Hedge
                       </div>
                    </div>
                 </div>
                 
                 <div className="h-[450px] w-full p-4">
                    <ResponsiveContainer width="100%" height="100%">
                       <ScatterChart margin={{top:20, right:20, left:44, bottom:20}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} strokeOpacity={0.5} />
                          <XAxis 
                             type="number" dataKey="lot" name="Lot" 
                             stroke="#71717a" fontSize={10} tickLine={false} axisLine={{ stroke: '#3f3f46' }}
                             tickFormatter={(val) => `${val}L`}
                             domain={['auto', 'auto']}
                             dy={10}
                          />
                          <YAxis 
                             type="number" dataKey="price" name="Price" 
                             stroke="#71717a" fontSize={10} tickLine={false} axisLine={{ stroke: '#3f3f46' }} 
                             domain={yDomain}
                             width={44}
                             ticks={[...new Set(specialLevels.map(l => l.value))].sort((a, b) => a - b)}
                             tick={<CustomYAxisTick />}
                             interval={0}
                          />
                          <Tooltip content={<CustomTooltip />} cursor={{strokeDasharray:'3 3', stroke: '#52525b', strokeWidth: 1}} />
                          
                          <Scatter name="Main Grid" data={mainData} fill="#3b82f6" shape="circle" />
                          <Scatter name="Dynamic Steps" data={dynData} fill="#a855f7" shape="diamond" />
                          <Scatter name="Hedge Trigger" data={hedgeData} fill="#f59e0b" shape="triangle" />
                          
                          {/* Reference Lines - Refined */}
                          <ReferenceLine y={entryPrice} stroke="#10b981" strokeDasharray="4 4" />
                          <ReferenceLine y={maxPrice} stroke="#ef4444" strokeDasharray="4 4" />
                          
                          {simResult.summary.isHedged && simResult.summary.hedgeTriggerPrice && (
                             <ReferenceLine 
                                y={simResult.summary.hedgeTriggerPrice} 
                                stroke="#f59e0b" 
                                strokeDasharray="3 3" 
                                strokeWidth={2}
                                style={{ filter: 'drop-shadow(0 0 6px #f59e0b)' }}
                                label={<AnimatedReferenceLabel labelText={`HEDGE [${formatNumber(simResult.summary.hedgeTriggerPrice)}]`} fill="#f59e0b" dy={-10} />}
                             />
                          )}

                          {(!simResult.summary.isHedged || (simResult.summary.isHedged && Math.abs(simResult.summary.netAvgPrice) > 0.001)) && (
                             <ReferenceLine 
                                y={simResult.summary.isHedged ? simResult.summary.netAvgPrice : simResult.summary.avgPrice} 
                                stroke="#3b82f6" 
                                strokeDasharray="5 5" 
                                strokeWidth={2}
                                style={{ filter: 'drop-shadow(0 0 6px #3b82f6)' }}
                                label={<AnimatedReferenceLabel labelText={`BE [${formatNumber(simResult.summary.isHedged ? simResult.summary.netAvgPrice : simResult.summary.avgPrice)}]`} fill="#3b82f6" dy={10} />}
                             />
                          )}
                          
                          {profTgt.targetPrice > 0 && (
                            <ReferenceLine 
                               y={profTgt.targetPrice} 
                               stroke="#10b981" 
                               strokeWidth={2} 
                               strokeDasharray="8 4"
                               style={{ filter: 'drop-shadow(0 0 6px #10b981)' }}
                               label={<AnimatedReferenceLabel labelText={`TARGET [${formatNumber(profTgt.targetPrice)}]`} fill="#10b981" dy={-10} />}
                            />
                          )}
                       </ScatterChart>
                    </ResponsiveContainer>
                 </div>
              </Card>

              {/* Data Table */}
              <Card sectionColor="#a1a1aa">
                 <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-black/20">
                    <SectionHeader icon={Layers} title="Order Breakdown" color="text-zinc-400" />
                    <button onClick={handleExportCSV} className="group relative px-4 py-2 bg-zinc-900 hover:bg-zinc-800 rounded text-xs font-bold text-zinc-300 transition-all overflow-hidden border border-zinc-800 hover:border-zinc-600">
                       <div className="absolute inset-0 w-full h-full bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_2s_infinite] opacity-0 group-hover:opacity-100"></div>
                       <div className="flex items-center gap-2 relative z-10">
                          <Download className="w-3.5 h-3.5 group-hover:text-cyan-400 transition-colors"/> 
                          <span className="group-hover:text-white transition-colors">EXPORT DATA</span>
                       </div>
                    </button>
                 </div>
                 <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                    <table className="w-full text-xs text-left border-collapse min-w-[800px]">
                       <thead className="text-zinc-500 font-bold uppercase tracking-wider sticky top-0 z-20 bg-zinc-950 shadow-lg">
                          <tr>
                             <th className="px-4 py-3 border-b border-zinc-800">Type</th>
                             <th className="px-4 py-3 text-right border-b border-zinc-800">Price</th>
                             <th className="px-4 py-3 text-right border-b border-zinc-800">Dist</th>
                             <th className="px-4 py-3 text-right border-b border-zinc-800">Lot</th>
                             <th className="px-4 py-3 text-right border-b border-zinc-800">Indiv PnL</th>
                             <th className="px-4 py-3 text-right border-b border-zinc-800">Cumul PnL</th>
                             <th className="px-4 py-3 text-right border-b border-zinc-800">Target PnL</th>
                             <th className="px-4 py-3 text-right border-b border-zinc-800">Net Lot</th>
                             <th className="px-4 py-3 text-right border-b border-zinc-800">Net Price</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-zinc-800/30 text-zinc-400">
                          {simResult.positions.map((p, idx) => {
                             const prevP = idx > 0 ? simResult.positions[idx-1] : null;
                             const isProfitStart = p.cumPnL >= 0 && (!prevP || prevP.cumPnL < 0);
                             const isTargetReached = targetPnL > 0 && p.cumPnL >= targetPnL && (!prevP || prevP.cumPnL < targetPnL);
                             const isHedge = p.type === 'HEDGE';

                             const projectedPnL = (() => {
                                if (!profTgt.targetPrice) return 0;
                                const dirMult = direction === 'LONG' ? 1 : -1;
                                const finalDir = p.type === 'HEDGE' ? -dirMult : dirMult;
                                return (profTgt.targetPrice - p.price) * finalDir * p.lot * contractSize;
                             })();
                             
                             return (
                             <tr key={p.id} className={`hover:bg-white/[0.02] transition-colors group relative ${
                                isHedge ? 'bg-amber-500/[0.02]' : 
                                isTargetReached ? 'bg-cyan-500/[0.05]' :
                                isProfitStart ? 'bg-emerald-500/[0.02]' : ''
                             }`}>
                                <td className="px-4 py-2.5 relative">
                                   {/* Row Highlight Line */}
                                   <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-transparent group-hover:bg-[var(--theme-color)] transition-colors"></div>
                                   
                                   {/* Status Indicators */}
                                   {isProfitStart && (
                                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] z-10"></div>
                                   )}
                                   {isTargetReached && (
                                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)] z-10 animate-pulse"></div>
                                   )}
                                   {isHedge && (
                                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] z-10"></div>
                                   )}

                                   <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border flex w-fit items-center gap-1.5 ${
                                         p.type==='HEDGE' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' :
                                         p.type==='DYN' ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' :
                                         p.type==='ENTRY' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                                         'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                      }`}>
                                         <span className={`w-1 h-1 rounded-full ${
                                            p.type==='HEDGE' ? 'bg-amber-500' :
                                            p.type==='DYN' ? 'bg-purple-500' :
                                            p.type==='ENTRY' ? 'bg-emerald-500' :
                                            'bg-blue-500'
                                         }`}></span>
                                         {p.type==='MAIN'?p.level:p.type==='ENTRY'?'ENTRY':p.level}
                                      </span>

                                      {/* Inline Badges */}
                                      {isProfitStart && <span className="text-[9px] font-bold text-emerald-500 px-1.5 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20 animate-pulse">BE</span>}
                                      {isTargetReached && <span className="text-[9px] font-bold text-cyan-400 px-1.5 py-0.5 bg-cyan-500/10 rounded border border-cyan-500/20 shadow-[0_0_10px_rgba(34,211,238,0.3)] animate-pulse">TAKE PROFIT</span>}
                                   </div>
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono text-zinc-300 group-hover:text-white transition-colors">{formatNumber(p.price)}</td>
                                <td className="px-4 py-2.5 text-right font-mono text-zinc-500">{formatNumber(p.dist)}</td>
                                <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{formatNumber(p.lot)}</td>
                                <td className={`px-4 py-2.5 text-right font-mono font-bold ${p.indivPnL<0?'text-rose-400':'text-emerald-400'}`}>{formatCurrency(p.indivPnL)}</td>
                                <td className={`px-4 py-2.5 text-right font-mono font-bold ${p.cumPnL<0?'text-rose-400':'text-emerald-400'} ${isProfitStart ? 'text-glow' : ''}`}>{formatCurrency(p.cumPnL)}</td>
                                <td className={`px-4 py-2.5 text-right font-mono font-bold ${projectedPnL<0?'text-rose-400':'text-emerald-400'}`}>{formatCurrency(projectedPnL)}</td>
                                <td className="px-4 py-2.5 text-right font-mono text-zinc-500">{formatNumber(p.totalLot)}</td>
                                <td className="px-4 py-2.5 text-right font-mono text-blue-400 group-hover:text-blue-300 transition-colors">{formatNumber(p.avgPrice)}</td>
                             </tr>
                          )})}
                       </tbody>
                       <tfoot className="bg-zinc-950/90 sticky bottom-0 backdrop-blur-sm z-20 border-t border-zinc-700 font-bold text-zinc-300 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
                          <tr>
                             <td className="px-4 py-3 text-[10px] uppercase tracking-wider text-zinc-500">TOTAL SUMMARY</td>
                             <td className="px-4 py-3 text-right">-</td>
                             <td className="px-4 py-3 text-right">-</td>
                             <td className="px-4 py-3 text-right text-indigo-400 font-mono text-sm">{formatNumber(simResult.positions.reduce((acc, p) => acc + p.lot, 0))}</td>
                             <td className={`px-4 py-3 text-right font-mono text-sm ${simResult.summary.pnl<0?'text-rose-400':'text-emerald-400 text-glow'}`}>{formatCurrency(simResult.summary.pnl)}</td>
                             <td className="px-4 py-3 text-right">-</td>
                             <td className={`px-4 py-3 text-right font-mono text-sm ${profTgt.profit<0?'text-rose-400':'text-emerald-400 text-glow'}`}>{formatCurrency(profTgt.profit)}</td>
                             <td className="px-4 py-3 text-right text-indigo-400 font-mono text-sm">{formatNumber(simResult.summary.netLot)}</td>
                             <td className="px-4 py-3 text-right text-blue-400 font-mono text-sm">{formatNumber(simResult.summary.netAvgPrice)}</td>
                          </tr>
                       </tfoot>
                    </table>
                 </div>
              </Card>

           </div>
        </div>
      </main>
    </div>
  );
};

export default App;
