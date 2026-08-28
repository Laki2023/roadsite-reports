import React, { useState, useEffect } from 'react';
import { supabase, hasRole, ROLE_LABELS } from '../lib/supabase';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, Legend } from 'recharts';

const COLORS = ['#e87b35','#2563eb','#16a34a','#d97706','#7c3aed','#dc2626','#0891b2','#6366f1'];
const fmt = (n) => n != null ? 'KES ' + Number(n).toLocaleString() : '—';
const fmtB = (n) => { if (!n) return 'KES 0'; if (n>=1e9) return 'KES '+(n/1e9).toFixed(2)+'B'; if (n>=1e6) return 'KES '+(n/1e6).toFixed(1)+'M'; return fmt(n); };
const pct = (a,b) => b > 0 ? Math.round((a/b)*100) : 0;
const daysBetween = (a,b) => { if(!a||!b) return 0; return Math.ceil((new Date(b)-new Date(a))/(86400000)); };

function ScoreRing({ value, size=80, stroke=7, color, label, sublabel, grade }) {
  const r=(size-stroke)/2, c=2*Math.PI*r, p=Math.min(value,100)/100*c;
  const auto = color||(value>=80?'#10b981':value>=60?'#f59e0b':'#ef4444');
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ position:'relative', width:size, height:size, margin:'0 auto' }}>
        <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} opacity={0.2} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={auto} strokeWidth={stroke}
            strokeDasharray={`${p} ${c-p}`} strokeLinecap="round" style={{ transition:'stroke-dasharray 1s ease' }} />
        </svg>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)' }}>
          {grade ? <div style={{ fontSize:size*0.3, fontWeight:900, color:auto }}>{grade}</div>
            : <div style={{ fontSize:size*0.25, fontWeight:800, color:auto }}>{value}<span style={{ fontSize:size*0.12 }}>%</span></div>}
        </div>
      </div>
      {label && <div style={{ fontSize:11, fontWeight:700, marginTop:6, color:auto }}>{label}</div>}
      {sublabel && <div style={{ fontSize:10, color:'var(--text-muted)' }}>{sublabel}</div>}
    </div>
  );
}

