import { supabase } from './supabase';

/**
 * Fetch all data needed for a monthly progress report.
 * @param {string} projectId - project UUID
 * @param {string} month - YYYY-MM format (e.g. '2026-08')
 * @returns {object} all report data organized by section
 */
export async function fetchMonthlyReportData(projectId, month) {
  const startDate = `${month}-01`;
  const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0)
    .toISOString().split('T')[0]; // last day of month

  // Parallel fetch all data
  const [
    projectRes,
    narrativeRes,
    dailyReportsRes,
    worksProgressRes,
    activitiesRes,
    equipStatusRes,
    equipRegRes,
    qualityRes,
    materialsRes,
    structProgressRes,
    structuresRes,
    issuesRes,
    instructionsRes,
    ipcRes,
    photosRes,
    voRes,
    safetyRes,
    boqRes,
  ] = await Promise.all([
    // Project info
    supabase.from('projects').select('*').eq('id', projectId).single(),
    
    // Monthly narrative (if exists)
    supabase.from('monthly_narratives')
      .select('*')
      .eq('project_id', projectId)
      .eq('report_month', startDate)
      .maybeSingle(),
    
    // Daily reports for the month
    supabase.from('daily_reports')
      .select('*, user:submitted_by(full_name)')
      .eq('project_id', projectId)
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .order('report_date'),
    
    // Works progress for the month
    supabase.from('works_progress')
      .select('*, activity:activity_id(activity_name, activity_code, unit, planned_quantity, category)')
      .eq('project_id', projectId)
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date'),
    
    // All activities (for overall progress)
    supabase.from('works_activities')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order'),
    
    // Equipment daily status
    supabase.from('equipment_daily_status')
      .select('*, equipment:equipment_id(equipment_name, equipment_type)')
      .eq('project_id', projectId)
      .gte('status_date', startDate)
      .lte('status_date', endDate),
    
    // Equipment register
    supabase.from('equipment_register')
      .select('*')
      .eq('project_id', projectId),
    
    // Quality tests
    supabase.from('quality_tests')
      .select('*')
      .eq('project_id', projectId)
      .gte('test_date', startDate)
      .lte('test_date', endDate)
      .order('test_date'),
    
    // Materials received
    supabase.from('project_materials')
      .select('*')
      .eq('project_id', projectId)
      .gte('received_date', startDate)
      .lte('received_date', endDate),
    
    // Structure progress
    supabase.from('structure_progress')
      .select('*, structure:structure_id(structure_ref, structure_type, chainage)')
      .eq('project_id', projectId)
      .gte('work_date', startDate)
      .lte('work_date', endDate),
    
    // All structures
    supabase.from('structures')
      .select('*')
      .eq('project_id', projectId),
    
    // Site issues
    supabase.from('site_issues')
      .select('*')
      .eq('project_id', projectId)
      .gte('reported_date', startDate)
      .lte('reported_date', endDate),
    
    // Site instructions
    supabase.from('site_instructions')
      .select('*')
      .eq('project_id', projectId)
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`),
    
    // IPCs
    supabase.from('ipc_certificates')
      .select('*')
      .eq('project_id', projectId)
      .order('ipc_no'),
    
    // Photos for the month
    supabase.from('report_photos')
      .select('*')
      .eq('project_id', projectId)
      .gte('photo_date', startDate)
      .lte('photo_date', endDate)
      .order('created_at'),
    
    // Variation orders
    supabase.from('variation_orders')
      .select('*')
      .eq('project_id', projectId)
      .order('vo_number'),
    
    // Safety incidents
    supabase.from('safety_incidents')
      .select('*')
      .eq('project_id', projectId)
      .gte('incident_date', startDate)
      .lte('incident_date', endDate),
    
    // BoQ items
    supabase.from('boq_items')
      .select('*')
      .eq('project_id', projectId),
  ]);

  const project = projectRes.data;
  const dailyReports = dailyReportsRes.data || [];
  const worksProgress = worksProgressRes.data || [];
  const activities = activitiesRes.data || [];
  const equipStatus = equipStatusRes.data || [];
  const equipRegister = equipRegRes.data || [];
  const qualityTests = qualityRes.data || [];
  const materials = materialsRes.data || [];
  const structProgress = structProgressRes.data || [];
  const structures = structuresRes.data || [];
  const issues = issuesRes.data || [];
  const instructions = instructionsRes.data || [];
  const ipcs = ipcRes.data || [];
  const photos = photosRes.data || [];
  const variationOrders = voRes.data || [];
  const safetyIncidents = safetyRes.data || [];
  const boqItems = boqRes.data || [];

  // ── Computed Summaries ──

  // Weather summary
  const workingDays = dailyReports.filter(r => r.is_working_day).length;
  const nonWorkingDays = dailyReports.filter(r => !r.is_working_day).length;
  const rainDays = dailyReports.filter(r => 
    r.weather?.includes('Rain') || r.weather?.includes('Storm')
  ).length;
  const avgTemp = dailyReports.length > 0
    ? (dailyReports.reduce((s, r) => s + (r.max_temp_c || 0), 0) / dailyReports.length).toFixed(1)
    : 0;
  const totalRainfall = dailyReports.reduce((s, r) => s + (r.rainfall_mm || 0), 0);

  // Labour summary
  const totalLabourDays = dailyReports.reduce((s, r) => 
    s + (r.contractor_labour_skilled || 0) + (r.contractor_labour_unskilled || 0) + (r.subcontractor_labour || 0), 0);
  const avgDailyLabour = dailyReports.length > 0 ? Math.round(totalLabourDays / dailyReports.length) : 0;
  const peakLabour = Math.max(...dailyReports.map(r => 
    (r.contractor_labour_skilled || 0) + (r.contractor_labour_unskilled || 0) + (r.subcontractor_labour || 0)), 0);

  // Physical progress
  const totalPlanned = activities.reduce((s, a) => s + (a.planned_quantity || 0), 0);
  const totalCompleted = activities.reduce((s, a) => s + (a.completed_quantity || 0), 0);
  const overallProgress = totalPlanned > 0 ? ((totalCompleted / totalPlanned) * 100).toFixed(1) : 0;
  
  // This month's works by activity
  const monthWorksMap = {};
  worksProgress.forEach(w => {
    const key = w.activity_id;
    if (!monthWorksMap[key]) {
      monthWorksMap[key] = {
        activity_name: w.activity?.activity_name || 'Unknown',
        activity_code: w.activity?.activity_code || '',
        unit: w.activity?.unit || '',
        planned: w.activity?.planned_quantity || 0,
        month_qty: 0,
        category: w.activity?.category || '',
      };
    }
    monthWorksMap[key].month_qty += w.quantity || 0;
  });
  const monthWorks = Object.values(monthWorksMap);

  // Equipment utilisation
  const equipUtilMap = {};
  equipStatus.forEach(es => {
    const key = es.equipment_id;
    if (!equipUtilMap[key]) {
      equipUtilMap[key] = {
        name: es.equipment?.equipment_name || 'Unknown',
        type: es.equipment?.equipment_type || '',
        total_hours: 0,
        working_days: 0,
        idle_days: 0,
        breakdown_days: 0,
      };
    }
    equipUtilMap[key].total_hours += es.hours_worked || 0;
    if (es.status === 'Operational') equipUtilMap[key].working_days++;
    else if (es.status === 'Idle') equipUtilMap[key].idle_days++;
    else if (es.status === 'Breakdown') equipUtilMap[key].breakdown_days++;
  });
  const equipUtil = Object.values(equipUtilMap);

  // Quality summary
  const testsPassed = qualityTests.filter(t => t.result_status === 'Pass').length;
  const testsFailed = qualityTests.filter(t => t.result_status === 'Fail').length;
  const testsPending = qualityTests.filter(t => t.result_status === 'Pending').length;
  const passRate = qualityTests.length > 0 
    ? ((testsPassed / qualityTests.length) * 100).toFixed(0) 
    : 'N/A';

  // Financial summary
  const contractSum = project?.contract_sum || boqItems.reduce((s, b) => s + (b.amount || 0), 0);
  const totalCertified = ipcs.reduce((s, c) => s + (c.certified_amount || 0), 0);
  const totalPaid = ipcs.reduce((s, c) => s + (c.paid_amount || 0), 0);
  const financialProgress = contractSum > 0 ? ((totalCertified / contractSum) * 100).toFixed(1) : 0;

  // Issues summary
  const issuesOpened = issues.filter(i => i.status === 'Open').length;
  const issuesClosed = issues.filter(i => i.status === 'Closed' || i.status === 'Resolved').length;
  const criticalIssues = issues.filter(i => i.severity === 'Critical' || i.severity === 'High').length;

  // VO summary
  const totalVOAmount = variationOrders.reduce((s, v) => s + (v.approved_amount || v.estimated_amount || 0), 0);
  const approvedVOs = variationOrders.filter(v => v.status === 'approved' || v.status === 'implemented');

  // Safety summary
  const ltiCount = safetyIncidents.filter(i => i.is_lti).length;
  const totalDaysLost = safetyIncidents.reduce((s, i) => s + (i.days_lost || 0), 0);
  const nearMisses = safetyIncidents.filter(i => i.incident_type === 'near_miss').length;

  return {
    project,
    month,
    startDate,
    endDate,
    narrative: narrativeRes.data || {},

    weather: { workingDays, nonWorkingDays, rainDays, avgTemp, totalRainfall, dailyReports },
    labour: { totalLabourDays, avgDailyLabour, peakLabour, dailyReports },
    
    physical: { overallProgress, totalPlanned, totalCompleted, monthWorks, activities },
    financial: { contractSum, totalCertified, totalPaid, financialProgress, ipcs },
    
    equipment: { equipUtil, equipRegister },
    quality: { qualityTests, testsPassed, testsFailed, testsPending, passRate },
    materials,
    structures: { structProgress, structures },
    
    issues: { issues, issuesOpened, issuesClosed, criticalIssues },
    instructions,
    variationOrders: { variationOrders, totalVOAmount, approvedVOs },
    safety: { safetyIncidents, ltiCount, totalDaysLost, nearMisses },
    
    photos,
    boqItems,
  };
}
