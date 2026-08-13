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
  const contractSum = boq.reduce((s,i)=>s+(i.boq_amount||0),0) || p.contract_sum || 0;
  const valueDone = boq.reduce((s,i)=>s+(i.value_to_date||0),0);
  const finPct = pct(valueDone, contractSum);
  const roadLen = p.end_chainage && p.start_chainage ? (p.end_chainage - p.start_chainage) : (p.road_length || 0);

  const startDt = p.commencement_date || p.start_date;
  const endDt = p.original_completion_date || p.end_date;
  const totalDays = daysBetween(startDt, endDt);
  const elapsedDays = daysBetween(startDt, new Date().toISOString().slice(0,10));
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const timePct = pct(elapsedDays, totalDays);
  const totalMonths = Math.round(totalDays / 30);
  const elapsedMonths = Math.round(elapsedDays / 30);

  const compActs = works.filter(w=>w.status==='Completed'||w.status==='Approved').length;
  const physPct = pct(compActs, works.length);
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

  // Activities by category
  const actByCat = {};
  works.forEach(w => {
    const cat = w.category || w.activity_name || 'Other';
    if (!actByCat[cat]) actByCat[cat] = { total:0, done:0 };
    actByCat[cat].total += w.planned_quantity || 1;
    actByCat[cat].done += w.completed_quantity || (w.status==='Completed'||w.status==='Approved' ? (w.planned_quantity||1) : 0);
  });
  const actProgress = Object.entries(actByCat)
    .map(([name,d])=>({ name: name.length>25 ? name.slice(0,25)+'...' : name, pct: pct(d.done, d.total) }))
    .sort((a,b)=>b.pct-a.pct).slice(0,10);

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

  // IPC chart data
  const ipcChart = ipcs.map(i => ({
    name: `IPC ${i.ipc_no}`,
    certified: i.certified_amount || 0,
    paid: i.paid_amount || 0,
  }));

  // Early warnings
  const warnings = [];
  if (variance < -10) warnings.push({ type:'critical', msg:'Physical progress significantly behind schedule' });
  if (critIss > 0) warnings.push({ type:'critical', msg:`${critIss} critical issue${critIss>1?'s':''} unresolved` });
  if (eqPct < 70 && eqReq > 0) warnings.push({ type:'warning', msg:`Equipment utilization at ${eqPct}% — below 70% target` });
  if (qPct < 80 && tests.length > 0) warnings.push({ type:'warning', msg:`Quality pass rate at ${qPct}% — below 80% threshold` });
  if (finPct > physPct + 15) warnings.push({ type:'warning', msg:'Financial progress ahead of physical — possible overpayment risk' });
  if (delayProb > 60) warnings.push({ type:'critical', msg:`Delay probability at ${delayProb}% — recovery programme needed` });
  if (critRisks > 0) warnings.push({ type:'warning', msg:`${critRisks} critical risk${critRisks>1?'s':''} on register` });

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

          {/* Major Activities */}
          <h3 style={{ margin:'16px 0 8px', fontSize:14 }}>Major Activities</h3>
          <div style={{ maxHeight:200, overflowY:'auto' }}>
            {actProgress.length > 0 ? actProgress.map((a,i) => (
              <ProgressBar key={i} label={a.name} value={a.pct}
                color={a.pct>=80?'#10b981':a.pct>=40?'#e87b35':'#ef4444'} />
            )) : <div className="text-sm text-muted" style={{ textAlign:'center', padding:20 }}>No activities data</div>}
          </div>
        </div>
      </div>

      {/* ══════ FINANCIAL + QUALITY + RISK ══════ */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:14, marginBottom:16 }}>
        {/* IPC / Financial Chart */}
        <div className="card" style={{ padding:14 }}>
          <h3 style={{ margin:'0 0 10px', fontSize:14 }}>Payment Certificates (IPC)</h3>
          {ipcChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ipcChart} margin={{ left:0, right:8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize:9, fill:'var(--text-muted)' }} />
                <YAxis tick={{ fontSize:9, fill:'var(--text-muted)' }} tickFormatter={v=>(v/1e6).toFixed(0)+'M'} />
                <Tooltip contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }} formatter={v=>fmt(v)} />
                <Legend wrapperStyle={{ fontSize:10 }} />
                <Bar dataKey="certified" fill="#2563eb" name="Certified" radius={[3,3,0,0]} />
                <Bar dataKey="paid" fill="#10b981" name="Paid" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-sm text-muted" style={{ textAlign:'center', padding:50 }}>No IPC data yet</div>}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:10, fontSize:11 }}>
            <div style={{ textAlign:'center' }}><div style={{ fontWeight:700 }}>{fmtB(certified)}</div><div className="text-muted">Certified</div></div>
            <div style={{ textAlign:'center' }}><div style={{ fontWeight:700 }}>{fmtB(paid)}</div><div className="text-muted">Paid</div></div>
            <div style={{ textAlign:'center' }}><div style={{ fontWeight:700 }}>{fmtB(balance)}</div><div className="text-muted">Balance</div></div>
          </div>
        </div>

        {/* Quality Summary */}
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
      </div>
    </div>
  );
}
