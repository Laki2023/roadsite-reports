import { supabase } from './supabase';
import { findProductionRate, estimateDuration, classifyActivity, CONSTRUCTION_SEQUENCE } from './productionRates';

/**
 * Auto-generate an Engineer's Programme from works_activities.
 * Uses Kenya road construction production rates to estimate durations,
 * then sequences activities by construction phase.
 * 
 * @param {string} projectId
 * @param {object} project - project record with start_date, end_date
 * @param {Array} activities - works_activities records
 * @param {string} profileId - current user
 * @param {string} source - 'engineer' or 'contractor'
 * @returns {number} count of items created
 */
export async function autoGenerateProgramme(projectId, project, activities, profileId, source = 'engineer') {
  if (!activities || activities.length === 0) return 0;

  const contractStart = project.start_date || new Date().toISOString().split('T')[0];
  const contractEnd = project.end_date || addDays(contractStart, 365);
  const contractDuration = daysBetween(contractStart, contractEnd);

  // 1. Classify and sort activities by construction sequence
  const classified = activities.map(a => ({
    ...a,
    phase: classifyActivity(a),
    rate: findProductionRate(a.activity_name),
  }));

  // Group by phase
  const phases = {};
  CONSTRUCTION_SEQUENCE.forEach(seq => {
    phases[seq.phase] = {
      ...seq,
      activities: [],
    };
  });

  classified.forEach(a => {
    const seq = CONSTRUCTION_SEQUENCE.find(s => s.categories.includes(a.phase));
    const phaseName = seq ? seq.phase : 'Preliminary';
    if (!phases[phaseName]) phases[phaseName] = { phase: phaseName, order: 99, activities: [] };
    phases[phaseName].activities.push(a);
  });

  // 2. Calculate durations and sequence dates
  const items = [];
  let sortOrder = 0;
  let currentDate = contractStart;

  const sortedPhases = Object.values(phases)
    .filter(p => p.activities.length > 0)
    .sort((a, b) => a.order - b.order);

  for (const phase of sortedPhases) {
    // Add summary row for the phase
    const phaseStart = currentDate;
    let phaseEnd = currentDate;
    
    items.push({
      project_id: projectId,
      item_name: `${phase.phase}`,
      item_code: `PH-${String(phase.order).padStart(2, '0')}`,
      category: phase.categories?.[0] || 'construction',
      is_summary: true,
      indent_level: 0,
      sort_order: sortOrder++,
      baseline_start: phaseStart,
      baseline_end: null, // will be updated after children
      planned_start: phaseStart,
      planned_end: null,
      progress_pct: 0,
      weight: 0, // summary rows have 0 weight
      source_type: source,
      created_by: profileId,
    });
    const summaryIdx = items.length - 1;

    // Add individual activities within the phase
    // Activities within the same phase can overlap (parallel work)
    // But we stagger them slightly for realism
    let phaseOffset = 0;

    for (const activity of phase.activities) {
      const duration = estimateDuration(
        activity.planned_quantity || 0,
        activity.rate,
        1.2 // 20% buffer
      );

      // Cap duration to not exceed remaining contract time
      const cappedDuration = Math.min(duration, Math.max(30, contractDuration - daysBetween(contractStart, currentDate)));

      const actStart = addDays(phaseStart, phaseOffset);
      const actEnd = addDays(actStart, cappedDuration);

      // Calculate progress from existing completed quantities
      const progressPct = activity.planned_quantity > 0
        ? Math.min(100, ((activity.completed_quantity || 0) / activity.planned_quantity) * 100)
        : 0;

      items.push({
        project_id: projectId,
        activity_id: activity.id,
        item_name: activity.activity_name,
        item_code: activity.activity_code,
        category: activity.phase || 'construction',
        is_summary: false,
        is_milestone: false,
        indent_level: 1,
        sort_order: sortOrder++,
        baseline_start: actStart,
        baseline_end: actEnd,
        baseline_duration: cappedDuration,
        planned_start: actStart,
        planned_end: actEnd,
        planned_duration: cappedDuration,
        progress_pct: Math.round(progressPct * 100) / 100,
        weight: activity.planned_quantity || 1,
        source_type: source,
        created_by: profileId,
        notes: activity.rate
          ? `Est. ${activity.rate.rate_per_day} ${activity.rate.unit}/day (matched: ${activity.rate.matched})`
          : 'No production rate match — default 30 days',
      });

      // Stagger: next activity starts after 30% of current duration (parallel work)
      phaseOffset += Math.ceil(cappedDuration * 0.3);

      if (actEnd > phaseEnd) phaseEnd = actEnd;
    }

    // Update summary row dates
    items[summaryIdx].baseline_end = phaseEnd;
    items[summaryIdx].planned_end = phaseEnd;

    // Next phase starts after a small gap (mobilisation buffer)
    currentDate = addDays(phaseEnd, 7);
  }

  // 3. Add completion milestone
  items.push({
    project_id: projectId,
    item_name: 'Project Completion',
    item_code: 'MS-END',
    category: 'demobilisation',
    is_milestone: true,
    indent_level: 0,
    sort_order: sortOrder++,
    baseline_start: contractEnd,
    baseline_end: contractEnd,
    planned_start: contractEnd,
    planned_end: contractEnd,
    progress_pct: 0,
    weight: 0,
    source_type: source,
    created_by: profileId,
  });

  // 4. Insert all items
  const { error } = await supabase.from('programme_items').insert(items);
  if (error) {
    console.error('Auto-generate error:', error);
    throw error;
  }

  return items.length;
}

