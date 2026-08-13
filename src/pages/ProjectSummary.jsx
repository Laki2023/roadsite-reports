import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const COLORS = ['#e87b35','#2563eb','#16a34a','#d97706','#7c3aed','#dc2626','#0891b2'];
const fmt = (n) => n != null ? 'KES ' + Number(n).toLocaleString() : '—';
const fmtB = (n) => { if (!n) return '—'; if (n >= 1e9) return 'KES ' + (n/1e9).toFixed(2) + 'B'; if (n >= 1e6) return 'KES ' + (n/1e6).toFixed(1) + 'M'; return fmt(n); };

function Ring({ pct, size=70, color='#e87b35', label }) {
  const r = (size-8)/2, c = 2*Math.PI*r, o = c - (pct/100)*c;
  return (<div style={{ position:'relative', width:size, height:size, display:'inline-block' }}>
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={c} strokeDashoffset={o} strokeLinecap="round" />
    </svg>
    <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center' }}>
      <div style={{ fontSize: size*0.22, fontWeight:800, color }}>{pct.toFixed(0)}%</div>
      {label && <div style={{ fontSize:8, color:'var(--text-muted)' }}>{label}</div>}
    </div>
  </div>);
}

function RAG({ status }) {
  const c = status === 'Good' || status === 'On Track' || status === 'Achieved' ? '#16a34a' : status === 'At Risk' || status === 'Requires Attention' ? '#d97706' : status === 'Critical' || status === 'Behind' || status === 'Delayed' ? '#dc2626' : '#6b7280';
  return <span style={{ display:'inline-block', width:12, height:12, borderRadius:6, background:c, marginRight:6 }} />;
}

