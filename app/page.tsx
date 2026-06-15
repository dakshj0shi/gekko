"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import type { DelegationRecord } from "./lib/smartAccount";

/* ── Helpers ── */
function esc(str: any): string {
  if (str == null) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function renderMarkdown(md: string): string {
  const escaped = esc(md);
  return escaped.split("\n\n").map(block => {
    block = block.trim();
    if (!block) return "";
    if (/^-{3,}$|^\*{3,}$/.test(block)) return "<hr class='border-white/5 my-5'>";
    if (/^#{1,3}\s/.test(block)) {
      const m = block.match(/^(#{1,3})\s+(.*)/);
      if (!m) return `<p>${inlineMd(block)}</p>`;
      const lvl = m[1].length;
      const sizes = ["text-xl","text-lg","text-base"];
      return `<h${lvl} class="${sizes[lvl-1]} font-bold text-white/90 mt-6 mb-2">${inlineMd(m[2])}</h${lvl}>`;
    }
    if (/^[*\-]\s/.test(block)) {
      const items = block.split("\n").map(l => l.replace(/^\s*[*\-]\s+/, ""));
      return "<ul class='list-disc pl-5 my-2 space-y-1'>" + items.map(i => `<li>${inlineMd(i)}</li>`).join("") + "</ul>";
    }
    if (/^\d+\.\s/.test(block)) {
      const items = block.split("\n").map(l => l.replace(/^\s*\d+\.\s+/, ""));
      return "<ol class='list-decimal pl-5 my-2 space-y-1'>" + items.map(i => `<li>${inlineMd(i)}</li>`).join("") + "</ol>";
    }
    return `<p class="my-2">${inlineMd(block)}</p>`;
  }).join("\n");
}
function inlineMd(s: string): string {
  return s
    .replace(/`([^`]+)`/g,'<code class="bg-white/5 px-1.5 py-0.5 rounded text-white/80 font-mono text-xs">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong class="text-white/90">$1</strong>')
    .replace(/\*([^*]+)\*/g,"<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,text,url) => {
      const safe = /^https?:\/\//.test(url) ? url : '#';
      return `<a href="${safe}" target="_blank" rel="noopener" class="text-emerald-400/80 underline decoration-emerald-400/30 hover:text-emerald-300">${text}</a>`;
    })
    .replace(/\n/g,"<br>");
}
function agentColor(name: string): string {
  if (!name) return "#555";
  const n = name.toLowerCase();
  if (n.includes("orch")) return "#4a7a49";
  if (n.includes("res") || n.includes("source") || n.includes("forecast")) return "#3d7a5a";
  if (n.includes("val") || n.includes("debat")) return "#52735a";
  if (n.includes("wri") || n.includes("summar")) return "#6b8a5a";
  if (n.includes("analys")) return "#4a6a7a";
  if (n.includes("bull")) return "#d97706";
  if (n.includes("bear")) return "#dc2626";
  if (n.includes("judge")) return "#7c3aed";
  return "#7a6a3a";
}
function agentBadgeStyle(name: string): React.CSSProperties {
  const color = agentColor(name);
  return { backgroundColor: color + "18", color, border: `1px solid ${color}30` };
}
function fmtUsdc(v: any): string {
  const n = parseFloat(v?.usdc_balance ?? v ?? "0");
  if (isNaN(n)) return "—";
  return "$" + n.toFixed(4);
}
function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return `${Math.floor(diff/1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  return `${Math.floor(diff/3600000)}h ago`;
}
function tryParseInvestmentJson(text: string): any | null {
  if (!text) return null;
  try { const p = JSON.parse(text); if (p.opportunities || p.summary) return p; } catch {}
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]+?)\n?```/);
  if (fenced) { try { const p = JSON.parse(fenced[1]); if (p.opportunities || p.summary) return p; } catch {} }
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start !== -1 && end > start) { try { const p = JSON.parse(text.slice(start,end+1)); if (p.opportunities||p.summary) return p; } catch {} }
  return null;
}
function fmtElapsed(s: number): string {
  const m = Math.floor(s/60), sec = s%60;
  return `${m}:${sec.toString().padStart(2,"0")}`;
}

/* ── Types ── */
type Screen = "mission" | "live" | "results";
type NodeStatus = "idle" | "active" | "done" | "dead" | "debating";

interface AgentEvent {
  timestamp: string; agent: string; action: string; type?: string;
  amount?: number; price?: number; error?: string; sessionId?: string;
  goal?: string; balance?: number; tasksCompleted?: number; totalSpent?: number;
  txId?: string; txHash?: string; reasoning?: string; capability?: string;
  candidates?: { name: string; price: number; score?: number }[];
  nodeId?: string; parentNodeId?: string; agentName?: string; depth?: number;
  argument?: string; confidence?: number; consensus?: string; verdict?: string;
  reason?: string; missionId?: string; factCount?: number;
}
interface Service {
  serviceName: string; description: string; capabilities: string[];
  agentName: string; price: number; walletAddress?: string;
  reputation?: number; tier?: string;
}
interface Escrow {
  sessionId: string; status: string; amount: number;
  buyerAgent: string; sellerAgent: string; txId?: string; txHash?: string;
}
interface Transaction {
  _agent: string; to_address?: string; amount_usdc: number;
  status: string; tx_hash?: string; created_at: string;
}
interface ReasonEntry {
  agent: string; action: string; reasoning?: string; goal?: string;
  candidates?: { name: string; price: number }[];
}
interface OnChainPayment {
  state: "idle"|"executing"|"polling"|"confirmed"|"failed";
  taskId?: string; txHash?: string; error?: string;
}
interface GraphNode {
  id: string; label: string; shortLabel: string;
  x: number; y: number; role: string; parentId: string | null;
}

/* ── Agent Graph definitions ── */
const BASE_NODES: GraphNode[] = [
  { id:"orch",       label:"GekkoOrchestrator", shortLabel:"Orch",     x:360, y:55,  role:"orchestrator", parentId:null },
  { id:"researcher", label:"GekkoResearcher",   shortLabel:"Research", x:145, y:195, role:"researcher",   parentId:"orch" },
  { id:"validator",  label:"GekkoValidator",    shortLabel:"Validate", x:360, y:195, role:"validator",    parentId:"orch" },
  { id:"writer",     label:"GekkoWriter",       shortLabel:"Write",    x:575, y:195, role:"writer",       parentId:"orch" },
];
const DEBATE_NODES: GraphNode[] = [
  { id:"bull",  label:"GekkoBull",  shortLabel:"Bull",  x:245, y:325, role:"bull",  parentId:"orch" },
  { id:"bear",  label:"GekkoBear",  shortLabel:"Bear",  x:475, y:325, role:"bear",  parentId:"orch" },
  { id:"judge", label:"GekkoJudge", shortLabel:"Judge", x:360, y:430, role:"judge", parentId:"bull" },
];
const SUPERVISOR_NODE: GraphNode = { id:"supervisor", label:"GekkoSupervisor", shortLabel:"Super", x:575, y:430, role:"supervisor", parentId:"writer" };
const SUB_POSITIONS = [
  {x:60,y:320},{x:185,y:320},{x:60,y:395},{x:185,y:395},
];

function nodeRoleColor(role: string): string {
  if (role==="orchestrator") return "#4a7a49";
  if (role==="researcher")   return "#3d7a5a";
  if (role==="validator")    return "#52735a";
  if (role==="writer")       return "#6b8a5a";
  if (role==="bull")         return "#d97706";
  if (role==="bear")         return "#dc2626";
  if (role==="judge")        return "#7c3aed";
  if (role==="supervisor")   return "#7c3aed";
  return "#7a6a3a";
}
function agentToNodeId(name: string): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("orch"))                                        return "orch";
  if (n.includes("supervisor"))                                  return "supervisor";
  if (n.includes("researcher") || n.includes("sourcer"))        return "researcher";
  if (n.includes("valid") || n.includes("debater"))             return "validator";
  if (n.includes("writ") || n.includes("summar") || n.includes("analyst")) return "writer";
  if (n.includes("bull"))  return "bull";
  if (n.includes("bear"))  return "bear";
  if (n.includes("judge")) return "judge";
  return null;
}

/* ── AgentGraph SVG ── */
function AgentGraph({ nodeStatuses, dynamicNodes, showDebate, showSupervisor }: {
  nodeStatuses: Record<string,NodeStatus>;
  dynamicNodes: GraphNode[];
  showDebate: boolean;
  showSupervisor: boolean;
}) {
  const allNodes = [...BASE_NODES, ...(showDebate ? DEBATE_NODES : []), ...(showSupervisor ? [SUPERVISOR_NODE] : []), ...dynamicNodes];
  const nodeMap = new Map(allNodes.map(n=>[n.id,n]));

  const edges: {x1:number;y1:number;x2:number;y2:number;ekey:string;toId:string}[] = [];
  for (const node of allNodes) {
    if (!node.parentId) continue;
    const parent = nodeMap.get(node.parentId);
    if (!parent) continue;
    edges.push({x1:parent.x,y1:parent.y,x2:node.x,y2:node.y,ekey:`${node.parentId}-${node.id}`,toId:node.id});
  }
  if (showDebate) {
    const bear = nodeMap.get("bear"), judge = nodeMap.get("judge");
    if (bear && judge) edges.push({x1:bear.x,y1:bear.y,x2:judge.x,y2:judge.y,ekey:"bear-judge",toId:"judge"});
  }

  const getStatus = (id: string): NodeStatus => nodeStatuses[id] || "idle";

  return (
    <svg viewBox="0 0 720 470" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Edges */}
      {edges.map(e => {
        const st = getStatus(e.toId);
        const active = st !== "idle";
        return (
          <line key={e.ekey} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={active ? "#4a7a4955" : "#ffffff0d"}
            strokeWidth={active ? 1.5 : 1}
            strokeDasharray={active ? undefined : "5 5"}
          />
        );
      })}

      {/* Nodes */}
      {allNodes.map(node => {
        const status = getStatus(node.id);
        const isSub = node.id.startsWith("sub-");
        const r = isSub ? 20 : 30;
        const rc = nodeRoleColor(node.role);
        const sc = status==="done"     ? "#10b981"
                 : status==="active"   ? "#f59e0b"
                 : status==="dead"     ? "#ef4444"
                 : status==="debating" ? "#60a5fa"
                 : rc;
        const fill = sc + (status==="idle" ? "0c" : "22");
        const stroke = sc + (status==="idle" ? "28" : "80");

        return (
          <g key={node.id} transform={`translate(${node.x},${node.y})`}>
            {status==="active" && (
              <circle r={r} fill="none" stroke={sc} strokeWidth={1} opacity={0.4}>
                <animate attributeName="r" values={`${r+2};${r+14};${r+2}`} dur="1.8s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.5;0;0.5" dur="1.8s" repeatCount="indefinite"/>
              </circle>
            )}
            <circle r={r} fill={fill} stroke={stroke} strokeWidth={1.5}
              filter={status==="active" ? "url(#glow)" : undefined}/>
            {status==="dead" && <>
              <line x1={-9} y1={-9} x2={9} y2={9} stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round"/>
              <line x1={9} y1={-9} x2={-9} y2={9} stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round"/>
            </>}
            <text x={0} y={5} textAnchor="middle" fontSize={isSub?8:10} fontFamily="monospace"
              fill={status==="idle" ? sc+"50" : sc}>
              {node.shortLabel}
            </text>
            <text x={0} y={r+14} textAnchor="middle" fontSize={8} fontFamily="monospace"
              fill={status==="idle" ? "#ffffff18" : "#ffffff45"}>
              {status==="idle" ? node.role : status}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Constants ── */
const HIDDEN_ACTIONS = new Set([
  "escrow_failed","escrow_fallback","escrow_creating",
  "synthesis_provider_failed","payment_pending_approval",
]);
const STEP_LABELS = [
  "Verify smart account balance","Discover agents from registry",
  "Lock funds — ERC-7710 delegation check","Worker verifies delegation caveats",
  "Researcher searches via Venice AI (x402)","Release payment — 1Shot USDC relay",
  "Validator fact-checks via Venice reasoning","Writer synthesizes report via Venice AI",
  "Final payment settled on Base Sepolia",
];
const STEP_BADGES = [
  "smart account","marketplace","ERC-7710","ERC-7715",
  "x402 ERC-7710","USDC transfer","Venice reasoning","Venice AI","Base L2",
];

/* ── Wallet Status Pill ── top-level so React never remounts it on parent re-render */
interface WalletPillProps {
  userAddress: string | null;
  connectWallet: () => void;
  smartAccountDeployed: boolean | null;
  deployingSmartAccount: boolean;
  deploySmartAccountHandler: () => void;
  delegationSigned: boolean;
  signingDelegation: boolean;
  signDelegation: () => void;
}
function WalletPill({ userAddress, connectWallet, smartAccountDeployed, deployingSmartAccount, deploySmartAccountHandler, delegationSigned, signingDelegation, signDelegation }: WalletPillProps) {
  if (!userAddress) return (
    <button onClick={connectWallet} className="text-xs px-3 py-1.5 rounded bg-[#4a7a49]/20 border border-[#4a7a49]/30 text-[#4a7a49] hover:bg-[#4a7a49]/30 transition-colors">
      Connect Wallet
    </button>
  );
  if (smartAccountDeployed === false) return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-white/30">{userAddress.slice(0,6)}…{userAddress.slice(-4)}</span>
      <button onClick={deploySmartAccountHandler} disabled={deployingSmartAccount}
        className="text-xs px-3 py-1.5 rounded bg-amber-900/30 border border-amber-600/30 text-amber-400 hover:bg-amber-900/50 transition-colors animate-pulse disabled:opacity-50 disabled:animate-none">
        {deployingSmartAccount ? "Deploying…" : "Deploy Smart Account"}
      </button>
    </div>
  );
  if (!delegationSigned) return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-white/30">{userAddress.slice(0,6)}…{userAddress.slice(-4)}</span>
      <button onClick={signDelegation} disabled={signingDelegation}
        className="text-xs px-3 py-1.5 rounded bg-[#3d7a5a]/20 border border-[#3d7a5a]/30 text-[#3d7a5a] hover:bg-[#3d7a5a]/30 transition-colors animate-pulse disabled:opacity-50 disabled:animate-none">
        {signingDelegation ? "Signing…" : "Sign Delegation"}
      </button>
    </div>
  );
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]"/>
      <span className="text-emerald-400">Delegation Active</span>
      <span className="text-white/30">{userAddress.slice(0,6)}…{userAddress.slice(-4)}</span>
    </div>
  );
}

/* ── Main Page ── */
export default function Page() { return <ErrorBoundary><Home /></ErrorBoundary>; }

function Home() {
  /* Screen */
  const [screen, setScreen] = useState<Screen>("mission");

  /* Data */
  const [timeline, setTimeline]     = useState<AgentEvent[]>([]);
  const [services, setServices]     = useState<Service[]>([]);
  const [escrows, setEscrows]       = useState<Escrow[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reasoning, setReasoning]   = useState<ReasonEntry[]>([]);
  const [balances, setBalances]     = useState<Record<string,any>>({});
  const [walletNames, setWalletNames] = useState<Record<string,string>>({});

  /* Goal form */
  const [goal, setGoal]             = useState("");
  const [budget, setBudget]         = useState(1.0);
  const [maxPerTask, setMaxPerTask] = useState(0.25);
  const [mode, setMode]             = useState<"research"|"investment">("research");
  const [running, setRunning]       = useState(false);
  const [cooldown, setCooldown]     = useState(0);

  /* Pipeline */
  const [steps, setSteps]           = useState<string[]>(Array(9).fill("waiting"));
  const [totalSpent, setTotalSpent] = useState(0);
  const [taskCount, setTaskCount]   = useState(0);

  /* Report */
  const [report, setReport]         = useState("");
  const [investmentData, setInvestmentData] = useState<any>(null);
  const [reportHistory, setReportHistory] = useState<{goal:string;report:string;timestamp:string;spent:number;mode:string}[]>([]);

  /* UI */
  const [activeTab, setActiveTab]   = useState("report");
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  const [statusLine, setStatusLine] = useState("");
  const [hasRun, setHasRun]         = useState(false);

  /* MetaMask */
  const [userAddress, setUserAddress]             = useState<string|null>(null);
  const [signingDelegation, setSigningDelegation] = useState(false);
  const [signedDelegation, setSignedDelegation]   = useState<DelegationRecord|null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string|null>(null);
  const [smartAccountDeployed, setSmartAccountDeployed] = useState<boolean|null>(null);
  const [deployingSmartAccount, setDeployingSmartAccount] = useState(false);

  /* 1Shot */
  const [onChainPayment, setOnChainPayment] = useState<OnChainPayment>({state:"idle"});

  /* Graph */
  const [nodeStatuses, setNodeStatuses] = useState<Record<string,NodeStatus>>({});
  const [dynamicNodes, setDynamicNodes] = useState<GraphNode[]>([]);
  const [showDebate, setShowDebate]         = useState(false);
  const [showSupervisor, setShowSupervisor] = useState(false);

  /* Mission meta */
  const [missionStart, setMissionStart] = useState(0);
  const [elapsed, setElapsed]           = useState(0);
  const [currentGoal, setCurrentGoal]   = useState("");
  const [agentsUsed, setAgentsUsed]     = useState<Set<string>>(new Set());
  const [missionMemory, setMissionMemory] = useState<{facts:any[];debateOutputs:any[];deathNotes:any[]}>({facts:[],debateOutputs:[],deathNotes:[]});
  const [debateResult, setDebateResult] = useState<AgentEvent|null>(null);
  const [supervisorVerdict, setSupervisorVerdict] = useState<any>(null);
  const [autoPayPending, setAutoPayPending] = useState(false);

  // Ref so SSE closure and auto-pay effect can always see current delegation
  const signedDelegationRef = useRef<DelegationRecord|null>(null);

  const tlRef = useRef<HTMLDivElement>(null);

  // Keep signedDelegationRef in sync so auto-pay effect can read latest value
  useEffect(() => { signedDelegationRef.current = signedDelegation; }, [signedDelegation]);

  /* ── Data loaders ── */
  const loadBalances   = useCallback(async () => { try { const r=await fetch("/api/balances");    if(!r.ok)return; const d=await r.json(); setBalances(d.balances||{}); } catch {} }, []);
  const loadServices   = useCallback(async () => { try { const r=await fetch("/api/registry");    if(!r.ok)return; const d=await r.json(); setServices(d.services||[]); } catch {} }, []);
  const loadEscrows    = useCallback(async () => { try { const r=await fetch("/api/escrows");     if(!r.ok)return; const d=await r.json(); setEscrows(d.escrows||[]); } catch {} }, []);
  const loadTransactions=useCallback(async () => { try { const r=await fetch("/api/transactions");if(!r.ok)return; const d=await r.json(); setTransactions(d.transactions||[]); } catch {} }, []);
  const loadReasoning  = useCallback(async () => { try { const r=await fetch("/api/reasoning");   if(!r.ok)return; const d=await r.json(); setReasoning(d.reasoning||[]); } catch {} }, []);

  /* Wallet names */
  useEffect(() => {
    (async()=>{
      try {
        const r=await fetch("/api/agents"); if(!r.ok)return; const d=await r.json();
        const names:Record<string,string>={};
        d.agents.forEach((a:any)=>{ if(a.wallet){ names[a.wallet.toLowerCase()]=a.name||a.role; names["_role_"+a.role]=a.wallet.toLowerCase(); }});
        setWalletNames(names);
      } catch {}
    })();
  }, []);

  /* Timer */
  useEffect(()=>{
    if (screen!=="live") return;
    const iv=setInterval(()=>setElapsed(Math.floor((Date.now()-missionStart)/1000)),1000);
    return ()=>clearInterval(iv);
  },[screen,missionStart]);

  /* Auto on-chain payment when mission completes with active delegation */
  useEffect(() => {
    if (!autoPayPending) return;
    setAutoPayPending(false);
    const delegation = signedDelegationRef.current;
    if (!delegation) return;
    // Small delay so results screen is rendered first
    setTimeout(() => executeOnChain(), 1200);
  }, [autoPayPending]);

  /* Graph helper */
  function setNodeStatus(id:string, status:NodeStatus) {
    setNodeStatuses(prev=>({...prev,[id]:status}));
  }

  /* Graph update from SSE */
  function updateGraph(ev: AgentEvent) {
    const a = ev.action;
    const nodeId = ev.agent ? agentToNodeId(ev.agent) : null;

    if (a==="balance_verified")    setNodeStatus("orch","active");
    if (a==="subtasks_planned")    setNodeStatus("orch","done");
    if (a==="agent_discovered" && nodeId) setNodeStatus(nodeId,"active");
    if (a==="research_started")   { setNodeStatus(nodeId||"researcher","active"); }
    if (a==="research_completed") { setNodeStatus(nodeId||"researcher","done"); }
    if (a==="validation_completed") setNodeStatus("validator","done");
    if (a==="synthesis_completed")  setNodeStatus("writer","active");
    if (a==="goal_completed") {
      setNodeStatus("writer","done");
      setNodeStatus("orch","done");
    }

    // Spawn tree
    if (a==="spawn_root") setNodeStatus("orch","active");
    if (a==="spawn_started") {
      const knownId = ev.agentName ? agentToNodeId(ev.agentName) : null;
      if (!knownId && ev.nodeId) {
        setDynamicNodes(prev=>{
          if (prev.some(n=>n.id===`sub-${ev.nodeId}`)) return prev;
          const idx = prev.length;
          if (idx>=SUB_POSITIONS.length) return prev;
          const pos = SUB_POSITIONS[idx];
          return [...prev,{
            id:`sub-${ev.nodeId}`,
            label: ev.agentName||`Sub-${idx+1}`,
            shortLabel:`S${idx+1}`,
            x:pos.x, y:pos.y,
            role:"researcher",
            parentId:"researcher",
          }];
        });
        if (ev.nodeId) setNodeStatus(`sub-${ev.nodeId}`,"active");
      }
    }
    if (a==="spawn_completed" && ev.nodeId) setNodeStatus(`sub-${ev.nodeId}`,"done");
    if (a==="spawn_died"      && ev.nodeId) setNodeStatus(`sub-${ev.nodeId}`,"dead");

    // Debate
    if (a==="debate_started") {
      setShowDebate(true);
      setNodeStatus("bull","active");
      setNodeStatus("bear","active");
    }
    if (a==="bull_thinking")  setNodeStatus("bull","active");
    if (a==="bull_argument")  setNodeStatus("bull","done");
    if (a==="bull_failed")    setNodeStatus("bull","dead");
    if (a==="bear_thinking")  setNodeStatus("bear","active");
    if (a==="bear_argument")  setNodeStatus("bear","done");
    if (a==="bear_failed")    setNodeStatus("bear","dead");
    if (a==="judge_thinking") setNodeStatus("judge","active");
    if (a==="judge_verdict")  setNodeStatus("judge","done");
    if (a==="judge_failed")   setNodeStatus("judge","dead");
    if (a==="debate_completed") {
      setNodeStatus("bull","done");
      setNodeStatus("bear","done");
      setNodeStatus("judge","done");
    }

    // Death
    if (a==="agent_died"        && nodeId) setNodeStatus(nodeId,"dead");
    if (a==="agent_resurrected" && nodeId) setNodeStatus(nodeId,"idle");

    // Supervisor
    if (a==="supervisor_checking") { setShowSupervisor(true); setNodeStatus("supervisor","active"); }
    if (a==="supervisor_verdict")  { setNodeStatus("supervisor","done"); }
    if (a==="supervisor_failed")   { setNodeStatus("supervisor","dead"); }
  }

  /* SSE */
  useEffect(()=>{
    const sse = new EventSource("/api/events/stream");
    sse.onmessage = (e)=>{
      try {
        const ev:AgentEvent = JSON.parse(e.data);
        if (ev.action==="connected") return;
        if (!HIDDEN_ACTIONS.has(ev.action)) setTimeline(prev=>[...prev.slice(-200),ev]);

        if (ev.type==="escrow"||ev.action==="checkout_confirmed"||ev.action==="escrow_released"||ev.action==="payment_confirmed") {
          loadEscrows(); loadTransactions();
        }
        if (ev.action?.includes("payment")||ev.action==="goal_completed") loadBalances();
        if (ev.action==="goal_completed") { loadReasoning(); setScreen("results"); setRunning(false); setAutoPayPending(true); }

        updateStepper(ev);

        if (ev.agent) {
          setActiveAgents(prev=>{const n=new Set(prev);n.add(ev.agent);return n;});
          setTimeout(()=>setActiveAgents(prev=>{const n=new Set(prev);n.delete(ev.agent);return n;}),3000);
          setAgentsUsed(prev=>new Set([...prev,ev.agent]));
        }
        if (ev.action==="goal_received") setStatusLine("Mission in progress...");
        if (ev.action==="goal_completed") setStatusLine(`Done — $${ev.totalSpent?.toFixed(4)||"?"} USDC spent`);
        if (ev.totalSpent!==undefined) setTotalSpent(ev.totalSpent);
        if (ev.tasksCompleted!==undefined) setTaskCount(ev.tasksCompleted);

        updateGraph(ev);

        // Memory accumulation
        if (ev.action==="memory_fact_added") {
          setMissionMemory(p=>({...p,facts:[...p.facts,{content:ev.reasoning,agent:ev.agent,ts:ev.timestamp}]}));
        }
        if (ev.action==="debate_completed"||ev.action==="judge_verdict") {
          setDebateResult(ev);
          setMissionMemory(p=>({...p,debateOutputs:[...p.debateOutputs,ev]}));
        }
        if (ev.action==="death_note_created"||ev.action==="agent_died") {
          setMissionMemory(p=>({...p,deathNotes:[...p.deathNotes,{agent:ev.agent,reason:ev.reason||ev.reasoning,ts:ev.timestamp}]}));
        }
        if (ev.action==="supervisor_verdict") {
          setSupervisorVerdict(ev);
        }
      } catch {}
    };
    return ()=>sse.close();
  },[]);

  useEffect(()=>{ if(tlRef.current) tlRef.current.scrollTop=0; },[timeline]);

  /* Initial load */
  useEffect(()=>{
    loadBalances(); loadServices(); loadEscrows(); loadTransactions();
    const b=setInterval(loadBalances,30000);
    const t=setInterval(loadTransactions,60000);
    return ()=>{ clearInterval(b); clearInterval(t); };
  },[]);

  /* Poll 1Shot */
  useEffect(()=>{
    if (onChainPayment.state!=="polling"||!onChainPayment.taskId) return;
    const iv=setInterval(async()=>{
      try {
        const r=await fetch(`/api/task-status?id=${onChainPayment.taskId}`);
        const d=await r.json();
        if (d.txHash) {
          setOnChainPayment(p=>({...p,state:"confirmed",txHash:d.txHash}));
          setSteps(prev=>{const s=[...prev];s[8]="done";return s;});
          clearInterval(iv);
        } else if (["failed","rejected","reverted"].includes(d.status)) {
          setOnChainPayment(p=>({...p,state:"failed",error:`1Shot: ${d.status}`}));
          clearInterval(iv);
        }
      } catch {}
    },3000);
    return ()=>clearInterval(iv);
  },[onChainPayment.state,onChainPayment.taskId]);

  /* Stepper */
  function updateStepper(ev:AgentEvent) {
    const a=ev.action;
    setSteps(prev=>{
      const s=[...prev];
      const set=(n:number,state:string)=>{ if(s[n]!=="done"||state==="done") s[n]=state; };
      if (a==="balance_verified")                                    set(0,"done");
      if (a==="marketplace_bids")                                    set(1,"active");
      if (a==="agent_discovered"||a==="subtasks_planned")          { set(1,"done"); set(2,"active"); }
      if (a==="escrow_created")                                    { set(2,"done"); set(3,"active"); }
      if (a==="escrow_verified")                                   { set(3,"done"); set(4,"active"); }
      if (a==="venice_search_completed"||a==="research_completed") { set(4,"done"); set(5,"active"); }
      if (a==="escrow_released")                                   { set(5,"done"); set(6,"active"); }
      if (a==="validation_completed")                              { set(6,"done"); set(7,"active"); }
      if (a==="synthesis_completed")                               { set(7,"done"); set(8,"active"); }
      if (a==="goal_completed")                                    { set(8,"done"); s.fill("done"); }
      if (a==="task_failed"||a==="payment_failed")                 { const i=s.findIndex(x=>x==="active"); if(i>=0)set(i,"error"); }
      return s;
    });
  }

  /* MetaMask */
  async function connectWallet() {
    const eth=(window as any).ethereum;
    if (!eth) { alert("MetaMask not found."); return; }
    try {
      const accounts=await eth.request({method:"eth_requestAccounts"});
      const owner=accounts[0]; setUserAddress(owner);
      try {
        const {getSmartAccountAddress}=await import("./lib/smartAccount");
        const sa=await getSmartAccountAddress(owner); setSmartAccountAddress(sa);
        const rpcRes=await fetch("https://sepolia.base.org",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",method:"eth_getCode",params:[sa,"latest"],id:1})});
        const rpcData=await rpcRes.json();
        setSmartAccountDeployed(!!(rpcData?.result&&rpcData.result!=="0x"));
      } catch {}
    } catch(err:any){ console.error("Connect failed:",err); }
  }
  async function deploySmartAccountHandler() {
    const eth=(window as any).ethereum;
    if (!eth||!userAddress) { alert("Connect wallet first."); return; }
    setDeployingSmartAccount(true);
    try {
      const {deploySmartAccount}=await import("./lib/smartAccount");
      const sa=await deploySmartAccount(eth,userAddress);
      setSmartAccountAddress(sa); setSmartAccountDeployed(true);
    } catch(err:any){ alert(`Deploy failed: ${err?.message??err}`); }
    finally{ setDeployingSmartAccount(false); }
  }
  async function signDelegation() {
    const eth=(window as any).ethereum;
    if (!eth||!userAddress) { alert("Connect wallet first."); return; }
    setSigningDelegation(true);
    try {
      const {signDelegationForOneShot,getSmartAccountAddress}=await import("./lib/smartAccount");
      try { const sa=await getSmartAccountAddress(userAddress); setSmartAccountAddress(sa); } catch {}
      const budgetMicro=BigInt(Math.floor(budget*1_000_000));
      const delegation=await signDelegationForOneShot(eth,userAddress,budgetMicro);
      setSignedDelegation(delegation);
    } catch(err:any){ alert(`Delegation failed: ${err?.message??err}`); }
    finally{ setSigningDelegation(false); }
  }

  /* Goal execution */
  async function runGoal() {
    if (!goal.trim()||running) return;
    setRunning(true);
    setCurrentGoal(goal);
    setMissionStart(Date.now()); setElapsed(0);
    setScreen("live");
    setSteps(Array(9).fill("waiting"));
    setSteps(prev=>{const s=[...prev];s[0]="active";return s;});
    setReport(""); setInvestmentData(null); setStatusLine("Launching mission...");
    setHasRun(true); setOnChainPayment({state:"idle"});
    setNodeStatuses({}); setDynamicNodes([]); setShowDebate(false); setShowSupervisor(false);
    setAgentsUsed(new Set()); setMissionMemory({facts:[],debateOutputs:[],deathNotes:[]});
    setDebateResult(null); setSupervisorVerdict(null); setAutoPayPending(false); setTotalSpent(0); setTaskCount(0);
    try {
      const res=await fetch("/api/goal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({goal,budget,maxPerTask,signedDelegation,mode})});
      const data=await res.json();
      if (data.report) {
        const reportText=data.report?.report||data.report;
        const reportStr=typeof reportText==="string"?reportText:JSON.stringify(reportText,null,2);
        setReport(reportStr);
        if (mode==="investment") { const p=tryParseInvestmentJson(reportStr); if(p) setInvestmentData(p); }
        setReportHistory(prev=>[{goal,report:reportStr,timestamp:new Date().toISOString(),spent:data.audit?.summary?.totalSpent||0,mode},...prev.slice(0,9)]);
      }
      await loadEscrows(); await loadTransactions(); await loadBalances(); await loadReasoning();
    } catch {}
    setRunning(false);
    setCooldown(15);
    const cd=setInterval(()=>setCooldown(p=>{if(p<=1){clearInterval(cd);return 0;}return p-1;}),1000);
  }

  async function executeOnChain() {
    if (!signedDelegation) { alert("Sign a delegation first."); return; }
    setOnChainPayment({state:"executing"});
    try {
      const res=await fetch("/api/execute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({signedDelegation})});
      const data=await res.json();
      if (!res.ok) throw new Error(data.error||"Execute failed");
      if (data.txHash&&data.confirmed) {
        setOnChainPayment({state:"confirmed",taskId:data.taskId,txHash:data.txHash});
        setSteps(prev=>{const s=[...prev];s[8]="done";return s;});
      } else {
        setOnChainPayment({state:"polling",taskId:data.taskId});
      }
    } catch(err:any){ setOnChainPayment({state:"failed",error:err?.message??"Unknown error"}); }
  }

  const delegationSigned = !!signedDelegation;

  /* ── RENDER ── */
  return (
    <div className="h-screen bg-[#080808] text-white/80 flex flex-col font-mono text-sm overflow-hidden">

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-white/6 bg-black/90 backdrop-blur-sm shrink-0 z-50">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gekko-logo.png" alt="Gekko" className="h-9 w-9 object-contain" style={{filter:"drop-shadow(0 0 8px #4a7a4990)"}}/>
          <div>
            <span className="text-white font-bold text-base tracking-tight">GEKKO</span>
            <span className="text-white/15 mx-2">·</span>
            <span className="text-white/35 text-xs">Autonomous AI Agent Marketplace</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {screen!=="mission" && (
            <button onClick={()=>{setScreen("mission");setGoal("");setCooldown(0);}}
              className="text-[11px] px-3 py-1 rounded border border-white/10 text-white/40 hover:text-white/70 transition-colors">
              ← New Mission
            </button>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded border border-emerald-800/50 text-emerald-500/70 bg-emerald-950/30">Base Sepolia</span>
          <span className="text-[10px] px-2 py-0.5 rounded border border-white/8 text-white/25 hidden md:inline">ERC-7710 · 1Shot · x402 · Venice AI</span>
          <WalletPill
            userAddress={userAddress}
            connectWallet={connectWallet}
            smartAccountDeployed={smartAccountDeployed}
            deployingSmartAccount={deployingSmartAccount}
            deploySmartAccountHandler={deploySmartAccountHandler}
            delegationSigned={delegationSigned}
            signingDelegation={signingDelegation}
            signDelegation={signDelegation}
          />
        </div>
      </header>

      {/* ══════════════ SCREEN 1: MISSION ══════════════ */}
      {screen==="mission" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
          <div className="w-full max-w-2xl space-y-5">

            {/* Title */}
            <div className="text-center mb-8">
              <p className="text-white/20 text-xs uppercase tracking-widest mb-2">Agent Network · {services.length} agents registered</p>
              <h1 className="text-2xl font-bold text-white/90">What should the agents research?</h1>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-2">
              {([{key:"research",label:"Research",icon:"◎"},{key:"investment",label:"Investment Analysis",icon:"◈"}] as const).map(m=>(
                <button key={m.key} onClick={()=>setMode(m.key)}
                  className="flex items-center gap-1.5 text-[11px] px-4 py-2 rounded-lg uppercase tracking-wider transition-all"
                  style={{
                    background:mode===m.key?(m.key==="investment"?"#7a6a3a20":"#4a7a4920"):"transparent",
                    border:mode===m.key?(m.key==="investment"?"1px solid #7a6a3a50":"1px solid #4a7a4940"):"1px solid #ffffff10",
                    color:mode===m.key?(m.key==="investment"?"#d4a820":"#4a7a49"):"#444",
                  }}>
                  <span>{m.icon}</span>{m.label}
                </button>
              ))}
            </div>

            {/* Goal input */}
            <div className="rounded-xl border border-white/10 bg-white/2 p-4">
              <textarea
                value={goal} onChange={e=>setGoal(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey))runGoal();}}
                placeholder={mode==="investment"?"e.g. Find the best USDC yield opportunities on Base Sepolia testnet":"e.g. Analyze the current DeFi landscape on Base network"}
                disabled={running} rows={3}
                className="w-full bg-transparent text-white/80 placeholder:text-white/20 text-sm resize-none outline-none border-0"/>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/6">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-white/30">Budget</span>
                  <input type="number" value={budget} onChange={e=>setBudget(+e.target.value)} min={0.01} max={1} step={0.01}
                    className="w-16 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white/70 outline-none"/>
                  <span className="text-[10px] text-white/30">USDC</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-white/30">Per task</span>
                  <input type="number" value={maxPerTask} onChange={e=>setMaxPerTask(+e.target.value)} min={0.01} max={0.25} step={0.01}
                    className="w-16 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white/70 outline-none"/>
                  <span className="text-[10px] text-white/30">USDC</span>
                </div>
                <button onClick={runGoal} disabled={running||!goal.trim()||cooldown>0}
                  className="ml-auto px-6 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                  style={{
                    background:(running||cooldown>0)?"#1a1a1a":mode==="investment"?"linear-gradient(90deg,#7a6a3a,#b08a20)":"linear-gradient(90deg,#4a7a49,#3d7a5a)",
                    color:"#fff",border:mode==="investment"?"1px solid #7a6a3a40":"1px solid #4a7a4930",
                  }}>
                  {running?"Running…":cooldown>0?`Wait ${cooldown}s`:mode==="investment"?"ANALYZE →":"LAUNCH MISSION →"}
                </button>
              </div>
              {cooldown>0&&(
                <div className="h-0.5 bg-white/5 rounded mt-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{width:`${(cooldown/15)*100}%`,background:mode==="investment"?"#b08a2060":"#4a7a4960"}}/>
                </div>
              )}
            </div>

            {/* Wallet status card */}
            {!delegationSigned && (
              <div className="rounded-xl border border-white/8 bg-white/1 p-4">
                <p className="text-[10px] uppercase tracking-widest text-white/20 mb-3">Wallet Setup</p>
                <div className="flex items-center gap-3">
                  {[
                    {step:1,label:"Connect MetaMask",done:!!userAddress,active:!userAddress},
                    {step:2,label:"Deploy Smart Account",done:smartAccountDeployed===true,active:!!userAddress&&smartAccountDeployed===false},
                    {step:3,label:"Sign ERC-7710 Delegation",done:delegationSigned,active:smartAccountDeployed===true&&!delegationSigned},
                  ].map(s=>(
                    <div key={s.step} className="flex items-center gap-2 flex-1">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
                        style={{
                          background:s.done?"#10b98120":s.active?"#f59e0b15":"#ffffff08",
                          border:`1px solid ${s.done?"#10b981":s.active?"#f59e0b":"#ffffff12"}`,
                          color:s.done?"#10b981":s.active?"#f59e0b":"#555",
                        }}>
                        {s.done?"✓":s.step}
                      </div>
                      <span className="text-[10px]" style={{color:s.done?"#aaa":s.active?"#ddd":"#444"}}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active delegation status */}
            {delegationSigned && (
              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/15 px-4 py-3 flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]"/>
                <div className="flex-1">
                  <p className="text-[11px] text-emerald-400">ERC-7710 Delegation Active</p>
                  <p className="text-[9px] text-white/25 font-mono mt-0.5">{signedDelegation?.delegator.slice(0,10)}… → 1Shot relayer · Base Sepolia · FunctionCall · 24h cap</p>
                </div>
                <span className="text-[8px] px-1.5 py-0.5 rounded border border-emerald-800/30 text-emerald-500/60">gasless</span>
              </div>
            )}

            {/* Recent missions */}
            {reportHistory.length>0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/20 mb-2">Recent Missions</p>
                <div className="space-y-1">
                  {reportHistory.slice(0,3).map((h,i)=>(
                    <button key={i} onClick={()=>{setReport(h.report);if(h.mode==="investment")setInvestmentData(tryParseInvestmentJson(h.report));else setInvestmentData(null);setCurrentGoal(h.goal);setScreen("results");}}
                      className="w-full flex items-center gap-3 text-left rounded-lg border border-white/6 bg-white/1 px-3 py-2 hover:bg-white/3 transition-colors">
                      <span className="text-[10px]">{h.mode==="investment"?"◈":"◎"}</span>
                      <span className="flex-1 text-[11px] text-white/50 truncate">{h.goal}</span>
                      <span className="text-[10px] text-emerald-400/60">${h.spent.toFixed(3)}</span>
                      <span className="text-[9px] text-white/20">{new Date(h.timestamp).toLocaleTimeString()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ SCREEN 2: LIVE ══════════════ */}
      {screen==="live" && (
        <div className="flex-1 flex overflow-hidden">

          {/* Left: Agent Graph */}
          <div className="flex flex-col border-r border-white/6" style={{width:"60%"}}>
            {/* Mission bar */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/6 bg-black/40 shrink-0">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_#ef4444]"/>
              <span className="text-[10px] text-white/50 uppercase tracking-wider">LIVE</span>
              <span className="flex-1 text-xs text-white/70 truncate font-medium">{currentGoal||"Mission in progress…"}</span>
              <div className="flex items-center gap-3 text-[10px] text-white/30 shrink-0">
                <span className="font-mono text-white/50">{fmtElapsed(elapsed)}</span>
                <span>${budget.toFixed(2)} budget</span>
                {totalSpent>0&&<span className="text-emerald-400">${totalSpent.toFixed(4)} spent</span>}
              </div>
            </div>

            {/* SVG graph */}
            <div className="flex-1 flex items-center justify-center p-4 min-h-0">
              <AgentGraph nodeStatuses={nodeStatuses} dynamicNodes={dynamicNodes} showDebate={showDebate} showSupervisor={showSupervisor}/>
            </div>

            {/* Pipeline stepper strip */}
            <div className="border-t border-white/5 px-4 py-3 shrink-0 bg-black/30">
              <div className="flex gap-1.5 flex-wrap">
                {STEP_LABELS.map((label,i)=>{
                  const st=steps[i];
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-[9px]" style={{opacity:st==="waiting"?0.3:1}}>
                      <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background:st==="done"?"#10b98120":st==="active"?"#f59e0b15":st==="error"?"#ef444420":"#ffffff08",
                          border:`1px solid ${st==="done"?"#10b981":st==="active"?"#f59e0b":st==="error"?"#ef4444":"#ffffff12"}`,
                          color:st==="done"?"#10b981":st==="active"?"#f59e0b":st==="error"?"#ef4444":"#555",
                          fontSize:7,
                        }}>
                        {st==="done"?"✓":st==="error"?"✗":i+1}
                      </div>
                      <span className="hidden lg:inline" style={{color:st==="active"?"#ccc":st==="done"?"#666":"#333"}}>{STEP_BADGES[i]}</span>
                      {i<STEP_LABELS.length-1&&<span className="text-white/10 hidden lg:inline">›</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Live Feed */}
          <div className="flex flex-col" style={{width:"40%"}}>
            <div className="px-3 pt-3 pb-2 border-b border-white/5 flex items-center gap-2 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-white/20">Live Feed</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
              <span className="ml-auto text-[10px] text-white/20">{timeline.length} events</span>
            </div>
            <div ref={tlRef} className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {timeline.length===0 && (
                <p className="text-[10px] text-white/15 p-2 italic">Waiting for events…</p>
              )}
              {[...timeline].reverse().map((ev,i)=>{
                if (ev.action==="marketplace_bids"&&ev.candidates?.length) return (
                  <div key={i} className="px-2 py-2 rounded-lg border border-amber-900/30 bg-amber-950/10">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[9px] text-amber-400/70 font-medium">Marketplace Auction</span>
                      <span className="text-[8px] text-white/20 ml-auto">{ev.capability}</span>
                    </div>
                    <div className="space-y-0.5">
                      {ev.candidates.map((c,j)=>(
                        <div key={j} className="flex items-center justify-between">
                          <span className={`text-[9px] ${j===0?"text-emerald-400":"text-white/25 line-through"}`}>{c.name.replace("Gekko","")}</span>
                          <div className="flex items-center gap-2">
                            {c.score!==undefined&&<span className="text-[8px] text-amber-400/60">score:{c.score.toFixed(2)}</span>}
                            <span className={`text-[9px] font-mono ${j===0?"text-emerald-400":"text-white/15"}`}>${c.price}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[8px] text-emerald-500/60 mt-1">↑ highest score wins</p>
                  </div>
                );
                if (ev.action==="debate_started"||ev.action==="bull_argument"||ev.action==="bear_argument"||ev.action==="judge_verdict"||ev.action==="debate_completed") return (
                  <div key={i} className="px-2 py-2 rounded-lg border border-blue-900/30 bg-blue-950/10">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] px-1 rounded" style={{background:"#1d4ed820",color:"#60a5fa",border:"1px solid #1d4ed830"}}>{ev.agent?.replace("Gekko","")}</span>
                      <span className="text-[9px] text-blue-400/60">{ev.action.replace(/_/g," ")}</span>
                      <span className="text-[9px] text-white/20 ml-auto">{relTime(ev.timestamp)}</span>
                    </div>
                    {ev.reasoning&&<p className="text-[9px] text-white/50 line-clamp-2">{ev.reasoning}</p>}
                    {ev.confidence!==undefined&&<p className="text-[9px] text-blue-400/60 mt-0.5">confidence: {(ev.confidence*100).toFixed(0)}%</p>}
                  </div>
                );
                if (ev.action==="agent_died") return (
                  <div key={i} className="px-2 py-1.5 rounded-lg border border-red-900/30 bg-red-950/10">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] px-1 rounded" style={{background:"#7f1d1d20",color:"#f87171",border:"1px solid #7f1d1d30"}}>{ev.agent?.replace("Gekko","")}</span>
                      <span className="text-[9px] text-red-400/60">died · 30s quarantine</span>
                    </div>
                    {ev.reason&&<p className="text-[9px] text-white/30 mt-0.5 truncate">{ev.reason}</p>}
                  </div>
                );
                if (ev.action==="spawn_started") return (
                  <div key={i} className="px-2 py-1.5 rounded-lg border border-white/6 bg-white/1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] text-white/30">↳ spawn</span>
                      <span className="text-[9px]" style={{color:agentColor(ev.agentName||ev.agent)}}>{(ev.agentName||ev.agent)?.replace("Gekko","")}</span>
                      {ev.depth!==undefined&&<span className="text-[8px] text-white/20 ml-auto">depth:{ev.depth}</span>}
                    </div>
                  </div>
                );
                return (
                  <div key={i} className="px-2 py-1.5 rounded-lg border border-white/4 bg-white/1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[9px] px-1 rounded" style={agentBadgeStyle(ev.agent)}>{ev.agent?.replace("Gekko","")}</span>
                      <span className="text-[9px] text-white/20 ml-auto">{relTime(ev.timestamp)}</span>
                    </div>
                    <p className="text-[10px] text-white/50 truncate">{ev.action.replace(/_/g," ")}</p>
                    {ev.amount!==undefined&&<p className="text-[10px] text-emerald-400">${Number(ev.amount).toFixed(4)} USDC</p>}
                    {ev.reasoning&&<p className="text-[9px] text-white/30 truncate mt-0.5">{ev.reasoning}</p>}
                  </div>
                );
              })}
            </div>

            {/* On-chain payment status (auto-triggered) */}
            {onChainPayment.state!=="idle"&&(
              <div className="border-t border-white/5 p-3 shrink-0">
                {onChainPayment.state==="executing"&&<p className="text-[11px] text-amber-400 animate-pulse text-center">⛓ Paying agents on-chain via 1Shot…</p>}
                {onChainPayment.state==="polling"&&<p className="text-[11px] text-amber-400 animate-pulse text-center">⛓ Waiting for confirmation…</p>}
                {onChainPayment.state==="confirmed"&&onChainPayment.txHash&&(
                  <a href={`https://sepolia.basescan.org/tx/${onChainPayment.txHash}`} target="_blank" rel="noopener"
                    className="block text-[10px] text-emerald-400 text-center underline">
                    ✓ Agents paid on Base Sepolia ↗
                  </a>
                )}
                {onChainPayment.state==="failed"&&(
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-red-400/60 flex-1 truncate">{onChainPayment.error}</p>
                    <button onClick={()=>{setOnChainPayment({state:"idle"});executeOnChain();}} className="text-[10px] text-white/40 hover:text-white/70">retry</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ SCREEN 3: RESULTS ══════════════ */}
      {screen==="results" && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Results header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/6 bg-emerald-950/10 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]"/>
            <span className="text-emerald-400 text-sm font-medium">Mission Complete</span>
            <span className="text-white/30 text-xs truncate flex-1">{currentGoal}</span>
            <span className="text-[11px] text-white/30">${totalSpent.toFixed(4)} USDC · {taskCount} tasks</span>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/6 shrink-0">
            {["report","memory","payments","agents"].map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className="px-5 py-2.5 text-[11px] uppercase tracking-wider transition-colors relative"
                style={{color:activeTab===tab?"#ccc":"#555"}}>
                {tab}
                {activeTab===tab&&<span className="absolute bottom-0 left-0 right-0 h-px bg-[#4a7a49]"/>}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto">

            {/* REPORT */}
            {activeTab==="report" && (
              <div className="h-full flex flex-col">
                {reportHistory.length>1&&(
                  <div className="flex gap-1 px-3 pt-2 pb-1 border-b border-white/5 shrink-0 overflow-x-auto">
                    {reportHistory.map((h,i)=>(
                      <button key={i} onClick={()=>{setReport(h.report);setCurrentGoal(h.goal);if(h.mode==="investment")setInvestmentData(tryParseInvestmentJson(h.report));else setInvestmentData(null);}}
                        className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-white/40 hover:text-white/70 whitespace-nowrap shrink-0">
                        {h.mode==="investment"?"◈ ":"◎ "}{h.goal.slice(0,28)}…
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex-1 overflow-auto px-6 py-4 max-w-4xl mx-auto w-full">
                  {!report?(
                    <p className="text-white/20 text-xs italic">Report loading…</p>
                  ):investmentData?(
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-amber-400/70 border border-amber-800/30 rounded px-2 py-0.5">Investment Analysis</span>
                        <button onClick={()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([report],{type:"application/json"}));a.download="investment.json";a.click();}}
                          className="ml-auto text-[10px] px-2 py-0.5 rounded border border-white/10 text-white/40 hover:text-white/70">Download JSON</button>
                      </div>
                      {investmentData.summary&&<div className="rounded-lg border border-white/8 bg-white/1 p-3"><p className="text-[10px] text-white/30 uppercase mb-1">Summary</p><p className="text-xs text-white/65 leading-relaxed">{investmentData.summary}</p></div>}
                      {investmentData.opportunities?.length>0&&(
                        <div className="grid grid-cols-2 gap-2">
                          {investmentData.opportunities.map((opp:any,i:number)=>(
                            <div key={i} className="rounded-lg border border-white/8 bg-white/1 p-2.5">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-[11px] font-medium text-white/80">{opp.protocol}</p>
                                <span className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${opp.risk==="low"?"bg-emerald-950/40 text-emerald-400 border border-emerald-800/30":opp.risk==="medium"?"bg-amber-950/40 text-amber-400 border border-amber-800/30":"bg-red-950/40 text-red-400 border border-red-800/30"}`}>{opp.risk}</span>
                              </div>
                              <p className="text-[10px] text-white/40 mb-1.5">{opp.action}</p>
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] text-emerald-400 font-mono">{opp.estimatedAPY}</span>
                                <span className="text-[10px] text-white/30">{opp.allocation}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {investmentData.riskScore!==undefined&&(
                        <div className="rounded-lg border border-white/8 bg-white/1 p-3 flex items-center gap-4">
                          <div className="shrink-0"><p className="text-[9px] text-white/30 mb-1">Risk Score</p><p className="text-xl font-mono text-white/80">{investmentData.riskScore}<span className="text-xs text-white/25">/10</span></p></div>
                          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${(investmentData.riskScore/10)*100}%`,background:investmentData.riskScore<4?"#10b981":investmentData.riskScore<7?"#f59e0b":"#ef4444"}}/></div>
                          {investmentData.recommendation&&<p className="text-[10px] text-white/45 max-w-xs">{investmentData.recommendation}</p>}
                        </div>
                      )}
                    </div>
                  ):(
                    <>
                      <div className="flex justify-end mb-3">
                        <button onClick={()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([report],{type:"text/markdown"}));a.download="report.md";a.click();}}
                          className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-white/40 hover:text-white/70">Download .md</button>
                      </div>
                      <div className="text-white/70 text-xs leading-relaxed prose-invert" dangerouslySetInnerHTML={{__html:renderMarkdown(report)}}/>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* MEMORY */}
            {activeTab==="memory" && (
              <div className="p-5 space-y-5 max-w-4xl mx-auto">

                {/* Debate result */}
                {debateResult && (
                  <div className="rounded-xl border border-blue-900/30 bg-blue-950/10 p-4">
                    <p className="text-[10px] uppercase tracking-widest text-blue-400/60 mb-3">Agent Debate · Bull / Bear / Judge</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {label:"Bull",color:"#d97706",key:"bull"},
                        {label:"Bear",color:"#dc2626",key:"bear"},
                        {label:"Judge",color:"#7c3aed",key:"judge"},
                      ].map(({label,color,key})=>{
                        const nodeEv=missionMemory.debateOutputs.find(e=>e.agent?.toLowerCase().includes(key));
                        const st=nodeStatuses[key]||"idle";
                        return (
                          <div key={key} className="rounded-lg border p-3" style={{borderColor:color+"30",background:color+"0a"}}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px]" style={{background:color+"20",color,border:`1px solid ${color}40`}}>{label[0]}</div>
                              <span className="text-[10px] font-medium" style={{color}}>{label}</span>
                              <span className="text-[8px] ml-auto px-1 rounded" style={{background:color+"15",color:color+"cc"}}>{st}</span>
                            </div>
                            {nodeEv?.reasoning ? (
                              <p className="text-[10px] text-white/55 leading-relaxed line-clamp-4">{nodeEv.reasoning}</p>
                            ) : (
                              <p className="text-[10px] text-white/20 italic">{st==="idle"?"Not yet reached":"No output captured"}</p>
                            )}
                            {nodeEv?.confidence!==undefined&&<p className="text-[9px] mt-1" style={{color:color+"80"}}>confidence: {(nodeEv.confidence*100).toFixed(0)}%</p>}
                          </div>
                        );
                      })}
                    </div>
                    {debateResult.consensus&&(
                      <div className="mt-3 px-3 py-2 rounded-lg border border-white/8 bg-white/2">
                        <p className="text-[9px] text-white/30 uppercase mb-1">Consensus</p>
                        <p className="text-xs text-white/65">{debateResult.consensus}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Facts */}
                {missionMemory.facts.length>0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/20 mb-2">Mission Facts ({missionMemory.facts.length})</p>
                    <div className="space-y-1">
                      {missionMemory.facts.map((f,i)=>(
                        <div key={i} className="flex items-start gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-white/1">
                          <span className="text-[9px] text-emerald-500/40 mt-0.5 shrink-0">#{i+1}</span>
                          <p className="text-[10px] text-white/55 flex-1">{f.content}</p>
                          <span className="text-[9px] text-white/20 shrink-0">{f.agent?.replace("Gekko","")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Death notes */}
                {missionMemory.deathNotes.length>0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-red-400/40 mb-2">Agent Deaths ({missionMemory.deathNotes.length})</p>
                    <div className="space-y-1">
                      {missionMemory.deathNotes.map((d,i)=>(
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-900/20 bg-red-950/8">
                          <span className="text-[9px] text-red-400/60">✗</span>
                          <span className="text-[10px] text-white/40">{d.agent?.replace("Gekko","")}</span>
                          <span className="text-[9px] text-white/25 flex-1 truncate">{d.reason}</span>
                          <span className="text-[9px] text-white/15">{d.ts?relTime(d.ts):""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Supervisor verdict */}
                {supervisorVerdict && (
                  <div className={`rounded-xl border p-4 ${supervisorVerdict.approved!==false?"border-emerald-900/30 bg-emerald-950/10":"border-amber-900/30 bg-amber-950/10"}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px]"
                        style={{background:"#7c3aed20",color:"#a78bfa",border:"1px solid #7c3aed40"}}>S</div>
                      <div>
                        <p className="text-[11px] font-medium text-purple-400">GekkoSupervisor · Quality Audit</p>
                        <p className="text-[9px] text-white/25">Report reviewed against debate consensus + mission facts</p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-lg font-mono font-bold" style={{color:supervisorVerdict.quality>=7?"#10b981":supervisorVerdict.quality>=5?"#f59e0b":"#ef4444"}}>
                          {supervisorVerdict.quality?.toFixed(1)}<span className="text-xs text-white/25">/10</span>
                        </p>
                        <p className="text-[8px]" style={{color:supervisorVerdict.approved!==false?"#10b981":"#f59e0b"}}>
                          {supervisorVerdict.approved!==false?"✓ APPROVED":"⚠ FLAGGED"}
                        </p>
                      </div>
                    </div>
                    {supervisorVerdict.recommendation&&<p className="text-[11px] text-white/60 mb-2">{supervisorVerdict.recommendation}</p>}
                    {supervisorVerdict.contradictions?.length>0&&(
                      <div className="mb-2">
                        <p className="text-[9px] text-amber-400/60 uppercase mb-1">Contradictions</p>
                        {supervisorVerdict.contradictions.map((c:string,i:number)=>(
                          <p key={i} className="text-[9px] text-white/40">· {c}</p>
                        ))}
                      </div>
                    )}
                    {supervisorVerdict.gaps?.length>0&&(
                      <div className="mb-2">
                        <p className="text-[9px] text-white/30 uppercase mb-1">Gaps</p>
                        {supervisorVerdict.gaps.map((g:string,i:number)=>(
                          <p key={i} className="text-[9px] text-white/35">· {g}</p>
                        ))}
                      </div>
                    )}
                    {supervisorVerdict.strengths?.length>0&&(
                      <div>
                        <p className="text-[9px] text-emerald-400/40 uppercase mb-1">Strengths</p>
                        {supervisorVerdict.strengths.map((s:string,i:number)=>(
                          <p key={i} className="text-[9px] text-white/35">· {s}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {missionMemory.facts.length===0&&missionMemory.deathNotes.length===0&&!debateResult&&!supervisorVerdict&&(
                  <p className="text-white/20 text-xs italic">No mission memory captured yet.</p>
                )}
              </div>
            )}

            {/* PAYMENTS */}
            {activeTab==="payments" && (
              <div className="p-4 space-y-4">
                {onChainPayment.state!=="idle"&&(
                  <div className={`rounded-lg border px-4 py-3 ${onChainPayment.state==="confirmed"?"border-emerald-800/30 bg-emerald-950/15":"border-white/8 bg-white/1"}`}>
                    <p className="text-[10px] text-white/30 uppercase mb-1">1Shot On-Chain Settlement</p>
                    {onChainPayment.state==="executing"&&<p className="text-[11px] text-amber-400 animate-pulse">Submitting to 1Shot relayer…</p>}
                    {onChainPayment.state==="confirmed"&&onChainPayment.txHash&&(
                      <div>
                        <p className="text-[11px] text-emerald-400">✓ Agents paid on Base Sepolia via ERC-7710</p>
                        <a href={`https://sepolia.basescan.org/tx/${onChainPayment.txHash}`} target="_blank" rel="noopener"
                          className="text-[10px] font-mono text-emerald-400 underline">{onChainPayment.txHash.slice(0,16)}… ↗</a>
                      </div>
                    )}
                    {onChainPayment.state==="failed"&&<p className="text-[11px] text-red-400/70">{onChainPayment.error}</p>}
                  </div>
                )}
                {onChainPayment.state==="idle"&&hasRun&&(
                  <div className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/1 px-3 py-2">
                    {signedDelegation?(
                      <p className="text-[11px] text-white/40">ERC-7710 delegation active — on-chain payment will auto-trigger on next mission completion.</p>
                    ):(
                      <>
                        <p className="text-[11px] text-white/40 flex-1">Sign an ERC-7710 delegation to enable automatic gasless agent payments.</p>
                        <button onClick={executeOnChain}
                          className="px-4 py-1.5 rounded-lg text-xs font-medium"
                          style={{background:"linear-gradient(90deg,#3d7a5a,#4a7a49)",color:"#fff",border:"1px solid #4a7a4930"}}>
                          Pay Manually →
                        </button>
                      </>
                    )}
                  </div>
                )}
                {transactions.length>0&&(
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/20 mb-2">Transactions</p>
                    <table className="w-full text-[10px]">
                      <thead><tr className="border-b border-white/6 text-white/30"><th className="text-left py-1 pr-3">Agent</th><th className="text-left pr-3">Amount</th><th className="text-left pr-3">Status</th><th className="text-left">TxHash</th></tr></thead>
                      <tbody>
                        {transactions.map((tx,i)=>(
                          <tr key={i} className="border-b border-white/4 text-white/50">
                            <td className="py-1 pr-3" style={{color:agentColor("Gekko"+tx._agent)}}>{tx._agent}</td>
                            <td className="pr-3 text-emerald-400">${tx.amount_usdc?.toFixed(4)}</td>
                            <td className="pr-3"><span className="text-[9px] px-1 rounded" style={{background:"#10b98115",color:"#10b981"}}>{tx.status}</span></td>
                            <td>{tx.tx_hash?<a href={`https://sepolia.basescan.org/tx/${tx.tx_hash}`} target="_blank" rel="noopener" className="text-emerald-400 underline">{tx.tx_hash.slice(0,8)}…</a>:"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {escrows.length>0&&(
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/20 mb-2">Escrow Sessions</p>
                    <table className="w-full text-[10px]">
                      <thead><tr className="border-b border-white/6 text-white/30"><th className="text-left py-1 pr-3">Route</th><th className="text-left pr-3">Amount</th><th className="text-left">Status</th></tr></thead>
                      <tbody>
                        {escrows.map((e,i)=>(
                          <tr key={i} className="border-b border-white/4 text-white/50">
                            <td className="py-1 pr-3">{e.buyerAgent?.replace("Gekko","")} → {e.sellerAgent?.replace("Gekko","")}</td>
                            <td className="pr-3 text-emerald-400">${e.amount?.toFixed(4)}</td>
                            <td><span className="text-[9px] px-1 rounded" style={{background:e.status==="released"?"#f59e0b15":"#10b98115",color:e.status==="released"?"#f59e0b":"#10b981"}}>{e.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* AGENTS */}
            {activeTab==="agents" && (
              <div className="p-5 space-y-4">
                <p className="text-[10px] uppercase tracking-widest text-white/20">Agents Used This Mission</p>
                <div className="grid grid-cols-2 gap-2">
                  {[...agentsUsed].map(agentName=>{
                    const svc=services.find(s=>s.agentName===agentName);
                    const nodeId=agentToNodeId(agentName);
                    const status=nodeId?nodeStatuses[nodeId]:"idle";
                    const color=agentColor(agentName);
                    return (
                      <div key={agentName} className="rounded-lg border p-3" style={{borderColor:color+"25",background:color+"08"}}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                            style={{background:color+"20",color,border:`1px solid ${color}40`}}>
                            {agentName.replace("Gekko","")[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium truncate" style={{color}}>{agentName.replace("Gekko","")}</p>
                            {svc?.tier&&<p className="text-[8px] text-white/25">{svc.tier} · ${svc.price}/task</p>}
                          </div>
                          <span className="text-[8px] px-1.5 py-0.5 rounded border shrink-0" style={{
                            borderColor:status==="dead"?"#ef444430":status==="done"?"#10b98130":"#ffffff10",
                            color:status==="dead"?"#ef4444":status==="done"?"#10b981":"#888",
                          }}>{status}</span>
                        </div>
                        {svc&&(
                          <div className="flex flex-wrap gap-0.5">
                            {svc.capabilities?.slice(0,3).map((c,i)=>(
                              <span key={i} className="text-[7px] px-1 rounded" style={{background:color+"10",color:color+"90",border:`1px solid ${color}20`}}>{c}</span>
                            ))}
                          </div>
                        )}
                        {svc?.reputation!==undefined&&(
                          <div className="flex items-center gap-1.5 mt-2">
                            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{width:`${svc.reputation*100}%`,background:color+"80"}}/>
                            </div>
                            <span className="text-[8px] text-white/25">{(svc.reputation*100).toFixed(0)}% rep</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* All marketplace services */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/20 mb-2">All Registered Agents ({services.length})</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {services.map((s,i)=>{
                      const color=agentColor(s.agentName);
                      const used=agentsUsed.has(s.agentName);
                      return (
                        <div key={i} className="rounded-lg border bg-white/1 p-2" style={{borderColor:used?color+"30":"#ffffff0a"}}>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] font-medium truncate" style={{color:used?color:"#666"}}>{s.agentName.replace("Gekko","")}</p>
                            <span className="text-[9px] font-mono" style={{color:used?color:"#555"}}>${s.price}</span>
                          </div>
                          {s.tier&&<p className="text-[8px] text-white/20">{s.tier}</p>}
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {s.capabilities?.slice(0,2).map((c,j)=>(
                              <span key={j} className="text-[7px] px-1 rounded" style={{background:color+"10",color:color+"70",border:`1px solid ${color}18`}}>{c}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Error boundary ── */
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:string|null}> {
  constructor(props:{children:React.ReactNode}){super(props);this.state={error:null};}
  static getDerivedStateFromError(e:Error){return {error:e.message};}
  render(){
    if (this.state.error) return (
      <div className="min-h-screen bg-black text-white/60 flex items-center justify-center font-mono text-sm">
        <div className="text-center">
          <p className="text-emerald-400 mb-2">GEKKO</p>
          <p className="text-white/40 mb-1">Dashboard error</p>
          <p className="text-white/20 text-xs">{this.state.error}</p>
        </div>
      </div>
    );
    return this.props.children;
  }
}