function ProgressBar({ label, value, max=100, color='#e87b35', showPct=true }) {
  const p = max>0 ? Math.min((value/max)*100,100) : 0;
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
        <span style={{ fontWeight:500 }}>{label}</span>
        {showPct && <span style={{ fontWeight:700, color }}>{p.toFixed(0)}%</span>}
      </div>
      <div style={{ height:8, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${p}%`, background:color, borderRadius:4, transition:'width 1s ease' }} />
      </div>
    </div>
  );
}

function KPI({ title, value, subtitle, color, icon, small }) {
  return (
    <div style={{ textAlign:'center', padding:small?'8px':'12px' }}>
      {icon && <div style={{ fontSize:20, marginBottom:4, opacity:0.7 }}>{icon}</div>}
      <div style={{ fontSize:small?18:24, fontWeight:800, color:color||'var(--text)' }}>{value}</div>
      <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em', marginTop:2 }}>{title}</div>
      {subtitle && <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:1 }}>{subtitle}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = { 'On Track':'#10b981', 'Behind':'#f59e0b', 'Critical':'#ef4444', 'Ahead':'#2563eb', 'Active':'#10b981', 'Completed':'#6b7280' };
  const c = colors[status]||'#6b7280';
  return <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:9999,
    fontSize:11, fontWeight:700, background:c+'18', color:c, border:`1px solid ${c}40` }}>
    <span style={{ width:6, height:6, borderRadius:'50%', background:c }} />{status}
  </span>;
}

export default function ProjectDashboard({ projectId, onBack, profile, navigateTo }) {
  const [d, setD] = useState(null);
  const [showObModal, setShowObModal] = useState(false);
  const [obForm, setObForm] = useState({ obligation_type: 'Performance Guarantee', provider: '', amount: '', reference_no: '', expiry_date: '', notes: '' });
  const [obEditId, setObEditId] = useState(null);
  const [obSaving, setObSaving] = useState(false);
  const isPlatformAdmin = profile.is_platform_admin === true;

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const [proj,boq,works,equip,structs,issues,layers,tests,ipcs,risks,miles,mats,reports,instructions,obligations,claimsRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('boq_items').select('*').eq('project_id', projectId),
      supabase.from('works_activities').select('*, parent:parent_activity_id(activity_name)').eq('project_id', projectId).order('sort_order'),
      supabase.from('equipment_register').select('*').eq('project_id', projectId),
      supabase.from('structures').select('*').eq('project_id', projectId),
      supabase.from('site_issues').select('*').eq('project_id', projectId),
      supabase.from('pavement_layers').select('*').eq('project_id', projectId).order('start_chainage'),
      supabase.from('quality_tests').select('*').eq('project_id', projectId),
      supabase.from('ipc_certificates').select('*').eq('project_id', projectId).order('ipc_no'),
      supabase.from('risk_register').select('*').eq('project_id', projectId),
      supabase.from('project_milestones').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('project_materials').select('*').eq('project_id', projectId),
      supabase.from('daily_reports').select('id, report_date, weather, rainfall_mm, max_temp_c, min_temp_c, is_working_day, non_working_reason, working_hours').eq('project_id', projectId).order('report_date'),
      supabase.from('site_instructions').select('*').eq('project_id', projectId).order('issued_at', { ascending: false }),
      supabase.from('project_obligations').select('*').eq('project_id', projectId).order('display_order'),
      supabase.from('claims').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ]);
    // Latest site photos with signed URLs (best-effort — dashboard still loads if storage fails)
    let photosWithUrls = [];
    try {
      const { data: photoRows } = await supabase.from('report_photos').select('*')
        .eq('project_id', projectId).order('created_at', { ascending: false }).limit(8);
      photosWithUrls = await Promise.all((photoRows || []).map(async (ph) => {
        try {
          const { data: signed } = await supabase.storage.from('site-photos').createSignedUrl(ph.file_path, 3600);
          return { ...ph, url: signed?.signedUrl || null };
        } catch { return { ...ph, url: null }; }
      }));
    } catch { photosWithUrls = []; }
    setD({ p:proj.data, boq:boq.data||[], works:works.data||[], equip:equip.data||[], structs:structs.data||[],
      issues:issues.data||[], layers:layers.data||[], tests:tests.data||[], ipcs:ipcs.data||[],
      risks:risks.data||[], miles:miles.data||[], mats:mats.data||[], reports:reports.data||[],
      instructions:instructions.data||[], obligations:obligations.data||[], photos:photosWithUrls,
      claims:claimsRes.data||[] });
  }

  // ── Statutory Obligations helpers ──
  const OB_TYPES = [
    'Performance Guarantee', 'Advance Payment Guarantee', 'Retention Guarantee',
    "Contractor's All Risk Insurance", 'Third Party Liability Insurance',
    "Workers' Compensation Insurance", 'Professional Indemnity Insurance',
    'Motor Vehicle Insurance', 'NEMA Licence', 'NCA Registration',
    'OSHA Registration', 'Tax Compliance Certificate', 'Other',
  ];
  const saveOb = async () => {
    setObSaving(true);
    try {
      const payload = {
        project_id: projectId, obligation_type: obForm.obligation_type,
        provider: obForm.provider || null, amount: obForm.amount ? parseFloat(obForm.amount) : null,
        reference_no: obForm.reference_no || null, expiry_date: obForm.expiry_date || null,
        notes: obForm.notes || null, display_order: (d?.obligations?.length || 0) + 1,
      };
      if (obEditId) {
        await supabase.from('project_obligations').update(payload).eq('id', obEditId);
      } else {
        await supabase.from('project_obligations').insert(payload);
      }
      setShowObModal(false); setObEditId(null);
      setObForm({ obligation_type: 'Performance Guarantee', provider: '', amount: '', reference_no: '', expiry_date: '', notes: '' });
      load();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setObSaving(false); }
  };
  const deleteOb = async (id) => {
    if (!window.confirm('Delete this obligation?')) return;
    await supabase.from('project_obligations').delete().eq('id', id);
    load();
  };
  const editOb = (ob) => {
    setObForm({ obligation_type: ob.obligation_type, provider: ob.provider || '', amount: ob.amount || '', reference_no: ob.reference_no || '', expiry_date: ob.expiry_date || '', notes: ob.notes || '' });
    setObEditId(ob.id); setShowObModal(true);
  };

  if (!d) return <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>Loading project dashboard...</div>;

  const { p, boq, works, equip, structs, issues, layers, tests, ipcs, risks, miles, mats, reports, instructions, claims } = d;

  // ── Computed Metrics ──
  const originalContractSum = p.original_contract_sum || p.contract_sum || 0;
  const revisedContractSum = p.revised_contract_sum || originalContractSum;
  const contractSum = revisedContractSum || boq.reduce((s,i)=>s+(i.boq_amount||0),0) || 0;
  const valueDone = boq.reduce((s,i)=>s+(i.value_to_date||0),0);
  const finPct = pct(valueDone, contractSum);
  const roadLen = p.end_chainage && p.start_chainage ? (p.end_chainage - p.start_chainage) : (p.road_length || 0);

  const startDt = p.commencement_date || p.start_date;
  const originalEndDt = p.original_completion_date || p.end_date;
  const revisedEndDt = p.revised_completion_date || originalEndDt;
  const endDt = revisedEndDt;
  const totalDays = daysBetween(startDt, endDt);
  const elapsedDays = daysBetween(startDt, new Date().toISOString().slice(0,10));
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const timePct = pct(elapsedDays, totalDays);
  const totalMonths = Math.round(totalDays / 30);
  const elapsedMonths = Math.round(elapsedDays / 30);
  const totalEOT = p.total_eot_awarded || 0;
  const hasRevisions = p.revised_completion_date || p.revised_contract_sum;

  const compActs = works.filter(w=>w.status==='Completed'||w.status==='Approved').length;
  // Quantity-weighted physical progress: each activity capped at 100% of its planned quantity,
  // so over-measured entries can't inflate overall progress. Falls back to completed-count if no quantities.
  const qtyPlanned = works.reduce((s,w)=>s+(w.planned_quantity||0),0);
  const qtyDone = works.reduce((s,w)=>{
    const planned = w.planned_quantity || 0;
    if (planned <= 0) return s;
    return s + Math.min(w.completed_quantity || 0, planned);
  },0);
  const physPct = qtyPlanned > 0 ? pct(qtyDone, qtyPlanned) : pct(compActs, works.length);
  const variance = physPct - timePct;
  const scheduleStatus = variance >= 0 ? 'On Track' : variance > -10 ? 'Behind' : 'Critical';

  const eqReq = equip.reduce((s,e)=>s+(e.required_quantity||0),0);
  const eqOn = equip.reduce((s,e)=>s+(e.actual_on_site||0),0);
  const eqWorking = equip.filter(e=>e.actual_on_site>0).length;
  const eqPct = pct(eqOn, eqReq);

  const testPass = tests.filter(t=>t.result_status==='Pass').length;
  const testFail = tests.filter(t=>t.result_status==='Fail').length;
  const qPct = pct(testPass, tests.length);
  const passRate = tests.length > 0 ? ((testPass/tests.length)*100).toFixed(1) : '—';

  const openIss = issues.filter(i=>i.status==='Open'||i.status==='In Progress').length;
  const critIss = issues.filter(i=>i.severity==='Critical'&&i.status!=='Closed'&&i.status!=='Resolved').length;
  const highIss = issues.filter(i=>i.severity==='High'&&i.status!=='Closed'&&i.status!=='Resolved').length;

  const openRisks = risks.filter(r=>r.status==='Open'||r.status==='Mitigating').length;
  const critRisks = risks.filter(r=>r.risk_level==='Critical'&&r.status!=='Closed').length;

  const certified = ipcs.reduce((s,i)=>s+(i.certified_amount||0),0);
  const paid = ipcs.reduce((s,i)=>s+(i.paid_amount||0),0);
  const balance = contractSum - valueDone;

  // ── Earned Value & Performance Indices ──
  // EV = Physical Progress % × Contract Sum (what we've earned)
  // AC = Certified amount (what we've spent/certified)
  // PV = Time Elapsed % × Contract Sum (what we should have earned by now)
  const earnedValue = (physPct / 100) * contractSum;
  const actualCost = certified > 0 ? certified : valueDone;
  const plannedValue = (timePct / 100) * contractSum;
  const spiVal = plannedValue > 0 ? (earnedValue / plannedValue) : 0;
  const cpiVal = actualCost > 0 ? (earnedValue / actualCost) : 0;
  // EAC = BAC / CPI (Estimate at Completion)
  const eacVal = cpiVal > 0 ? contractSum / cpiVal : contractSum;
  // Variance at Completion
  const vacVal = contractSum - eacVal;
  // To Complete Performance Index
  const tcpiVal = (contractSum - earnedValue) > 0 && (contractSum - actualCost) > 0
    ? (contractSum - earnedValue) / (contractSum - actualCost) : 1;
  // Time overrun projection
  const projectedEndDays = spiVal > 0 ? Math.round(totalDays / spiVal) : totalDays * 2;
  const projectedOverrun = projectedEndDays - totalDays;

  // Health score
  const health = Math.round((physPct*0.3)+(finPct*0.25)+(qPct*0.2)+(eqPct*0.15)+((100-Math.min(openIss*5,100))*0.1));
  const grade = health>=85?'A':health>=70?'B':health>=55?'C':health>=40?'D':'F';
  const gradeLabel = health>=85?'Excellent':health>=70?'Good':health>=55?'Fair':health>=40?'At Risk':'Critical';
  const gradeColor = health>=70?'#10b981':health>=55?'#f59e0b':'#ef4444';

  // Delay probability
  const delayProb = Math.min(100, Math.max(0, Math.round(
    (variance < 0 ? Math.abs(variance) * 2 : 0) + (critIss * 10) + (eqPct < 70 ? 20 : 0) + (qPct < 80 ? 10 : 0)
  )));

  // S-curve data
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const curMonth = new Date().getMonth();
  const sCurve = months.slice(0, curMonth+1).map((m,i) => ({
    month: m,
    planned: Math.round((i+1)/12*100),
    actual: Math.round(physPct * ((i+1)/(curMonth+1))),
  }));

  // Activities with live tracking
  const today = new Date().toISOString().slice(0,10);
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
  const twoWeeksAgo = new Date(Date.now() - 14*86400000).toISOString().slice(0,10);

  // Categorize activities by recency
  const liveActivities = works.filter(w => w.last_progress_date === today);
  const activeThisWeek = works.filter(w => w.last_progress_date >= weekAgo && w.last_progress_date !== today);
  const stalledActivities = works.filter(w => w.status === 'In Progress' && (!w.last_progress_date || w.last_progress_date < twoWeeksAgo));
  const completedActivities = works.filter(w => w.status === 'Completed' || w.status === 'Approved');

  // Activities by category for progress bars
  const actByCat = {};
  works.forEach(w => {
    const cat = w.category || w.activity_name || 'Other';
    if (!actByCat[cat]) actByCat[cat] = { total:0, done:0, lastDate:null, hasLive:false };
    actByCat[cat].total += w.planned_quantity || 1;
    actByCat[cat].done += w.completed_quantity || (w.status==='Completed'||w.status==='Approved' ? (w.planned_quantity||1) : 0);
    if (w.last_progress_date === today) actByCat[cat].hasLive = true;
    if (!actByCat[cat].lastDate || (w.last_progress_date && w.last_progress_date > actByCat[cat].lastDate))
      actByCat[cat].lastDate = w.last_progress_date;
  });
  const actProgress = Object.entries(actByCat)
    .map(([name,d])=>({ name: name.length>22 ? name.slice(0,22)+'...' : name, pct: pct(d.done, d.total), hasLive: d.hasLive, lastDate: d.lastDate }))
    .sort((a,b)=>b.pct-a.pct).slice(0,10);

  // Individual activity ranking (for detailed view)
  const topActivities = works
    .map(w => {
      const rawPct = w.planned_quantity > 0 ? pct(w.completed_quantity || 0, w.planned_quantity) : 0;
      return {
      name: (w.activity_code ? w.activity_code + ' ' : '') + (w.activity_name || 'Unknown'),
      pct: Math.min(100, rawPct),
      overMeasured: rawPct > 100,
      rawPct,
      status: w.status,
      isLive: w.last_progress_date === today,
      isActiveWeek: w.last_progress_date >= weekAgo,
      isStalled: w.status === 'In Progress' && (!w.last_progress_date || w.last_progress_date < twoWeeksAgo),
      isCritical: w.is_critical,
      lastDate: w.last_progress_date,
      category: w.category,
    };})
    .filter(w => w.status !== 'Not Started' || w.pct > 0)
    .sort((a,b) => {
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      if (a.isStalled && !b.isStalled) return -1;
      return b.pct - a.pct;
    })
    .slice(0, 15);

  // Chainage progress (visual bar)
  const chainageStep = Math.max(1, Math.ceil(roadLen / 20));
  const chainageBlocks = [];
  if (roadLen > 0 && p.start_chainage != null) {
    for (let ch = Math.floor(p.start_chainage); ch < (p.start_chainage + roadLen); ch += chainageStep) {
      const end = Math.min(ch + chainageStep, p.start_chainage + roadLen);
      const layersHere = layers.filter(l => l.start_chainage <= end && (l.end_chainage||l.start_chainage) >= ch);
      const done = layersHere.filter(l => l.layer_status==='Completed'||l.layer_status==='Approved').length;
      const total = Math.max(layersHere.length, 1);
      const status = done/total >= 0.8 ? 'completed' : done/total >= 0.3 ? 'ongoing' : layersHere.length > 0 ? 'behind' : 'notstarted';
      chainageBlocks.push({ from: ch, to: end, status, pct: pct(done, total) });
    }
  }
  const chainageColors = { completed:'#10b981', ongoing:'#f59e0b', behind:'#ef4444', notstarted:'#374151' };

  // IPC chart data with cumulative and unpaid
  let cumCertified = 0, cumPaid = 0;
  const ipcChart = ipcs.map(i => {
    const cert = i.certified_amount || 0;
    const pd = i.paid_amount || 0;
    cumCertified += cert;
    cumPaid += pd;
    return {
      name: `IPC ${i.ipc_no}`,
      certified: cert,
      paid: pd,
      unpaid: Math.max(0, cert - pd),
      cumCertified,
      cumPaid,
      cumUnpaid: cumCertified - cumPaid,
    };
  });
  const totalUnpaid = certified - paid;
  const paymentRatio = certified > 0 ? pct(paid, certified) : 0;
  const avgIpcValue = ipcs.length > 0 ? Math.round(certified / ipcs.length) : 0;
  const retentionEst = contractSum * 0.1;

  // Financial S-Curve — monthly planned vs actual expenditure
  const finSCurve = months.slice(0, curMonth + 1).map((m, i) => {
    const monthFraction = (i + 1) / 12;
    // Planned: S-curve distribution (front-loaded typical for road construction)
    const sCurveFactor = monthFraction < 0.3 ? monthFraction * 0.6
      : monthFraction < 0.7 ? 0.18 + (monthFraction - 0.3) * 1.55
      : 0.8 + (monthFraction - 0.7) * 0.67;
    const planned = Math.round(contractSum * Math.min(sCurveFactor, 1));
    // Actual: from cumulative IPC certified up to this month index
    const monthDate = new Date(new Date().getFullYear(), i, 28);
    const ipcsToDate = ipcs.filter(ipc => {
      const ipcDate = ipc.created_at || ipc.ipc_date;
      return ipcDate && new Date(ipcDate) <= monthDate;
    });
    const actualCert = ipcsToDate.reduce((s, ipc) => s + (ipc.certified_amount || 0), 0);
    const actualPaid = ipcsToDate.reduce((s, ipc) => s + (ipc.paid_amount || 0), 0);
    return {
      month: m,
      planned,
      certified: actualCert || Math.round(certified * ((i + 1) / (curMonth + 1))),
      paid: actualPaid || Math.round(paid * ((i + 1) / (curMonth + 1))),
    };
  });

  // Combined progress comparison (physical vs financial)
  const combinedProgress = months.slice(0, curMonth + 1).map((m, i) => ({
    month: m,
    physPlanned: sCurve[i]?.planned || 0,
    physActual: sCurve[i]?.actual || 0,
    finPlanned: contractSum > 0 ? pct(finSCurve[i]?.planned || 0, contractSum) : 0,
    finActual: contractSum > 0 ? pct(finSCurve[i]?.certified || 0, contractSum) : 0,
  })); // Assume 10% retention

  // Early warnings
  const warnings = [];
  if (variance < -10) warnings.push({ type:'critical', msg:'Physical progress significantly behind schedule' });
  if (critIss > 0) warnings.push({ type:'critical', msg:`${critIss} critical issue${critIss>1?'s':''} unresolved` });
  if (eqPct < 70 && eqReq > 0) warnings.push({ type:'warning', msg:`Equipment utilization at ${eqPct}% — below 70% target` });
  if (qPct < 80 && tests.length > 0) warnings.push({ type:'warning', msg:`Quality pass rate at ${qPct}% — below 80% threshold` });
  if (finPct > physPct + 15) warnings.push({ type:'warning', msg:'Financial progress ahead of physical — possible overpayment risk' });
  if (delayProb > 60) warnings.push({ type:'critical', msg:`Delay probability at ${delayProb}% — recovery programme needed` });
  if (critRisks > 0) warnings.push({ type:'warning', msg:`${critRisks} critical risk${critRisks>1?'s':''} on register` });

  /* ══════════════════════════════════════════════════════════════
     PROGRESS RATE ANALYSIS ENGINE
     Computes weekly productivity, detects trends, and triggers
     meeting recommendations per FIDIC Cl. 8.6 (Rate of Progress)
     ══════════════════════════════════════════════════════════════ */

  // Group progress entries by week
  const progressByWeek = {};
  reports.forEach(r => {
    if (!r.report_date) return;
    const d = new Date(r.report_date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const weekKey = weekStart.toISOString().slice(0,10);
    progressByWeek[weekKey] = (progressByWeek[weekKey] || 0) + 1;
  });

  // Weekly activity progress (from works_progress via last_progress_date)
  const activityByWeek = {};
  works.forEach(w => {
    if (!w.last_progress_date) return;
    const d = new Date(w.last_progress_date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const weekKey = weekStart.toISOString().slice(0,10);
    if (!activityByWeek[weekKey]) activityByWeek[weekKey] = { count: 0, quantity: 0 };
    activityByWeek[weekKey].count += 1;
    activityByWeek[weekKey].quantity += w.completed_quantity || 0;
  });

  // Build weekly rate data (last 12 weeks)
  const weeklyRates = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - (i * 7));
    d.setDate(d.getDate() - d.getDay());
    const weekKey = d.toISOString().slice(0,10);
    const weekLabel = `W${12 - i}`;
    const reportsCount = progressByWeek[weekKey] || 0;
    const activitiesWorked = activityByWeek[weekKey]?.count || 0;
    // Productivity index: combination of reports filed and activities worked on
    const productivityIndex = reportsCount + (activitiesWorked * 2);
    weeklyRates.push({ week: weekLabel, weekDate: weekKey, reports: reportsCount, activities: activitiesWorked, productivity: productivityIndex });
  }

  // Trend detection — compare last 4 weeks vs previous 4 weeks
  const recent4 = weeklyRates.slice(-4);
  const previous4 = weeklyRates.slice(-8, -4);
  const recentAvg = recent4.reduce((s,w) => s + w.productivity, 0) / Math.max(recent4.length, 1);
  const previousAvg = previous4.reduce((s,w) => s + w.productivity, 0) / Math.max(previous4.length, 1);
  const rateChange = previousAvg > 0 ? Math.round(((recentAvg - previousAvg) / previousAvg) * 100) : 0;

  const progressTrend = recentAvg === 0 && previousAvg === 0 ? 'no_data'
    : rateChange > 15 ? 'increasing'
    : rateChange > -5 ? 'steady'
    : rateChange > -25 ? 'declining'
    : 'critical_decline';

  const trendConfig = {
    no_data: { label: 'No Data', color: '#6b7280', icon: '—', desc: 'Insufficient progress data to analyse trend' },
    increasing: { label: 'Increasing', color: '#10b981', icon: '📈', desc: 'Productivity is improving — rate of progress has increased' },
    steady: { label: 'Steady', color: '#3b82f6', icon: '➡️', desc: 'Productivity is consistent — maintain current momentum' },
    declining: { label: 'Declining', color: '#f59e0b', icon: '📉', desc: 'Productivity is reducing — contractor may need to increase resources' },
    critical_decline: { label: 'Critical Decline', color: '#ef4444', icon: '🚨', desc: 'Severe productivity drop — FIDIC Cl. 8.6 intervention may be required' },
  };
  const trend = trendConfig[progressTrend];

  // Consecutive declining weeks
  let decliningWeeks = 0;
  for (let i = weeklyRates.length - 1; i > 0; i--) {
    if (weeklyRates[i].productivity < weeklyRates[i-1].productivity) decliningWeeks++;
    else break;
  }

  // Zero progress weeks (recent)
  const zeroWeeks = recent4.filter(w => w.productivity === 0).length;

  // ── Meeting Recommendation Engine ──
  const meetingReasons = [];
  let meetingUrgency = 'none'; // none, recommended, required, urgent

  if (progressTrend === 'critical_decline') {
    meetingReasons.push({ reason: 'Critical decline in progress rate — FIDIC Cl. 8.6', urgency: 'urgent', fidic: 'Cl. 8.6' });
    meetingUrgency = 'urgent';
  }
  if (decliningWeeks >= 3) {
    meetingReasons.push({ reason: `Progress declining for ${decliningWeeks} consecutive weeks`, urgency: 'required' });
    if (meetingUrgency !== 'urgent') meetingUrgency = 'required';
  }
  if (zeroWeeks >= 2) {
    meetingReasons.push({ reason: `${zeroWeeks} out of last 4 weeks with zero productivity`, urgency: 'urgent' });
    meetingUrgency = 'urgent';
  }
  if (variance < -15) {
    meetingReasons.push({ reason: `Physical progress ${Math.abs(variance)}% behind schedule`, urgency: 'required', fidic: 'Cl. 8.6' });
    if (meetingUrgency !== 'urgent') meetingUrgency = 'required';
  }
  if (stalledActivities.length > 3) {
    meetingReasons.push({ reason: `${stalledActivities.length} activities stalled for 14+ days`, urgency: 'required' });
    if (meetingUrgency !== 'urgent') meetingUrgency = 'required';
  }
  if (critIss >= 2) {
    meetingReasons.push({ reason: `${critIss} critical issues unresolved`, urgency: 'required' });
    if (meetingUrgency !== 'urgent') meetingUrgency = 'required';
  }
  if (eqPct < 50 && eqReq > 0) {
    meetingReasons.push({ reason: `Equipment mobilisation critically low at ${eqPct}%`, urgency: 'required' });
    if (meetingUrgency !== 'urgent') meetingUrgency = 'required';
  }
  if (finPct > physPct + 20) {
    meetingReasons.push({ reason: 'Financial progress exceeds physical by 20%+ — overpayment risk', urgency: 'recommended', fidic: 'Cl. 14.6' });
    if (meetingUrgency === 'none') meetingUrgency = 'recommended';
  }
  if (delayProb > 70) {
    meetingReasons.push({ reason: `Delay probability at ${delayProb}% — revised programme required`, urgency: 'urgent', fidic: 'Cl. 8.3' });
    meetingUrgency = 'urgent';
  }

  // Add rate-related warnings to early warnings
  if (progressTrend === 'declining') warnings.push({ type:'warning', msg:`Progress rate declining by ${Math.abs(rateChange)}% — monitor closely` });
  if (progressTrend === 'critical_decline') warnings.push({ type:'critical', msg:`Critical decline in progress rate (${Math.abs(rateChange)}%) — FIDIC Cl. 8.6 action needed` });
  if (decliningWeeks >= 3) warnings.push({ type:'warning', msg:`${decliningWeeks} consecutive weeks of declining productivity` });
  if (zeroWeeks >= 2) warnings.push({ type:'critical', msg:`${zeroWeeks} out of last 4 weeks with zero productivity recorded` });
  if (meetingUrgency === 'urgent') warnings.push({ type:'critical', msg:'Project management meeting urgently recommended — see analysis below' });

  const meetingColors = { none:'#6b7280', recommended:'#3b82f6', required:'#f59e0b', urgent:'#ef4444' };
  const meetingLabels = { none:'Not Required', recommended:'Recommended', required:'Required', urgent:'Urgently Required' };

  const category = (p.category || 'Construction').toLowerCase();

  return (
    <div>
      {/* ══════ HEADER ══════ */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, flexWrap:'wrap', gap:12 }}>
        <div style={{ flex:1 }}>
          <button onClick={onBack} className="btn btn-sm btn-secondary" style={{ marginBottom:8 }}>← Back to Portfolio</button>
          <h2 style={{ margin:0, fontSize:20 }}>{p.name}</h2>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:6, alignItems:'center' }}>
            <span className="badge badge-accent">{p.category || 'Construction'}</span>
            <StatusBadge status={p.project_status || 'Active'} />
            <span className="text-sm text-muted">Contract: {p.contract_no || '—'}</span>
            <span className="text-sm text-muted">{p.contractor_name || ''}</span>
          </div>
        </div>
        <div style={{ textAlign:'right', fontSize:12, color:'var(--text-muted)' }}>
          <div>{startDt ? new Date(startDt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'} — {endDt ? new Date(endDt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</div>
          <div style={{ fontWeight:600 }}>{totalMonths} Months · {elapsedMonths} Elapsed · {Math.max(0,totalMonths-elapsedMonths)} Remaining</div>
        </div>
      </div>

      {/* ══════ CONTRACT VITALS HEADER ══════ */}
      <div className="card" style={{ padding:0, marginBottom:16, overflow:'hidden' }}>
        <div style={{ background:'linear-gradient(135deg, #1e293b 0%, #334155 100%)', padding:'16px 20px', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:0, color:'#fff' }}>
          {[
            { label:'Contract Sum', value: fmtB(contractSum), sub: hasRevisions ? `Original: ${fmtB(originalContractSum)}` : null, icon:'💰' },
            { label:'Certified to Date', value: fmtB(certified), sub: `${pct(certified, contractSum)}% of contract`, icon:'📜', color: certified > 0 ? '#4ade80' : '#94a3b8' },
            { label:'Amount Paid', value: fmtB(paid), sub: certified > 0 ? `${pct(paid, certified)}% of certified` : '—', icon:'🏦', color: paid > 0 ? '#4ade80' : '#94a3b8' },
            { label:'Physical Progress', value: `${physPct}%`, sub: `${variance > 0 ? '+' : ''}${variance}% vs time`, icon:'🔨', color: variance >= 0 ? '#4ade80' : variance > -10 ? '#fbbf24' : '#f87171' },
            { label:'Time Elapsed', value: `${timePct}%`, sub: `${remainingDays > 0 ? remainingDays + ' days left' : Math.abs(totalDays - elapsedDays) + ' days overrun'}`, icon:'⏱️', color: remainingDays > 0 ? '#4ade80' : '#f87171' },
            { label:'Completion Date', value: endDt ? new Date(endDt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—', sub: totalEOT > 0 ? `EOT: ${totalEOT} days` : 'No EOT', icon:'📅' },
          ].map((item, i) => (
            <div key={i} style={{ padding:'8px 14px', borderRight: i < 5 ? '1px solid #ffffff15' : 'none', textAlign:'center' }}>
              <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em', color:'#94a3b8', marginBottom:4, fontWeight:600 }}>{item.icon} {item.label}</div>
              <div style={{ fontSize:20, fontWeight:800, color: item.color || '#fff', lineHeight:1.2 }}>{item.value}</div>
              {item.sub && <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>{item.sub}</div>}
            </div>
          ))}
        </div>
        {/* Progress vs Time comparison bar */}
        <div style={{ padding:'10px 20px', background:'#0f172a', display:'flex', gap:16, alignItems:'center' }}>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#94a3b8', marginBottom:3 }}>
              <span>Physical Progress</span><span style={{ color: variance >= 0 ? '#4ade80' : '#f87171', fontWeight:700 }}>{physPct}%</span>
            </div>
            <div style={{ height:6, background:'#1e293b', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.min(physPct,100)}%`, background: variance >= 0 ? '#4ade80' : '#f87171', borderRadius:3, transition:'width 1s ease' }} />
            </div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#94a3b8', marginBottom:3 }}>
              <span>Time Elapsed</span><span style={{ fontWeight:700, color:'#60a5fa' }}>{timePct}%</span>
            </div>
            <div style={{ height:6, background:'#1e293b', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.min(timePct,100)}%`, background:'#60a5fa', borderRadius:3, transition:'width 1s ease' }} />
            </div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#94a3b8', marginBottom:3 }}>
              <span>Financial Progress</span><span style={{ fontWeight:700, color:'#a78bfa' }}>{finPct}%</span>
            </div>
            <div style={{ height:6, background:'#1e293b', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.min(finPct,100)}%`, background:'#a78bfa', borderRadius:3, transition:'width 1s ease' }} />
            </div>
          </div>
          <div style={{ textAlign:'center', minWidth:70 }}>
            <div style={{ fontSize:9, color:'#94a3b8', textTransform:'uppercase' }}>SPI</div>
            <div style={{ fontSize:16, fontWeight:800, color: spiVal >= 1 ? '#4ade80' : spiVal >= 0.8 ? '#fbbf24' : '#f87171' }}>{spiVal.toFixed(2)}</div>
          </div>
          <div style={{ textAlign:'center', minWidth:70 }}>
            <div style={{ fontSize:9, color:'#94a3b8', textTransform:'uppercase' }}>CPI</div>
            <div style={{ fontSize:16, fontWeight:800, color: cpiVal >= 1 ? '#4ade80' : cpiVal >= 0.8 ? '#fbbf24' : '#f87171' }}>{cpiVal > 0 ? cpiVal.toFixed(2) : '—'}</div>
          </div>
        </div>
      </div>

      {/* ══════ CONTRACT DATA ══════ */}
      <details className="card" style={{ padding: 0, marginBottom: 16 }}>
        <summary style={{ padding: '12px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 14, userSelect: 'none', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📋 Contract Data</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>▼ Click to expand</span>
        </summary>
        <div style={{ padding: '0 16px 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {[
                ['Project Name', p.name],
                ['Employer', p.employer || '—'],
                ['Financier', p.financier || '—'],
                ['Contractor', p.contractor_name || '—'],
                ['Engineer', p.engineer_name || '—'],
                ["Engineer's Representative", p.engineer_rep || '—'],
                ['Contract Number', p.contract_no || '—'],
                ['FIDIC Edition', p.fidic_edition || '—'],
                ['Contract Award Date', p.contract_award_date ? new Date(p.contract_award_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'],
                ['Contract Signing Date', p.contract_signing_date ? new Date(p.contract_signing_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'],
                ['Order to Commence', p.order_to_commence_date ? new Date(p.order_to_commence_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'],
                ['Commencement Date', startDt ? new Date(startDt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'],
                ['Original Completion Date', originalEndDt ? new Date(originalEndDt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'],
                ['Extension of Time', totalEOT > 0 ? `${totalEOT} days` : 'None'],
                ['Revised Completion Date', revisedEndDt && revisedEndDt !== originalEndDt ? new Date(revisedEndDt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'],
                ['Defects Liability Period', p.defects_liability_months ? `${p.defects_liability_months} Months` : '—'],
                ['Original Contract Sum', p.original_contract_sum ? `KES ${Number(p.original_contract_sum).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : (contractSum > 0 ? `KES ${Number(contractSum).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—')],
                ['Revised Contract Sum', p.revised_contract_sum ? `KES ${Number(p.revised_contract_sum).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'N/A'],
                ['Addendums', p.addendums || 'None'],
                ['Time Elapsed', `${elapsedMonths} months (${timePct}%)`],
                ['County(ies)', p.county || '—'],
                ['Sub-County(ies)', p.sub_county || '—'],
                ['Constituency(ies)', p.constituency || '—'],
                ['Road Length', roadLen > 0 ? `${roadLen} Km (Ch. ${p.start_chainage || 0}+000 to ${p.end_chainage || roadLen}+000)` : '—'],
                ['Performance Guarantee Expiry', p.performance_guarantee_expiry ? new Date(p.performance_guarantee_expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'],
              ].map(([label, value], i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-muted)', width: '40%', verticalAlign: 'top' }}>{label}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text)' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* ══════ STATUTORY OBLIGATIONS MATRIX ══════ */}
      {(() => {
        const obs = d.obligations || [];
        const todayDate = new Date();
        const daysUntil = (dt) => dt ? Math.ceil((new Date(dt) - todayDate) / 86400000) : null;

        // Group obligations by category
        const guarantees = ['Performance Guarantee', 'Advance Payment Guarantee', 'Retention Guarantee'];
        const insurance = ["Contractor's All Risk Insurance", 'Third Party Liability Insurance', "Workers' Compensation Insurance", 'Professional Indemnity Insurance', 'Motor Vehicle Insurance'];
        const regulatory = ['NEMA Licence', 'NCA Registration', 'OSHA Registration', 'Tax Compliance Certificate'];

        const getStatus = (ob) => {
          if (!ob) return { status: 'Not Provided', color: '#6b7280', bg: '#6b728010', icon: '◻' };
          const days = daysUntil(ob.expiry_date);
          if (days === null) return { status: 'No Expiry Set', color: '#3b82f6', bg: '#3b82f610', icon: '◻' };
          if (days < 0) return { status: `Expired ${Math.abs(days)}d ago`, color: '#ef4444', bg: '#ef444415', icon: '⛔' };
          if (days <= 30) return { status: `${days}d remaining`, color: '#ef4444', bg: '#ef444410', icon: '🔴' };
          if (days <= 90) return { status: `${days}d remaining`, color: '#f59e0b', bg: '#f59e0b10', icon: '🟡' };
          return { status: `Valid (${days}d)`, color: '#10b981', bg: '#10b98110', icon: '🟢' };
        };

        const expired = obs.filter(o => { const d = daysUntil(o.expiry_date); return d !== null && d < 0; });
        const expiringSoon = obs.filter(o => { const d = daysUntil(o.expiry_date); return d !== null && d >= 0 && d <= 90; });
        const valid = obs.filter(o => { const d = daysUntil(o.expiry_date); return d === null || d > 90; });

        const overallColor = expired.length > 0 ? '#ef4444' : expiringSoon.length > 0 ? '#f59e0b' : '#10b981';
        const overallLabel = expired.length > 0 ? 'Action Required' : expiringSoon.length > 0 ? 'Attention Needed' : 'All Compliant';
        const overallPct = obs.length > 0 ? Math.round((valid.length / obs.length) * 100) : 0;

        const renderGroup = (title, types, icon) => (
          <div key={title} style={{ marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6, display:'flex', alignItems:'center', gap:4 }}>
              <span>{icon}</span> {title}
            </div>
            <div style={{ display:'grid', gap:4 }}>
              {types.map(type => {
                const ob = obs.find(o => o.obligation_type === type);
                const st = getStatus(ob);
                return (
                  <div key={type} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background: st.bg, borderRadius:6, fontSize:11 }}>
                    <span style={{ fontSize:10, minWidth:16 }}>{st.icon}</span>
                    <div style={{ flex:1 }}>
                      <span style={{ fontWeight:600 }}>{type}</span>
                      {ob?.provider && <span style={{ color:'var(--text-muted)', marginLeft:6 }}>({ob.provider})</span>}
                    </div>
                    {ob?.amount > 0 && <span style={{ fontSize:10, color:'var(--text-muted)' }}>{fmtB(ob.amount)}</span>}
                    <span style={{ fontSize:10, fontWeight:700, color: st.color, minWidth:90, textAlign:'right' }}>{st.status}</span>
                    {ob?.expiry_date && <span style={{ fontSize:9, color:'var(--text-muted)', minWidth:70, textAlign:'right' }}>{new Date(ob.expiry_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'})}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );

        return (
          <div className="card" style={{ padding:14, marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h3 style={{ margin:0, fontSize:14 }}>🔒 Statutory Obligations Matrix</h3>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ display:'flex', gap:6, fontSize:10 }}>
                  <span style={{ padding:'2px 8px', borderRadius:9999, background:'#10b98118', color:'#10b981', fontWeight:600 }}>{valid.length} Valid</span>
                  {expiringSoon.length > 0 && <span style={{ padding:'2px 8px', borderRadius:9999, background:'#f59e0b18', color:'#f59e0b', fontWeight:600 }}>{expiringSoon.length} Expiring</span>}
                  {expired.length > 0 && <span style={{ padding:'2px 8px', borderRadius:9999, background:'#ef444418', color:'#ef4444', fontWeight:600 }}>{expired.length} Expired</span>}
                </div>
                <div style={{ width:40, height:40, borderRadius:'50%', border:`3px solid ${overallColor}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ fontSize:12, fontWeight:800, color: overallColor }}>{overallPct}%</span>
                </div>
                <button className="btn btn-sm btn-secondary" style={{ fontSize:10 }} onClick={() => navigateTo('obligations')}>Manage</button>
              </div>
            </div>

            {obs.length === 0 ? (
              <div style={{ textAlign:'center', padding:20, color:'var(--text-muted)', fontSize:12 }}>
                No statutory obligations recorded. <button className="btn btn-sm btn-primary" style={{ fontSize:10, marginLeft:8 }} onClick={() => navigateTo('obligations')}>Add Obligations</button>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  {renderGroup('Financial Guarantees', guarantees, '🏛️')}
                  {renderGroup('Regulatory & Compliance', regulatory, '📋')}
                </div>
                <div>
                  {renderGroup('Insurance Policies', insurance, '🛡️')}
                  {/* Other obligations */}
                  {obs.filter(o => !guarantees.includes(o.obligation_type) && !insurance.includes(o.obligation_type) && !regulatory.includes(o.obligation_type)).length > 0 && (
                    renderGroup('Other', obs.filter(o => !guarantees.includes(o.obligation_type) && !insurance.includes(o.obligation_type) && !regulatory.includes(o.obligation_type)).map(o => o.obligation_type), '📎')
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ══════ TOP KPI ROW ══════ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:10, marginBottom:16 }}>
        <div className="card" style={{ padding:12, borderTop:`3px solid ${gradeColor}` }}>
          <KPI title="Project Health" value={`${health}/100`} color={gradeColor} subtitle={gradeLabel} small />
        </div>
        <div className="card" style={{ padding:12, borderTop:`3px solid ${variance>=0?'#10b981':'#ef4444'}` }}>
          <KPI title="Physical Progress" value={`${physPct}%`} color={variance>=0?'#10b981':'#ef4444'}
            subtitle={`${variance>0?'+':''}${variance}% vs schedule`} small />
        </div>
        <div className="card" style={{ padding:12, borderTop:'3px solid #2563eb' }}>
          <KPI title="Time Performance" value={`${timePct}%`} subtitle={`${remainingDays} days remaining`} small />
        </div>
        <div className="card" style={{ padding:12, borderTop:'3px solid #d97706' }}>
          <KPI title="Cost Performance" value={`${finPct}%`} subtitle={fmtB(valueDone)} small />
        </div>
        <div className="card" style={{ padding:12, borderTop:'3px solid #e87b35' }}>
          <KPI title="Contract Value" value={fmtB(contractSum)} subtitle={`${fmtB(balance)} remaining`} small />
        </div>
        {roadLen > 0 && (
          <div className="card" style={{ padding:12, borderTop:'3px solid #7c3aed' }}>
            <KPI title="Road Length" value={`${roadLen.toFixed(1)} KM`}
              subtitle={`Ch. ${p.start_chainage||0} — ${(p.start_chainage||0)+roadLen}`} small />
          </div>
        )}
      </div>

      {/* ══════ PERFORMANCE INDICES & SCORES ROW ══════ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:10, marginBottom:16 }}>
        <div className="card" style={{ padding:14 }}>
          <ScoreRing value={health} size={76} color={gradeColor} grade={grade} label="Health Grade" sublabel={gradeLabel} />
        </div>
        <div className="card" style={{ padding:14 }}>
          {(() => {
            const spiColor = spiVal >= 1 ? '#10b981' : spiVal >= 0.8 ? '#f59e0b' : '#ef4444';
            const spiPct = Math.min(spiVal * 100, 200);
            const spiLabel = spiVal >= 1 ? 'On Schedule' : spiVal >= 0.8 ? 'Slightly Behind' : 'Behind Schedule';
            return <ScoreRing value={Math.min(spiPct, 100)} size={76} color={spiColor} grade={spiVal.toFixed(2)} label="SPI" sublabel={spiLabel} />;
          })()}
        </div>
        <div className="card" style={{ padding:14 }}>
          {(() => {
            const cpiColor = cpiVal >= 1 ? '#10b981' : cpiVal >= 0.8 ? '#f59e0b' : '#ef4444';
            const cpiLabel = cpiVal >= 1 ? 'Under Budget' : cpiVal >= 0.8 ? 'Slight Overrun' : cpiVal > 0 ? 'Over Budget' : 'No Data';
            return <ScoreRing value={cpiVal > 0 ? Math.min(cpiVal * 100, 100) : 0} size={76} color={cpiVal > 0 ? cpiColor : '#6b7280'} grade={cpiVal > 0 ? cpiVal.toFixed(2) : '—'} label="CPI" sublabel={cpiLabel} />;
          })()}
        </div>
        <div className="card" style={{ padding:14 }}>
          <ScoreRing value={qPct} size={76} label="Quality Score" sublabel={`${testPass}/${tests.length} passed`} />
        </div>
        <div className="card" style={{ padding:14 }}>
          <ScoreRing value={eqPct} size={76} label="Equipment Util." sublabel={`${eqOn}/${eqReq} on site`} />
        </div>
        <div className="card" style={{ padding:14 }}>
          <ScoreRing value={100-delayProb} size={76} label="Delay Risk"
            sublabel={`${delayProb}% probability`} color={delayProb>60?'#ef4444':delayProb>30?'#f59e0b':'#10b981'} />
        </div>
      </div>

      {/* ══════ EARNED VALUE SUMMARY ══════ */}
      {(certified > 0 || valueDone > 0) && (
        <div className="card" style={{ padding:'12px 16px', marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <h3 style={{ margin:0, fontSize:14 }}>Earned Value Analysis</h3>
            <span style={{ fontSize:10, color:'var(--text-muted)' }}>FIDIC Contract Performance</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:8 }}>
            {[
              { label:'Planned Value (PV)', value: fmtB(plannedValue), desc:'Budgeted cost of work scheduled' },
              { label:'Earned Value (EV)', value: fmtB(earnedValue), desc:'Budgeted cost of work performed' },
              { label:'Actual Cost (AC)', value: fmtB(actualCost), desc:'Actual cost of work performed' },
              { label:'BAC', value: fmtB(contractSum), desc:'Budget at completion' },
              { label:'EAC', value: fmtB(eacVal), desc:'Estimate at completion', color: eacVal > contractSum ? '#ef4444' : '#10b981' },
              { label:'VAC', value: fmtB(vacVal), desc:'Variance at completion', color: vacVal >= 0 ? '#10b981' : '#ef4444' },
              { label:'TCPI', value: tcpiVal.toFixed(2), desc:'To-complete performance index', color: tcpiVal > 1.1 ? '#ef4444' : '#10b981' },
              { label:'Projected Overrun', value: projectedOverrun > 0 ? `+${projectedOverrun} days` : projectedOverrun < 0 ? `${projectedOverrun} days` : 'On time', desc: spiVal > 0 ? `At current SPI of ${spiVal.toFixed(2)}` : '—', color: projectedOverrun > 0 ? '#ef4444' : '#10b981' },
            ].map((item, i) => (
              <div key={i} style={{ padding:'8px 10px', background:'var(--bg-hover)', borderRadius:'var(--radius)', textAlign:'center' }}>
                <div style={{ fontSize:9, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:2 }}>{item.label}</div>
                <div style={{ fontSize:15, fontWeight:800, color: item.color || 'var(--text)' }}>{item.value}</div>
                <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:1 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════ EARLY WARNINGS ══════ */}
      {warnings.length > 0 && (
        <div className="card" style={{ padding:14, marginBottom:16, borderLeft:'4px solid #f59e0b' }}>
          <h3 style={{ marginBottom:8, fontSize:13 }}>⚡ Early Warning — {warnings.filter(w=>w.type==='critical').length > 0 ? 'Action Required' : 'Monitor Closely'}</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {warnings.map((w,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12,
                padding:'5px 10px', borderRadius:'var(--radius)',
                background: w.type==='critical'?'#fef2f2':w.type==='warning'?'#fffbeb':'#eff6ff' }}>
                <span>{w.type==='critical'?'🔴':'🟡'}</span>
                <span style={{ color: w.type==='critical'?'#dc2626':'#d97706' }}>{w.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════ S-CURVE + CHAINAGE ══════ */}
      <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:14, marginBottom:14, alignItems:'stretch' }}>
        <div className="card" style={{ padding:14, display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <h3 style={{ margin:0, fontSize:14 }}>Progress Curve (S-Curve)</h3>
            <StatusBadge status={scheduleStatus} />
          </div>
          <div style={{ flex:1, minHeight:0 }}>
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={sCurve} margin={{ left:0, right:8, top:5 }}>
                <defs>
                  <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6b7280" stopOpacity={0.2}/><stop offset="100%" stopColor="#6b7280" stopOpacity={0.02}/></linearGradient>
                  <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e87b35" stopOpacity={0.3}/><stop offset="100%" stopColor="#e87b35" stopOpacity={0.02}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis dataKey="month" tick={{ fontSize:10, fill:'var(--text-muted)' }} />
                <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }} domain={[0,100]} tickFormatter={v=>v+'%'} />
                <Tooltip contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }} formatter={v=>v+'%'} />
                <Legend wrapperStyle={{ fontSize:11 }} />
                <Area type="monotone" dataKey="planned" stroke="#6b7280" strokeWidth={2} fill="url(#gP)" name="Planned" dot={false} />
                <Area type="monotone" dataKey="actual" stroke="#e87b35" strokeWidth={2.5} fill="url(#gA)" name="Actual" dot={{ r:3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginTop:6, padding:'0 8px' }}>
            <span>Planned: <strong>{timePct}%</strong></span>
            <span>Actual: <strong>{physPct}%</strong></span>
            <span style={{ color:variance>=0?'#10b981':'#ef4444', fontWeight:700 }}>Variance: {variance>0?'+':''}{variance}%</span>
          </div>

          {/* Monthly Variance Breakdown — fills space below S-Curve */}
          <div style={{ marginTop:14, padding:'10px 12px', background:'var(--bg-hover)', borderRadius:'var(--radius)' }}>
            <div style={{ fontSize:11, fontWeight:700, marginBottom:8, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em' }}>Monthly Variance Breakdown</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6 }}>
              {sCurve.filter(m => m.planned > 0 || m.actual > 0).slice(-8).map((m, i) => {
                const v = m.actual - m.planned;
                const vColor = v >= 0 ? '#10b981' : v >= -10 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={i} style={{ textAlign:'center', padding:'6px 4px', borderRadius:6, background:'var(--bg-card)', border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:2 }}>{m.month}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:vColor }}>{v > 0 ? '+' : ''}{v}%</div>
                    <div style={{ fontSize:9, color:'var(--text-muted)' }}>{m.actual}% of {m.planned}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Chainage Progress — mini summary */}
        <div className="card" style={{ padding:14, display:'flex', flexDirection:'column' }}>
          <h3 style={{ margin:'0 0 10px', fontSize:14 }}>Chainage Progress</h3>
          {chainageBlocks.length > 0 ? (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text-muted)', marginBottom:4 }}>
                <span>KM {(p.start_chainage||0).toFixed(0)}</span>
                <span>KM {((p.start_chainage||0)+roadLen).toFixed(0)}</span>
              </div>
              <div style={{ display:'flex', gap:2, marginBottom:12 }}>
                {chainageBlocks.map((b,i) => (
                  <div key={i} title={`Ch. ${b.from.toFixed(0)}-${b.to.toFixed(0)}: ${b.pct}%`}
                    style={{ flex:1, height:24, borderRadius:3, background:chainageColors[b.status],
                      opacity:0.85, cursor:'pointer', transition:'opacity 0.2s', position:'relative' }}
                    onMouseEnter={e=>e.currentTarget.style.opacity='1'}
                    onMouseLeave={e=>e.currentTarget.style.opacity='0.85'}>
                    {b.pct > 0 && <div style={{ position:'absolute', bottom:0, left:0, right:0, height:`${b.pct}%`,
                      background:chainageColors.completed, borderRadius:3, transition:'height 0.5s' }} />}
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
                {Object.entries(chainageColors).map(([k,c]) => (
                  <span key={k} style={{ fontSize:9, display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ width:10, height:10, borderRadius:2, background:c }} />
                    {k === 'notstarted' ? 'Not Started' : k.charAt(0).toUpperCase()+k.slice(1)}
                  </span>
                ))}
              </div>
            </>
          ) : <div className="text-sm text-muted" style={{ textAlign:'center', padding:40 }}>No chainage data — add pavement layers to see progress</div>}
        </div>
      </div>

      {/* ══════ CHAINAGE STRIP MAP ══════ */}
      <div className="card" style={{ padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
          <h3 style={{ margin:0, fontSize:15 }}>🗺️ Chainage Strip Map — Layer-by-Layer Progress</h3>
          <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:11 }}>
            {layers.length > 0 && <span style={{ padding:'3px 10px', borderRadius:9999, background:'#3b82f618', color:'#3b82f6', fontWeight:600 }}>{layers.length} segments</span>}
            <button className="btn btn-sm btn-secondary" style={{ fontSize:10 }} onClick={() => navigateTo('pavement', p)}>Full View</button>
          </div>
        </div>
        {layers.length > 0 && roadLen > 0 ? (() => {
          const STRIP_LAYERS = ['Subgrade','Improved Subgrade','Sub-base','Base','Prime Coat','Binder Course','Wearing Course','Surface Dressing','Seal Coat'];
          const stripColors = {
            'Subgrade':'#8B6914','Improved Subgrade':'#A0823B','Sub-base':'#C4956A','Base':'#D4A574',
            'Prime Coat':'#2a2a2a','Binder Course':'#3d3d3d','Wearing Course':'#555','Surface Dressing':'#4a4a4a','Seal Coat':'#333'
          };
          const statusOpacity = { 'Completed':1, 'Approved':1, 'In Progress':0.65, 'Not Started':0.2, 'Rejected':0.3 };
          const statusPattern = { 'Rejected': true };
          const chStart = p.start_chainage || 0;
          const chEnd = chStart + roadLen;
          // Only show layer types that have data
          const typesPresent = STRIP_LAYERS.filter(lt => layers.some(l => l.layer_type === lt));
          // Chainage tick marks
          const tickCount = Math.min(20, Math.max(4, Math.ceil(roadLen)));
          const tickStep = roadLen / tickCount;
          const ticks = [];
          for (let i = 0; i <= tickCount; i++) ticks.push(chStart + i * tickStep);
          // Summary per layer type
          const layerSummary = typesPresent.map(lt => {
            const segs = layers.filter(l => l.layer_type === lt);
            const totalLen = segs.reduce((s,l) => s + ((l.end_chainage || l.start_chainage) - l.start_chainage), 0);
            const doneLen = segs.filter(l => l.layer_status === 'Completed' || l.layer_status === 'Approved')
              .reduce((s,l) => s + ((l.end_chainage || l.start_chainage) - l.start_chainage), 0);
            const pr = totalLen > 0 ? Math.round((doneLen / totalLen) * 100) : 0;
            return { type: lt, segs: segs.length, totalLen, doneLen, pr };
          });
          return (
            <>
              <div style={{ overflowX:'auto', marginBottom:12 }}>
                <div style={{ minWidth: Math.max(600, typesPresent.length > 6 ? 800 : 600) }}>
                  {/* Chainage axis (top) */}
                  <div style={{ display:'flex', marginLeft:120, marginBottom:2, position:'relative', height:18 }}>
                    {ticks.map((t,i) => {
                      const leftPct = ((t - chStart) / roadLen) * 100;
                      return (
                        <div key={i} style={{ position:'absolute', left:`${leftPct}%`, transform:'translateX(-50%)', fontSize:9, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
                          {t.toFixed(t % 1 === 0 ? 0 : 1)}
                        </div>
                      );
                    })}
                  </div>
                  {/* Grid lines + layer rows */}
                  {typesPresent.map((lt, ri) => {
                    const segs = layers.filter(l => l.layer_type === lt);
                    const summary = layerSummary.find(s => s.type === lt);
                    return (
                      <div key={lt} style={{ display:'flex', alignItems:'center', marginBottom:2 }}>
                        {/* Layer label */}
                        <div style={{ width:120, flexShrink:0, paddingRight:8, textAlign:'right' }}>
                          <div style={{ fontSize:11, fontWeight:600, lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{lt}</div>
                          <div style={{ fontSize:9, color:'var(--text-muted)' }}>{summary.pr}% done</div>
                        </div>
                        {/* Strip bar */}
                        <div style={{ flex:1, position:'relative', height:22, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                          {/* Vertical grid lines */}
                          {ticks.map((t,i) => {
                            const leftPct = ((t - chStart) / roadLen) * 100;
                            return <div key={i} style={{ position:'absolute', left:`${leftPct}%`, top:0, bottom:0, width:1, background:'var(--bg-card)', opacity:0.6, zIndex:1 }} />;
                          })}
                          {/* Segments */}
                          {segs.map((seg, si) => {
                            const segStart = Math.max(seg.start_chainage, chStart);
                            const segEnd = Math.min(seg.end_chainage || seg.start_chainage, chEnd);
                            const leftPct = ((segStart - chStart) / roadLen) * 100;
                            const widthPct = ((segEnd - segStart) / roadLen) * 100;
                            if (widthPct <= 0) return null;
                            const op = statusOpacity[seg.layer_status] || 0.4;
                            const isRejected = statusPattern[seg.layer_status];
                            return (
                              <div key={si}
                                title={`${lt} Ch.${seg.start_chainage}–${seg.end_chainage || '?'} [${seg.layer_status}]${seg.material_type ? ' — '+seg.material_type : ''}`}
                                style={{
                                  position:'absolute', left:`${leftPct}%`, width:`${Math.max(widthPct, 0.5)}%`,
                                  top:1, bottom:1, borderRadius:2, zIndex:2, cursor:'pointer',
                                  background: isRejected
                                    ? `repeating-linear-gradient(45deg, ${stripColors[lt]||'#888'}, ${stripColors[lt]||'#888'} 3px, #ef4444 3px, #ef4444 6px)`
                                    : (stripColors[lt]||'#888'),
                                  opacity: op, transition:'opacity 0.2s',
                                  borderLeft: si > 0 ? '1px solid var(--bg-card)' : 'none',
                                }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={e => e.currentTarget.style.opacity = String(op)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {/* Bottom chainage axis */}
                  <div style={{ display:'flex', marginLeft:120, marginTop:2, position:'relative', height:14 }}>
                    {ticks.filter((_,i) => i % 2 === 0 || ticks.length <= 10).map((t,i) => {
                      const leftPct = ((t - chStart) / roadLen) * 100;
                      return (
                        <div key={i} style={{ position:'absolute', left:`${leftPct}%`, transform:'translateX(-50%)', fontSize:8, color:'var(--text-muted)' }}>
                          Km{t.toFixed(0)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Legend + Summary Stats */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  {[['Completed/Approved',1],['In Progress',0.65],['Not Started',0.2],['Rejected','pattern']].map(([label,op]) => (
                    <span key={label} style={{ fontSize:9, display:'flex', alignItems:'center', gap:4 }}>
                      <span style={{ width:14, height:10, borderRadius:2,
                        background: op === 'pattern' ? 'repeating-linear-gradient(45deg, #666, #666 2px, #ef4444 2px, #ef4444 4px)' : '#666',
                        opacity: typeof op === 'number' ? op : 1 }} />
                      {label}
                    </span>
                  ))}
                </div>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                  {layerSummary.slice(0, 6).map(ls => (
                    <div key={ls.type} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:14, fontWeight:800, color: ls.pr >= 80 ? '#10b981' : ls.pr >= 40 ? '#f59e0b' : ls.pr > 0 ? '#ef4444' : 'var(--text-muted)' }}>{ls.pr}%</div>
                      <div style={{ fontSize:9, color:'var(--text-muted)', maxWidth:60, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ls.type}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          );
        })() : (
          <div className="text-sm text-muted" style={{ textAlign:'center', padding:40 }}>
            No pavement layer data — add layers in the Pavement page to see the strip map.
          </div>
        )}
      </div>

      {/* ══════ PROGRESS SUMMARY — KEY LAYERS (full width) ══════ */}
      <div className="card" style={{ padding:16, marginBottom:16 }}>
        <h3 style={{ margin:'0 0 10px', fontSize:15 }}>📋 Progress Summary — Key Layers</h3>
        {(() => {
          // Curated list: the critical-path layers every RE tracks
          const KEY_LAYERS = [
            'Site Clearance', 'Topsoil Stripping', 'Compaction of OGL', 'Final Earthworks',
            'Bottom Subgrade', 'Top Subgrade', 'Subbase', 'Base',
            'Asphalt Concrete', 'Surface Dressing', 'Concrete Pavement',
          ];
          // Match against project activities (components + parents), flexible name matching
          const matchActivity = (keyword) => {
            const kw = keyword.toLowerCase();
            return works.find(w => {
              const n = (w.activity_name || '').toLowerCase();
              // Exact or contains match
              if (n === kw) return true;
              if (n.includes(kw)) return true;
              // Specific mappings
              if (kw === 'site clearance' && n === 'bush clearing') return true;
              if (kw === 'topsoil stripping' && (n === 'topsoil stripping' || n === 'top soil stripping')) return true;
              if (kw === 'compaction of ogl' && n.includes('compaction') && (w.category === 'Earthworks' || (w.parent?.activity_name || '').toLowerCase().includes('ogl'))) return true;
              if (kw === 'final earthworks' && (n.includes('formation') || n === 'excavation to formation' || n === 'shaping & trimming')) return true;
              if (kw === 'bottom subgrade' && n.includes('bottom') && n.includes('subgrade')) return true;
              if (kw === 'top subgrade' && n.includes('top') && n.includes('subgrade')) return true;
              if (kw === 'subbase' && (n.includes('subbase') || n.includes('sub-base') || n.includes('cig') || n.includes('natural material'))) return true;
              if (kw === 'base' && (n.includes('gcs base') || n.includes('graded crushed') || n.includes('cement stab') || n.includes('lime/cement'))) return true;
              if (kw === 'asphalt concrete' && (n.includes('binder course') || n.includes('wearing course') || n.includes('asphalt laying') || n.includes('ac'))) return true;
              if (kw === 'surface dressing' && n.includes('surface dressing')) return true;
              if (kw === 'concrete pavement' && n.includes('concrete pavement')) return true;
              return false;
            });
          };
          const rows = KEY_LAYERS.map((name, i) => {
            const act = matchActivity(name);
            const parent = act?.parent_activity_id ? works.find(w => w.id === act.parent_activity_id) : null;
            const planned = act?.planned_quantity || parent?.planned_quantity || 0;
            const done = act?.completed_quantity || 0;
            const unit = act?.unit || 'Km';
            const pctRaw = planned > 0 ? (done / planned) * 100 : 0;
            const pctDisplay = Math.min(100, Math.round(pctRaw));
            const isLive = act?.last_progress_date === today;
            const remaining = Math.max(0, planned - done);
            const layerStatus = pctDisplay >= 100 ? 'Completed' : pctDisplay > 0 ? 'In Progress' : 'Not Started';
            return { name, act, planned, done, unit, pctDisplay, isLive, remaining, layerStatus, itemNo: i + 1 };
          });
          const layersStarted = rows.filter(r => r.pctDisplay > 0).length;
          const layersComplete = rows.filter(r => r.pctDisplay >= 100).length;
          const avgProgress = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.pctDisplay, 0) / rows.length) : 0;

          return (
            <>
              <div style={{ display:'flex', gap:16, marginBottom:12, fontSize:11 }}>
                <span style={{ padding:'4px 10px', borderRadius:9999, background:'#3b82f618', color:'#3b82f6', fontWeight:600 }}>
                  {layersStarted} of {rows.length} layers started
                </span>
                <span style={{ padding:'4px 10px', borderRadius:9999, background:'#10b98118', color:'#10b981', fontWeight:600 }}>
                  {layersComplete} completed
                </span>
                <span style={{ padding:'4px 10px', borderRadius:9999, background:'#e87b3518', color:'#e87b35', fontWeight:600 }}>
                  Avg: {avgProgress}%
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:'2px solid var(--border)' }}>
                      <th style={{ textAlign:'center', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:35 }}>No.</th>
                      <th style={{ textAlign:'left', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase' }}>Layer</th>
                      <th style={{ textAlign:'center', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:45 }}>Unit</th>
                      <th style={{ textAlign:'right', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:65 }}>Billed</th>
                      <th style={{ textAlign:'right', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:75 }}>Achieved</th>
                      <th style={{ textAlign:'right', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:75 }}>Remaining</th>
                      <th style={{ padding:'8px 6px', width:120 }}></th>
                      <th style={{ textAlign:'center', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:95 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.itemNo} style={{ borderBottom:'1px solid var(--border)', background: r.isLive ? '#10b98108' : 'transparent' }}>
                        <td style={{ textAlign:'center', padding:'6px', fontWeight:600, color:'var(--text-muted)' }}>{r.itemNo}</td>
                        <td style={{ padding:'6px', fontWeight:500 }}>
                          {r.isLive && <span style={{ width:7, height:7, borderRadius:'50%', background:'#10b981', display:'inline-block', marginRight:5, boxShadow:'0 0 5px #10b981', animation:'pulse 1.5s infinite' }} />}
                          {r.name}
                        </td>
                        <td style={{ textAlign:'center', padding:'6px', color:'var(--text-muted)' }}>{r.unit}</td>
                        <td className="text-mono" style={{ textAlign:'right', padding:'6px' }}>{r.planned > 0 ? Number(r.planned).toLocaleString(undefined, {minimumFractionDigits:1, maximumFractionDigits:1}) : '—'}</td>
                        <td className="text-mono" style={{ textAlign:'right', padding:'6px', fontWeight:700,
                          color: r.pctDisplay >= 80 ? '#10b981' : r.pctDisplay >= 40 ? '#e87b35' : r.done > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                          {r.done > 0 ? Number(r.done).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '—'}
                        </td>
                        <td className="text-mono" style={{ textAlign:'right', padding:'6px', color:'var(--text-muted)' }}>
                          {r.planned > 0 && r.pctDisplay < 100 ? Number(r.remaining).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : r.pctDisplay >= 100 ? '0.00' : '—'}
                        </td>
                        <td style={{ padding:'6px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <div style={{ width:70, height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${r.pctDisplay}%`, borderRadius:3,
                                background: r.pctDisplay >= 80 ? '#10b981' : r.pctDisplay >= 40 ? '#e87b35' : r.pctDisplay > 0 ? '#ef4444' : 'transparent' }} />
                            </div>
                            <span style={{ fontSize:10, fontWeight:600, minWidth:28,
                              color: r.pctDisplay >= 80 ? '#10b981' : r.pctDisplay >= 40 ? '#e87b35' : r.pctDisplay > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                              {r.pctDisplay > 0 ? r.pctDisplay + '%' : ''}
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign:'center', padding:'6px' }}>
                          {(() => {
                            const sc = r.layerStatus === 'Completed' ? '#10b981' : r.layerStatus === 'In Progress' ? '#e87b35' : '#6b7280';
                            return <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:9999, fontSize:9, fontWeight:700,
                              background:sc+'18', color:sc, border:`1px solid ${sc}35`, whiteSpace:'nowrap' }}>{r.layerStatus}</span>;
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </div>

      {/* ══════ ENGINEER'S INSIGHTS & RECOMMENDATIONS ══════ */}
      <div className="card" style={{ padding:16, marginBottom:16 }}>
        <h3 style={{ margin:'0 0 12px', fontSize:15 }}>🧠 Engineer's Insights &amp; Recommendations</h3>
        {(() => {
          const insights = [];
          const monthsRemaining = Math.max(0.1, remainingDays / 30);
          const requiredRate = (100 - physPct) / monthsRemaining;
          const actualRate = elapsedMonths > 0 ? physPct / elapsedMonths : 0;
          const rateMultiple = actualRate > 0 ? (requiredRate / actualRate) : Infinity;

          // Schedule insight
          if (variance < -10) {
            insights.push({ sev:'critical', icon:'📅', title:'Schedule Recovery Required',
              detail:`Physical progress (${physPct}%) trails time elapsed (${timePct}%) by ${Math.abs(variance)} points. At the current rate of ${actualRate.toFixed(1)}%/month, the required rate to finish on time is ${requiredRate.toFixed(1)}%/month — a ${isFinite(rateMultiple) ? rateMultiple.toFixed(1) + '×' : 'major'} acceleration.`,
              action:'Request a revised programme under FIDIC Cl. 8.3 and consider a Cl. 8.6 rate-of-progress notice.' });
          } else if (variance >= 0) {
            insights.push({ sev:'positive', icon:'📅', title:'Programme On Track',
              detail:`Physical progress (${physPct}%) is ${variance > 0 ? variance + ' points ahead of' : 'level with'} time elapsed (${timePct}%).`,
              action:'Maintain current production rates and resource levels.' });
          }

          // Cost / EV insight
          if (cpiVal > 0 && cpiVal < 0.95) {
            insights.push({ sev:'warning', icon:'💰', title:'Cost Efficiency Below Par',
              detail:`CPI of ${cpiVal.toFixed(2)} means every KES 1.00 certified earns only KES ${cpiVal.toFixed(2)} of value. Estimate at Completion is ${fmtB(eacVal)} against a budget of ${fmtB(contractSum)} (${vacVal < 0 ? fmtB(Math.abs(vacVal)) + ' projected overrun' : 'within budget'}).`,
              action:'Audit measured quantities vs certified amounts; tighten interim valuations.' });
          } else if (cpiVal >= 1) {
            insights.push({ sev:'positive', icon:'💰', title:'Cost Performance Healthy',
              detail:`CPI of ${cpiVal.toFixed(2)} — value earned exceeds amounts certified. EAC ${fmtB(eacVal)} vs budget ${fmtB(contractSum)}.`,
              action:'No corrective action needed; keep certification discipline.' });
          }

          // Cash flow insight
          if (totalUnpaid > 0 && certified > 0 && paymentRatio < 80) {
            insights.push({ sev:'warning', icon:'🏦', title:'Payment Lag',
              detail:`${fmtB(totalUnpaid)} certified but unpaid (${100 - paymentRatio}% of certifications outstanding). Sustained lag risks contractor cash-flow claims under FIDIC Cl. 14.8 (delayed payment financing charges).`,
              action:'Escalate outstanding certificates to the Employer for settlement.' });
          }

          // Productivity insight
          if (stalledActivities.length > 0) {
            insights.push({ sev:'warning', icon:'⚙️', title:`${stalledActivities.length} Stalled Activit${stalledActivities.length > 1 ? 'ies' : 'y'}`,
              detail:`${stalledActivities.length} in-progress activit${stalledActivities.length > 1 ? 'ies have' : 'y has'} recorded no progress for 14+ days${liveActivities.length === 0 ? ', and no activity reported progress today' : ''}.`,
              action:'Review resourcing of stalled fronts at the next site meeting.' });
          }

          // Equipment insight
          if (eqReq > 0 && eqPct < 70) {
            insights.push({ sev:'critical', icon:'🚜', title:'Equipment Mobilization Gap',
              detail:`Only ${eqOn} of ${eqReq} required equipment units are on site (${eqPct}%). Under-mobilization is the leading predictor of the current delay probability (${delayProb}%).`,
              action:'Issue a mobilization notice to the Contractor listing the deficit plant.' });
          }

          // Quality insight
          if (tests.length > 0 && testFail > 0) {
            insights.push({ sev: qPct < 80 ? 'critical' : 'warning', icon:'🧪', title:'Quality Watch',
              detail:`${testFail} of ${tests.length} tests failed (pass rate ${qPct}%). Failed layers must be reworked before overlaying.`,
              action:'Hold points on subsequent layers until retests pass.' });
          } else if (tests.length === 0) {
            insights.push({ sev:'info', icon:'🧪', title:'No Test Records',
              detail:'No quality tests are recorded. Compaction, CBR and density verification should accompany each completed layer.',
              action:'Log all field/lab test results in the Quality module.' });
          }

          // Obligations insight
          {
            const obs = d.obligations || [];
            const todayD = new Date();
            const valid = obs.filter(o => o.expiry_date && new Date(o.expiry_date) >= todayD).length;
            const expired = obs.filter(o => o.expiry_date && new Date(o.expiry_date) < todayD).length;
            if (obs.length === 0) {
              insights.push({ sev:'info', icon:'🛡️', title:'Statutory Obligations Unrecorded',
                detail:'No guarantees, insurances or licences are logged. The Employer is exposed if the Performance Guarantee or CAR insurance has lapsed unnoticed.',
                action:'Populate the Statutory Obligations Matrix from the contract documents.' });
            } else if (expired > 0) {
              insights.push({ sev:'critical', icon:'🛡️', title:`${expired} Obligation${expired > 1 ? 's' : ''} Expired`,
                detail:`${expired} of ${obs.length} recorded obligations have passed expiry; only ${valid} remain valid.`,
                action:'Demand renewal certificates from the Contractor immediately.' });
            }
          }

          // Risk insight
          if (critRisks > 0) {
            insights.push({ sev:'warning', icon:'⚠️', title:`${critRisks} Critical Risk${critRisks > 1 ? 's' : ''} Open`,
              detail:`The risk register carries ${openRisks} open risk${openRisks > 1 ? 's' : ''}, ${critRisks} rated critical.`,
              action:'Review mitigation owners and dates at the monthly progress meeting.' });
          }

          // Completion projection
          if (projectedOverrun > 30 && spiVal > 0 && spiVal < 0.9) {
            insights.push({ sev:'critical', icon:'🏁', title:'Completion Forecast Slipping',
              detail:`At SPI ${spiVal.toFixed(2)}, the works trend toward ${projectedEndDays} days total duration — roughly ${Math.round(projectedOverrun / 30)} month${Math.round(projectedOverrun / 30) > 1 ? 's' : ''} beyond the approved ${totalDays}-day period.`,
              action:'Evaluate acceleration options now; EOT alone will not recover the Employer\'s programme.' });
          }

          const sevRank = { critical: 0, warning: 1, info: 2, positive: 3 };
          insights.sort((a, b) => sevRank[a.sev] - sevRank[b.sev]);
          const sevColors = { critical:'#ef4444', warning:'#f59e0b', info:'#3b82f6', positive:'#10b981' };
          const counts = insights.reduce((m, i) => { m[i.sev] = (m[i.sev] || 0) + 1; return m; }, {});

          return (
            <>
              <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
                {Object.entries(sevColors).map(([sev, c]) => counts[sev] ? (
                  <span key={sev} style={{ padding:'3px 10px', borderRadius:9999, fontSize:10, fontWeight:700,
                    background:c+'18', color:c, border:`1px solid ${c}35`, textTransform:'capitalize' }}>
                    {counts[sev]} {sev}
                  </span>
                ) : null)}
              </div>
              {insights.length === 0 ? (
                <div className="text-sm text-muted" style={{ textAlign:'center', padding:20 }}>All metrics nominal — no findings to report.</div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:10 }}>
                  {insights.map((ins, i) => {
                    const c = sevColors[ins.sev];
                    return (
                      <div key={i} style={{ padding:'12px 14px', borderRadius:10, background:c+'0a',
                        border:`1px solid ${c}25`, borderLeft:`4px solid ${c}` }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                          <span style={{ fontSize:16 }}>{ins.icon}</span>
                          <span style={{ fontSize:13, fontWeight:700, color:c }}>{ins.title}</span>
                        </div>
                        <div style={{ fontSize:12, lineHeight:1.55, marginBottom:8 }}>{ins.detail}</div>
                        <div style={{ fontSize:11, color:'var(--text-muted)', display:'flex', gap:6 }}>
                          <span style={{ fontWeight:700, color:c, whiteSpace:'nowrap' }}>→ Action:</span>
                          <span>{ins.action}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* ══════ LIVE ACTIVITY MONITOR ══════ */}
      <div className="card" style={{ padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <h3 style={{ margin:0, fontSize:15 }}>
            <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#10b981',
              marginRight:8, boxShadow:'0 0 8px #10b981', animation:'pulse 1.5s infinite' }} />
            Live Activity Monitor
          </h3>
          <div style={{ display:'flex', gap:12, fontSize:11 }}>
            <span style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:'#10b981', boxShadow:'0 0 4px #10b981' }} />
              Active Today ({liveActivities.length})
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:'#3b82f6' }} />
              This Week ({activeThisWeek.length})
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:'#ef4444' }} />
              Stalled ({stalledActivities.length})
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:'#6b7280' }} />
              Completed ({completedActivities.length}/{works.length})
            </span>
          </div>
        </div>

        {/* Activity Status Strip */}
        <div style={{ display:'flex', gap:2, height:14, borderRadius:7, overflow:'hidden', marginBottom:16 }}>
          {works.length > 0 && (
            <>
              <div style={{ width:`${pct(completedActivities.length, works.length)}%`, background:'#10b981', transition:'width 1s' }}
                title={`Completed: ${completedActivities.length}`} />
              <div style={{ width:`${pct(liveActivities.length + activeThisWeek.length, works.length)}%`,
                background:'linear-gradient(90deg, #34d399, #3b82f6)', transition:'width 1s' }}
                title={`Active: ${liveActivities.length + activeThisWeek.length}`} />
              <div style={{ width:`${pct(stalledActivities.length, works.length)}%`, background:'#ef4444', transition:'width 1s' }}
                title={`Stalled: ${stalledActivities.length}`} />
              <div style={{ flex:1, background:'#374151' }} title="Not Started / Pending" />
            </>
          )}
        </div>

        {/* Individual Activities Table */}
        {topActivities.length > 0 ? (
          <div style={{ maxHeight:400, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--border)' }}>
                  <th style={{ textAlign:'left', padding:'6px 8px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase' }}>Status</th>
                  <th style={{ textAlign:'left', padding:'6px 8px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase' }}>Activity</th>
                  <th style={{ textAlign:'left', padding:'6px 8px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase' }}>Category</th>
                  <th style={{ textAlign:'center', padding:'6px 8px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase' }}>Progress</th>
                  <th style={{ textAlign:'right', padding:'6px 8px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase' }}>Last Update</th>
                </tr>
              </thead>
              <tbody>
                {topActivities.map((a,i) => (
                  <tr key={i} style={{ borderBottom:'1px solid var(--border)',
                    background: a.isLive ? '#10b98108' : a.isStalled ? '#ef444408' : 'transparent' }}>
                    <td style={{ padding:'8px', width:40 }}>
                      {a.isLive ? (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                          <span style={{ width:10, height:10, borderRadius:'50%', background:'#10b981',
                            boxShadow:'0 0 8px #10b981', animation:'pulse 1.5s infinite' }} />
                          <span style={{ fontSize:9, fontWeight:700, color:'#10b981' }}>LIVE</span>
                        </span>
                      ) : a.isStalled ? (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                          <span style={{ width:10, height:10, borderRadius:'50%', background:'#ef4444' }} />
                          <span style={{ fontSize:9, fontWeight:700, color:'#ef4444' }}>STALLED</span>
                        </span>
                      ) : a.status === 'Completed' || a.status === 'Approved' ? (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                          <span style={{ fontSize:12 }}>✅</span>
                          <span style={{ fontSize:9, fontWeight:700, color:'#6b7280' }}>DONE</span>
                        </span>
                      ) : a.isActiveWeek ? (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                          <span style={{ width:10, height:10, borderRadius:'50%', background:'#3b82f6' }} />
                          <span style={{ fontSize:9, fontWeight:700, color:'#3b82f6' }}>ACTIVE</span>
                        </span>
                      ) : (
                        <span style={{ width:10, height:10, borderRadius:'50%', background:'#374151', display:'inline-block' }} />
                      )}
                    </td>
                    <td style={{ padding:'8px', fontWeight: a.isCritical ? 700 : 500 }}>
                      {a.isCritical && <span style={{ color:'#ef4444', marginRight:4, fontSize:10 }}>★</span>}
                      {a.name.length > 40 ? a.name.slice(0,40)+'...' : a.name}
                    </td>
                    <td style={{ padding:'8px' }}>
                      <span className="badge badge-muted" style={{ fontSize:9 }}>{a.category || '—'}</span>
                    </td>
                    <td style={{ padding:'8px', width:140 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ flex:1, height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                          <div style={{ height:'100%', borderRadius:3, transition:'width 0.8s ease',
                            width:`${a.pct}%`,
                            background: a.isLive ? 'linear-gradient(90deg, #10b981, #34d399)'
                              : a.pct >= 80 ? '#10b981' : a.pct >= 40 ? '#e87b35' : a.pct > 0 ? '#ef4444' : '#374151' }} />
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, width:32, textAlign:'right',
                          color: a.overMeasured ? '#ef4444' : a.pct >= 80 ? '#10b981' : a.pct >= 40 ? '#e87b35' : '#ef4444' }}
                          title={a.overMeasured ? `Over-measured: recorded ${a.rawPct}% of planned quantity — check chainage entries` : ''}>
                          {a.overMeasured ? '⚠100%' : `${a.pct}%`}</span>
                      </div>
                    </td>
                    <td style={{ padding:'8px', textAlign:'right', fontSize:11, color:'var(--text-muted)' }}>
                      {a.lastDate || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-muted" style={{ textAlign:'center', padding:30 }}>
            No activity progress recorded yet. Go to Works Activities to start logging progress.
          </div>
        )}

        {/* Stalled Warning */}
        {stalledActivities.length > 0 && (
          <div style={{ marginTop:12, padding:'10px 14px', background:'#fef2f2', borderRadius:'var(--radius)', borderLeft:'3px solid #ef4444' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#dc2626', marginBottom:4 }}>
              ⚠ {stalledActivities.length} Stalled Activit{stalledActivities.length === 1 ? 'y' : 'ies'} — No progress for 14+ days
            </div>
            <div style={{ fontSize:11, color:'#991b1b' }}>
              {stalledActivities.slice(0,5).map(w => w.activity_name).join(' · ')}
              {stalledActivities.length > 5 && ` · +${stalledActivities.length - 5} more`}
            </div>
          </div>
        )}
      </div>

      {/* ══════ PROGRESS RATE ANALYSIS + MEETING RECOMMENDATION ══════ */}
      <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:14, marginBottom:16, alignItems:'start' }}>
        {/* Progress Rate Chart */}
        <div className="card" style={{ padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <h3 style={{ margin:0, fontSize:15 }}>
              {trend.icon} Progress Rate Analysis
            </h3>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:12, fontWeight:700, color:trend.color }}>{trend.label}</span>
              {rateChange !== 0 && progressTrend !== 'no_data' && (
                <span style={{ fontSize:11, fontWeight:700, color: rateChange > 0 ? '#10b981' : '#ef4444',
                  padding:'2px 8px', borderRadius:9999, background: rateChange > 0 ? '#10b98118' : '#ef444418' }}>
                  {rateChange > 0 ? '▲' : '▼'} {Math.abs(rateChange)}%
                </span>
              )}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyRates} margin={{ left:0, right:8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="week" tick={{ fontSize:10, fill:'var(--text-muted)' }} />
              <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }} />
              <Tooltip contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}
                labelFormatter={l => {
                  const w = weeklyRates.find(r => r.week === l);
                  return w ? `Week of ${w.weekDate}` : l;
                }} />
              <Legend wrapperStyle={{ fontSize:10 }} />
              <Bar dataKey="reports" fill="#3b82f6" name="Daily Reports" radius={[3,3,0,0]} />
              <Bar dataKey="activities" fill="#e87b35" name="Activities Progressed" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>

          <div style={{ marginTop:10, padding:'10px 14px', borderRadius:'var(--radius)',
            background: progressTrend === 'critical_decline' ? '#fef2f2' : progressTrend === 'declining' ? '#fffbeb'
              : progressTrend === 'increasing' ? '#f0fdf4' : 'var(--bg-hover)', fontSize:12 }}>
            <div style={{ fontWeight:600, color:trend.color, marginBottom:2 }}>{trend.desc}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>
              Recent 4-week avg: <strong>{recentAvg.toFixed(1)}</strong> · Previous 4-week avg: <strong>{previousAvg.toFixed(1)}</strong>
              {decliningWeeks > 0 && <span> · <span style={{ color:'#ef4444' }}>{decliningWeeks} consecutive declining week{decliningWeeks > 1 ? 's' : ''}</span></span>}
            </div>
            {progressTrend === 'critical_decline' && (
              <div style={{ marginTop:6, fontSize:11, color:'#991b1b', fontWeight:500 }}>
                Under FIDIC Cl. 8.6, the Engineer may instruct the Contractor to submit a revised programme
                showing modified methods to achieve completion within the Time for Completion.
              </div>
            )}
          </div>
        </div>

        {/* Meeting Recommendation Panel */}
        <div className="card" style={{ padding:16, borderLeft:`4px solid ${meetingColors[meetingUrgency]}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <h3 style={{ margin:0, fontSize:15 }}>📋 Meeting Recommendation</h3>
          </div>

          {/* Meeting Status Indicator */}
          <div style={{ textAlign:'center', padding:'16px 0', marginBottom:14 }}>
            <div style={{ fontSize:48, marginBottom:6 }}>
              {meetingUrgency === 'urgent' ? '🚨' : meetingUrgency === 'required' ? '⚠️' : meetingUrgency === 'recommended' ? 'ℹ️' : '✅'}
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:meetingColors[meetingUrgency] }}>
              {meetingLabels[meetingUrgency]}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
              Project Management Meeting
            </div>
          </div>

          {/* Reasons */}
          {meetingReasons.length > 0 ? (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {meetingReasons.map((r, i) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:12,
                  padding:'8px 10px', borderRadius:'var(--radius)',
                  background: r.urgency === 'urgent' ? '#fef2f2' : r.urgency === 'required' ? '#fffbeb' : '#eff6ff' }}>
                  <span style={{ flexShrink:0, marginTop:1 }}>
                    {r.urgency === 'urgent' ? '🔴' : r.urgency === 'required' ? '🟡' : '🔵'}
                  </span>
                  <div>
                    <span style={{ color: r.urgency === 'urgent' ? '#dc2626' : r.urgency === 'required' ? '#d97706' : '#2563eb' }}>
                      {r.reason}
                    </span>
                    {r.fidic && (
                      <span style={{ marginLeft:6, fontSize:9, padding:'1px 5px', borderRadius:4,
                        background:'var(--bg-hover)', color:'var(--text-muted)', fontWeight:600 }}>
                        FIDIC {r.fidic}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)', padding:'10px 0' }}>
              No issues requiring management attention at this time. Continue monitoring.
            </div>
          )}

          {/* Recommended Actions */}
          {meetingUrgency !== 'none' && (
            <div style={{ marginTop:14, padding:'10px 14px', background:'var(--bg-hover)', borderRadius:'var(--radius)', fontSize:11 }}>
              <div style={{ fontWeight:700, marginBottom:6, color:'var(--text)' }}>Recommended Actions:</div>
              {meetingUrgency === 'urgent' && (
                <div style={{ display:'flex', flexDirection:'column', gap:3, color:'var(--text-muted)' }}>
                  <div>1. Convene emergency project management meeting within 48 hours</div>
                  <div>2. Request Contractor's revised programme per FIDIC Cl. 8.6</div>
                  <div>3. Issue Notice to Contractor citing specific concerns</div>
                  <div>4. Review resource mobilisation and acceleration options</div>
                  <div>5. Consider Engineer's Instruction for recovery measures</div>
                </div>
              )}
              {meetingUrgency === 'required' && (
                <div style={{ display:'flex', flexDirection:'column', gap:3, color:'var(--text-muted)' }}>
                  <div>1. Schedule project management meeting within one week</div>
                  <div>2. Prepare progress comparison report for discussion</div>
                  <div>3. Review contractor's current programme vs actual progress</div>
                  <div>4. Assess need for additional resources or revised methodology</div>
                </div>
              )}
              {meetingUrgency === 'recommended' && (
                <div style={{ display:'flex', flexDirection:'column', gap:3, color:'var(--text-muted)' }}>
                  <div>1. Include in next scheduled project review meeting agenda</div>
                  <div>2. Monitor identified issues over the next reporting period</div>
                  <div>3. Request contractor's explanation if trend continues</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════ FINANCIAL S-CURVE + COMBINED PROGRESS ══════ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
        {/* Financial S-Curve */}
        <div className="card" style={{ padding:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <h3 style={{ margin:0, fontSize:14 }}>Financial Progress Curve</h3>
            <span className="badge badge-muted" style={{ fontSize:9 }}>KES</span>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={finSCurve} margin={{ left:0, right:8, top:5 }}>
              <defs>
                <linearGradient id="gFP" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6b7280" stopOpacity={0.15}/><stop offset="100%" stopColor="#6b7280" stopOpacity={0.02}/></linearGradient>
                <linearGradient id="gFC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.25}/><stop offset="100%" stopColor="#2563eb" stopOpacity={0.02}/></linearGradient>
                <linearGradient id="gFPd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="100%" stopColor="#10b981" stopOpacity={0.02}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="month" tick={{ fontSize:10, fill:'var(--text-muted)' }} />
              <YAxis tick={{ fontSize:9, fill:'var(--text-muted)' }} tickFormatter={v=>(v/1e6).toFixed(0)+'M'} />
              <Tooltip contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }} formatter={v=>fmt(v)} />
              <Legend wrapperStyle={{ fontSize:10 }} />
              <Area type="monotone" dataKey="planned" stroke="#6b7280" strokeWidth={2} fill="url(#gFP)" name="Planned Expenditure" dot={false} strokeDasharray="6 3" />
              <Area type="monotone" dataKey="certified" stroke="#2563eb" strokeWidth={2.5} fill="url(#gFC)" name="Actual Certified" dot={{ r:3 }} />
              <Area type="monotone" dataKey="paid" stroke="#10b981" strokeWidth={2} fill="url(#gFPd)" name="Actual Paid" dot={{ r:2 }} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginTop:6, padding:'0 8px' }}>
            <span>Planned: <strong>{fmtB(finSCurve[finSCurve.length-1]?.planned || 0)}</strong></span>
            <span style={{ color:'#2563eb' }}>Certified: <strong>{fmtB(certified)}</strong></span>
            <span style={{ color:'#10b981' }}>Paid: <strong>{fmtB(paid)}</strong></span>
          </div>
        </div>

        {/* Combined Physical vs Financial */}
        <div className="card" style={{ padding:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <h3 style={{ margin:0, fontSize:14 }}>Physical vs Financial Progress</h3>
            <StatusBadge status={Math.abs(physPct - finPct) <= 10 ? 'On Track' : finPct > physPct ? 'Overpaid' : 'Underpaid'} />
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={combinedProgress} margin={{ left:0, right:8, top:5 }}>
              <defs>
                <linearGradient id="gPhy" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e87b35" stopOpacity={0.2}/><stop offset="100%" stopColor="#e87b35" stopOpacity={0.02}/></linearGradient>
                <linearGradient id="gFin" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.2}/><stop offset="100%" stopColor="#2563eb" stopOpacity={0.02}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="month" tick={{ fontSize:10, fill:'var(--text-muted)' }} />
              <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }} domain={[0,100]} tickFormatter={v=>v+'%'} />
              <Tooltip contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }} formatter={v=>v+'%'} />
              <Legend wrapperStyle={{ fontSize:10 }} />
              <Area type="monotone" dataKey="physPlanned" stroke="#6b7280" strokeWidth={1.5} fill="none" name="Physical Planned" dot={false} strokeDasharray="4 3" />
              <Area type="monotone" dataKey="physActual" stroke="#e87b35" strokeWidth={2.5} fill="url(#gPhy)" name="Physical Actual" dot={{ r:3 }} />
              <Area type="monotone" dataKey="finActual" stroke="#2563eb" strokeWidth={2.5} fill="url(#gFin)" name="Financial Actual" dot={{ r:3 }} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginTop:6, padding:'0 8px' }}>
            <span style={{ color:'#e87b35' }}>Physical: <strong>{physPct}%</strong></span>
            <span style={{ color:'#2563eb' }}>Financial: <strong>{finPct}%</strong></span>
            <span style={{ color: Math.abs(physPct-finPct)<=10?'#10b981':'#ef4444', fontWeight:700 }}>
              Gap: {physPct > finPct ? '+' : ''}{physPct - finPct}%
            </span>
          </div>
          {Math.abs(physPct - finPct) > 15 && (
            <div style={{ marginTop:8, padding:'6px 10px', borderRadius:'var(--radius)', fontSize:11,
              background: finPct > physPct ? '#fef2f2' : '#eff6ff',
              color: finPct > physPct ? '#dc2626' : '#2563eb' }}>
              {finPct > physPct
                ? '⚠ Financial progress exceeds physical — review for potential overpayment'
                : 'ℹ Physical progress exceeds financial — contractor may be underpaid'}
            </div>
          )}
        </div>
      </div>

      {/* ══════ FINANCIAL + QUALITY + RISK ══════ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:14, marginBottom:16 }}>
        {/* IPC / Financial Section — Full Width */}
        <div className="card" style={{ padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
            <h3 style={{ margin:0, fontSize:15 }}>Payment Certificates (IPC) & Financial Summary</h3>
            <span className="text-sm text-muted">{ipcs.length} IPC{ipcs.length!==1?'s':''} issued</span>
          </div>

          {/* Financial KPI strip */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:10, marginBottom:16 }}>
            <div style={{ textAlign:'center', padding:'10px 8px', background:'var(--bg-hover)', borderRadius:'var(--radius)', borderTop:'3px solid #2563eb' }}>
              <div style={{ fontSize:18, fontWeight:800, color:'#2563eb' }}>{fmtB(certified)}</div>
              <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600 }}>Total Certified</div>
            </div>
            <div style={{ textAlign:'center', padding:'10px 8px', background:'var(--bg-hover)', borderRadius:'var(--radius)', borderTop:'3px solid #10b981' }}>
              <div style={{ fontSize:18, fontWeight:800, color:'#10b981' }}>{fmtB(paid)}</div>
              <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600 }}>Total Paid</div>
            </div>
            <div style={{ textAlign:'center', padding:'10px 8px', background:'var(--bg-hover)', borderRadius:'var(--radius)', borderTop:`3px solid ${totalUnpaid>0?'#ef4444':'#10b981'}` }}>
              <div style={{ fontSize:18, fontWeight:800, color:totalUnpaid>0?'#ef4444':'#10b981' }}>{fmtB(totalUnpaid)}</div>
              <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600 }}>Outstanding / Unpaid</div>
            </div>
            <div style={{ textAlign:'center', padding:'10px 8px', background:'var(--bg-hover)', borderRadius:'var(--radius)', borderTop:'3px solid #d97706' }}>
              <div style={{ fontSize:18, fontWeight:800, color:'#d97706' }}>{fmtB(balance)}</div>
              <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600 }}>Contract Balance</div>
            </div>
            <div style={{ textAlign:'center', padding:'10px 8px', background:'var(--bg-hover)', borderRadius:'var(--radius)', borderTop:'3px solid #7c3aed' }}>
              <div style={{ fontSize:18, fontWeight:800, color:'#7c3aed' }}>{paymentRatio}%</div>
              <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600 }}>Payment Ratio</div>
            </div>
            <div style={{ textAlign:'center', padding:'10px 8px', background:'var(--bg-hover)', borderRadius:'var(--radius)', borderTop:'3px solid #6b7280' }}>
              <div style={{ fontSize:18, fontWeight:800 }}>{fmtB(avgIpcValue)}</div>
              <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600 }}>Avg IPC Value</div>
            </div>
          </div>

          {ipcChart.length > 0 ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              {/* Bar chart: Per-IPC Certified vs Paid vs Unpaid */}
              <div>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:8, color:'var(--text-muted)' }}>Per-IPC Breakdown</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={ipcChart} margin={{ left:0, right:8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                    <XAxis dataKey="name" tick={{ fontSize:9, fill:'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize:9, fill:'var(--text-muted)' }} tickFormatter={v=>(v/1e6).toFixed(0)+'M'} />
                    <Tooltip contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }} formatter={v=>fmt(v)} />
                    <Legend wrapperStyle={{ fontSize:10 }} />
                    <Bar dataKey="certified" fill="#2563eb" name="Certified" radius={[3,3,0,0]} />
                    <Bar dataKey="paid" fill="#10b981" name="Paid" radius={[3,3,0,0]} />
                    <Bar dataKey="unpaid" fill="#ef4444" name="Unpaid" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Cumulative line chart: Running totals */}
              <div>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:8, color:'var(--text-muted)' }}>Cumulative Payment Curve</div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={ipcChart} margin={{ left:0, right:8 }}>
                    <defs>
                      <linearGradient id="gCert" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.3}/><stop offset="100%" stopColor="#2563eb" stopOpacity={0.02}/></linearGradient>
                      <linearGradient id="gPaid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="100%" stopColor="#10b981" stopOpacity={0.02}/></linearGradient>
                      <linearGradient id="gUnpd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.2}/><stop offset="100%" stopColor="#ef4444" stopOpacity={0.02}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                    <XAxis dataKey="name" tick={{ fontSize:9, fill:'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize:9, fill:'var(--text-muted)' }} tickFormatter={v=>(v/1e6).toFixed(0)+'M'} />
                    <Tooltip contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }} formatter={v=>fmt(v)} />
                    <Legend wrapperStyle={{ fontSize:10 }} />
                    <Area type="monotone" dataKey="cumCertified" stroke="#2563eb" strokeWidth={2.5} fill="url(#gCert)" name="Cum. Certified" dot={{ r:3 }} />
                    <Area type="monotone" dataKey="cumPaid" stroke="#10b981" strokeWidth={2.5} fill="url(#gPaid)" name="Cum. Paid" dot={{ r:3 }} />
                    <Area type="monotone" dataKey="cumUnpaid" stroke="#ef4444" strokeWidth={1.5} fill="url(#gUnpd)" name="Cum. Unpaid" dot={{ r:2 }} strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : <div className="text-sm text-muted" style={{ textAlign:'center', padding:50 }}>No IPC data yet — generate certificates from the IPC page</div>}

          {/* Contract Details — Original vs Revised */}
          {hasRevisions && (
            <div style={{ marginTop: 14, padding: 10, background: 'var(--bg-hover)', borderRadius: 'var(--radius)', borderLeft: '3px solid var(--accent)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', marginBottom: 6 }}>📋 CONTRACT AMENDMENTS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 10 }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>Contract Sum</div>
                  <div style={{ textDecoration: revisedContractSum !== originalContractSum ? 'line-through' : 'none', color: 'var(--text-muted)' }}>
                    KES {Number(originalContractSum).toLocaleString()}
                  </div>
                  {revisedContractSum !== originalContractSum && (
                    <div style={{ fontWeight: 700, color: '#059669' }}>KES {Number(revisedContractSum).toLocaleString()}</div>
                  )}
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>Completion Date</div>
                  <div style={{ textDecoration: revisedEndDt !== originalEndDt ? 'line-through' : 'none', color: 'var(--text-muted)' }}>
                    {originalEndDt || '—'}
                  </div>
                  {revisedEndDt !== originalEndDt && (
                    <div style={{ fontWeight: 700, color: '#6366f1' }}>{revisedEndDt}</div>
                  )}
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>EOT Awarded</div>
                  <div style={{ fontWeight: 700, color: '#6366f1' }}>{totalEOT} days</div>
                  {p.total_variations_amount ? (
                    <>
                      <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 4 }}>Variations</div>
                      <div style={{ fontWeight: 700, color: '#059669' }}>KES {Number(p.total_variations_amount).toLocaleString()}</div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* Contract financial progress bar */}
          <div style={{ marginTop:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}>
              <span style={{ fontWeight:600 }}>Contract Financial Progress</span>
              <span style={{ fontWeight:700 }}>{finPct}% of contract sum</span>
            </div>
            <div style={{ height:16, background:'var(--border)', borderRadius:8, overflow:'hidden', position:'relative' }}>
              <div style={{ height:'100%', width:`${pct(paid, contractSum)}%`, background:'#10b981', position:'absolute', left:0, transition:'width 1s', borderRadius:8 }} />
              <div style={{ height:'100%', width:`${finPct}%`, background:'#2563eb40', position:'absolute', left:0, transition:'width 1s', borderRadius:8 }} />
              <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', fontSize:9, fontWeight:700, color:'#fff', textShadow:'0 1px 3px rgba(0,0,0,0.5)' }}>
                {fmtB(paid)} paid of {fmtB(contractSum)}
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, marginTop:4, color:'var(--text-muted)' }}>
              <span>🟢 Paid ({pct(paid, contractSum)}%)</span>
              <span>🔵 Certified ({pct(certified, contractSum)}%)</span>
              <span>⬜ Balance ({pct(balance, contractSum)}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════ QUALITY + RISK ROW ══════ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
        <div className="card" style={{ padding:14 }}>
          <h3 style={{ margin:'0 0 10px', fontSize:14 }}>Quality & Testing</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
            <div style={{ textAlign:'center', padding:8, background:'var(--bg-hover)', borderRadius:'var(--radius)' }}>
              <div style={{ fontSize:22, fontWeight:800 }}>{tests.length}</div><div style={{ fontSize:10, color:'var(--text-muted)' }}>Total Tests</div>
            </div>
            <div style={{ textAlign:'center', padding:8, background:'var(--bg-hover)', borderRadius:'var(--radius)' }}>
              <div style={{ fontSize:22, fontWeight:800 }}>{passRate}%</div><div style={{ fontSize:10, color:'var(--text-muted)' }}>Pass Rate</div>
            </div>
          </div>
          <ProgressBar label="Pass" value={testPass} max={tests.length||1} color="#10b981" />
          <ProgressBar label="Fail" value={testFail} max={tests.length||1} color="#ef4444" />
          {tests.length > 0 && (() => {
            const byType = {};
            tests.forEach(t => {
              const k = t.test_type || 'Other';
              if (!byType[k]) byType[k] = { total:0, pass:0, fail:0 };
              byType[k].total++;
              if (t.result_status === 'Pass') byType[k].pass++;
              if (t.result_status === 'Fail') byType[k].fail++;
            });
            const rows = Object.entries(byType).sort((a,b) => b[1].total - a[1].total).slice(0, 8);
            return (
              <div style={{ marginTop:10 }}>
                <div style={{ fontSize:11, fontWeight:600, marginBottom:6 }}>By Test Type</div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {rows.map(([type, s]) => {
                    const pr = s.total > 0 ? Math.round((s.pass / s.total) * 100) : 0;
                    const c = pr >= 80 ? '#10b981' : pr >= 50 ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={type} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11 }}>
                        <span style={{ flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{type}</span>
                        <span style={{ color:'var(--text-muted)', fontSize:10, minWidth:52, textAlign:'right' }}>{s.pass}/{s.total} pass</span>
                        <div style={{ width:60, height:5, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pr}%`, background:c, borderRadius:3 }} />
                        </div>
                        <span style={{ fontWeight:700, color:c, minWidth:32, textAlign:'right', fontSize:10 }}>{pr}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <div style={{ marginTop:10 }}>
            <div style={{ fontSize:11, fontWeight:600, marginBottom:4 }}>Pavement Layers</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, fontSize:10 }}>
              <div>Total: <strong>{layers.length}</strong></div>
              <div>Completed: <strong>{layers.filter(l=>l.layer_status==='Completed'||l.layer_status==='Approved').length}</strong></div>
            </div>
          </div>
        </div>

        {/* Risk & Issues */}
        <div className="card" style={{ padding:14 }}>
          <h3 style={{ margin:'0 0 10px', fontSize:14 }}>Risk Status</h3>
          <div style={{ textAlign:'center', marginBottom:12 }}>
            <div style={{ fontSize:28, fontWeight:800, color: critRisks>0||critIss>0?'#ef4444':openRisks>2?'#f59e0b':'#10b981' }}>
              {critRisks>0||critIss>0?'High':openRisks>2?'Medium':'Low'}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>Manage Closely</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:11 }}>
            <div style={{ padding:6, background:'#fef2f2', borderRadius:'var(--radius)', textAlign:'center' }}>
              <div style={{ fontWeight:700, color:'#ef4444' }}>{critIss}</div><div style={{ fontSize:9 }}>Critical Issues</div>
            </div>
            <div style={{ padding:6, background:'#fffbeb', borderRadius:'var(--radius)', textAlign:'center' }}>
              <div style={{ fontWeight:700, color:'#d97706' }}>{highIss}</div><div style={{ fontSize:9 }}>High Issues</div>
            </div>
            <div style={{ padding:6, background:'#eff6ff', borderRadius:'var(--radius)', textAlign:'center' }}>
              <div style={{ fontWeight:700, color:'#2563eb' }}>{openRisks}</div><div style={{ fontSize:9 }}>Open Risks</div>
            </div>
            <div style={{ padding:6, background:'#f0fdf4', borderRadius:'var(--radius)', textAlign:'center' }}>
              <div style={{ fontWeight:700, color:'#16a34a' }}>{structs.length}</div><div style={{ fontSize:9 }}>Structures</div>
            </div>
          </div>
          <div style={{ marginTop:10, fontSize:11 }}>
            <div><strong>{reports.length}</strong> daily reports submitted</div>
            <div><strong>{instructions.length}</strong> site instructions issued</div>
            <div><strong>{miles.length}</strong> milestones tracked</div>
          </div>
        </div>
      </div>

      {/* ══════ RESOURCE SUMMARY ══════ */}
      <div className="card" style={{ padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <h3 style={{ margin:0, fontSize:15 }}>🚜 Resource Summary — Plant &amp; Equipment</h3>
          <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:11 }}>
            <span style={{ padding:'3px 10px', borderRadius:9999, background:'#3b82f618', color:'#3b82f6', fontWeight:600 }}>{equip.length} types registered</span>
            <span style={{ padding:'3px 10px', borderRadius:9999, background: eqPct >= 70 ? '#10b98118' : '#ef444418', color: eqPct >= 70 ? '#10b981' : '#ef4444', fontWeight:600 }}>{eqOn}/{eqReq} units · {eqPct}% mobilized</span>
            {mats.length > 0 && <span style={{ padding:'3px 10px', borderRadius:9999, background:'#7c3aed18', color:'#7c3aed', fontWeight:600 }}>{mats.length} materials tracked</span>}
            <button className="btn btn-sm btn-secondary" style={{ fontSize:10 }} onClick={() => navigateTo('equipment', p)}>Manage</button>
          </div>
        </div>
        {equip.length > 0 ? (() => {
          const rows = equip.map(e => {
            const req = e.required_quantity || 0;
            const on = e.actual_on_site || 0;
            const gap = Math.max(0, req - on);
            const util = req > 0 ? Math.round((on / req) * 100) : 0;
            return { ...e, req, on, gap, util };
          }).sort((a, b) => (b.is_key_equipment === true) - (a.is_key_equipment === true) || b.gap - a.gap);
          const shown = rows.slice(0, 12);
          const keyGaps = rows.filter(r => r.is_key_equipment && r.gap > 0);
          return (
            <>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:'2px solid var(--border)' }}>
                      <th style={{ textAlign:'left', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase' }}>Equipment</th>
                      <th style={{ textAlign:'left', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:100 }}>Type</th>
                      <th style={{ textAlign:'center', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:70 }}>Required</th>
                      <th style={{ textAlign:'center', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:70 }}>On Site</th>
                      <th style={{ textAlign:'center', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:60 }}>Gap</th>
                      <th style={{ padding:'8px 6px', width:130 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r, i) => (
                      <tr key={r.id || i} style={{ borderBottom:'1px solid var(--border)', background: r.is_key_equipment && r.gap > 0 ? '#ef444408' : 'transparent' }}>
                        <td style={{ padding:'6px', fontWeight: r.is_key_equipment ? 700 : 500 }}>
                          {r.is_key_equipment && <span style={{ color:'#e87b35', marginRight:4, fontSize:10 }} title="Key equipment">★</span>}
                          {r.equipment_name || '—'}
                        </td>
                        <td style={{ padding:'6px', color:'var(--text-muted)', fontSize:11 }}>{r.equipment_type || '—'}</td>
                        <td className="text-mono" style={{ textAlign:'center', padding:'6px' }}>{r.req}</td>
                        <td className="text-mono" style={{ textAlign:'center', padding:'6px', fontWeight:700, color: r.on >= r.req && r.req > 0 ? '#10b981' : r.on > 0 ? '#e87b35' : 'var(--text-muted)' }}>{r.on}</td>
                        <td className="text-mono" style={{ textAlign:'center', padding:'6px', fontWeight:700, color: r.gap > 0 ? '#ef4444' : '#10b981' }}>{r.gap > 0 ? r.gap : '—'}</td>
                        <td style={{ padding:'6px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <div style={{ width:80, height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${Math.min(r.util, 100)}%`, borderRadius:3,
                                background: r.util >= 100 ? '#10b981' : r.util >= 50 ? '#e87b35' : r.util > 0 ? '#ef4444' : 'transparent' }} />
                            </div>
                            <span style={{ fontSize:10, fontWeight:600, minWidth:30,
                              color: r.util >= 100 ? '#10b981' : r.util >= 50 ? '#e87b35' : r.util > 0 ? '#ef4444' : 'var(--text-muted)' }}>{r.req > 0 ? r.util + '%' : ''}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > shown.length && (
                <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:6, textAlign:'center' }}>+{rows.length - shown.length} more — see Equipment page</div>
              )}
              {keyGaps.length > 0 && (
                <div style={{ marginTop:10, padding:'8px 12px', background:'#fef2f2', borderRadius:'var(--radius)', borderLeft:'3px solid #ef4444', fontSize:11, color:'#991b1b' }}>
                  ⚠ <strong>{keyGaps.length} key equipment type{keyGaps.length > 1 ? 's' : ''} under-mobilized:</strong> {keyGaps.slice(0,4).map(r => `${r.equipment_name} (−${r.gap})`).join(' · ')}{keyGaps.length > 4 ? ` · +${keyGaps.length - 4} more` : ''}
                </div>
              )}
            </>
          );
        })() : (
          <div className="text-sm text-muted" style={{ textAlign:'center', padding:30 }}>
            No equipment registered. <button className="btn btn-sm btn-primary" style={{ fontSize:10, marginLeft:8 }} onClick={() => navigateTo('equipment', p)}>Add Equipment</button>
          </div>
        )}
      </div>

      {/* ══════ LATEST SITE PHOTOS ══════ */}
      <div className="card" style={{ padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <h3 style={{ margin:0, fontSize:15 }}>📸 Latest Site Photos</h3>
          <span className="text-sm text-muted">{(d.photos || []).length > 0 ? `${d.photos.length} most recent` : ''}</span>
        </div>
        {(d.photos || []).filter(ph => ph.url).length > 0 ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(170px, 1fr))', gap:10 }}>
            {d.photos.filter(ph => ph.url).map((ph, i) => (
              <div key={ph.id || i} style={{ borderRadius:8, overflow:'hidden', border:'1px solid var(--border)', cursor:'pointer', background:'var(--bg-hover)' }}
                onClick={() => window.open(ph.url, '_blank', 'noopener')}
                title={ph.caption || ph.file_name || 'Site photo'}>
                <div style={{ height:110, overflow:'hidden' }}>
                  <img src={ph.url} alt={ph.caption || 'Site photo'} loading="lazy"
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', transition:'transform 0.3s' }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.06)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} />
                </div>
                <div style={{ padding:'6px 8px' }}>
                  <div style={{ fontSize:10, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {ph.caption || ph.category || ph.file_name || 'Site photo'}
                  </div>
                  <div style={{ fontSize:9, color:'var(--text-muted)', display:'flex', justifyContent:'space-between', marginTop:2 }}>
                    <span>{ph.photo_date || (ph.created_at ? String(ph.created_at).slice(0,10) : '')}</span>
                    {ph.chainage && <span>Ch. {ph.chainage}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted" style={{ textAlign:'center', padding:30 }}>
            No site photos yet — photos attached to daily reports will appear here automatically.
          </div>
        )}
      </div>

      {/* ══════ MILESTONES TIMELINE ══════ */}
      <div className="card" style={{ padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
          <h3 style={{ margin:0, fontSize:15 }}>🏁 Project Milestones Timeline</h3>
          <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:11 }}>
            {miles.length > 0 && (() => {
              const achieved = miles.filter(m => m.status === 'Completed' || m.actual_date).length;
              const overdue = miles.filter(m => (m.status === 'Overdue' || m.status === 'Delayed') && !m.actual_date).length;
              const upcoming = miles.filter(m => m.status === 'Upcoming' || m.status === 'On Track').length;
              return (
                <>
                  <span style={{ padding:'3px 10px', borderRadius:9999, background:'#10b98118', color:'#10b981', fontWeight:600 }}>{achieved} achieved</span>
                  {overdue > 0 && <span style={{ padding:'3px 10px', borderRadius:9999, background:'#ef444418', color:'#ef4444', fontWeight:600 }}>{overdue} overdue</span>}
                  {upcoming > 0 && <span style={{ padding:'3px 10px', borderRadius:9999, background:'#3b82f618', color:'#3b82f6', fontWeight:600 }}>{upcoming} upcoming</span>}
                </>
              );
            })()}
            <button className="btn btn-sm btn-secondary" style={{ fontSize:10 }} onClick={() => navigateTo('summary', p)}>Manage</button>
          </div>
        </div>
        {miles.length > 0 ? (() => {
          // Build timeline
          const today = new Date().toISOString().slice(0,10);
          const allDates = miles.filter(m => m.planned_date).map(m => m.planned_date).concat(miles.filter(m => m.actual_date).map(m => m.actual_date));
          if (startDt) allDates.push(startDt);
          if (endDt) allDates.push(endDt);
          allDates.push(today);
          const minDate = allDates.length > 0 ? allDates.sort()[0] : today;
          const maxDate = allDates.length > 0 ? allDates.sort()[allDates.length - 1] : today;
          const totalSpan = Math.max(1, daysBetween(minDate, maxDate));
          const dateToPos = (dt) => dt ? Math.max(0, Math.min(100, (daysBetween(minDate, dt) / totalSpan) * 100)) : null;
          const todayPos = dateToPos(today);

          // Status colors
          const msColors = { 'Completed':'#10b981', 'On Track':'#3b82f6', 'Upcoming':'#6b7280', 'Delayed':'#f59e0b', 'Overdue':'#ef4444' };
          const msIcons = { 'Completed':'✓', 'On Track':'●', 'Upcoming':'○', 'Delayed':'⚠', 'Overdue':'✗' };

          return (
            <>
              {/* Horizontal timeline bar */}
              <div style={{ position:'relative', margin:'0 0 20px 0', padding:'30px 20px 50px 20px' }}>
                {/* Main timeline bar */}
                <div style={{ position:'absolute', left:20, right:20, top:42, height:4, background:'var(--border)', borderRadius:2 }}>
                  {/* Progress fill to today */}
                  <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${todayPos}%`, background:'linear-gradient(90deg, #e87b35, #f59e0b)', borderRadius:2 }} />
                </div>
                {/* Today marker */}
                <div style={{ position:'absolute', left:`calc(${todayPos}% + 10px)`, top:28, transform:'translateX(-50%)', zIndex:5 }}>
                  <div style={{ width:2, height:32, background:'#ef4444', margin:'0 auto' }} />
                  <div style={{ fontSize:8, color:'#ef4444', fontWeight:700, textAlign:'center', marginTop:1, whiteSpace:'nowrap' }}>TODAY</div>
                </div>
                {/* Milestone markers */}
                {miles.map((m, i) => {
                  const pos = dateToPos(m.planned_date);
                  if (pos === null) return null;
                  const actualPos = dateToPos(m.actual_date);
                  const c = msColors[m.status] || '#6b7280';
                  const icon = msIcons[m.status] || '●';
                  const isCompleted = m.status === 'Completed' || m.actual_date;
                  // Stagger labels to avoid overlap — alternate above and below
                  const above = i % 2 === 0;
                  return (
                    <React.Fragment key={m.id || i}>
                      {/* Planned position marker */}
                      <div style={{ position:'absolute', left:`calc(${pos}% + 10px)`, top:above ? 16 : 48, transform:'translateX(-50%)', zIndex:3, textAlign:'center', cursor:'pointer' }}
                        title={`${m.milestone_name}\nPlanned: ${m.planned_date || '—'}\nActual: ${m.actual_date || '—'}\nStatus: ${m.status}`}>
                        {/* Connector line */}
                        <div style={{ position:'absolute', left:'50%', width:1, background:c,
                          ...(above ? { bottom:-2, height:14 } : { top:-2, height:14 }), transform:'translateX(-50%)' }} />
                        {/* Milestone dot */}
                        <div style={{
                          width:isCompleted ? 18 : 14, height:isCompleted ? 18 : 14, borderRadius:'50%',
                          background: isCompleted ? c : 'var(--bg-card)', border:`2px solid ${c}`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize: isCompleted ? 10 : 8, color: isCompleted ? 'white' : c, fontWeight:700,
                          margin:'0 auto', ...(above ? {} : {}),
                          boxShadow: isCompleted ? `0 0 6px ${c}40` : 'none'
                        }}>{icon}</div>
                        {/* Label */}
                        <div style={{ fontSize:9, fontWeight:600, color:c, maxWidth:80, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                          ...(above ? { marginBottom:4, order:-1, position:'absolute', bottom:'100%', left:'50%', transform:'translateX(-50%)' }
                                    : { marginTop:4, position:'absolute', top:'100%', left:'50%', transform:'translateX(-50%)' }) }}>
                          {m.milestone_name.length > 14 ? m.milestone_name.slice(0,13)+'…' : m.milestone_name}
                        </div>
                      </div>
                      {/* Actual date connector (if different from planned) */}
                      {actualPos !== null && Math.abs(actualPos - pos) > 1 && (
                        <div style={{ position:'absolute', top:43, height:2, zIndex:2,
                          left: `calc(${Math.min(pos, actualPos)}% + 10px)`, width:`${Math.abs(actualPos - pos)}%`,
                          background: actualPos > pos ? '#ef4444' : '#10b981', opacity:0.5, borderRadius:1 }}
                          title={`${m.milestone_name}: ${actualPos > pos ? 'Late' : 'Early'} by ${Math.abs(daysBetween(m.planned_date, m.actual_date))} days`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
              {/* Milestone detail table */}
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:'2px solid var(--border)' }}>
                      <th style={{ textAlign:'left', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase' }}>#</th>
                      <th style={{ textAlign:'left', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase' }}>Milestone</th>
                      <th style={{ textAlign:'center', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:100 }}>Planned Date</th>
                      <th style={{ textAlign:'center', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:100 }}>Actual Date</th>
                      <th style={{ textAlign:'center', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:80 }}>Variance</th>
                      <th style={{ textAlign:'center', padding:'8px 6px', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', width:90 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {miles.map((m, i) => {
                      const c = msColors[m.status] || '#6b7280';
                      const varDays = m.planned_date && m.actual_date ? daysBetween(m.planned_date, m.actual_date) : null;
                      const isLate = varDays !== null && varDays > 0;
                      const isEarly = varDays !== null && varDays < 0;
                      const daysUntil = m.planned_date && !m.actual_date ? daysBetween(today, m.planned_date) : null;
                      return (
                        <tr key={m.id || i} style={{ borderBottom:'1px solid var(--border)', background: m.status === 'Overdue' ? '#ef444408' : m.status === 'Completed' ? '#10b98108' : 'transparent' }}>
                          <td style={{ padding:'6px', color:'var(--text-muted)', fontSize:11 }}>{i+1}</td>
                          <td style={{ padding:'6px', fontWeight:600 }}>{m.milestone_name}</td>
                          <td className="text-mono" style={{ textAlign:'center', padding:'6px', fontSize:11 }}>{m.planned_date || '—'}</td>
                          <td className="text-mono" style={{ textAlign:'center', padding:'6px', fontSize:11, fontWeight: m.actual_date ? 700 : 400, color: m.actual_date ? '#10b981' : 'var(--text-muted)' }}>{m.actual_date || '—'}</td>
                          <td style={{ textAlign:'center', padding:'6px', fontSize:11, fontWeight:700 }}>
                            {varDays !== null ? (
                              <span style={{ color: isLate ? '#ef4444' : isEarly ? '#10b981' : '#6b7280' }}>
                                {isLate ? `+${varDays}d late` : isEarly ? `${varDays}d early` : 'On time'}
                              </span>
                            ) : daysUntil !== null ? (
                              <span style={{ color: daysUntil < 0 ? '#ef4444' : daysUntil <= 30 ? '#f59e0b' : 'var(--text-muted)', fontSize:10 }}>
                                {daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : `in ${daysUntil}d`}
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ textAlign:'center', padding:'6px' }}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 8px', borderRadius:9999, fontSize:10, fontWeight:700, background:c+'18', color:c }}>
                              <span style={{ width:5, height:5, borderRadius:'50%', background:c }} />{m.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Critical path warning */}
              {(() => {
                const overdue = miles.filter(m => (m.status === 'Overdue' || m.status === 'Delayed') && !m.actual_date);
                if (overdue.length === 0) return null;
                return (
                  <div style={{ marginTop:10, padding:'8px 12px', background:'#fef2f2', borderRadius:'var(--radius)', borderLeft:'3px solid #ef4444', fontSize:11, color:'#991b1b' }}>
                    ⚠ <strong>{overdue.length} milestone{overdue.length > 1 ? 's' : ''} at risk:</strong>{' '}
                    {overdue.slice(0,3).map(m => m.milestone_name).join(' · ')}{overdue.length > 3 ? ` · +${overdue.length - 3} more` : ''}
                    {' — Review programme per FIDIC Cl. 8.3'}
                  </div>
                );
              })()}
            </>
          );
        })() : (
          <div className="text-sm text-muted" style={{ textAlign:'center', padding:40 }}>
            No milestones set — add milestones in the Project Summary page to see the timeline.
          </div>
        )}
      </div>

      {/* ══════ SITE INSTRUCTIONS & VARIATION ORDERS ══════ */}
      <div className="card" style={{ padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
          <h3 style={{ margin:0, fontSize:15 }}>📋 Site Instructions & Variation Orders</h3>
          <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:11 }}>
            {instructions.length > 0 && (() => {
              const active = instructions.filter(i => !['Completed','Overridden'].includes(i.status)).length;
              const vos = instructions.filter(i => i.instruction_type === 'Variation Order').length;
              const overdue = instructions.filter(i => i.due_date && new Date(i.due_date) < new Date() && !['Completed','Overridden'].includes(i.status)).length;
              return (
                <>
                  <span style={{ padding:'3px 10px', borderRadius:9999, background:'#3b82f618', color:'#3b82f6', fontWeight:600 }}>{active} active</span>
                  {vos > 0 && <span style={{ padding:'3px 10px', borderRadius:9999, background:'#8b5cf618', color:'#8b5cf6', fontWeight:600 }}>{vos} VOs</span>}
                  {overdue > 0 && <span style={{ padding:'3px 10px', borderRadius:9999, background:'#ef444418', color:'#ef4444', fontWeight:600 }}>{overdue} overdue</span>}
                </>
              );
            })()}
            <button className="btn btn-sm btn-secondary" style={{ fontSize:10 }} onClick={() => navigateTo('instructions', p)}>Full Register</button>
          </div>
        </div>
        {instructions.length > 0 ? (() => {
          const TYPE_ICONS = { 'Site Instruction':'📝', 'Variation Order':'🔄', 'Day Work Order':'⚡', 'Suspension Order':'⏸️', 'Resumption Order':'▶️', 'Defects Notice':'🔍', 'Taking Over Notice':'🏁', 'Other':'📄' };
          const STATUS_COLORS = { 'Draft':'#94a3b8', 'Issued':'#3b82f6', 'Escalated':'#f59e0b', 'Approved':'#10b981', 'Rejected':'#ef4444', 'Acknowledged':'#6366f1', 'Completed':'#059669', 'Overridden':'#6b7280' };
          const PRIORITY_COLORS = { 'Low':'#64748b', 'Normal':'#3b82f6', 'High':'#f59e0b', 'Urgent':'#ef4444' };
          // Type breakdown
          const typeBreakdown = {};
          instructions.forEach(i => { const t = i.instruction_type || 'Other'; typeBreakdown[t] = (typeBreakdown[t] || 0) + 1; });
          const typeEntries = Object.entries(typeBreakdown).sort((a,b) => b[1] - a[1]);
          // Status pipeline
          const STATUSES = ['Draft','Issued','Escalated','Approved','Acknowledged','Completed','Rejected','Overridden'];
          const statusData = STATUSES.map(s => ({ status: s, count: instructions.filter(i => i.status === s).length, color: STATUS_COLORS[s] })).filter(d => d.count > 0);
          const maxStatus = Math.max(1, ...statusData.map(d => d.count));
          // Overdue
          const overdue = instructions.filter(i => i.due_date && new Date(i.due_date) < new Date() && !['Completed','Overridden'].includes(i.status));
          // Active sorted by priority
          const PRIO_ORDER = { 'Urgent':0, 'High':1, 'Normal':2, 'Low':3 };
          const activeList = instructions.filter(i => !['Completed','Overridden'].includes(i.status))
            .sort((a,b) => (PRIO_ORDER[a.priority] ?? 4) - (PRIO_ORDER[b.priority] ?? 4));
          // Compliance rate
          const completed = instructions.filter(i => i.status === 'Completed').length;
          const complianceRate = Math.round((completed / instructions.length) * 100);
          return (
            <>
              {/* KPI row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(100px, 1fr))', gap:8, marginBottom:16 }}>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#3b82f6' }}>{instructions.length}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Total</div>
                </div>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#10b981' }}>{complianceRate}%</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Compliance</div>
                </div>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#8b5cf6' }}>{instructions.filter(i => i.instruction_type === 'Variation Order').length}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Variation Orders</div>
                </div>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color: overdue.length > 0 ? '#ef4444' : '#10b981' }}>{overdue.length}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Overdue</div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                {/* Status Pipeline */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Status Pipeline</div>
                  {statusData.map(d => (
                    <div key={d.status} style={{ marginBottom:4 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, marginBottom:1 }}>
                        <span style={{ fontWeight:600 }}>{d.status}</span>
                        <span style={{ fontWeight:700, color: d.color }}>{d.count}</span>
                      </div>
                      <div style={{ height:8, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${(d.count / maxStatus) * 100}%`, background:d.color, borderRadius:4, transition:'width 0.8s' }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Type Breakdown */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>By Type</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {typeEntries.map(([type, count]) => (
                      <div key={type} style={{ padding:'6px 12px', borderRadius:8, background:'var(--bg)', textAlign:'center' }}>
                        <div style={{ fontSize:10, marginBottom:2 }}>{TYPE_ICONS[type] || '📄'} {type}</div>
                        <div style={{ fontSize:16, fontWeight:800 }}>{count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Active Instructions Table */}
              {activeList.length > 0 && (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', fontSize:11, borderCollapse:'separate', borderSpacing:'0 2px' }}>
                    <thead>
                      <tr style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em' }}>
                        <th style={{ padding:'6px 8px', textAlign:'left' }}>No.</th>
                        <th style={{ padding:'6px 8px', textAlign:'left' }}>Subject</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>Type</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>Priority</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>FIDIC</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>Due</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeList.slice(0, 8).map((ins, i) => {
                        const isOverdue = ins.due_date && new Date(ins.due_date) < new Date();
                        return (
                          <tr key={ins.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-card)' }}>
                            <td style={{ padding:'6px 8px', fontWeight:700, fontFamily:'monospace', fontSize:10, color:'var(--text-muted)' }}>{ins.instruction_no || `#${i+1}`}</td>
                            <td style={{ padding:'6px 8px', fontWeight:500, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ins.subject}</td>
                            <td style={{ padding:'6px 8px', textAlign:'center', fontSize:10 }}>{TYPE_ICONS[ins.instruction_type] || ''} {ins.instruction_type || '—'}</td>
                            <td style={{ padding:'6px 8px', textAlign:'center' }}>
                              <span style={{ padding:'2px 8px', borderRadius:9999, fontSize:10, fontWeight:600, background:`${PRIORITY_COLORS[ins.priority] || '#6b7280'}18`, color: PRIORITY_COLORS[ins.priority] || '#6b7280' }}>{ins.priority || '—'}</span>
                            </td>
                            <td style={{ padding:'6px 8px', textAlign:'center', fontSize:10, fontFamily:'monospace' }}>{ins.fidic_clause || '—'}</td>
                            <td style={{ padding:'6px 8px', textAlign:'center', fontSize:10, color: isOverdue ? '#ef4444' : 'var(--text-muted)', fontWeight: isOverdue ? 700 : 400 }}>{ins.due_date ? new Date(ins.due_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : '—'}</td>
                            <td style={{ padding:'6px 8px', textAlign:'center' }}>
                              <span style={{ padding:'2px 8px', borderRadius:9999, fontSize:10, fontWeight:600, background:`${STATUS_COLORS[ins.status] || '#6b7280'}18`, color: STATUS_COLORS[ins.status] || '#6b7280' }}>{ins.status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {activeList.length > 8 && (
                    <div style={{ textAlign:'center', fontSize:10, color:'var(--text-muted)', marginTop:6 }}>
                      +{activeList.length - 8} more — see Instructions Register
                    </div>
                  )}
                </div>
              )}
              {/* Overdue warning */}
              {overdue.length > 0 && (
                <div style={{ marginTop:12, padding:'8px 12px', background:'#fef2f2', borderRadius:'var(--radius)', borderLeft:'3px solid #ef4444', fontSize:10, color:'#991b1b' }}>
                  ⚠️ <strong>{overdue.length} overdue instruction{overdue.length !== 1 ? 's' : ''}:</strong> {overdue.slice(0, 3).map(o => o.subject || o.instruction_no).join(', ')}{overdue.length > 3 ? ` +${overdue.length - 3} more` : ''}
                </div>
              )}
            </>
          );
        })() : (
          <div className="text-sm text-muted" style={{ textAlign:'center', padding:40 }}>
            No instructions recorded — use the Site Instructions page to issue and track instructions.
          </div>
        )}
      </div>

      {/* ══════ WEATHER IMPACT & WORKING DAYS ══════ */}
      <div className="card" style={{ padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
          <h3 style={{ margin:0, fontSize:15 }}>🌦️ Weather Impact & Working Days Analysis</h3>
          <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:11 }}>
            {reports.length > 0 && (() => {
              const workingDays = reports.filter(r => r.is_working_day === true).length;
              const nonWorking = reports.filter(r => r.is_working_day === false).length;
              const rainDays = reports.filter(r => r.rainfall_mm > 0).length;
              return (
                <>
                  <span style={{ padding:'3px 10px', borderRadius:9999, background:'#10b98118', color:'#10b981', fontWeight:600 }}>{workingDays} working</span>
                  <span style={{ padding:'3px 10px', borderRadius:9999, background:'#ef444418', color:'#ef4444', fontWeight:600 }}>{nonWorking} non-working</span>
                  {rainDays > 0 && <span style={{ padding:'3px 10px', borderRadius:9999, background:'#3b82f618', color:'#3b82f6', fontWeight:600 }}>{rainDays} rain days</span>}
                </>
              );
            })()}
            <button className="btn btn-sm btn-secondary" style={{ fontSize:10 }} onClick={() => navigateTo('reports', p)}>Daily Reports</button>
          </div>
        </div>
        {reports.length > 0 ? (() => {
          // Monthly aggregation
          const monthly = {};
          reports.forEach(r => {
            const m = r.report_date ? r.report_date.substring(0, 7) : null;
            if (!m) return;
            if (!monthly[m]) monthly[m] = { working: 0, nonWorking: 0, rainDays: 0, totalRainfall: 0, reports: 0, totalHours: 0, maxTemp: -Infinity, minTemp: Infinity };
            monthly[m].reports++;
            if (r.is_working_day === true) monthly[m].working++;
            if (r.is_working_day === false) monthly[m].nonWorking++;
            if (r.rainfall_mm > 0) { monthly[m].rainDays++; monthly[m].totalRainfall += r.rainfall_mm; }
            if (r.working_hours) monthly[m].totalHours += r.working_hours;
            if (r.max_temp_c != null && r.max_temp_c > monthly[m].maxTemp) monthly[m].maxTemp = r.max_temp_c;
            if (r.min_temp_c != null && r.min_temp_c < monthly[m].minTemp) monthly[m].minTemp = r.min_temp_c;
          });
          const monthKeys = Object.keys(monthly).sort();
          const monthLabels = monthKeys.map(k => { const [y,m] = k.split('-'); return new Date(y, m-1).toLocaleDateString('en-GB', { month:'short', year:'2-digit' }); });
          const maxDays = Math.max(1, ...monthKeys.map(k => monthly[k].working + monthly[k].nonWorking));
          // Overall stats
          const totalWorking = reports.filter(r => r.is_working_day === true).length;
          const totalNonWorking = reports.filter(r => r.is_working_day === false).length;
          const totalRainDays = reports.filter(r => r.rainfall_mm > 0).length;
          const totalRainfall = reports.reduce((s, r) => s + (r.rainfall_mm || 0), 0);
          const avgRainfall = totalRainDays > 0 ? (totalRainfall / totalRainDays).toFixed(1) : 0;
          const utilizationRate = reports.length > 0 ? Math.round((totalWorking / reports.length) * 100) : 0;
          // Weather distribution
          const weatherDist = {};
          reports.forEach(r => { const w = r.weather || 'Unknown'; weatherDist[w] = (weatherDist[w] || 0) + 1; });
          const weatherEntries = Object.entries(weatherDist).sort((a,b) => b[1] - a[1]);
          const WEATHER_ICONS = { 'Sunny':'☀️', 'Clear':'☀️', 'Partly Cloudy':'⛅', 'Cloudy':'☁️', 'Overcast':'🌥️', 'Light Rain':'🌦️', 'Rain':'🌧️', 'Heavy Rain':'⛈️', 'Thunderstorm':'⛈️', 'Drizzle':'🌦️', 'Fog':'🌫️', 'Windy':'💨', 'Hot':'🌡️', 'Cold':'❄️' };
          // Non-working reasons
          const reasons = {};
          reports.filter(r => r.is_working_day === false && r.non_working_reason).forEach(r => { reasons[r.non_working_reason] = (reasons[r.non_working_reason] || 0) + 1; });
          const reasonEntries = Object.entries(reasons).sort((a,b) => b[1] - a[1]);
          return (
            <>
              {/* KPI row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(100px, 1fr))', gap:8, marginBottom:16 }}>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#10b981' }}>{utilizationRate}%</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Utilization Rate</div>
                </div>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#3b82f6' }}>{totalWorking}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Working Days</div>
                </div>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#ef4444' }}>{totalNonWorking}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Non-Working</div>
                </div>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#0ea5e9' }}>{totalRainDays}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Rain Days</div>
                </div>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#6366f1' }}>{totalRainfall.toFixed(0)}mm</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Total Rainfall</div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                {/* Monthly Working Days Chart */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Monthly Working vs Non-Working Days</div>
                  {monthKeys.map((k, idx) => {
                    const m = monthly[k];
                    const total = m.working + m.nonWorking;
                    return (
                      <div key={k} style={{ marginBottom:4 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, marginBottom:1 }}>
                          <span style={{ fontWeight:600 }}>{monthLabels[idx]}</span>
                          <span style={{ color:'var(--text-muted)' }}>{m.working}w / {m.nonWorking}nw{m.rainDays > 0 ? ` / ${m.rainDays}🌧` : ''}</span>
                        </div>
                        <div style={{ height:10, background:'var(--border)', borderRadius:5, overflow:'hidden', display:'flex' }}>
                          {m.working > 0 && <div style={{ height:'100%', width:`${(m.working/maxDays)*100}%`, background:'#10b981', transition:'width 0.8s' }} title={`${m.working} working days`} />}
                          {m.nonWorking > 0 && <div style={{ height:'100%', width:`${(m.nonWorking/maxDays)*100}%`, background:'#ef4444', transition:'width 0.8s' }} title={`${m.nonWorking} non-working days`} />}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display:'flex', gap:12, marginTop:6, fontSize:9, justifyContent:'center' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:3 }}><span style={{ width:8, height:8, borderRadius:2, background:'#10b981' }} />Working</span>
                    <span style={{ display:'flex', alignItems:'center', gap:3 }}><span style={{ width:8, height:8, borderRadius:2, background:'#ef4444' }} />Non-Working</span>
                  </div>
                </div>
                {/* Weather Distribution + Non-working reasons */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Weather Conditions</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                    {weatherEntries.slice(0, 8).map(([weather, count]) => (
                      <div key={weather} style={{ padding:'5px 10px', borderRadius:8, background:'var(--bg)', textAlign:'center', minWidth:60 }}>
                        <div style={{ fontSize:14 }}>{WEATHER_ICONS[weather] || '☀️'}</div>
                        <div style={{ fontSize:9, color:'var(--text-muted)' }}>{weather}</div>
                        <div style={{ fontSize:14, fontWeight:800 }}>{count}</div>
                      </div>
                    ))}
                  </div>
                  {reasonEntries.length > 0 && (
                    <>
                      <div style={{ fontSize:11, fontWeight:600, marginBottom:4 }}>Non-Working Reasons</div>
                      {reasonEntries.slice(0, 5).map(([reason, count]) => (
                        <div key={reason} style={{ display:'flex', justifyContent:'space-between', fontSize:10, padding:'3px 0', borderBottom:'1px solid var(--border)' }}>
                          <span>{reason}</span>
                          <span style={{ fontWeight:700, color:'#ef4444' }}>{count} day{count !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
              {/* Rainfall info note */}
              {totalRainfall > 0 && (
                <div style={{ padding:'8px 12px', background:'#eff6ff', borderRadius:'var(--radius)', borderLeft:'3px solid #3b82f6', fontSize:10, color:'#1e40af' }}>
                  🌧️ <strong>Rainfall Summary:</strong> {totalRainfall.toFixed(1)}mm total across {totalRainDays} rain days (avg {avgRainfall}mm/rain day).
                  {totalNonWorking > 0 && ` Non-working days account for ${Math.round((totalNonWorking / reports.length) * 100)}% of reported days.`}
                </div>
              )}
            </>
          );
        })() : (
          <div className="text-sm text-muted" style={{ textAlign:'center', padding:40 }}>
            No daily reports submitted — weather and working day analysis will appear automatically.
          </div>
        )}
      </div>

      {/* ══════ SITE ISSUES TRACKER ══════ */}
      <div className="card" style={{ padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
          <h3 style={{ margin:0, fontSize:15 }}>⚠️ Site Issues Tracker</h3>
          <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:11 }}>
            {issues.length > 0 && (() => {
              const open = issues.filter(i => i.status === 'Open' || i.status === 'In Progress' || i.status === 'Escalated').length;
              const critical = issues.filter(i => i.severity === 'Critical' && !['Resolved','Closed'].includes(i.status)).length;
              const resolved = issues.filter(i => i.status === 'Resolved' || i.status === 'Closed').length;
              return (
                <>
                  <span style={{ padding:'3px 10px', borderRadius:9999, background: critical > 0 ? '#ef444418' : '#10b98118', color: critical > 0 ? '#ef4444' : '#10b981', fontWeight:600 }}>{open} open</span>
                  {critical > 0 && <span style={{ padding:'3px 10px', borderRadius:9999, background:'#ef444418', color:'#ef4444', fontWeight:600 }}>{critical} critical</span>}
                  <span style={{ padding:'3px 10px', borderRadius:9999, background:'#6b728018', color:'#6b7280', fontWeight:600 }}>{resolved} resolved</span>
                </>
              );
            })()}
            <button className="btn btn-sm btn-secondary" style={{ fontSize:10 }} onClick={() => navigateTo('issues', p)}>Full Register</button>
          </div>
        </div>
        {issues.length > 0 ? (() => {
          const SEV_COLORS = { 'Critical':'#ef4444', 'High':'#f59e0b', 'Medium':'#eab308', 'Low':'#22c55e' };
          const STAT_COLORS = { 'Open':'#3b82f6', 'In Progress':'#f59e0b', 'Escalated':'#ef4444', 'Resolved':'#10b981', 'Closed':'#6b7280' };
          // Severity breakdown
          const sevBreakdown = {};
          issues.forEach(i => { const s = i.severity || 'Medium'; sevBreakdown[s] = (sevBreakdown[s] || 0) + 1; });
          // Category breakdown
          const catBreakdown = {};
          issues.forEach(i => { const c = i.category || 'General'; catBreakdown[c] = (catBreakdown[c] || 0) + 1; });
          const catEntries = Object.entries(catBreakdown).sort((a,b) => b[1] - a[1]);
          const maxCat = Math.max(1, ...catEntries.map(e => e[1]));
          // Status breakdown
          const statusBreakdown = {};
          issues.forEach(i => { const s = i.status || 'Open'; statusBreakdown[s] = (statusBreakdown[s] || 0) + 1; });
          // Resolution time for resolved issues
          const resolvedIssues = issues.filter(i => i.date_resolved && i.date_raised);
          const avgResolution = resolvedIssues.length > 0 ? Math.round(resolvedIssues.reduce((s, i) => s + daysBetween(i.date_raised, i.date_resolved), 0) / resolvedIssues.length) : null;
          // Active issues sorted by severity
          const activeIssues = issues.filter(i => !['Resolved','Closed'].includes(i.status))
            .sort((a,b) => {
              const svl = { 'Critical':0, 'High':1, 'Medium':2, 'Low':3 };
              return (svl[a.severity] ?? 4) - (svl[b.severity] ?? 4);
            });
          return (
            <>
              {/* KPI row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(100px, 1fr))', gap:8, marginBottom:16 }}>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#3b82f6' }}>{issues.length}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Total Issues</div>
                </div>
                {['Critical','High','Medium','Low'].map(sev => (
                  <div key={sev} style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                    <div style={{ fontSize:20, fontWeight:800, color: SEV_COLORS[sev] }}>{sevBreakdown[sev] || 0}</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)' }}>{sev}</div>
                  </div>
                ))}
                {avgResolution !== null && (
                  <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                    <div style={{ fontSize:20, fontWeight:800, color:'#6366f1' }}>{avgResolution}d</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)' }}>Avg Resolution</div>
                  </div>
                )}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                {/* Category Breakdown */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Issues by Category</div>
                  {catEntries.slice(0, 8).map(([cat, count]) => (
                    <div key={cat} style={{ marginBottom:4 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, marginBottom:1 }}>
                        <span style={{ fontWeight:600 }}>{cat}</span>
                        <span style={{ color:'var(--text-muted)' }}>{count}</span>
                      </div>
                      <div style={{ height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${(count / maxCat) * 100}%`, background:'#f59e0b', borderRadius:3, transition:'width 0.8s' }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Status Distribution */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Status Distribution</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
                    {Object.entries(statusBreakdown).sort((a,b) => b[1] - a[1]).map(([status, count]) => (
                      <div key={status} style={{ textAlign:'center', padding:'6px 14px', borderRadius:8, background:`${STAT_COLORS[status] || '#6b7280'}12` }}>
                        <div style={{ fontSize:18, fontWeight:800, color: STAT_COLORS[status] || '#6b7280' }}>{count}</div>
                        <div style={{ fontSize:9, color:'var(--text-muted)' }}>{status}</div>
                      </div>
                    ))}
                  </div>
                  {/* Resolution bar */}
                  {resolvedIssues.length > 0 && (
                    <div style={{ marginTop:12 }}>
                      <div style={{ fontSize:11, fontWeight:600, marginBottom:4 }}>Resolution Progress</div>
                      <div style={{ height:14, background:'var(--border)', borderRadius:7, overflow:'hidden', display:'flex' }}>
                        <div style={{ height:'100%', width:`${pct(issues.filter(i => ['Resolved','Closed'].includes(i.status)).length, issues.length)}%`, background:'#10b981', transition:'width 0.8s' }} title={`Resolved: ${issues.filter(i => ['Resolved','Closed'].includes(i.status)).length}`} />
                        <div style={{ height:'100%', width:`${pct(issues.filter(i => !['Resolved','Closed'].includes(i.status)).length, issues.length)}%`, background:'#f59e0b', transition:'width 0.8s' }} title={`Open: ${issues.filter(i => !['Resolved','Closed'].includes(i.status)).length}`} />
                      </div>
                      <div style={{ display:'flex', gap:12, marginTop:4, fontSize:9, justifyContent:'center' }}>
                        <span style={{ display:'flex', alignItems:'center', gap:3 }}><span style={{ width:8, height:8, borderRadius:2, background:'#10b981' }} />Resolved</span>
                        <span style={{ display:'flex', alignItems:'center', gap:3 }}><span style={{ width:8, height:8, borderRadius:2, background:'#f59e0b' }} />Open</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Active Issues Table */}
              {activeIssues.length > 0 && (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', fontSize:11, borderCollapse:'separate', borderSpacing:'0 2px' }}>
                    <thead>
                      <tr style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em' }}>
                        <th style={{ padding:'6px 8px', textAlign:'left' }}>#</th>
                        <th style={{ padding:'6px 8px', textAlign:'left' }}>Title</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>Severity</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>Category</th>
                        <th style={{ padding:'6px 8px', textAlign:'left' }}>Assigned</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>Raised</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeIssues.slice(0, 8).map((iss, i) => (
                        <tr key={iss.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-card)' }}>
                          <td style={{ padding:'6px 8px', fontWeight:600, color:'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ padding:'6px 8px', fontWeight:500, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{iss.title}</td>
                          <td style={{ padding:'6px 8px', textAlign:'center' }}>
                            <span style={{ padding:'2px 8px', borderRadius:9999, fontSize:10, fontWeight:700, background:`${SEV_COLORS[iss.severity] || '#6b7280'}18`, color: SEV_COLORS[iss.severity] || '#6b7280' }}>{iss.severity || '—'}</span>
                          </td>
                          <td style={{ padding:'6px 8px', textAlign:'center', fontSize:10 }}>{iss.category || '—'}</td>
                          <td style={{ padding:'6px 8px', fontSize:10, color:'var(--text-muted)' }}>{iss.assigned_to || '—'}</td>
                          <td style={{ padding:'6px 8px', textAlign:'center', fontSize:10, color:'var(--text-muted)' }}>{iss.date_raised ? new Date(iss.date_raised).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : '—'}</td>
                          <td style={{ padding:'6px 8px', textAlign:'center' }}>
                            <span style={{ padding:'2px 8px', borderRadius:9999, fontSize:10, fontWeight:600, background:`${STAT_COLORS[iss.status] || '#6b7280'}18`, color: STAT_COLORS[iss.status] || '#6b7280' }}>{iss.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {activeIssues.length > 8 && (
                    <div style={{ textAlign:'center', fontSize:10, color:'var(--text-muted)', marginTop:6 }}>
                      +{activeIssues.length - 8} more — see Issues Register
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })() : (
          <div className="text-sm text-muted" style={{ textAlign:'center', padding:40 }}>
            No site issues recorded — issues raised in the field will appear here automatically.
          </div>
        )}
      </div>

      {/* ══════ RISK OVERVIEW — HEAT MAP & REGISTER ══════ */}
      <div className="card" style={{ padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
          <h3 style={{ margin:0, fontSize:15 }}>🛡️ Risk Overview — Heat Map &amp; Register</h3>
          <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:11 }}>
            {risks.length > 0 && (() => {
              const open = risks.filter(r => r.status === 'Open' || r.status === 'Mitigating').length;
              const crit = risks.filter(r => r.risk_level === 'Critical' && r.status !== 'Closed').length;
              const closed = risks.filter(r => r.status === 'Closed').length;
              return (
                <>
                  <span style={{ padding:'3px 10px', borderRadius:9999, background: crit > 0 ? '#ef444418' : '#10b98118', color: crit > 0 ? '#ef4444' : '#10b981', fontWeight:600 }}>{open} open</span>
                  {crit > 0 && <span style={{ padding:'3px 10px', borderRadius:9999, background:'#ef444418', color:'#ef4444', fontWeight:600 }}>{crit} critical</span>}
                  <span style={{ padding:'3px 10px', borderRadius:9999, background:'#6b728018', color:'#6b7280', fontWeight:600 }}>{closed} closed</span>
                </>
              );
            })()}
            <button className="btn btn-sm btn-secondary" style={{ fontSize:10 }} onClick={() => navigateTo('summary', p)}>Manage</button>
          </div>
        </div>
        {risks.length > 0 ? (() => {
          // Risk heat map data
          const PROBS = ['Very High','High','Medium','Low'];
          const IMPACTS = ['Low','Medium','High','Very High'];
          const heatColors = {
            'Very High-Very High':'#991b1b','Very High-High':'#dc2626','Very High-Medium':'#f59e0b','Very High-Low':'#f59e0b',
            'High-Very High':'#dc2626','High-High':'#ef4444','High-Medium':'#f59e0b','High-Low':'#84cc16',
            'Medium-Very High':'#f59e0b','Medium-High':'#f59e0b','Medium-Medium':'#eab308','Medium-Low':'#84cc16',
            'Low-Very High':'#f59e0b','Low-High':'#84cc16','Low-Medium':'#84cc16','Low-Low':'#22c55e',
          };
          // Category breakdown
          const categories = {};
          risks.forEach(r => { const c = r.category || 'Other'; categories[c] = (categories[c] || 0) + 1; });
          const catEntries = Object.entries(categories).sort((a,b) => b[1] - a[1]);
          const catColors = { 'Technical':'#3b82f6','Financial':'#10b981','Environmental':'#84cc16','Contractual':'#f59e0b','Safety':'#ef4444','Political':'#8b5cf6','Social':'#ec4899','Other':'#6b7280' };
          // Open risks sorted by severity
          const openRisksList = risks.filter(r => r.status !== 'Closed')
            .sort((a,b) => {
              const lvl = { 'Critical':0, 'High':1, 'Medium':2, 'Low':3 };
              return (lvl[a.risk_level] ?? 4) - (lvl[b.risk_level] ?? 4);
            });
          const riskLevelColors = { 'Critical':'#ef4444', 'High':'#f59e0b', 'Medium':'#eab308', 'Low':'#22c55e' };
          const statusColors = { 'Open':'#3b82f6', 'Mitigating':'#f59e0b', 'Closed':'#6b7280' };
          return (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                {/* Heat Map */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:8, textAlign:'center' }}>Probability × Impact Matrix</div>
                  <div style={{ display:'grid', gridTemplateColumns:'auto repeat(4, 1fr)', gap:2, fontSize:10 }}>
                    {/* Header row */}
                    <div style={{ padding:4 }} />
                    {IMPACTS.map(imp => (
                      <div key={imp} style={{ padding:4, textAlign:'center', fontWeight:700, fontSize:9, color:'var(--text-muted)' }}>{imp}</div>
                    ))}
                    {/* Data rows */}
                    {PROBS.map(prob => (
                      <React.Fragment key={prob}>
                        <div style={{ padding:'6px 4px', fontWeight:700, fontSize:9, color:'var(--text-muted)', textAlign:'right', whiteSpace:'nowrap' }}>{prob}</div>
                        {IMPACTS.map(imp => {
                          const count = risks.filter(r => r.status !== 'Closed' && r.probability === prob && r.impact === imp).length;
                          const bg = heatColors[`${prob}-${imp}`] || '#6b7280';
                          return (
                            <div key={imp} style={{
                              padding:6, textAlign:'center', borderRadius:4,
                              background: count > 0 ? bg : `${bg}18`,
                              color: count > 0 ? '#fff' : 'var(--text-muted)',
                              fontWeight: count > 0 ? 800 : 400,
                              fontSize: count > 0 ? 14 : 10,
                              transition:'all 0.3s',
                              cursor: count > 0 ? 'default' : 'default',
                            }}
                              title={`${prob} probability × ${imp} impact: ${count} risk${count !== 1 ? 's' : ''}`}
                            >
                              {count > 0 ? count : '·'}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                    {/* Axis labels */}
                    <div style={{ gridColumn:'1', textAlign:'center', fontSize:8, color:'var(--text-muted)', paddingTop:4, fontStyle:'italic' }}>↑ Probability</div>
                    <div style={{ gridColumn:'2 / 6', textAlign:'center', fontSize:8, color:'var(--text-muted)', paddingTop:4, fontStyle:'italic' }}>Impact →</div>
                  </div>
                </div>
                {/* Category Breakdown */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:8, textAlign:'center' }}>Risk Categories</div>
                  {catEntries.map(([cat, count]) => {
                    const total = risks.length;
                    const pctVal = Math.round((count / total) * 100);
                    const color = catColors[cat] || '#6b7280';
                    return (
                      <div key={cat} style={{ marginBottom:6 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:2 }}>
                          <span style={{ fontWeight:600 }}>{cat}</span>
                          <span style={{ color:'var(--text-muted)' }}>{count} ({pctVal}%)</span>
                        </div>
                        <div style={{ height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pctVal}%`, background:color, borderRadius:3, transition:'width 0.8s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                  {/* Risk level summary */}
                  <div style={{ display:'flex', gap:8, marginTop:12, justifyContent:'center' }}>
                    {['Critical','High','Medium','Low'].map(lvl => {
                      const c = risks.filter(r => r.risk_level === lvl && r.status !== 'Closed').length;
                      return (
                        <div key={lvl} style={{ textAlign:'center', padding:'4px 10px', borderRadius:6, background:`${riskLevelColors[lvl]}12` }}>
                          <div style={{ fontSize:16, fontWeight:800, color:riskLevelColors[lvl] }}>{c}</div>
                          <div style={{ fontSize:9, color:'var(--text-muted)' }}>{lvl}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Top Risks Table */}
              {openRisksList.length > 0 && (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', fontSize:11, borderCollapse:'separate', borderSpacing:'0 2px' }}>
                    <thead>
                      <tr style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em' }}>
                        <th style={{ padding:'6px 8px', textAlign:'left' }}>#</th>
                        <th style={{ padding:'6px 8px', textAlign:'left' }}>Risk Description</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>Level</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>Prob.</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>Impact</th>
                        <th style={{ padding:'6px 8px', textAlign:'left' }}>Mitigation</th>
                        <th style={{ padding:'6px 8px', textAlign:'left' }}>Owner</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openRisksList.slice(0, 8).map((r, i) => (
                        <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-card)' }}>
                          <td style={{ padding:'6px 8px', fontWeight:600, color:'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ padding:'6px 8px', fontWeight:500, maxWidth:250, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.risk_description}</td>
                          <td style={{ padding:'6px 8px', textAlign:'center' }}>
                            <span style={{ padding:'2px 8px', borderRadius:9999, fontSize:10, fontWeight:700,
                              background:`${riskLevelColors[r.risk_level] || '#6b7280'}18`,
                              color: riskLevelColors[r.risk_level] || '#6b7280' }}>{r.risk_level}</span>
                          </td>
                          <td style={{ padding:'6px 8px', textAlign:'center', fontSize:10 }}>{r.probability || '—'}</td>
                          <td style={{ padding:'6px 8px', textAlign:'center', fontSize:10 }}>{r.impact || '—'}</td>
                          <td style={{ padding:'6px 8px', fontSize:10, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--text-muted)' }}>{r.mitigation || '—'}</td>
                          <td style={{ padding:'6px 8px', fontSize:10, color:'var(--text-muted)' }}>{r.owner || '—'}</td>
                          <td style={{ padding:'6px 8px', textAlign:'center' }}>
                            <span style={{ padding:'2px 8px', borderRadius:9999, fontSize:10, fontWeight:600,
                              background:`${statusColors[r.status] || '#6b7280'}18`,
                              color: statusColors[r.status] || '#6b7280' }}>{r.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {openRisksList.length > 8 && (
                    <div style={{ textAlign:'center', fontSize:10, color:'var(--text-muted)', marginTop:6 }}>
                      +{openRisksList.length - 8} more — see Risk Register
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })() : (
          <div className="text-sm text-muted" style={{ textAlign:'center', padding:40 }}>
            No risks registered — add risks in the Project Summary page to see the heat map.
          </div>
        )}
      </div>

      {/* ══════ CLAIMS DASHBOARD ══════ */}
      <div className="card" style={{ padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
          <h3 style={{ margin:0, fontSize:15 }}>⚖️ Claims Dashboard — FIDIC Contractual Claims</h3>
          <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:11 }}>
            {(claims || []).length > 0 && (() => {
              const active = claims.filter(c => !['approved','rejected','withdrawn','time_barred'].includes(c.status)).length;
              const approved = claims.filter(c => c.status === 'approved').length;
              const totalClaimed = claims.reduce((s, c) => s + (c.cost_claimed || 0), 0);
              return (
                <>
                  <span style={{ padding:'3px 10px', borderRadius:9999, background:'#f59e0b18', color:'#f59e0b', fontWeight:600 }}>{active} active</span>
                  {approved > 0 && <span style={{ padding:'3px 10px', borderRadius:9999, background:'#10b98118', color:'#10b981', fontWeight:600 }}>{approved} approved</span>}
                  {totalClaimed > 0 && <span style={{ padding:'3px 10px', borderRadius:9999, background:'#3b82f618', color:'#3b82f6', fontWeight:600 }}>{fmtB(totalClaimed)} claimed</span>}
                </>
              );
            })()}
            <button className="btn btn-sm btn-secondary" style={{ fontSize:10 }} onClick={() => navigateTo('claims', p)}>Full Register</button>
          </div>
        </div>
        {(claims || []).length > 0 ? (() => {
          const TYPE_LABELS = { eot:'⏱️ EOT', cost:'💰 Cost', eot_and_cost:'⏱️💰 EOT & Cost', interest:'🏦 Interest', variation:'🔄 Variation', force_majeure:'🌪️ Force Majeure' };
          const STATUS_COLORS = {
            detected:'#f59e0b', notified:'#6366f1', under_preparation:'#0284c7', submitted:'#8b5cf6',
            under_review:'#e87b35', additional_info:'#f59e0b', partially_approved:'#059669',
            approved:'#059669', rejected:'#dc2626', withdrawn:'#94a3b8', time_barred:'#dc2626',
          };
          const PRIORITY_COLORS = { low:'#64748b', medium:'#f59e0b', high:'#e87b35', critical:'#dc2626' };
          // Pipeline stages
          const PIPELINE = ['detected','notified','under_preparation','submitted','under_review','additional_info','partially_approved','approved','rejected','withdrawn','time_barred'];
          const PIPELINE_LABELS = { detected:'Detected', notified:'Notified', under_preparation:'Preparing', submitted:'Submitted', under_review:'Under Review', additional_info:'Add. Info', partially_approved:'Partial', approved:'Approved', rejected:'Rejected', withdrawn:'Withdrawn', time_barred:'Time-barred' };
          const pipelineData = PIPELINE.map(s => ({ stage: s, label: PIPELINE_LABELS[s], count: claims.filter(c => c.status === s).length, color: STATUS_COLORS[s] })).filter(d => d.count > 0);
          const maxPipeline = Math.max(1, ...pipelineData.map(d => d.count));

          // Financial summary
          const totalCostClaimed = claims.reduce((s, c) => s + (c.cost_claimed || 0), 0);
          const totalEotClaimed = claims.reduce((s, c) => s + (c.eot_days_claimed || 0), 0);
          const approvedCost = claims.filter(c => c.status === 'approved' || c.status === 'partially_approved').reduce((s, c) => s + (c.cost_claimed || 0), 0);
          const rejectedCost = claims.filter(c => c.status === 'rejected').reduce((s, c) => s + (c.cost_claimed || 0), 0);
          const pendingCost = totalCostClaimed - approvedCost - rejectedCost;

          // Type breakdown
          const typeBreakdown = {};
          claims.forEach(c => { const t = c.claim_type || 'other'; typeBreakdown[t] = (typeBreakdown[t] || 0) + 1; });
          const typeEntries = Object.entries(typeBreakdown).sort((a,b) => b[1] - a[1]);

          return (
            <>
              {/* Top KPI row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:8, marginBottom:16 }}>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#3b82f6' }}>{claims.length}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Total Claims</div>
                </div>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#f59e0b' }}>{fmtB(totalCostClaimed)}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Cost Claimed</div>
                </div>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#10b981' }}>{fmtB(approvedCost)}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Approved</div>
                </div>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#ef4444' }}>{fmtB(rejectedCost)}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Rejected</div>
                </div>
                <div style={{ textAlign:'center', padding:10, background:'var(--bg)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#8b5cf6' }}>{totalEotClaimed}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>EOT Days Claimed</div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                {/* Claims Pipeline */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Claims Pipeline</div>
                  {pipelineData.map(d => (
                    <div key={d.stage} style={{ marginBottom:4 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, marginBottom:1 }}>
                        <span style={{ fontWeight:600 }}>{d.label}</span>
                        <span style={{ fontWeight:700, color: d.color }}>{d.count}</span>
                      </div>
                      <div style={{ height:8, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${(d.count / maxPipeline) * 100}%`, background:d.color, borderRadius:4, transition:'width 0.8s' }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Type + Financial Exposure */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Claims by Type</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
                    {typeEntries.map(([type, count]) => (
                      <div key={type} style={{ padding:'6px 12px', borderRadius:8, background:'var(--bg)', textAlign:'center' }}>
                        <div style={{ fontSize:10, marginBottom:2 }}>{TYPE_LABELS[type] || type}</div>
                        <div style={{ fontSize:16, fontWeight:800 }}>{count}</div>
                      </div>
                    ))}
                  </div>
                  {/* Financial exposure bar */}
                  {totalCostClaimed > 0 && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:600, marginBottom:4 }}>Financial Exposure</div>
                      <div style={{ height:14, background:'var(--border)', borderRadius:7, overflow:'hidden', display:'flex' }}>
                        {approvedCost > 0 && <div style={{ height:'100%', width:`${(approvedCost/totalCostClaimed)*100}%`, background:'#10b981', transition:'width 0.8s' }} title={`Approved: ${fmtB(approvedCost)}`} />}
                        {pendingCost > 0 && <div style={{ height:'100%', width:`${(pendingCost/totalCostClaimed)*100}%`, background:'#f59e0b', transition:'width 0.8s' }} title={`Pending: ${fmtB(pendingCost)}`} />}
                        {rejectedCost > 0 && <div style={{ height:'100%', width:`${(rejectedCost/totalCostClaimed)*100}%`, background:'#ef4444', transition:'width 0.8s' }} title={`Rejected: ${fmtB(rejectedCost)}`} />}
                      </div>
                      <div style={{ display:'flex', gap:12, marginTop:4, fontSize:9, justifyContent:'center' }}>
                        <span style={{ display:'flex', alignItems:'center', gap:3 }}><span style={{ width:8, height:8, borderRadius:2, background:'#10b981' }} />Approved</span>
                        <span style={{ display:'flex', alignItems:'center', gap:3 }}><span style={{ width:8, height:8, borderRadius:2, background:'#f59e0b' }} />Pending</span>
                        <span style={{ display:'flex', alignItems:'center', gap:3 }}><span style={{ width:8, height:8, borderRadius:2, background:'#ef4444' }} />Rejected</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Claims Table */}
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', fontSize:11, borderCollapse:'separate', borderSpacing:'0 2px' }}>
                  <thead>
                    <tr style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em' }}>
                      <th style={{ padding:'6px 8px', textAlign:'left' }}>Ref</th>
                      <th style={{ padding:'6px 8px', textAlign:'left' }}>Title</th>
                      <th style={{ padding:'6px 8px', textAlign:'center' }}>Type</th>
                      <th style={{ padding:'6px 8px', textAlign:'center' }}>FIDIC</th>
                      <th style={{ padding:'6px 8px', textAlign:'right' }}>Cost</th>
                      <th style={{ padding:'6px 8px', textAlign:'center' }}>EOT</th>
                      <th style={{ padding:'6px 8px', textAlign:'center' }}>Priority</th>
                      <th style={{ padding:'6px 8px', textAlign:'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.slice(0, 10).map((c, i) => (
                      <tr key={c.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-card)' }}>
                        <td style={{ padding:'6px 8px', fontWeight:700, fontFamily:'monospace', fontSize:10, color:'var(--text-muted)' }}>{c.claim_number || `#${i+1}`}</td>
                        <td style={{ padding:'6px 8px', fontWeight:500, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.title}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center', fontSize:10 }}>{TYPE_LABELS[c.claim_type] || c.claim_type || '—'}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center', fontSize:10, fontFamily:'monospace' }}>{c.fidic_clause || '—'}</td>
                        <td style={{ padding:'6px 8px', textAlign:'right', fontWeight:600, fontFamily:'monospace', fontSize:10 }}>{c.cost_claimed ? fmtB(c.cost_claimed) : '—'}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center', fontSize:10 }}>{c.eot_days_claimed ? `${c.eot_days_claimed}d` : '—'}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center' }}>
                          <span style={{ padding:'2px 8px', borderRadius:9999, fontSize:10, fontWeight:600,
                            background:`${PRIORITY_COLORS[c.priority] || '#6b7280'}18`,
                            color: PRIORITY_COLORS[c.priority] || '#6b7280' }}>{c.priority || '—'}</span>
                        </td>
                        <td style={{ padding:'6px 8px', textAlign:'center' }}>
                          <span style={{ padding:'2px 8px', borderRadius:9999, fontSize:10, fontWeight:600,
                            background:`${STATUS_COLORS[c.status] || '#6b7280'}18`,
                            color: STATUS_COLORS[c.status] || '#6b7280' }}>{(c.status || '').replace(/_/g, ' ')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {claims.length > 10 && (
                  <div style={{ textAlign:'center', fontSize:10, color:'var(--text-muted)', marginTop:6 }}>
                    +{claims.length - 10} more — see Claims Register
                  </div>
                )}
              </div>

              {/* FIDIC compliance note */}
              <div style={{ marginTop:12, padding:'8px 12px', background:'#eff6ff', borderRadius:'var(--radius)', borderLeft:'3px solid #3b82f6', fontSize:10, color:'#1e40af' }}>
                📋 <strong>FIDIC 1999 Red Book:</strong> Claims must be notified within 28 days of awareness (Cl. 20.1).
                Engineer's determination due within 42 days of receiving full particulars.
                {totalEotClaimed > 0 && ` Total EOT exposure: ${totalEotClaimed} days.`}
                {totalCostClaimed > 0 && ` Total financial exposure: ${fmtB(totalCostClaimed)}.`}
              </div>
            </>
          );
        })() : (
          <div className="text-sm text-muted" style={{ textAlign:'center', padding:40 }}>
            No claims recorded — use the Claims page to detect triggers and manage contractual claims.
          </div>
        )}
      </div>

      {/* ══════ FOOTER ACTIONS ══════ */}
      <div className="card" style={{ padding:14, display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
        <button className="btn btn-secondary" onClick={() => navigateTo('reports', p)}>📋 View Reports</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('works', p)}>⚒️ Works Activities</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('quality', p)}>🧪 Quality Tests</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('equipment', p)}>⚙ Equipment</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('boq', p)}>📊 Bill of Quantities</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('ipc', p)}>💰 IPC Certificates</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('issues', p)}>⚠ Site Issues</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('pavement', p)}>▤ Pavement Layers</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('structures', p)}>🌉 Structures</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('approvals', p)}>✅ Approvals</button>
        <button className="btn btn-primary" onClick={() => navigateTo('monthly-report', p)}>📋 Monthly Report</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('programme', p)}>📅 Programme</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('claims', p)}>⚖️ Claims</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('key-personnel', p)}>👥 Key Personnel</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('approvals-matrix', p)}>🔐 Approvals Matrix</button>
      </div>
    </div>
  );
}
