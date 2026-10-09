import { supabase } from './supabase';
import { syncWorksActivity } from './syncWorksActivity';
import { parseChainage, fmtChainage } from './utils';
import { uploadReportPhotos } from '../components/PhotoUploader';
import { clearAllDrafts } from './autosave';

/**
 * submitDailyReport — Single Entry Point + Fan-Out
 *
 * Takes the wizard's collected state and fans it out into all downstream
 * Supabase tables in the correct order. Returns a structured result with
 * the created report, warnings for partial failures, and a breakdown of
 * what was inserted into each table.
 *
 * Tables written (in order):
 *   1. daily_reports        — the parent record (must succeed)
 *   2. works_progress       — one row per works entry → syncs works_activities
 *   3. equipment_daily_status — upserts; auto-registers new equipment
 *   4. structure_progress   — inserts; auto-registers new structures
 *   5. quality_tests        — batch insert
 *   6. site_issues          — batch insert
 *   7. site_instructions    — sequential (needs RPC for numbering)
 *   8. project_materials    — batch insert
 *   9. report_photos        — storage upload + metadata rows
 *  10. personnel_attendance — bulk upsert
 *  11. daily_labour         — bulk insert + legacy column backfill
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {Object} params.profile          — { id, role }
 * @param {Object} params.form             — wizard form fields
 * @param {Object} params.metWeather       — met station data (nullable)
 * @param {boolean} params.weatherOverride — inspector overrode met data
 * @param {Array}  params.worksEntries
 * @param {Array}  params.equipEntries
 * @param {Array}  params.structEntries
 * @param {Array}  params.testEntries
 * @param {Array}  params.issueEntries
 * @param {Array}  params.instructionEntries
 * @param {Array}  params.materialEntries
 * @param {Object} params.photos           — { works, equip, quality, struct, issue, general }
 * @param {Array}  params.contractorPersonnel
 * @param {Array}  params.supervisionPersonnel
 * @param {Object} params.contractorPresence
 * @param {Object} params.supervisionPresence
 * @param {Array}  params.contractorLabour
 * @param {Array}  params.supervisionLabour
 * @param {Array}  params.activities       — project's works_activities (for ID resolution)
 * @param {Array}  params.equipment        — project's equipment_register (for ID resolution)
 * @param {Array}  params.structures       — project's structures (for ID resolution)
 * @param {Object} params.nilSections      — { 2: bool, 3: bool, ... 8: bool }
 * @param {Function} params.findOverlaps   — overlap detection function
 * @param {Function} params.sideFactor     — side factor calculation function
 * @param {Array}  params.recentProgress   — recent works_progress for overlap checks
 * @param {Array}  params.WORK_LAYERS      — activity reference constant
 *
 * @returns {Promise<SubmitResult>}
 */
