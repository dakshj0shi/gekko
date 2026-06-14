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
    .replace(/`([^`]+)`/g, '<code class="bg-white/5 px-1.5 py-0.5 rounded text-white/80 font-mono text-xs">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white/90">$1</strong>')
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      const safeUrl = /^https?:\/\//.test(url) ? url : '#';
      return `<a href="${safeUrl}" target="_blank" rel="noopener" class="text-[#4a7a49] underline decoration-[#4a7a49]/40 hover:text-[#6aaa69]">${text}</a>`;
    })
    .replace(/\n/g, "<br>");
}

function agentColor(name: string): string {
  if (!name) return "#555";
  const n = name.toLowerCase();
  if (n.includes("orch")) return "#4a7a49";
  if (n.includes("res")) return "#3d7a5a";
  if (n.includes("val")) return "#52735a";
  if (n.includes("wri")) return "#6b8a5a";
  return "#555";
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
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

/* ── Types ── */
interface AgentEvent { timestamp: string; agent: string; action: string; type?: string; amount?: number; provider?: string; endpoint?: string; query?: string; task?: string; serviceName?: string; price?: number; error?: string; sessionId?: string; goal?: string; balance?: number; count?: number; sellers?: string; seller?: string; canPay?: boolean; tasksCompleted?: number; totalSpent?: number; providers?: string[]; txId?: string; txHash?: string; reasoning?: string; }
interface Service { serviceName: string; description: string; capabilities: string[]; agentName: string; price: number; }
interface Escrow { sessionId: string; status: string; amount: number; buyerAgent: string; sellerAgent: string; description?: string; createdAt?: string; paidAt?: string; txId?: string; txHash?: string; }
interface Transaction { _agent: string; to_address?: string; from_address?: string; memo?: string; amount_usdc: number; status: string; tx_hash?: string; created_at: string; }
interface ReasonEntry { agent: string; action: string; reasoning?: string; goal?: string; task?: string; description?: string; amount?: number; }
interface Delegation { from: string; to: string; role: string; type: string; authority: string; caveats: any[]; signed: boolean; }

interface OnChainPayment {
  state: "idle" | "executing" | "polling" | "confirmed" | "failed";
  taskId?: string;
  txHash?: string;
  error?: string;
}

const HIDDEN_ACTIONS = new Set(["escrow_failed","escrow_fallback","escrow_creating","synthesis_provider_failed","payment_pending_approval"]);

const STEP_LABELS = [
  "Verify smart account balance",
  "Discover agents from registry",
  "Lock funds — ERC-7710 delegation check",
  "Worker verifies delegation caveats",
  "Researcher searches via Venice AI (x402)",
  "Release payment — 1Shot USDC relay",
  "Validator fact-checks via Venice reasoning",
  "Writer synthesizes report via Venice AI",
  "Final payment settled on Base mainnet",
];
const STEP_BADGES = ["smart account","marketplace","ERC-7710","ERC-7715","x402 ERC-7710","USDC transfer","Venice reasoning","Venice AI","Base L2"];

/* ── Main Page ── */
export default function Page() {
  return <ErrorBoundary><Home /></ErrorBoundary>;
}

function Home() {
  /* State */
  const [timeline, setTimeline] = useState<AgentEvent[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reasoning, setReasoning] = useState<ReasonEntry[]>([]);
  const [balances, setBalances] = useState<Record<string, any>>({});
  const [walletNames, setWalletNames] = useState<Record<string, string>>({});
  const [delegations, setDelegations] = useState<Delegation[]>([]);

  /* Goal form */
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState(1.0);
  const [maxPerTask, setMaxPerTask] = useState(0.25);
  const [running, setRunning] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  /* Pipeline */
  const [steps, setSteps] = useState<string[]>(Array(9).fill("waiting"));
  const [totalSpent, setTotalSpent] = useState(0);
  const [taskCount, setTaskCount] = useState(0);

  /* Report */
  const [report, setReport] = useState("");
  const [reportHistory, setReportHistory] = useState<{ goal: string; report: string; timestamp: string; spent: number }[]>([]);

  /* UI */
  const [activeTab, setActiveTab] = useState<string>("marketplace");
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  const [statusLine, setStatusLine] = useState("");
  const [hasRun, setHasRun] = useState(false);

  /* MetaMask + ERC-7710 delegation */
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [signingDelegation, setSigningDelegation] = useState(false);
  const [signedDelegation, setSignedDelegation] = useState<DelegationRecord | null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);

  /* 1Shot on-chain payment */
  const [onChainPayment, setOnChainPayment] = useState<OnChainPayment>({ state: "idle" });

  const tlRef = useRef<HTMLDivElement>(null);

  /* ── Data fetching ── */
  const loadBalances = useCallback(async () => {
    try { const r = await fetch("/api/balances"); if (!r.ok) return; const d = await r.json(); setBalances(d.balances || {}); } catch {}
  }, []);
  const loadServices = useCallback(async () => {
    try { const r = await fetch("/api/registry"); if (!r.ok) return; const d = await r.json(); setServices(d.services || []); } catch {}
  }, []);
  const loadEscrows = useCallback(async () => {
    try { const r = await fetch("/api/escrows"); if (!r.ok) return; const d = await r.json(); setEscrows(d.escrows || []); } catch {}
  }, []);
  const loadTransactions = useCallback(async () => {
    try { const r = await fetch("/api/transactions"); if (!r.ok) return; const d = await r.json(); setTransactions(d.transactions || []); } catch {}
  }, []);
  const loadReasoning = useCallback(async () => {
    try { const r = await fetch("/api/reasoning"); if (!r.ok) return; const d = await r.json(); setReasoning(d.reasoning || []); } catch {}
  }, []);
  const loadDelegations = useCallback(async () => {
    try { const r = await fetch("/api/delegations"); if (!r.ok) return; const d = await r.json(); setDelegations(d.delegations || []); } catch {}
  }, []);

  /* Wallet names */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/agents"); if (!r.ok) return; const d = await r.json();
        const names: Record<string, string> = {};
        d.agents.forEach((a: any) => { if (a.wallet) { names[a.wallet.toLowerCase()] = a.name || a.role; names["_role_" + a.role] = a.wallet.toLowerCase(); } });
        setWalletNames(names);
      } catch {}
    })();
  }, []);

  function walletLabel(addr: string): string {
    if (!addr) return "?";
    return walletNames[addr.toLowerCase()] || addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  /* SSE */
  useEffect(() => {
    const sse = new EventSource("/api/events/stream");
    sse.onmessage = (e) => {
      try {
        const ev: AgentEvent = JSON.parse(e.data);
        if (ev.action === "connected") return;
        if (!HIDDEN_ACTIONS.has(ev.action)) setTimeline(prev => [...prev.slice(-200), ev]);

        if (ev.type === "escrow" || ev.action === "checkout_confirmed" || ev.action === "escrow_released" || ev.action === "payment_confirmed") { loadEscrows(); loadTransactions(); }
        if (ev.action?.includes("payment") || ev.action === "goal_completed") loadBalances();
        if (ev.action === "goal_completed") { loadReasoning(); setActiveTab("report"); }

        updateStepper(ev);
        if (ev.agent) { setActiveAgents(prev => { const n = new Set(prev); n.add(ev.agent); return n; }); setTimeout(() => setActiveAgents(prev => { const n = new Set(prev); n.delete(ev.agent); return n; }), 3000); }
        if (ev.action === "goal_received") setStatusLine("Mission in progress...");
        if (ev.action === "goal_completed") setStatusLine(`Complete — $${ev.totalSpent?.toFixed(4) || "?"} USDC spent`);
        if (ev.totalSpent !== undefined) setTotalSpent(ev.totalSpent);
        if (ev.tasksCompleted !== undefined) setTaskCount(ev.tasksCompleted);
      } catch {}
    };
    return () => sse.close();
  }, []);

  useEffect(() => { if (tlRef.current) tlRef.current.scrollTop = tlRef.current.scrollHeight; }, [timeline]);

  /* Initial load */
  useEffect(() => {
    loadBalances(); loadServices(); loadEscrows(); loadTransactions(); loadDelegations();
    const b = setInterval(loadBalances, 30000);
    const t = setInterval(loadTransactions, 60000);
    return () => { clearInterval(b); clearInterval(t); };
  }, []);

  /* Poll 1Shot task status */
  useEffect(() => {
    if (onChainPayment.state !== "polling" || !onChainPayment.taskId) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/task-status?id=${onChainPayment.taskId}`);
        const d = await r.json();
        if (d.txHash) {
          setOnChainPayment(p => ({ ...p, state: "confirmed", txHash: d.txHash }));
          setSteps(prev => { const s = [...prev]; s[8] = "done"; return s; });
          clearInterval(iv);
        } else if (["failed","rejected","reverted"].includes(d.status)) {
          setOnChainPayment(p => ({ ...p, state: "failed", error: `1Shot status: ${d.status}` }));
          clearInterval(iv);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(iv);
  }, [onChainPayment.state, onChainPayment.taskId]);

  /* Stepper */
  function updateStepper(ev: AgentEvent) {
    const a = ev.action;
    setSteps(prev => {
      const s = [...prev];
      const set = (n: number, state: string) => { if (s[n] !== "done" || state === "done") s[n] = state; };
      if (a === "balance_verified") set(0, "done");
      if (a === "agent_discovered" || a === "subtasks_planned") { set(1, "done"); set(2, "active"); }
      if (a === "escrow_created") { set(2, "done"); set(3, "active"); }
      if (a === "escrow_verified") { set(3, "done"); set(4, "active"); }
      if (a === "venice_search_completed" || a === "research_completed") { set(4, "done"); set(5, "active"); }
      if (a === "escrow_released") { set(5, "done"); set(6, "active"); }
      if (a === "validation_completed") { set(6, "done"); set(7, "active"); }
      if (a === "synthesis_completed") { set(7, "done"); set(8, "active"); }
      if (a === "goal_completed") { set(8, "done"); s.fill("done"); }
      if (a === "task_failed" || a === "payment_failed") { const i = s.findIndex(x => x === "active"); if (i >= 0) set(i, "error"); }
      return s;
    });
  }

  /* ── MetaMask ── */
  async function connectWallet() {
    const eth = (window as any).ethereum;
    if (!eth) { alert("MetaMask not found. Please install MetaMask."); return; }
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      setUserAddress(accounts[0]);
    } catch (err: any) { console.error("Connect failed:", err); }
  }

  /**
   * Sign an ERC-7710 delegation from the user's MetaMask Smart Account to 1Shot.
   * MetaMask switches to Base mainnet, derives the smart account, and shows
   * an EIP-712 signing popup. The signed delegation is stored and passed to
   * every goal POST and to /api/execute for on-chain payment.
   */
  async function signDelegation() {
    const eth = (window as any).ethereum;
    if (!eth || !userAddress) { alert("Connect your wallet first."); return; }
    setSigningDelegation(true);
    try {
      const { signDelegationForOneShot, getSmartAccountAddress, ONESHOT_CHAIN_ID } = await import("./lib/smartAccount");

      // Derive smart account address for display (no signing yet)
      try {
        const sa = await getSmartAccountAddress(userAddress);
        setSmartAccountAddress(sa);
      } catch {}

      // Budget in micro-USDC (6 decimals): budget USDC + 0.01 fee
      const budgetMicro = BigInt(Math.floor(budget * 1_000_000));
      const delegation = await signDelegationForOneShot(eth, userAddress, budgetMicro);
      setSignedDelegation(delegation);
    } catch (err: any) {
      console.error("Delegation signing failed:", err);
      alert(`Delegation signing failed: ${err?.message ?? err}`);
    } finally {
      setSigningDelegation(false);
    }
  }

  /* ── Goal execution ── */
  async function runGoal() {
    if (!goal.trim() || running) return;
    setRunning(true);
    setSteps(Array(9).fill("waiting"));
    setSteps(prev => { const s = [...prev]; s[0] = "active"; return s; });
    setReport("");
    setStatusLine("Launching mission...");
    setHasRun(true);
    setActiveTab("report");
    setOnChainPayment({ state: "idle" });

    try {
      const res = await fetch("/api/goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, budget, maxPerTask, signedDelegation }),
      });
      const data = await res.json();
      if (data.report) {
        const reportText = data.report?.report || data.report;
        setReport(typeof reportText === "string" ? reportText : JSON.stringify(reportText));
        setReportHistory(prev => [{
          goal,
          report: typeof reportText === "string" ? reportText : JSON.stringify(reportText),
          timestamp: new Date().toISOString(),
          spent: data.audit?.summary?.totalSpent || 0,
        }, ...prev.slice(0, 9)]);
      }
      await loadEscrows(); await loadTransactions(); await loadBalances(); await loadReasoning(); await loadDelegations();
    } catch {}

    setRunning(false);
    setCooldown(15);
    const cd = setInterval(() => setCooldown(p => { if (p <= 1) { clearInterval(cd); return 0; } return p - 1; }), 1000);
  }

  /* ── 1Shot on-chain payment ── */
  async function executeOnChain() {
    if (!signedDelegation) { alert("Sign a delegation first."); return; }
    setOnChainPayment({ state: "executing" });
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedDelegation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execute failed");
      if (data.txHash && data.confirmed) {
        setOnChainPayment({ state: "confirmed", taskId: data.taskId, txHash: data.txHash });
        setSteps(prev => { const s = [...prev]; s[8] = "done"; return s; });
      } else {
        // Start polling
        setOnChainPayment({ state: "polling", taskId: data.taskId });
      }
    } catch (err: any) {
      setOnChainPayment({ state: "failed", error: err?.message ?? "Unknown error" });
    }
  }

  /* ── Render ── */
  const AGENT_DEFS = [
    { role: "orchestrator", label: "GekkoOrchestrator", sub: "Coordinator" },
    { role: "researcher", label: "GekkoResearcher", sub: "Worker · Merchant" },
    { role: "validator", label: "GekkoValidator", sub: "Quality Gate" },
    { role: "writer", label: "GekkoWriter", sub: "Worker · Merchant" },
  ];

  const TABS = ["report","marketplace","escrow","transactions","delegation","reasoning"];

  const delegationSigned = !!signedDelegation;

  return (
    <div className="min-h-screen bg-black text-white/80 flex flex-col font-mono text-sm">

      {/* ── Topbar ── */}
      <header className="flex items-center justify-between px-5 py-2 border-b border-white/6 bg-black/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gekko-logo.png" alt="Gekko" className="h-9 w-9 object-contain" style={{ filter: "drop-shadow(0 0 6px #4a7a4980)" }} />
          <span className="text-white font-bold text-base tracking-tight">GEKKO</span>
          <span className="text-white/20">·</span>
          <span className="text-white/40 text-xs">Autonomous AI · Smart Accounts · On-Chain</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded border border-[#4a7a49]/40 text-[#4a7a49]/80 bg-[#4a7a49]/5">Base</span>
          <span className="text-[10px] px-2 py-0.5 rounded border border-white/8 text-white/30">ERC-7710 · 1Shot · x402 · Venice AI</span>

          {!userAddress ? (
            <button onClick={connectWallet}
              className="text-xs px-3 py-1 rounded bg-[#4a7a49]/20 border border-[#4a7a49]/30 text-[#4a7a49] hover:bg-[#4a7a49]/30 transition-colors">
              Connect Wallet
            </button>
          ) : !delegationSigned ? (
            <button onClick={signDelegation} disabled={signingDelegation}
              className="text-xs px-3 py-1 rounded bg-[#3d7a5a]/20 border border-[#3d7a5a]/30 text-[#3d7a5a] hover:bg-[#3d7a5a]/30 transition-colors animate-pulse disabled:opacity-50 disabled:animate-none">
              {signingDelegation ? "Signing…" : "Sign Delegation"}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#4a7a49] shadow-[0_0_6px_#4a7a49]" />
              <span className="text-[#4a7a49]">Delegation Active</span>
              <span className="text-white/30">{userAddress.slice(0, 6)}…{userAddress.slice(-4)}</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Three-panel main area ── */}
      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 48px - 280px)" }}>

        {/* Left panel — Agent Roster + Delegation Chain */}
        <aside className="w-56 shrink-0 border-r border-white/6 flex flex-col overflow-y-auto bg-black">
          <div className="px-3 pt-3 pb-1">
            <p className="text-[10px] uppercase tracking-widest text-white/20 mb-2">Agent Roster</p>
            <div className="space-y-1">
              {AGENT_DEFS.map(ag => {
                const bal = balances[ag.role];
                const isActive = activeAgents.has("Gekko" + ag.label.replace("Gekko",""));
                const color = agentColor(ag.label);
                return (
                  <div key={ag.role}
                    className="flex items-center gap-2 px-2 py-1.5 rounded transition-all"
                    style={{ background: isActive ? color + "10" : "transparent", border: isActive ? `1px solid ${color}25` : "1px solid transparent" }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 transition-all"
                      style={{ background: isActive ? color : color + "50", boxShadow: isActive ? `0 0 5px ${color}` : "none" }} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium truncate" style={{ color: isActive ? color : color + "cc" }}>{ag.label.replace("Gekko","")}</p>
                      <p className="text-[9px] text-white/25">{fmtUsdc(bal)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-white/5 px-3 pt-2 pb-3 mt-1">
            <p className="text-[10px] uppercase tracking-widest text-white/20 mb-2">ERC-7710 Chain</p>
            {delegations.length === 0 ? (
              <p className="text-[10px] text-white/20 italic">Connect & sign to build</p>
            ) : (
              <div className="space-y-1">
                {delegations.map((d, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-white/15 text-[10px] mt-0.5">{i === 0 ? "└" : "  └"}</span>
                    <div>
                      <p className="text-[10px]" style={{ color: agentColor("Gekko" + d.role) }}>{d.role}</p>
                      <p className="text-[9px] text-white/20">{d.type}</p>
                    </div>
                    {d.signed && <span className="ml-auto text-[8px] text-[#4a7a49] mt-0.5">✓</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Signed delegation info */}
            {signedDelegation && (
              <div className="mt-2 pt-2 border-t border-white/5">
                <p className="text-[9px] text-[#4a7a49] mb-0.5">✓ 1Shot delegation signed</p>
                <p className="text-[8px] text-white/20 font-mono truncate">{signedDelegation.delegator.slice(0,10)}…</p>
                <p className="text-[8px] text-white/15">→ 1Shot relayer</p>
                <p className="text-[8px] text-white/15">Base mainnet</p>
              </div>
            )}
          </div>
        </aside>

        {/* Center panel — Command + Pipeline */}
        <main className="flex-1 flex flex-col overflow-y-auto px-5 py-4 gap-4 min-w-0">
          {/* Command input */}
          <div className="rounded border border-white/8 bg-white/2 p-4">
            <p className="text-[10px] uppercase tracking-widest text-white/20 mb-2">Mission Goal</p>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runGoal(); }}
              placeholder="What should the agent network research?"
              disabled={running}
              rows={3}
              className="w-full bg-transparent text-white/80 placeholder:text-white/20 text-sm resize-none outline-none focus:outline-none border-0"
            />
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/6">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-white/30">Budget</span>
                <input type="number" value={budget} onChange={e => setBudget(+e.target.value)} min={0.01} max={1} step={0.01} className="w-16 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white/70 outline-none" />
                <span className="text-[10px] text-white/30">USDC</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-white/30">Per task</span>
                <input type="number" value={maxPerTask} onChange={e => setMaxPerTask(+e.target.value)} min={0.01} max={0.25} step={0.01} className="w-16 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white/70 outline-none" />
                <span className="text-[10px] text-white/30">USDC</span>
              </div>
              <button
                onClick={runGoal}
                disabled={running || !goal.trim() || cooldown > 0}
                className="ml-auto px-5 py-1.5 rounded text-xs font-medium transition-all disabled:opacity-40"
                style={{ background: (running || cooldown > 0) ? "#1a1a1a" : "linear-gradient(90deg,#4a7a49,#3d7a5a)", color: "#fff", border: "1px solid #4a7a4930" }}
              >
                {running ? "Running…" : cooldown > 0 ? `Wait ${cooldown}s` : "LAUNCH MISSION →"}
              </button>
            </div>
            {cooldown > 0 && <div className="h-0.5 bg-white/5 rounded mt-2 overflow-hidden"><div className="h-full bg-[#4a7a49]/60 transition-all" style={{ width: `${(cooldown / 15) * 100}%` }} /></div>}
            {statusLine && <p className="text-[11px] text-[#4a7a49] mt-2">{statusLine}</p>}
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Budget", val: `$${budget.toFixed(2)}` },
              { label: "Spent", val: `$${totalSpent.toFixed(4)}` },
              { label: "Remaining", val: `$${Math.max(0, budget - totalSpent).toFixed(4)}` },
              { label: "Tasks", val: taskCount },
            ].map(s => (
              <div key={s.label} className="bg-white/2 border border-white/6 rounded px-3 py-2">
                <p className="text-[10px] text-white/30">{s.label}</p>
                <p className="text-sm font-mono text-white/80">{s.val}</p>
              </div>
            ))}
          </div>

          {/* 9-step pipeline stepper */}
          <div className="rounded border border-white/6 bg-white/1 p-4">
            <p className="text-[10px] uppercase tracking-widest text-white/20 mb-3">Pipeline</p>
            <div className="space-y-1">
              {STEP_LABELS.map((label, i) => {
                const state = steps[i];
                return (
                  <motion.div key={i} className="flex items-center gap-3"
                    initial={{ opacity: 0.4 }} animate={{ opacity: state === "waiting" ? 0.4 : 1 }} transition={{ duration: 0.3 }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold transition-all"
                      style={{
                        background: state === "done" ? "#4a7a49" : state === "active" ? "#4a7a4930" : state === "error" ? "#7a2a2a30" : "#ffffff08",
                        border: `1px solid ${state === "done" ? "#4a7a49" : state === "active" ? "#4a7a49" : state === "error" ? "#7a3a3a" : "#ffffff12"}`,
                        boxShadow: state === "active" ? "0 0 8px #4a7a4960" : "none",
                        color: state === "done" ? "#fff" : state === "active" ? "#4a7a49" : state === "error" ? "#aa5555" : "#555",
                      }}>
                      {state === "done" ? "✓" : state === "error" ? "✗" : i + 1}
                    </div>
                    <span className="flex-1 text-[11px] truncate" style={{ color: state === "done" ? "#aaa" : state === "active" ? "#ddd" : "#555" }}>{label}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded border shrink-0"
                      style={{ borderColor: state === "active" ? "#4a7a4940" : "#ffffff08", color: state === "active" ? "#4a7a49" : "#333", background: state === "active" ? "#4a7a4908" : "transparent" }}>
                      {STEP_BADGES[i]}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* 1Shot on-chain payment panel — shown after mission completes */}
          {hasRun && !running && (
            <div className="rounded border border-white/8 bg-white/1 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-widest text-white/20">On-Chain Settlement · 1Shot · Base</p>
                {onChainPayment.state === "confirmed" && (
                  <span className="text-[9px] px-2 py-0.5 rounded bg-[#4a7a49]/20 border border-[#4a7a49]/30 text-[#4a7a49]">Confirmed</span>
                )}
              </div>

              {onChainPayment.state === "idle" && (
                <div className="flex items-center gap-3">
                  <p className="text-[11px] text-white/40 flex-1">
                    {signedDelegation
                      ? "Pay agents on Base mainnet via ERC-7710 delegation — no ETH required."
                      : "Sign a delegation above to enable gasless on-chain payment."}
                  </p>
                  <button
                    onClick={executeOnChain}
                    disabled={!signedDelegation}
                    className="px-4 py-1.5 rounded text-xs font-medium transition-all disabled:opacity-30"
                    style={{ background: "linear-gradient(90deg,#3d7a5a,#4a7a49)", color: "#fff", border: "1px solid #4a7a4930" }}>
                    Pay Agents On-Chain →
                  </button>
                </div>
              )}

              {onChainPayment.state === "executing" && (
                <p className="text-[11px] text-[#4a7a49] animate-pulse">Submitting to 1Shot relayer…</p>
              )}

              {onChainPayment.state === "polling" && (
                <p className="text-[11px] text-[#4a7a49] animate-pulse">
                  Waiting for on-chain confirmation… task {onChainPayment.taskId?.slice(0, 8)}
                </p>
              )}

              {onChainPayment.state === "confirmed" && onChainPayment.txHash && (
                <div className="space-y-1">
                  <p className="text-[11px] text-[#4a7a49]">✓ Agents paid on Base mainnet via ERC-7710</p>
                  <a
                    href={`https://basescan.org/tx/${onChainPayment.txHash}`}
                    target="_blank"
                    rel="noopener"
                    className="text-[10px] font-mono text-[#4a7a49] underline decoration-[#4a7a49]/40 hover:text-[#6aaa69]">
                    {onChainPayment.txHash.slice(0, 12)}…{onChainPayment.txHash.slice(-8)} ↗ basescan
                  </a>
                </div>
              )}

              {onChainPayment.state === "failed" && (
                <div>
                  <p className="text-[11px] text-red-400/70">Payment failed: {onChainPayment.error}</p>
                  <button onClick={() => setOnChainPayment({ state: "idle" })}
                    className="text-[10px] text-white/30 hover:text-white/60 mt-1">retry</button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right panel — Live Feed */}
        <aside className="w-64 shrink-0 border-l border-white/6 flex flex-col bg-black overflow-hidden">
          <div className="px-3 pt-3 pb-1 border-b border-white/5 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-white/20">Live Feed</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#4a7a49] animate-pulse" />
            <span className="ml-auto text-[10px] text-white/20">{timeline.length}</span>
          </div>
          <div ref={tlRef} className="flex-1 overflow-y-auto p-2 space-y-1">
            {timeline.length === 0 && <p className="text-[10px] text-white/15 p-2 italic">Waiting for mission...</p>}
            {timeline.map((ev, i) => (
              <div key={i} className="px-2 py-1.5 rounded border border-white/4 bg-white/1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] px-1 rounded" style={agentBadgeStyle(ev.agent)}>{ev.agent?.replace("Gekko","")}</span>
                  <span className="text-[9px] text-white/20 ml-auto">{relTime(ev.timestamp)}</span>
                </div>
                <p className="text-[10px] text-white/50 truncate">{ev.action.replace(/_/g," ")}</p>
                {ev.amount !== undefined && <p className="text-[10px] text-[#4a7a49]">${Number(ev.amount).toFixed(4)} USDC</p>}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* ── Bottom tabbed panel ── */}
      <div className="border-t border-white/6 flex flex-col" style={{ height: "280px" }}>
        {/* Tab bar */}
        <div className="flex gap-0 border-b border-white/6 shrink-0">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-2 text-[11px] uppercase tracking-wider transition-colors relative"
              style={{ color: activeTab === tab ? "#ccc" : "#555", background: "transparent" }}>
              {tab}
              {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-px bg-[#4a7a49]" />}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto">
          {activeTab === "report" && (
            <div className="h-full flex flex-col">
              {reportHistory.length > 1 && (
                <div className="flex gap-1 px-3 pt-2 pb-1 border-b border-white/5 shrink-0 overflow-x-auto">
                  {reportHistory.map((h, i) => (
                    <button key={i} onClick={() => setReport(h.report)} className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-white/40 hover:text-white/70 whitespace-nowrap shrink-0">
                      {h.goal.slice(0, 30)}… (${h.spent.toFixed(3)})
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 overflow-auto px-4 py-3">
                {!report ? (
                  <p className="text-white/20 text-xs italic">Run a mission to see the report.</p>
                ) : (
                  <>
                    <div className="flex justify-end mb-2">
                      <button onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([report], { type: "text/markdown" })); a.download = "report.md"; a.click(); }}
                        className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-white/40 hover:text-white/70">Download .md</button>
                    </div>
                    <div className="text-white/70 text-xs leading-relaxed prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }} />
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === "marketplace" && (
            <div className="p-3 h-full overflow-auto">
              {services.length === 0 ? (
                <p className="text-white/20 text-xs italic">No services registered.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {services.map((s, i) => (
                    <div key={i} className="rounded border border-white/6 bg-white/1 p-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[11px] font-medium text-white/70">{s.serviceName}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#4a7a4920", color: "#4a7a49", border: "1px solid #4a7a4930" }}>${s.price}/task</span>
                      </div>
                      <p className="text-[9px] text-white/30 mb-1">{s.agentName?.replace("Gekko","")}</p>
                      <div className="flex flex-wrap gap-1">
                        {s.capabilities?.slice(0, 3).map((c, j) => (
                          <span key={j} className="text-[8px] px-1 rounded" style={{ background: "#3d7a5a15", color: "#3d7a5a", border: "1px solid #3d7a5a20" }}>{c}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "escrow" && (
            <div className="p-3 h-full overflow-auto">
              {escrows.length === 0 ? (
                <p className="text-white/20 text-xs italic">No escrow sessions yet.</p>
              ) : (
                <table className="w-full text-[10px]">
                  <thead><tr className="border-b border-white/6 text-white/30">
                    <th className="text-left py-1 pr-3">Session</th><th className="text-left pr-3">Amount</th><th className="text-left pr-3">Route</th><th className="text-left pr-3">Status</th><th className="text-left">Tx</th>
                  </tr></thead>
                  <tbody>
                    {escrows.map((e, i) => (
                      <tr key={i} className="border-b border-white/4 text-white/50">
                        <td className="py-1 pr-3 font-mono">{e.sessionId?.slice(0, 8)}…</td>
                        <td className="pr-3 text-[#4a7a49]">${e.amount?.toFixed(4)}</td>
                        <td className="pr-3">{e.buyerAgent?.replace("Gekko","")} → {e.sellerAgent?.replace("Gekko","")}</td>
                        <td className="pr-3">
                          <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: e.status === "confirmed" ? "#4a7a4920" : e.status === "released" ? "#7a6a3020" : "#ffffff08", color: e.status === "confirmed" ? "#4a7a49" : e.status === "released" ? "#aa9a40" : "#666" }}>
                            {e.status}
                          </span>
                        </td>
                        <td>{e.txHash ? <a href={`https://basescan.org/tx/${e.txHash}`} target="_blank" rel="noopener" className="text-[#4a7a49] underline">{e.txHash.slice(0,8)}…</a> : e.txId ? <span className="text-white/25">{e.txId.slice(0,8)}…</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "transactions" && (
            <div className="p-3 h-full overflow-auto">
              {transactions.length === 0 ? (
                <p className="text-white/20 text-xs italic">No on-chain transactions yet.</p>
              ) : (
                <table className="w-full text-[10px]">
                  <thead><tr className="border-b border-white/6 text-white/30">
                    <th className="text-left py-1 pr-3">Agent</th><th className="text-left pr-3">To</th><th className="text-left pr-3">Amount</th><th className="text-left pr-3">Status</th><th className="text-left">TxHash</th>
                  </tr></thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={i} className="border-b border-white/4 text-white/50">
                        <td className="py-1 pr-3" style={{ color: agentColor("Gekko" + tx._agent) }}>{tx._agent}</td>
                        <td className="pr-3 font-mono">{tx.to_address ? tx.to_address.slice(0,6)+"…"+tx.to_address.slice(-4) : "—"}</td>
                        <td className="pr-3 text-[#4a7a49]">${tx.amount_usdc?.toFixed(4)}</td>
                        <td className="pr-3"><span className="text-[9px] px-1 rounded" style={{ background: "#4a7a4918", color: "#4a7a49" }}>{tx.status}</span></td>
                        <td>{tx.tx_hash ? <a href={`https://basescan.org/tx/${tx.tx_hash}`} target="_blank" rel="noopener" className="text-[#4a7a49] underline">{tx.tx_hash.slice(0,8)}…</a> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "delegation" && (
            <div className="p-4 h-full overflow-auto">
              <p className="text-[10px] text-white/30 mb-3">ERC-7710 Delegation Chain — 1Shot Gasless Execution on Base</p>
              {/* Live signed delegation info */}
              {signedDelegation ? (
                <div className="space-y-2 mb-3">
                  <div className="rounded border border-[#4a7a49]/20 bg-[#4a7a49]/5 px-3 py-2">
                    <p className="text-[10px] text-[#4a7a49] mb-1">✓ ERC-7710 Delegation Signed</p>
                    <p className="text-[9px] text-white/40 font-mono">Delegator: {signedDelegation.delegator.slice(0,12)}…{signedDelegation.delegator.slice(-6)}</p>
                    <p className="text-[9px] text-white/40 font-mono">Delegate:  {signedDelegation.delegate.slice(0,12)}…{signedDelegation.delegate.slice(-6)} (1Shot)</p>
                    <p className="text-[9px] text-white/30 mt-1">Chain: Base mainnet · Scheme: erc20TransferAmount</p>
                    <div className="mt-1 flex gap-1">
                      {signedDelegation.caveats.slice(0, 2).map((c: any, i) => (
                        <span key={i} className="text-[8px] px-1 rounded border border-white/10 text-white/25 font-mono">{c.enforcer.slice(0,6)}…</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-white/20 italic mb-3">Connect wallet and click "Sign Delegation" to create an ERC-7710 delegation.</p>
              )}

              {/* Static delegation chain from backend */}
              {delegations.length > 0 && (
                <div className="space-y-2">
                  {delegations.map((d, i) => (
                    <div key={i} className="flex items-center gap-3 rounded border border-white/6 px-3 py-2" style={{ marginLeft: i === 0 ? 0 : 16 }}>
                      <div className="text-[10px] text-white/25 w-4">{i === 0 ? "①" : "└"}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium" style={{ color: agentColor("Gekko" + d.role) }}>{d.role}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded border" style={{ borderColor: "#4a7a4930", color: "#4a7a49", background: "#4a7a4908" }}>{d.type}</span>
                          {d.signed && <span className="text-[9px] text-[#4a7a49]">✓ signed</span>}
                        </div>
                        <p className="text-[9px] text-white/25 font-mono">{d.to?.slice(0,10)}…{d.to?.slice(-6)} ← {d.from?.slice(0,6)}…</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* On-chain payment result */}
              {onChainPayment.state === "confirmed" && onChainPayment.txHash && (
                <div className="mt-3 px-3 py-2 rounded border border-[#4a7a49]/20 bg-[#4a7a49]/5">
                  <p className="text-[10px] text-[#4a7a49] mb-1">✓ On-chain settlement complete</p>
                  <a href={`https://basescan.org/tx/${onChainPayment.txHash}`} target="_blank" rel="noopener"
                    className="text-[9px] font-mono text-[#4a7a49] underline">
                    {onChainPayment.txHash.slice(0, 16)}… ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {activeTab === "reasoning" && (
            <div className="p-3 h-full overflow-auto space-y-2">
              {reasoning.length === 0 ? (
                <p className="text-white/20 text-xs italic">Run a mission to see agent reasoning.</p>
              ) : (
                reasoning.map((r, i) => (
                  <div key={i} className="rounded border border-white/5 bg-white/1 px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] px-1 rounded" style={agentBadgeStyle(r.agent)}>{r.agent?.replace("Gekko","")}</span>
                      <span className="text-[10px] text-white/40">{r.action?.replace(/_/g," ")}</span>
                    </div>
                    {r.reasoning && <p className="text-[10px] text-white/50">{r.reasoning}</p>}
                    {r.goal && <p className="text-[10px] text-white/30 italic">Goal: {r.goal}</p>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Error boundary ── */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) return (
      <div className="min-h-screen bg-black text-white/60 flex items-center justify-center font-mono text-sm">
        <div className="text-center">
          <p className="text-[#4a7a49] mb-2">GEKKO</p>
          <p className="text-white/40 mb-1">Dashboard error</p>
          <p className="text-white/20 text-xs">{this.state.error}</p>
        </div>
      </div>
    );
    return this.props.children;
  }
}