export default function ProjectSummary({ projectId, onBack, profile }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('overview');
  const [showModal, setShowModal] = useState(null);
  const [modalForm, setModalForm] = useState({});
  const [saving, setSaving] = useState(false);
  const canManage = hasRole(profile?.role, 'resident_engineer');

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const [proj,boq,works,equip,structs,issues,layers,tests,ipcs,emerg,mats,risks,miles,decisions] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('boq_items').select('*').eq('project_id', projectId),
      supabase.from('works_activities').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('equipment_register').select('*').eq('project_id', projectId),
      supabase.from('structures').select('*').eq('project_id', projectId).order('chainage'),
      supabase.from('site_issues').select('*').eq('project_id', projectId),
      supabase.from('pavement_layers').select('*').eq('project_id', projectId).order('start_chainage'),
      supabase.from('quality_tests').select('*').eq('project_id', projectId),
      supabase.from('ipc_certificates').select('*').eq('project_id', projectId).order('ipc_no'),
      supabase.from('site_emergencies').select('*').eq('project_id', projectId),
      supabase.from('project_materials').select('*').eq('project_id', projectId),
      supabase.from('risk_register').select('*').eq('project_id', projectId).order('created_at',{ascending:false}),
      supabase.from('project_milestones').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('management_decisions').select('*').eq('project_id', projectId).order('created_at',{ascending:false}),
    ]);
    setD({ p:proj.data, boq:boq.data||[], works:works.data||[], equip:equip.data||[], structs:structs.data||[],
      issues:issues.data||[], layers:layers.data||[], tests:tests.data||[], ipcs:ipcs.data||[],
      emerg:emerg.data||[], mats:mats.data||[], risks:risks.data||[], miles:miles.data||[], decisions:decisions.data||[] });
  }

  async function addRecord(table, data) {
    setSaving(true);
    const { error } = await supabase.from(table).insert({ ...data, project_id: projectId, raised_by: profile.id });
    setSaving(false);
    if (error) return;
    setShowModal(null); setModalForm({}); load();
  }

  if (!d) return <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>Loading...</div>;

  const { p, boq, works, equip, structs, issues, layers, tests, ipcs, emerg, mats, risks, miles, decisions } = d;
  const contractSum = boq.reduce((s,i) => s+(i.boq_amount||0),0) || p.contract_sum || 0;
  const valueDone = boq.reduce((s,i) => s+(i.value_to_date||0),0);
  const finPct = contractSum > 0 ? (valueDone/contractSum)*100 : 0;
  const roadLen = p.end_chainage && p.start_chainage ? p.end_chainage - p.start_chainage : 0;
  const costPerKm = roadLen > 0 ? contractSum/roadLen : 0;
  const startDt = p.commencement_date ? new Date(p.commencement_date) : null;
  const endDt = p.original_completion_date ? new Date(p.original_completion_date) : null;
  const now = new Date();
  const totalDays = startDt && endDt ? (endDt-startDt)/86400000 : 0;
  const elapsed = startDt ? Math.max(0,(now-startDt)/86400000) : 0;
  const remaining = endDt ? Math.max(0,(endDt-now)/86400000) : 0;
  const timePct = totalDays > 0 ? Math.min(100,(elapsed/totalDays)*100) : 0;
  const behind = finPct < timePct - 10;
  const compActs = works.filter(w=>w.status==='Completed'||w.status==='Approved').length;
  const worksPct = works.length > 0 ? (compActs/works.length)*100 : 0;
  const eqReq = equip.reduce((s,e)=>s+(e.required_quantity||0),0);
  const eqOn = equip.reduce((s,e)=>s+(e.actual_on_site||0),0);
  const eqPct = eqReq > 0 ? (eqOn/eqReq)*100 : 100;
  const strDone = structs.filter(s=>s.overall_status==='Completed'||s.overall_status==='Approved').length;
  const strPct = structs.length > 0 ? (strDone/structs.length)*100 : 100;
  const testPass = tests.filter(t=>t.result_status==='Pass').length;
  const testFail = tests.filter(t=>t.result_status==='Fail').length;
  const qPct = tests.length > 0 ? (testPass/tests.length)*100 : 100;
  const openIss = issues.filter(i=>i.status==='Open'||i.status==='In Progress').length;
  const critIss = issues.filter(i=>i.severity==='Critical'&&i.status!=='Closed').length;
  const health = (finPct*0.25)+(worksPct*0.25)+(qPct*0.2)+(eqPct*0.15)+(strPct*0.15);
  const grade = health >= 90 ? 'A' : health >= 75 ? 'B' : health >= 60 ? 'C' : health >= 40 ? 'D' : 'F';
  const gradeColor = health >= 75 ? '#16a34a' : health >= 60 ? '#d97706' : '#dc2626';
  const openRisks = risks.filter(r=>r.status==='Open'||r.status==='Mitigating');
  const critRisks = openRisks.filter(r=>r.risk_level==='Critical');
  const pendingDecisions = decisions.filter(d=>d.status==='Pending');

  // Chainage matrix data
  const chainageStep = Math.max(1, Math.ceil(roadLen / 10));
  const chainageSlots = [];
  if (roadLen > 0) {
    for (let ch = Math.floor(p.start_chainage); ch < p.end_chainage; ch += chainageStep) {
      chainageSlots.push({ from: ch, to: Math.min(ch + chainageStep, p.end_chainage) });
    }
  }
  const actCategories = ['Earthworks','Pavement','Surfacing','Drainage','Road Furniture'];
  const layerTypes = ['Subgrade','Sub-base','Base','Binder Course','Wearing Course'];

  // Works by category chart
  const worksCat = {};
  works.forEach(w => { if (!worksCat[w.category]) worksCat[w.category] = { total:0, done:0 }; worksCat[w.category].total++; if (w.status==='Completed'||w.status==='Approved') worksCat[w.category].done++; });
  const worksChart = Object.entries(worksCat).map(([name,d]) => ({ name, total:d.total, done:d.done }));

  const TABS = [
    { key:'overview', label:'Executive Summary' },
    { key:'chainage', label:'Chainage Matrix' },
    { key:'financial', label:'Financial' },
    { key:'materials', label:'Materials' },
    { key:'quality', label:'Quality' },
    { key:'risks', label:'Risks & Issues' },
    { key:'milestones', label:'Milestones' },
    { key:'decisions', label:'Decisions' },
  ];

  return (
    <div>
      <button className="btn btn-sm btn-secondary mb-16" onClick={onBack}>← Back to Dashboard</button>

      {/* HEADER */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:20, marginBottom:16, padding:20, background:'var(--bg-card)', borderRadius:'var(--radius)', border:'1px solid var(--border)' }}>
        <div>
          <h2 style={{ margin:0, fontSize:20 }}>{p.name}</h2>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>{p.contract_no} · {p.contractor_name} · {p.category} · {p.fidic_edition}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'4px 16px', fontSize:11, marginTop:8 }}>
            <div><span className="text-muted">Employer:</span> <strong>{p.employer}</strong></div>
            <div><span className="text-muted">Length:</span> <strong>{roadLen.toFixed(1)} km</strong></div>
            <div><span className="text-muted">Phase:</span> <span className="badge badge-accent">{p.current_phase}</span></div>
          </div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:48, fontWeight:900, color:gradeColor, lineHeight:1 }}>{grade}</div>
          <div style={{ fontSize:10, color:'var(--text-muted)' }}>Health: {health.toFixed(0)}/100</div>
        </div>
      </div>

      {/* KEY ISSUES FOR MANAGEMENT - always on top */}
      {(pendingDecisions.length > 0 || critRisks.length > 0 || critIss > 0) && (
        <div style={{ background:'linear-gradient(135deg,#7f1d1d,#991b1b)', padding:16, borderRadius:'var(--radius)', marginBottom:16, color:'#fff' }}>
          <h3 style={{ margin:'0 0 8px', fontSize:14 }}>⚠ Key Issues Requiring Management Attention</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:6, fontSize:12 }}>
            {pendingDecisions.slice(0,3).map(d => (
              <div key={d.id} style={{ display:'flex', gap:8 }}>
                <span>🔴</span><span><strong>{d.issue}</strong> — {d.required_decision} (Due: {d.deadline || 'ASAP'})</span>
              </div>
            ))}
            {critRisks.slice(0,2).map(r => (
              <div key={r.id} style={{ display:'flex', gap:8 }}>
                <span>⚠️</span><span><strong>Risk:</strong> {r.risk_description} — Mitigation: {r.mitigation || 'TBD'}</span>
              </div>
            ))}
            {critIss > 0 && <div style={{ display:'flex', gap:8 }}><span>🔴</span><span>{critIss} critical site issue{critIss>1?'s':''} unresolved</span></div>}
          </div>
        </div>
      )}

      {/* KPI STRIP */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, marginBottom:16 }}>
        {[
          { l:'Physical', v:`${finPct.toFixed(0)}%`, s:behind?'Behind':'On Track', c:behind?'#dc2626':'#16a34a' },
          { l:'Financial', v:fmtB(valueDone), s:`of ${fmtB(contractSum)}`, c:'#e87b35' },
          { l:'Time', v:`${timePct.toFixed(0)}%`, s:`${Math.round(remaining)}d left`, c:behind?'#dc2626':'#2563eb' },
          { l:'Quality', v:`${qPct.toFixed(0)}%`, s:`${testPass}/${tests.length}`, c:qPct>=80?'#16a34a':'#dc2626' },
          { l:'Equipment', v:`${eqPct.toFixed(0)}%`, s:`${eqOn}/${eqReq}`, c:eqPct>=80?'#16a34a':'#d97706' },
          { l:'Risks', v:openRisks.length, s:`${critRisks.length} critical`, c:critRisks.length>0?'#dc2626':'#16a34a' },
        ].map((k,i) => (
          <div key={i} className="stat-card" style={{ textAlign:'center', borderTop:`3px solid ${k.c}`, padding:'10px 6px' }}>
            <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase' }}>{k.l}</div>
            <div style={{ fontSize:18, fontWeight:800, color:k.c, margin:'4px 0' }}>{k.v}</div>
            <div style={{ fontSize:9, color:'var(--text-muted)' }}>{k.s}</div>
          </div>
        ))}
      </div>

      {/* PROGRESS RINGS */}
      <div style={{ display:'flex', justifyContent:'space-around', padding:'12px 0', marginBottom:16, background:'var(--bg-card)', borderRadius:'var(--radius)', border:'1px solid var(--border)' }}>
        <Ring pct={finPct} color="#e87b35" label="Financial" />
        <Ring pct={worksPct} color="#2563eb" label="Works" />
        <Ring pct={timePct} color={behind?'#dc2626':'#16a34a'} label="Schedule" />
        <Ring pct={eqPct} color="#7c3aed" label="Equipment" />
        <Ring pct={strPct} color="#0891b2" label="Structures" />
        <Ring pct={qPct} color={qPct>=80?'#16a34a':'#dc2626'} label="Quality" />
      </div>

      {/* TABS */}
      <div className="tabs" style={{ marginBottom:16 }}>
        {TABS.map(t => <button key={t.key} className={tab===t.key?'active':''} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {/* ═══ OVERVIEW TAB ═══ */}
      {tab === 'overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {/* Timeline */}
          <div className="card" style={{ padding:16, gridColumn:'span 2' }}>
            <h3 style={{ fontSize:13, marginBottom:8 }}>Project Timeline</h3>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:10, minWidth:70 }}>{p.commencement_date||'—'}</span>
              <div style={{ flex:1, position:'relative', height:22, background:'var(--bg-hover)', borderRadius:11, overflow:'hidden' }}>
                <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${timePct}%`, background:'rgba(107,114,128,0.3)', borderRadius:11 }} />
                <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${Math.min(100,finPct)}%`, background:behind?'rgba(220,38,38,0.6)':'rgba(22,163,74,0.6)', borderRadius:11 }} />
                <span style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', fontSize:9, fontWeight:700, color:'#fff' }}>
                  {behind ? `⚠ Physical ${finPct.toFixed(0)}% vs Time ${timePct.toFixed(0)}%` : `On Track — ${finPct.toFixed(0)}%`}
                </span>
              </div>
              <span style={{ fontSize:10, minWidth:70, textAlign:'right' }}>{p.original_completion_date||'—'}</span>
            </div>
          </div>

          {/* Works Progress */}
          {worksChart.length > 0 && (
            <div className="card" style={{ padding:16 }}>
              <h3 style={{ fontSize:13, marginBottom:8 }}>Works by Category</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={worksChart}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize:9, fill:'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize:9, fill:'var(--text-muted)' }} />
                  <Tooltip contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }} />
                  <Bar dataKey="total" fill="#4b5563" name="Total" radius={[2,2,0,0]} />
                  <Bar dataKey="done" fill="#e87b35" name="Done" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Key Observations */}
          <div className="card" style={{ padding:16 }}>
            <h3 style={{ fontSize:13, marginBottom:8 }}>Key Observations</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:6, fontSize:12 }}>
              {behind ? <div><RAG status="Behind" /><strong>Behind schedule</strong> — physical {finPct.toFixed(0)}% vs time {timePct.toFixed(0)}%</div>
                : <div><RAG status="On Track" /><strong>On track</strong> — progress aligned with schedule</div>}
              {qPct < 80 && tests.length > 0 && <div><RAG status="Critical" />Quality concern — {qPct.toFixed(0)}% pass rate ({testFail} failures)</div>}
              {qPct >= 80 && tests.length > 0 && <div><RAG status="Good" />Quality good — {qPct.toFixed(0)}% pass rate</div>}
              {eqPct < 80 && <div><RAG status="At Risk" />Equipment shortfall — {eqOn}/{eqReq} on site ({eqPct.toFixed(0)}%)</div>}
              {mats.filter(m=>m.available_quantity<m.required_quantity*0.5).length > 0 && <div><RAG status="Critical" />{mats.filter(m=>m.available_quantity<m.required_quantity*0.5).length} materials critically low</div>}
              {openRisks.length > 0 && <div><RAG status={critRisks.length>0?'Critical':'At Risk'} />{openRisks.length} open risks ({critRisks.length} critical)</div>}
              {openIss > 0 && <div><RAG status={critIss>0?'Critical':'At Risk'} />{openIss} open issues</div>}
              {emerg.filter(e=>e.status!=='Resolved').length > 0 && <div>🚨 <strong style={{ color:'#dc2626' }}>{emerg.filter(e=>e.status!=='Resolved').length} active emergency</strong></div>}
            </div>
          </div>

          {/* Structures */}
          {structs.length > 0 && (
            <div className="card" style={{ padding:16 }}>
              <h3 style={{ fontSize:13, marginBottom:8 }}>Structures ({structs.length})</h3>
              {structs.slice(0,6).map(s => (
                <div key={s.id} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, marginBottom:4 }}>
                  <span style={{ fontWeight:600, minWidth:45 }}>{s.structure_ref}</span>
                  <span className="text-muted" style={{ flex:1 }}>{s.structure_type}</span>
                  <div className="progress-bar" style={{ width:60, height:5 }}>
                    <div className={`fill ${s.percent_complete>=80?'green':s.percent_complete>=40?'orange':'red'}`} style={{ width:`${s.percent_complete||0}%` }} />
                  </div>
                  <span style={{ fontSize:9, minWidth:25 }}>{s.percent_complete||0}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Impact */}
          <div className="card" style={{ padding:16, gridColumn:'span 2' }}>
            <h3 style={{ fontSize:13, marginBottom:8 }}>Project Impact</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, textAlign:'center' }}>
              {[
                { v:roadLen.toFixed(1), l:'km of Road', c:'#e87b35' },
                { v:structs.length, l:'Structures', c:'#2563eb' },
                { v:equip.length, l:'Equipment', c:'#16a34a' },
                { v:tests.length, l:'Quality Tests', c:'#7c3aed' },
                { v:fmtB(costPerKm), l:'Cost per km', c:'#0891b2' },
                { v:ipcs.length, l:'IPCs Issued', c:'#d97706' },
              ].map((x,i) => (
                <div key={i} style={{ padding:8, background:'var(--bg-hover)', borderRadius:'var(--radius)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:x.c }}>{x.v}</div>
                  <div style={{ fontSize:9, color:'var(--text-muted)' }}>{x.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ CHAINAGE MATRIX TAB ═══ */}
      {tab === 'chainage' && (
        <div className="card" style={{ padding:16, overflowX:'auto' }}>
          <h3 style={{ fontSize:13, marginBottom:12 }}>Chainage-Based Progress Matrix</h3>
          {chainageSlots.length === 0 ? <div className="text-muted">Set project chainage to generate matrix</div> : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
              <thead>
                <tr style={{ background:'var(--bg-hover)' }}>
                  <th style={{ padding:'6px 8px', textAlign:'left', borderBottom:'2px solid var(--border)' }}>Chainage</th>
                  {layerTypes.map(lt => <th key={lt} style={{ padding:'6px 4px', textAlign:'center', borderBottom:'2px solid var(--border)', fontSize:9 }}>{lt}</th>)}
                  <th style={{ padding:'6px 4px', textAlign:'center', borderBottom:'2px solid var(--border)', fontSize:9 }}>Drainage</th>
                  <th style={{ padding:'6px 4px', textAlign:'center', borderBottom:'2px solid var(--border)', fontSize:9 }}>Structures</th>
                  <th style={{ padding:'6px 4px', textAlign:'center', borderBottom:'2px solid var(--border)', fontSize:9 }}>Overall</th>
                </tr>
              </thead>
              <tbody>
                {chainageSlots.map((slot,i) => {
                  const inRange = (item) => item.start_chainage < slot.to && (item.end_chainage || item.start_chainage) > slot.from;
                  const layerStatus = (lt) => {
                    const matching = layers.filter(l => l.layer_type === lt && inRange(l));
                    if (matching.length === 0) return '—';
                    const approved = matching.some(l => l.layer_status === 'Approved');
                    const laid = matching.some(l => l.layer_status === 'Laid' || l.layer_status === 'Tested');
                    const inProg = matching.some(l => l.layer_status === 'Laying In Progress');
                    return approved ? '✅' : laid ? '🟡' : inProg ? '🔨' : '—';
                  };
                  const drainStatus = structs.filter(s => s.chainage >= slot.from && s.chainage < slot.to && (s.structure_type.includes('Culvert') || s.structure_type.includes('Drain'))).length > 0 ? '✅' : '—';
                  const structsInSlot = structs.filter(s => s.chainage >= slot.from && s.chainage < slot.to && !s.structure_type.includes('Culvert'));
                  const structStatus = structsInSlot.length > 0 ? (structsInSlot.every(s => s.percent_complete >= 100) ? '✅' : '🔨') : '—';
                  const statuses = layerTypes.map(lt => layerStatus(lt));
                  const doneCount = statuses.filter(s => s === '✅').length;
                  const overall = doneCount >= 4 ? 'Good' : doneCount >= 2 ? 'Moderate' : 'Behind';
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'4px 8px', fontWeight:600, fontFamily:'monospace' }}>{slot.from.toFixed(0)}–{slot.to.toFixed(0)} km</td>
                      {layerTypes.map(lt => <td key={lt} style={{ textAlign:'center', padding:'4px' }}>{layerStatus(lt)}</td>)}
                      <td style={{ textAlign:'center', padding:'4px' }}>{drainStatus}</td>
                      <td style={{ textAlign:'center', padding:'4px' }}>{structStatus}</td>
                      <td style={{ textAlign:'center', padding:'4px' }}><RAG status={overall} /><span style={{ fontSize:9 }}>{overall}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div style={{ marginTop:8, fontSize:10, color:'var(--text-muted)' }}>✅ Approved  🟡 Laid/Tested  🔨 In Progress  — Not Started</div>
        </div>
      )}

      {/* ═══ FINANCIAL TAB ═══ */}
      {tab === 'financial' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div className="card" style={{ padding:16 }}>
            <h3 style={{ fontSize:13, marginBottom:8 }}>Financial Summary</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'6px 16px', fontSize:12 }}>
              {[
                ['Contract Sum', fmtB(contractSum)],
                ['Value Done', fmtB(valueDone)],
                ['Remaining', fmtB(contractSum-valueDone)],
                ['Cost/km', fmtB(costPerKm)],
                ['IPCs Issued', ipcs.length],
                ['Last IPC Net', ipcs.length>0?fmtB(ipcs[ipcs.length-1].net_amount):'—'],
                ['Financial Progress', finPct.toFixed(1)+'%'],
                ['Physical Progress', worksPct.toFixed(1)+'%'],
              ].map(([l,v],i) => (<React.Fragment key={i}><div>{l}:</div><div className="text-mono" style={{ textAlign:'right', fontWeight:i<3?700:400 }}>{v}</div></React.Fragment>))}
            </div>
            {finPct > worksPct + 10 && <div style={{ marginTop:8, padding:8, background:'rgba(220,38,38,0.1)', borderRadius:'var(--radius)', fontSize:11, color:'#dc2626' }}>⚠ Financial progress ({finPct.toFixed(0)}%) exceeds physical ({worksPct.toFixed(0)}%) — investigate</div>}
          </div>
          <div className="card" style={{ padding:16 }}>
            <h3 style={{ fontSize:13, marginBottom:8 }}>IPC History</h3>
            {ipcs.length === 0 ? <div className="text-muted text-sm">No IPCs yet</div> : (
              <div style={{ fontSize:11 }}>{ipcs.map(i => (
                <div key={i.id} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                  <span>IPC {i.ipc_no}</span><span className="text-mono">{fmtB(i.net_amount)}</span>
                  <span className={`badge badge-${i.status==='Paid'?'success':i.status==='Certified'?'accent':'muted'}`} style={{ fontSize:9 }}>{i.status}</span>
                </div>
              ))}</div>
            )}
          </div>
        </div>
      )}

      {/* ═══ MATERIALS TAB ═══ */}
      {tab === 'materials' && (
        <div>
          {canManage && <button className="btn btn-primary btn-sm mb-16" onClick={() => { setShowModal('material'); setModalForm({ material_name:'', material_type:'Cement', unit:'tonnes', required_quantity:0, available_quantity:0, delivered_quantity:0, source:'', approval_status:'Pending' }); }}>+ Add Material</button>}
          {mats.length === 0 ? <div className="card empty-state"><p>No materials tracked</p></div> : (
            <div className="table-wrap"><table><thead><tr><th>Material</th><th>Type</th><th>Required</th><th>Available</th><th>Delivered</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>{mats.map(m => {
                const bal = m.required_quantity - m.delivered_quantity;
                const low = m.available_quantity < m.required_quantity * 0.5;
                return (<tr key={m.id} style={{ background:low?'rgba(220,38,38,0.05)':'transparent' }}>
                  <td style={{ fontWeight:500 }}>{m.material_name}</td><td className="text-sm">{m.material_type}</td>
                  <td className="text-mono">{Number(m.required_quantity).toLocaleString()} {m.unit}</td>
                  <td className="text-mono" style={{ color:low?'var(--danger)':'inherit', fontWeight:low?700:400 }}>{Number(m.available_quantity).toLocaleString()}</td>
                  <td className="text-mono">{Number(m.delivered_quantity).toLocaleString()}</td>
                  <td className="text-mono" style={{ color:bal>0?'var(--danger)':'var(--success)' }}>{Number(bal).toLocaleString()}</td>
                  <td><span className={`badge badge-${m.approval_status==='Approved'?'success':m.approval_status==='Rejected'?'danger':'muted'}`}>{m.approval_status}</span></td>
                </tr>);
              })}</tbody></table></div>
          )}
        </div>
      )}

      {/* ═══ QUALITY TAB ═══ */}
      {tab === 'quality' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div className="card" style={{ padding:16 }}>
            <h3 style={{ fontSize:13, marginBottom:8 }}>Quality Summary</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'6px 16px', fontSize:12 }}>
              {[['Tests Conducted',tests.length],['Tests Passed',testPass],['Tests Failed',testFail],['Pass Rate',qPct.toFixed(0)+'%'],['Pending',tests.filter(t=>t.result_status==='Pending').length]].map(([l,v],i) => (
                <React.Fragment key={i}><div>{l}:</div><div style={{ textAlign:'right', fontWeight:600 }}>{v}</div></React.Fragment>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding:16 }}>
            <h3 style={{ fontSize:13, marginBottom:8 }}>Pavement Layer Tests</h3>
            {layerTypes.map(lt => {
              const ltTests = tests.filter(t => layers.some(l => l.id === t.layer_id && l.layer_type === lt));
              const passed = ltTests.filter(t => t.result_status === 'Pass').length;
              return ltTests.length > 0 ? (
                <div key={lt} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, marginBottom:4 }}>
                  <span style={{ minWidth:90 }}>{lt}</span>
                  <div className="progress-bar" style={{ flex:1, height:6 }}><div className="fill green" style={{ width:`${(passed/ltTests.length)*100}%` }} /></div>
                  <span style={{ fontSize:9 }}>{passed}/{ltTests.length}</span>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* ═══ RISKS TAB ═══ */}
      {tab === 'risks' && (
        <div>
          {canManage && <button className="btn btn-primary btn-sm mb-16" onClick={() => { setShowModal('risk'); setModalForm({ risk_description:'', category:'Technical', probability:'Medium', impact:'Medium', mitigation:'', owner:'', due_date:'', status:'Open' }); }}>+ Add Risk</button>}
          {risks.length === 0 ? <div className="card empty-state"><p>No risks registered</p></div> : (
            <div className="table-wrap"><table><thead><tr><th>Risk</th><th>Category</th><th>Prob.</th><th>Impact</th><th>Level</th><th>Mitigation</th><th>Owner</th><th>Status</th></tr></thead>
              <tbody>{risks.map(r => (
                <tr key={r.id}><td style={{ fontWeight:500, fontSize:12 }}>{r.risk_description}</td><td className="text-sm">{r.category}</td>
                  <td><RAG status={r.probability==='High'||r.probability==='Very High'?'Critical':'At Risk'} />{r.probability}</td>
                  <td><RAG status={r.impact==='High'||r.impact==='Very High'?'Critical':'At Risk'} />{r.impact}</td>
                  <td><span className={`badge badge-${r.risk_level==='Critical'?'danger':r.risk_level==='High'?'warning':'muted'}`}>{r.risk_level}</span></td>
                  <td className="text-sm">{r.mitigation||'—'}</td><td className="text-sm">{r.owner||'—'}</td>
                  <td><span className={`badge badge-${r.status==='Closed'?'success':'accent'}`}>{r.status}</span></td>
                </tr>))}</tbody></table></div>
          )}
        </div>
      )}

      {/* ═══ MILESTONES TAB ═══ */}
      {tab === 'milestones' && (
        <div>
          {canManage && <button className="btn btn-primary btn-sm mb-16" onClick={() => { setShowModal('milestone'); setModalForm({ milestone_name:'', planned_date:'', status:'Upcoming', sort_order:miles.length }); }}>+ Add Milestone</button>}
          {miles.length === 0 ? <div className="card empty-state"><p>No milestones set</p></div> : (
            <div className="table-wrap"><table><thead><tr><th>Milestone</th><th>Planned</th><th>Actual</th><th>Status</th></tr></thead>
              <tbody>{miles.map(m => (
                <tr key={m.id}><td style={{ fontWeight:500 }}>{m.milestone_name}</td>
                  <td className="text-mono">{m.planned_date||'—'}</td><td className="text-mono">{m.actual_date||'—'}</td>
                  <td><RAG status={m.status} /><span style={{ fontSize:12 }}>{m.status}</span></td>
                </tr>))}</tbody></table></div>
          )}
        </div>
      )}

      {/* ═══ DECISIONS TAB ═══ */}
      {tab === 'decisions' && (
        <div>
          {canManage && <button className="btn btn-primary btn-sm mb-16" onClick={() => { setShowModal('decision'); setModalForm({ issue:'', impact:'', required_decision:'', responsible:'', deadline:'', status:'Pending' }); }}>+ Add Decision Item</button>}
          {decisions.length === 0 ? <div className="card empty-state"><p>No management decisions pending</p></div> : (
            <div className="table-wrap"><table><thead><tr><th>Issue</th><th>Impact</th><th>Decision Required</th><th>Responsible</th><th>Deadline</th><th>Status</th></tr></thead>
              <tbody>{decisions.map(d => (
                <tr key={d.id}><td style={{ fontWeight:500, fontSize:12 }}>{d.issue}</td><td className="text-sm">{d.impact||'—'}</td>
                  <td className="text-sm">{d.required_decision}</td><td className="text-sm">{d.responsible||'—'}</td>
                  <td className="text-mono text-sm">{d.deadline||'—'}</td>
                  <td><span className={`badge badge-${d.status==='Decided'||d.status==='Implemented'?'success':d.status==='Escalated'?'danger':'accent'}`}>{d.status}</span></td>
                </tr>))}</tbody></table></div>
          )}
        </div>
      )}

      {/* ═══ ADD MODAL ═══ */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:500 }}>
            <h3>Add {showModal === 'material' ? 'Material' : showModal === 'risk' ? 'Risk' : showModal === 'milestone' ? 'Milestone' : 'Decision'}
              <button onClick={() => setShowModal(null)}>×</button></h3>
            <form onSubmit={e => { e.preventDefault();
              const table = showModal === 'material' ? 'project_materials' : showModal === 'risk' ? 'risk_register' : showModal === 'milestone' ? 'project_milestones' : 'management_decisions';
              addRecord(table, modalForm); }}>
              {showModal === 'material' && (<>
                <div className="form-group mb-16"><label>Material *</label><input value={modalForm.material_name||''} onChange={e => setModalForm({...modalForm,material_name:e.target.value})} required /></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                  <div className="form-group mb-16"><label>Type</label><select value={modalForm.material_type||''} onChange={e => setModalForm({...modalForm,material_type:e.target.value})}>{['Cement','Aggregate','Bitumen','Steel','Gravel','Sand','Gabion Wire','Geotextile','Pipe','Paint','Fuel','Other'].map(t => <option key={t}>{t}</option>)}</select></div>
                  <div className="form-group mb-16"><label>Required Qty</label><input type="number" value={modalForm.required_quantity||''} onChange={e => setModalForm({...modalForm,required_quantity:e.target.value})} /></div>
                  <div className="form-group mb-16"><label>Available</label><input type="number" value={modalForm.available_quantity||''} onChange={e => setModalForm({...modalForm,available_quantity:e.target.value})} /></div>
                </div>
              </>)}
              {showModal === 'risk' && (<>
                <div className="form-group mb-16"><label>Risk Description *</label><textarea rows={2} value={modalForm.risk_description||''} onChange={e => setModalForm({...modalForm,risk_description:e.target.value})} required /></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                  <div className="form-group mb-16"><label>Category</label><select value={modalForm.category||''} onChange={e => setModalForm({...modalForm,category:e.target.value})}>{['Technical','Financial','Schedule','Environmental','Social','Safety','Design','Contractual','Political','Other'].map(t => <option key={t}>{t}</option>)}</select></div>
                  <div className="form-group mb-16"><label>Probability</label><select value={modalForm.probability||''} onChange={e => setModalForm({...modalForm,probability:e.target.value})}>{['Low','Medium','High','Very High'].map(t => <option key={t}>{t}</option>)}</select></div>
                  <div className="form-group mb-16"><label>Impact</label><select value={modalForm.impact||''} onChange={e => setModalForm({...modalForm,impact:e.target.value})}>{['Low','Medium','High','Very High'].map(t => <option key={t}>{t}</option>)}</select></div>
                </div>
                <div className="form-group mb-16"><label>Mitigation</label><input value={modalForm.mitigation||''} onChange={e => setModalForm({...modalForm,mitigation:e.target.value})} /></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div className="form-group mb-16"><label>Owner</label><input value={modalForm.owner||''} onChange={e => setModalForm({...modalForm,owner:e.target.value})} /></div>
                  <div className="form-group mb-16"><label>Due Date</label><input type="date" value={modalForm.due_date||''} onChange={e => setModalForm({...modalForm,due_date:e.target.value})} /></div>
                </div>
              </>)}
              {showModal === 'milestone' && (<>
                <div className="form-group mb-16"><label>Milestone *</label><input value={modalForm.milestone_name||''} onChange={e => setModalForm({...modalForm,milestone_name:e.target.value})} required placeholder="e.g. Earthworks completion" /></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div className="form-group mb-16"><label>Planned Date</label><input type="date" value={modalForm.planned_date||''} onChange={e => setModalForm({...modalForm,planned_date:e.target.value})} /></div>
                  <div className="form-group mb-16"><label>Status</label><select value={modalForm.status||''} onChange={e => setModalForm({...modalForm,status:e.target.value})}>{['Upcoming','On Track','At Risk','Delayed','Achieved','Cancelled'].map(t => <option key={t}>{t}</option>)}</select></div>
                </div>
              </>)}
              {showModal === 'decision' && (<>
                <div className="form-group mb-16"><label>Issue *</label><input value={modalForm.issue||''} onChange={e => setModalForm({...modalForm,issue:e.target.value})} required placeholder="e.g. Utility relocation delayed" /></div>
                <div className="form-group mb-16"><label>Impact</label><input value={modalForm.impact||''} onChange={e => setModalForm({...modalForm,impact:e.target.value})} placeholder="e.g. 2 km inaccessible" /></div>
                <div className="form-group mb-16"><label>Decision Required *</label><input value={modalForm.required_decision||''} onChange={e => setModalForm({...modalForm,required_decision:e.target.value})} required placeholder="e.g. Engage utility agency" /></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div className="form-group mb-16"><label>Responsible</label><input value={modalForm.responsible||''} onChange={e => setModalForm({...modalForm,responsible:e.target.value})} /></div>
                  <div className="form-group mb-16"><label>Deadline</label><input type="date" value={modalForm.deadline||''} onChange={e => setModalForm({...modalForm,deadline:e.target.value})} /></div>
                </div>
              </>)}
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving?'Saving...':'Save'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ textAlign:'center', fontSize:9, color:'var(--text-muted)', padding:'12px 0' }}>RoadSite Reports v7.0 — Road Project Management · {new Date().toLocaleDateString()} · {p.employer}</div>
    </div>
  );
}