export async function submitDailyReport(params) {
  const {
    projectId, profile, form, metWeather, weatherOverride,
    worksEntries, equipEntries, structEntries, testEntries,
    issueEntries, instructionEntries, materialEntries,
    photos, contractorPersonnel, supervisionPersonnel,
    contractorPresence, supervisionPresence,
    contractorLabour, supervisionLabour,
    activities, equipment, structures, nilSections,
    findOverlaps: findOverlapsFn, sideFactor: sideFactorFn,
    recentProgress, WORK_LAYERS,
  } = params;

  const result = {
    success: false,
    report: null,
    warnings: [],
    counts: {
      works: 0, equipment: 0, structures: 0, tests: 0,
      issues: 0, instructions: 0, materials: 0, photos: 0,
      attendance: 0, labour: 0,
    },
  };

  // ── 1. Daily Report (parent — must succeed) ────────────────────
  const reportData = buildReportData(projectId, profile, form, metWeather, weatherOverride);
  const { data: report, error: repErr } = await supabase
    .from('daily_reports')
    .insert(reportData)
    .select()
    .single();

  if (repErr) {
    throw new Error(`Failed to create report: ${repErr.message}`);
  }
  result.report = report;

  // ── 2. Works Progress ─────────────────────────────────────────
  if (!nilSections[4]) {
    const worksResult = await insertWorksProgress({
      entries: worksEntries, projectId, reportId: report.id,
      reportDate: form.report_date, profileId: profile.id,
      activities, recentProgress,
      findOverlapsFn, sideFactorFn, WORK_LAYERS,
    });
    result.warnings.push(...worksResult.warnings);
    result.counts.works = worksResult.inserted;
  }

  // ── 3. Equipment Status ────────────────────────────────────────
  if (!nilSections[5]) {
    const equipResult = await upsertEquipmentStatus({
      entries: equipEntries, projectId,
      reportDate: form.report_date, profileId: profile.id,
      existingEquipment: equipment,
    });
    result.warnings.push(...equipResult.warnings);
    result.counts.equipment = equipResult.inserted;
  }

  // ── 4. Structures ──────────────────────────────────────────────
  if (!nilSections[7]) {
    const structResult = await insertStructureProgress({
      entries: structEntries, projectId,
      reportDate: form.report_date, profileId: profile.id,
      existingStructures: structures,
    });
    result.warnings.push(...structResult.warnings);
    result.counts.structures = structResult.inserted;
  }

  // ── 5. Quality Tests (batch) ───────────────────────────────────
  if (!nilSections[6]) {
    const testResult = await batchInsert('quality_tests',
      testEntries.filter(t => t.test_type).map(t => ({
        project_id: projectId, test_type: t.test_type,
        test_date: form.report_date, location: t.location || null,
        chainage: t.chainage || null, sample_id: t.sample_id || null,
        result_value: t.result_value || null, spec_limit: t.spec_limit || null,
        result_status: t.result_status, notes: t.notes || null,
        tested_by: profile.id,
      })),
      'Quality test',
    );
    result.warnings.push(...testResult.warnings);
    result.counts.tests = testResult.inserted;

    // Materials (batch within same nil gate)
    const matResult = await batchInsert('project_materials',
      materialEntries.filter(m => m.material_type && m.quantity).map(m => ({
        project_id: projectId, material_type: m.material_type,
        description: m.description || null, quantity: parseFloat(m.quantity) || 0,
        unit: m.unit, source: m.source || null, delivery_note: m.delivery_note || null,
        received_date: form.report_date, received_by: profile.id,
      })),
      'Material',
    );
    result.warnings.push(...matResult.warnings);
    result.counts.materials = matResult.inserted;
  }

  // ── 6. Site Issues (batch) ─────────────────────────────────────
  if (!nilSections[8]) {
    const issResult = await batchInsert('site_issues',
      issueEntries.filter(i => i.title).map(i => ({
        project_id: projectId, title: i.title,
        category: i.category, severity: i.severity,
        description: i.description || null, action_required: i.action_required || null,
        status: 'Open', raised_by: profile.id, date_raised: form.report_date,
      })),
      'Issue',
    );
    result.warnings.push(...issResult.warnings);
    result.counts.issues = issResult.inserted;

    // Site Instructions (sequential — needs RPC for numbering)
    const instrResult = await insertSiteInstructions({
      entries: instructionEntries, projectId, profile,
    });
    result.warnings.push(...instrResult.warnings);
    result.counts.instructions = instrResult.inserted;
  }

  // ── 7. Photos ──────────────────────────────────────────────────
  const allPhotos = [
    ...(photos.works || []), ...(photos.equip || []),
    ...(photos.quality || []), ...(photos.struct || []),
    ...(photos.issue || []), ...(photos.general || []),
  ];
  if (allPhotos.length > 0) {
    try {
      result.counts.photos = await uploadReportPhotos(
        allPhotos, projectId, report.id, profile, form.report_date,
      );
    } catch (photoErr) {
      result.warnings.push(`Photos: ${photoErr.message}`);
    }
  }

  // ── 8. Personnel Attendance (bulk upsert) ──────────────────────
  if (!nilSections[2] || !nilSections[3]) {
    const attResult = await upsertAttendance({
      contractorPersonnel, supervisionPersonnel,
      contractorPresence, supervisionPresence,
      projectId, reportDate: form.report_date, profileId: profile.id,
    });
    result.warnings.push(...attResult.warnings);
    result.counts.attendance = attResult.inserted;
  }

  // ── 9. Daily Labour (bulk insert + legacy backfill) ────────────
  if (!nilSections[2] || !nilSections[3]) {
    const labResult = await insertDailyLabour({
      contractorLabour, supervisionLabour,
      reportId: report.id, projectId,
      reportDate: form.report_date,
    });
    result.warnings.push(...labResult.warnings);
    result.counts.labour = labResult.inserted;
  }

  // ── 10. Cleanup ────────────────────────────────────────────────
  await clearAllDrafts(profile.id);

  result.success = true;
  return result;
}