/**
 * Auto-sync progress from works_progress to programme_items.
 * Call this periodically or after daily report submission.
 * 
 * @param {string} projectId
 * @returns {number} count of items updated
 */
export async function syncProgressFromReports(projectId) {
  // Fetch programme items linked to activities
  const { data: progItems } = await supabase
    .from('programme_items')
    .select('id, activity_id, progress_pct, actual_start, actual_end, status')
    .eq('project_id', projectId)
    .not('activity_id', 'is', null);

  if (!progItems || progItems.length === 0) return 0;

  // Fetch activities with current progress
  const activityIds = progItems.map(p => p.activity_id).filter(Boolean);
  const { data: activities } = await supabase
    .from('works_activities')
    .select('id, planned_quantity, completed_quantity')
    .in('id', activityIds);

  if (!activities) return 0;

  // Fetch first work date per activity (for actual_start)
  const { data: firstDates } = await supabase
    .from('works_progress')
    .select('activity_id, work_date')
    .in('activity_id', activityIds)
    .order('work_date', { ascending: true });

  const firstDateMap = {};
  (firstDates || []).forEach(fd => {
    if (!firstDateMap[fd.activity_id]) firstDateMap[fd.activity_id] = fd.work_date;
  });

  // Fetch last work date per activity (for tracking)
  const { data: lastDates } = await supabase
    .from('works_progress')
    .select('activity_id, work_date')
    .in('activity_id', activityIds)
    .order('work_date', { ascending: false });

  const lastDateMap = {};
  (lastDates || []).forEach(ld => {
    if (!lastDateMap[ld.activity_id]) lastDateMap[ld.activity_id] = ld.work_date;
  });

  const actMap = {};
  activities.forEach(a => { actMap[a.id] = a; });

  let updated = 0;

  for (const item of progItems) {
    const act = actMap[item.activity_id];
    if (!act) continue;

    const newProgress = act.planned_quantity > 0
      ? Math.min(100, ((act.completed_quantity || 0) / act.planned_quantity) * 100)
      : 0;

    const roundedProgress = Math.round(newProgress * 100) / 100;

    // Only update if progress changed
    if (Math.abs(roundedProgress - (item.progress_pct || 0)) < 0.01) continue;

    const updates = { progress_pct: roundedProgress };

    // Set actual_start to first work_date
    if (!item.actual_start && firstDateMap[item.activity_id]) {
      updates.actual_start = firstDateMap[item.activity_id];
    }

    // Set actual_end if 100% complete
    if (roundedProgress >= 100 && !item.actual_end) {
      updates.actual_end = lastDateMap[item.activity_id] || new Date().toISOString().split('T')[0];
    }

    const { error } = await supabase.from('programme_items').update(updates).eq('id', item.id);
    if (!error) updated++;
  }

  // Update summary rows
  await updateSummaryProgress(projectId);

  return updated;
}

/**
 * Update progress on summary (parent) rows from their children.
 */
async function updateSummaryProgress(projectId) {
  const { data: allItems } = await supabase
    .from('programme_items')
    .select('id, is_summary, indent_level, sort_order, progress_pct, weight, baseline_start, baseline_end, planned_start, planned_end')
    .eq('project_id', projectId)
    .order('sort_order');

  if (!allItems) return;

  // For each summary row, calculate weighted progress of following items until next summary
  const summaries = allItems.filter(i => i.is_summary);

  for (const summary of summaries) {
    const children = [];
    const startIdx = allItems.indexOf(summary);

    for (let i = startIdx + 1; i < allItems.length; i++) {
      if (allItems[i].is_summary && allItems[i].indent_level <= summary.indent_level) break;
      if (!allItems[i].is_summary) children.push(allItems[i]);
    }

    if (children.length === 0) continue;

    const totalWeight = children.reduce((s, c) => s + (c.weight || 1), 0);
    const weightedProgress = totalWeight > 0
      ? children.reduce((s, c) => s + (c.progress_pct || 0) * (c.weight || 1), 0) / totalWeight
      : 0;

    await supabase.from('programme_items').update({
      progress_pct: Math.round(weightedProgress * 100) / 100,
    }).eq('id', summary.id);
  }
}

