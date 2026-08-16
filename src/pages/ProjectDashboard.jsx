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
  const isPlatformAdmin = profile.is_platform_admin === true;

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const [proj,boq,works,equip,structs,issues,layers,tests,ipcs,risks,miles,mats,reports,instructions] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('boq_items').select('*').eq('project_id', projectId),
      supabase.from('works_activities').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('equipment_register').select('*').eq('project_id', projectId),
      supabase.from('structures').select('*').eq('project_id', projectId),
      supabase.from('site_issues').select('*').eq('project_id', projectId),
      supabase.from('pavement_layers').select('*').eq('project_id', projectId).order('start_chainage'),
      supabase.from('quality_tests').select('*').eq('project_id', projectId),
      supabase.from('ipc_certificates').select('*').eq('project_id', projectId).order('ipc_no'),
      supabase.from('risk_register').select('*').eq('project_id', projectId),
      supabase.from('project_milestones').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('project_materials').select('*').eq('project_id', projectId),
      supabase.from('daily_reports').select('id, report_date').eq('project_id', projectId),
      supabase.from('site_instructions').select('*').eq('project_id', projectId).order('issued_at', { ascending: false }),
    ]);
    setD({ p:proj.data, boq:boq.data||[], works:works.data||[], equip:equip.data||[], structs:structs.data||[],
      issues:issues.data||[], layers:layers.data||[], tests:tests.data||[], ipcs:ipcs.data||[],
      risks:risks.data||[], miles:miles.data||[], mats:mats.data||[], reports:reports.data||[],
      instructions:instructions.data||[] });
  }

  if (!d) return <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>Loading project dashboard...</div>;

  const { p, boq, works, equip, structs, issues, layers, tests, ipcs, risks, miles, mats, reports, instructions } = d;

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

      {/* ══════ SCORES ROW ══════ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:10, marginBottom:16 }}>
        <div className="card" style={{ padding:14 }}>
          <ScoreRing value={health} size={76} color={gradeColor} grade={grade} label="Health Grade" sublabel={gradeLabel} />
        </div>
        <div className="card" style={{ padding:14 }}>
          <ScoreRing value={qPct} size={76} label="Quality Score" sublabel={`${testPass}/${tests.length} passed`} />
        </div>
        <div className="card" style={{ padding:14 }}>
          <ScoreRing value={eqPct} size={76} label="Equipment Util." sublabel={`${eqOn}/${eqReq} on site`} />
        </div>
        <div className="card" style={{ padding:14 }}>
          <ScoreRing value={100-delayProb} size={76} label="Delay Probability"
            sublabel={`${delayProb}% risk`} color={delayProb>60?'#ef4444':delayProb>30?'#f59e0b':'#10b981'} />
        </div>
        <div className="card" style={{ padding:14 }}>
          <KPI title="Certified" value={fmtB(certified)} subtitle={`${fmtB(paid)} paid`} />
        </div>
        <div className="card" style={{ padding:14, background: openIss > 0 ? '#fef2f220' : 'var(--bg-card)' }}>
          <KPI title="Open Issues" value={openIss} color={critIss>0?'#ef4444':openIss>0?'#f59e0b':'#10b981'}
            subtitle={critIss>0?`${critIss} critical`:openIss>0?`${highIss} high`:'All clear'} />
        </div>
      </div>

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
      <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:14, marginBottom:16 }}>
        <div className="card" style={{ padding:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <h3 style={{ margin:0, fontSize:14 }}>Progress Curve (S-Curve)</h3>
            <StatusBadge status={scheduleStatus} />
          </div>
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
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginTop:6, padding:'0 8px' }}>
            <span>Planned: <strong>{timePct}%</strong></span>
            <span>Actual: <strong>{physPct}%</strong></span>
            <span style={{ color:variance>=0?'#10b981':'#ef4444', fontWeight:700 }}>Variance: {variance>0?'+':''}{variance}%</span>
          </div>
        </div>

        {/* Chainage Progress */}
        <div className="card" style={{ padding:14 }}>
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

          {/* Category Progress with Live Indicators */}
          <h3 style={{ margin:'16px 0 8px', fontSize:14 }}>Major Activities by Category</h3>
          <div style={{ maxHeight:220, overflowY:'auto' }}>
            {actProgress.length > 0 ? actProgress.map((a,i) => (
              <div key={i} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, marginBottom:3 }}>
                  <span style={{ fontWeight:500, display:'flex', alignItems:'center', gap:5 }}>
                    {a.hasLive && <span style={{ width:8, height:8, borderRadius:'50%', background:'#10b981', display:'inline-block',
                      boxShadow:'0 0 6px #10b981', animation:'pulse 1.5s infinite' }} title="Active today" />}
                    {a.name}
                  </span>
                  <span style={{ fontWeight:700, color: a.pct>=80?'#10b981':a.pct>=40?'#e87b35':'#ef4444' }}>{a.pct}%</span>
                </div>
                <div style={{ height:8, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${a.pct}%`, borderRadius:4, transition:'width 1s ease',
                    background: a.hasLive
                      ? 'linear-gradient(90deg, #10b981, #34d399)'
                      : a.pct>=80 ? '#10b981' : a.pct>=40 ? '#e87b35' : '#ef4444' }} />
                </div>
              </div>
            )) : <div className="text-sm text-muted" style={{ textAlign:'center', padding:20 }}>No activities data</div>}
          </div>
        </div>
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
      <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:14, marginBottom:16 }}>
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

      {/* ══════ FOOTER ACTIONS ══════ */}
      <div className="card" style={{ padding:14, display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
        <button className="btn btn-secondary" onClick={() => navigateTo('reports', p)}>📋 View Reports</button>
        <button className="btn btn-secondary" onClick={() => navigateTo('works', p)}>⛏ Works Activities</button>
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