// ═══════════════════════════════════════════════════════════════════
// Individual fan-out functions
// ═══════════════════════════════════════════════════════════════════

/** Build the daily_reports row data from wizard form state. */
function buildReportData(projectId, profile, form, metWeather, weatherOverride) {
  return {
    project_id: projectId,
    submitted_by: profile.id,
    report_date: form.report_date,
    weather: form.weather,
    max_temp_c: form.max_temp_c ? parseFloat(form.max_temp_c) : null,
    min_temp_c: form.min_temp_c ? parseFloat(form.min_temp_c) : null,
    rainfall_mm: form.rainfall_mm ? parseFloat(form.rainfall_mm) : null,
    working_hours: parseFloat(form.working_hours) || 0,
    contractor_labour_skilled: parseInt(form.contractor_labour_skilled) || 0,
    contractor_labour_unskilled: parseInt(form.contractor_labour_unskilled) || 0,
    subcontractor_labour: parseInt(form.subcontractor_labour) || 0,
    work_done: form.work_done || null,
    quality_observations: form.quality_observations || null,
    challenges: form.challenges || null,
    visitors: form.visitors || null,
    safety_incidents: form.safety_incidents || null,
    urgent_flag: form.urgent_flag || false,
    progress_pct: 0,
    met_weather: metWeather?.weather || null,
    met_temp_c: metWeather?.temp || null,
    met_rainfall_mm: metWeather?.rainfall || null,
    weather_source: weatherOverride ? 'inspector_override' : metWeather ? 'met_prefill_confirmed' : 'manual',
  };
}

/** Insert works_progress entries with chainage math, overlap tagging, and activity sync. */
async function insertWorksProgress({
  entries, projectId, reportId, reportDate, profileId,
  activities, recentProgress, findOverlapsFn, sideFactorFn, WORK_LAYERS,
}) {
  const warnings = [];
  let inserted = 0;

  for (const w of entries) {
    if (!w.layer_name) continue;

    // Resolve activity ID: component_id > activity_id > name-match
    let actId = w.component_id || w.activity_id || null;
    if (!actId) {
      const match = activities.find(a => a.activity_name.toLowerCase() === w.layer_name.toLowerCase());
      if (match) actId = match.id;
    }

    const linkedAct = actId ? activities.find(a => a.id === actId) : null;
    const unit = linkedAct?.unit || (WORK_LAYERS.find(l => l.name === w.layer_name)?.unit) || 'Km';
    const isLinear = unit === 'Km' || unit === 'km';

    const chFrom = parseChainage(w.start_chainage);
    const chTo = parseChainage(w.end_chainage);
    const rawLength = isLinear && chFrom != null && chTo != null
      ? Math.abs(chTo - chFrom) : null;

    // Side factor: half-width for carriageway activities worked one side only
    const sf = isLinear ? sideFactorFn(w.layer_name, w.side || 'Both') : { factor: 1, label: null };
    const autoQty = rawLength != null
      ? rawLength * sf.factor
      : parseFloat(w.quantity) || 0;

    const sideTag = sf.label && sf.factor !== 1
      ? ` (${sf.label}: ${rawLength?.toFixed(3)} Km × 0.5 = ${autoQty.toFixed(3)} Km eq.)`
      : '';

    // Flag overlaps for RE review
    const subOverlaps = actId ? findOverlapsFn(recentProgress, actId, chFrom, chTo, w.side || 'Both') : [];
    const overlapTag = subOverlaps.length > 0
      ? ` [⚠ OVERLAPS prior entry ${fmtChainage(subOverlaps[0].start_chainage)}→${fmtChainage(subOverlaps[0].end_chainage)} of ${subOverlaps[0].work_date} — verify at measurement]`
      : '';

    const { error: wpErr } = await supabase.from('works_progress').insert({
      project_id: projectId, activity_id: actId,
      daily_report_id: reportId,
      work_date: reportDate, start_chainage: chFrom || 0,
      end_chainage: chTo || 0, side: w.side || 'Both',
      quantity: autoQty,
      notes: w.layer_name + (w.notes ? ' — ' + w.notes : '') + sideTag + overlapTag,
      reported_by: profileId,
    });

    if (wpErr) {
      warnings.push(`Works "${w.layer_name}": ${wpErr.message}`);
    } else {
      inserted++;
      // Sync works_activities so Dashboard Physical Progress updates
      if (actId) {
        await syncWorksActivity(projectId, actId);
      }
    }
  }

  return { warnings, inserted };
}