/**
 * Parse Excel/CSV programme upload from Contractor.
 * Expected columns: Activity Name, Start Date, End Date, Weight
 * Optional: Activity Code, Category, Milestone (Y/N)
 * 
 * @param {Array} rows - parsed CSV/Excel rows (array of arrays)
 * @param {string} projectId
 * @param {string} profileId
 * @returns {Array} programme_items ready for insert
 */
export function parseContractorProgramme(rows, projectId, profileId) {
  if (!rows || rows.length < 2) return [];

  // Find header row
  const headers = rows[0].map(h => (h || '').toString().toLowerCase().trim());

  const colMap = {
    name: headers.findIndex(h => h.includes('activity') || h.includes('name') || h.includes('task') || h.includes('description')),
    code: headers.findIndex(h => h.includes('code') || h.includes('id') || h.includes('wbs')),
    start: headers.findIndex(h => h.includes('start')),
    end: headers.findIndex(h => h.includes('end') || h.includes('finish')),
    duration: headers.findIndex(h => h.includes('duration') || h.includes('days')),
    weight: headers.findIndex(h => h.includes('weight') || h.includes('cost') || h.includes('amount')),
    milestone: headers.findIndex(h => h.includes('milestone')),
    category: headers.findIndex(h => h.includes('category') || h.includes('phase') || h.includes('type')),
  };

  // Must have at least name and start
  if (colMap.name < 0) {
    // Try first column as name
    colMap.name = 0;
  }

  const items = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[colMap.name]) continue;

    const name = row[colMap.name]?.toString().trim();
    if (!name) continue;

    const startStr = colMap.start >= 0 ? parseDate(row[colMap.start]) : null;
    const endStr = colMap.end >= 0 ? parseDate(row[colMap.end]) : null;
    const isMilestone = colMap.milestone >= 0 && ['y', 'yes', 'true', '1'].includes((row[colMap.milestone] || '').toString().toLowerCase());
    const isSummary = name === name.toUpperCase() || (row[colMap.code] || '').toString().includes('PH-');

    items.push({
      project_id: projectId,
      item_name: name,
      item_code: colMap.code >= 0 ? row[colMap.code]?.toString() : '',
      category: colMap.category >= 0 ? mapCategory(row[colMap.category]) : 'construction',
      is_milestone: isMilestone,
      is_summary: isSummary,
      indent_level: isSummary ? 0 : 1,
      sort_order: i - 1,
      baseline_start: startStr,
      baseline_end: endStr || (startStr ? addDays(startStr, 30) : null),
      planned_start: startStr,
      planned_end: endStr || (startStr ? addDays(startStr, 30) : null),
      progress_pct: 0,
      weight: colMap.weight >= 0 ? parseFloat(row[colMap.weight]) || 1 : 1,
      source_type: 'contractor',
      created_by: profileId,
    });
  }

  return items;
}

function parseDate(val) {
  if (!val) return null;
  const str = val.toString().trim();

  // Try ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

  // Try MM/DD/YYYY
  const mdy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdy) {
    const m = parseInt(mdy[1]), d = parseInt(mdy[2]);
    if (m <= 12 && d <= 31) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }

  // Try Excel serial number
  const num = parseFloat(str);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = new Date((num - 25569) * 86400000);
    return d.toISOString().split('T')[0];
  }

  // Try native Date parse
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  return null;
}

function mapCategory(val) {
  if (!val) return 'construction';
  const v = val.toString().toLowerCase();
  if (v.includes('earth')) return 'earthworks';
  if (v.includes('pave') || v.includes('bitum') || v.includes('asphalt')) return 'pavement';
  if (v.includes('drain') || v.includes('culvert')) return 'drainage';
  if (v.includes('struct') || v.includes('bridge')) return 'structures';
  if (v.includes('prelim') || v.includes('mobil')) return 'preliminary';
  if (v.includes('furniture') || v.includes('sign') || v.includes('mark')) return 'road_furniture';
  if (v.includes('environ')) return 'environmental';
  if (v.includes('demob')) return 'demobilisation';
  return 'construction';
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