/** Upsert equipment_daily_status entries, auto-registering new equipment. */
async function upsertEquipmentStatus({
  entries, projectId, reportDate, profileId, existingEquipment,
}) {
  const warnings = [];
  let inserted = 0;

  for (const eq of entries) {
    if (!eq.equipment_id && !eq.equipment_name) continue;

    let eqId = eq.equipment_id;

    // Auto-register from reference list if needed
    if (!eqId && eq.equipment_name) {
      const existing = existingEquipment.find(e => e.equipment_name === eq.equipment_name);
      if (existing) {
        eqId = existing.id;
      } else {
        const { data: newEq, error: eqErr } = await supabase
          .from('equipment_register')
          .insert({
            project_id: projectId, equipment_name: eq.equipment_name,
            equipment_type: eq.equipment_name, actual_on_site: 1, required_quantity: 1,
          })
          .select('id')
          .single();
        if (eqErr) {
          warnings.push(`Equipment "${eq.equipment_name}": ${eqErr.message}`);
          continue;
        }
        if (newEq) eqId = newEq.id;
      }
    }

    if (eqId) {
      const { error: esErr } = await supabase
        .from('equipment_daily_status')
        .upsert({
          equipment_id: eqId, project_id: projectId,
          status_date: reportDate, status: eq.status,
          hours_worked: parseFloat(eq.hours_worked) || 0,
          notes: eq.notes || null, reported_by: profileId,
        }, { onConflict: 'equipment_id,status_date' });
      if (esErr) {
        warnings.push(`Equipment status: ${esErr.message}`);
      } else {
        inserted++;
      }
    }
  }

  return { warnings, inserted };
}

/** Insert structure_progress entries, auto-registering new structures. */
async function insertStructureProgress({
  entries, projectId, reportDate, profileId, existingStructures,
}) {
  const warnings = [];
  let inserted = 0;

  for (const s of entries) {
    if ((!s.structure_id && !s.structure_name) || !s.stage) continue;

    let strId = s.structure_id;

    // Auto-register from reference list if needed
    if (!strId && s.structure_name) {
      const existing = existingStructures.find(st => st.structure_type === s.structure_name);
      if (existing) {
        strId = existing.id;
      } else {
        const strRef = s.structure_name.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '')
          + '-' + Date.now().toString().slice(-4);
        const { data: newStr, error: strErr } = await supabase
          .from('structures')
          .insert({
            project_id: projectId, structure_ref: strRef,
            structure_type: s.structure_name, chainage: 0,
            overall_status: 'In Progress', percent_complete: 0,
          })
          .select('id')
          .single();
        if (strErr) {
          warnings.push(`Structure "${s.structure_name}": ${strErr.message}`);
          continue;
        }
        if (newStr) strId = newStr.id;
      }
    }

    if (strId) {
      const { error: spErr } = await supabase.from('structure_progress').insert({
        structure_id: strId, project_id: projectId,
        stage: s.stage, status: s.status, work_date: reportDate,
        concrete_volume_m3: s.concrete_volume_m3 ? parseFloat(s.concrete_volume_m3) : null,
        rebar_kg: s.rebar_kg ? parseFloat(s.rebar_kg) : null,
        notes: s.notes || null, reported_by: profileId,
      });
      if (spErr) {
        warnings.push(`Structure progress: ${spErr.message}`);
      } else {
        inserted++;
      }
    }
  }

  return { warnings, inserted };
}

/** Insert site_instructions sequentially (each needs an RPC for numbering). */
async function insertSiteInstructions({ entries, projectId, profile }) {
  const warnings = [];
  let inserted = 0;

  for (const instr of entries) {
    if (!instr.subject) continue;
    const { data: instrNo } = await supabase.rpc('next_instruction_no', { p_project_id: projectId });
    const { error: siErr } = await supabase.from('site_instructions').insert({
      project_id: projectId, instruction_no: instrNo,
      instruction_type: instr.instruction_type, subject: instr.subject,
      description: instr.description || null, chainage_from: instr.chainage || null,
      issued_by: profile.id, issued_by_role: profile.role,
      response_required: instr.response_required, status: 'issued',
    });
    if (siErr) {
      warnings.push(`Instruction "${instr.subject}": ${siErr.message}`);
    } else {
      inserted++;
    }
  }

  return { warnings, inserted };
}

/** Bulk upsert personnel_attendance records. */
async function upsertAttendance({
  contractorPersonnel, supervisionPersonnel,
  contractorPresence, supervisionPresence,
  projectId, reportDate, profileId,
}) {
  const warnings = [];
  const allPersonnel = [
    ...contractorPersonnel.map(t => ({ ...t, presenceMap: contractorPresence })),
    ...supervisionPersonnel.map(t => ({ ...t, presenceMap: supervisionPresence })),
  ];

  if (allPersonnel.length === 0) return { warnings, inserted: 0 };

  const attendanceRecords = allPersonnel.map(t => ({
    project_id: projectId, personnel_id: t.id,
    attendance_date: reportDate, is_present: !!t.presenceMap[t.id],
    recorded_by: profileId,
  }));

  const { error: attErr } = await supabase
    .from('personnel_attendance')
    .upsert(attendanceRecords, { onConflict: 'personnel_id,attendance_date' });

  if (attErr) {
    warnings.push(`Attendance: ${attErr.message}`);
    return { warnings, inserted: 0 };
  }

  return { warnings, inserted: attendanceRecords.length };
}

/** Bulk insert daily_labour + backfill legacy columns on daily_reports. */
async function insertDailyLabour({
  contractorLabour, supervisionLabour,
  reportId, projectId, reportDate,
}) {
  const warnings = [];
  const allLabour = [
    ...contractorLabour
      .filter(e => (e.male_count || 0) + (e.female_count || 0) > 0)
      .map(e => ({ ...e, party: 'contractor' })),
    ...supervisionLabour
      .filter(e => (e.male_count || 0) + (e.female_count || 0) > 0)
      .map(e => ({ ...e, party: 'supervision' })),
  ];

  if (allLabour.length === 0) return { warnings, inserted: 0 };

  const labourRecords = allLabour.map(e => ({
    daily_report_id: reportId, project_id: projectId,
    report_date: reportDate, party: e.party, category: e.category,
    role_title: e.role_title, male_count: e.male_count || 0,
    female_count: e.female_count || 0, key_personnel_id: null, is_present: true,
  }));

  const { error: labErr } = await supabase.from('daily_labour').insert(labourRecords);
  if (labErr) {
    warnings.push(`Labour records: ${labErr.message}`);
    return { warnings, inserted: 0 };
  }

  // Backfill legacy labour columns on daily_reports
  const contSkilled = contractorLabour
    .filter(e => e.category === 'skilled')
    .reduce((s, e) => s + (e.male_count || 0) + (e.female_count || 0), 0);
  const contUnskilled = contractorLabour
    .filter(e => e.category === 'unskilled')
    .reduce((s, e) => s + (e.male_count || 0) + (e.female_count || 0), 0);

  if (contSkilled > 0 || contUnskilled > 0) {
    await supabase.from('daily_reports').update({
      contractor_labour_skilled: contSkilled,
      contractor_labour_unskilled: contUnskilled,
    }).eq('id', reportId);
  }

  return { warnings, inserted: labourRecords.length };
}


// ═══════════════════════════════════════════════════════════════════
// Generic batch helper
// ═══════════════════════════════════════════════════════════════════

/**
 * Batch-insert an array of records into a table.
 * Returns { warnings, inserted }.
 */
async function batchInsert(table, records, label) {
  const warnings = [];
  if (records.length === 0) return { warnings, inserted: 0 };

  const { error } = await supabase.from(table).insert(records);
  if (error) {
    warnings.push(`${label}: ${error.message}`);
    return { warnings, inserted: 0 };
  }

  return { warnings, inserted: records.length };
}
