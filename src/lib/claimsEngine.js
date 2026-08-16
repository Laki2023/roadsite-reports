import { supabase } from './supabase';

/**
 * FIDIC claim auto-detection rules.
 * Each rule scans project data and returns potential claim triggers.
 */
const DETECTION_RULES = [
  {
    id: 'excessive_rain',
    name: 'Exceptionally Adverse Weather',
    clause: 'Cl. 8.4(c)',
    claim_type: 'eot',
    priority: 'high',
    description: 'Monthly rain days exceed historical average threshold',
    async detect(projectId, month) {
      const startDate = `${month}-01`;
      const endDate = lastDayOfMonth(month);

      const { data } = await supabase.from('daily_reports')
        .select('id, report_date, weather, rainfall_mm, working_hours')
        .eq('project_id', projectId)
        .gte('report_date', startDate).lte('report_date', endDate);

      if (!data) return null;

      const rainDays = data.filter(r =>
        r.weather?.includes('Rain') || r.weather?.includes('Storm') || (r.rainfall_mm && r.rainfall_mm > 5)
      );

      // Trigger: >8 rain days in a month (Kenya average ~5-6 for wet season)
      if (rainDays.length > 8) {
        return {
          title: `Exceptionally Adverse Weather — ${monthLabel(month)}`,
          description: `${rainDays.length} rain days recorded in ${monthLabel(month)}, exceeding the threshold of 8 days. Total rainfall: ${data.reduce((s, r) => s + (r.rainfall_mm || 0), 0).toFixed(0)}mm.`,
          event_start_date: rainDays[0]?.report_date,
          event_end_date: rainDays[rainDays.length - 1]?.report_date,
          eot_days_claimed: rainDays.length - 8,
          trigger_data: { rain_days: rainDays.length, threshold: 8, total_rainfall: data.reduce((s, r) => s + (r.rainfall_mm || 0), 0) },
          events: rainDays.map(r => ({
            event_type: 'rain_day',
            event_date: r.report_date,
            description: `Rain day: ${r.weather}, ${r.rainfall_mm || 0}mm`,
            report_id: r.id,
            days_lost: (r.working_hours || 0) === 0 ? 1 : 0.5,
          })),
        };
      }
      return null;
    },
  },
  {
    id: 'late_payment',
    name: 'Delayed Payment — Interest',
    clause: 'Cl. 14.8',
    claim_type: 'interest',
    priority: 'critical',
    description: 'IPC payment delayed beyond 56 days',
    async detect(projectId) {
      const { data } = await supabase.from('ipc_certificates')
        .select('*')
        .eq('project_id', projectId)
        .order('ipc_no');

      if (!data) return null;

      const today = new Date();
      const overdue = data.filter(ipc => {
        if (!ipc.certified_date || ipc.paid_amount >= ipc.certified_amount) return false;
        const certDate = new Date(ipc.certified_date);
        const daysSinceCert = Math.floor((today - certDate) / 86400000);
        return daysSinceCert > 56;
      });

      if (overdue.length > 0) {
        const totalUnpaid = overdue.reduce((s, c) => s + ((c.certified_amount || 0) - (c.paid_amount || 0)), 0);
        return {
          title: `Late Payment Interest — ${overdue.length} overdue IPC(s)`,
          description: `${overdue.length} Interim Payment Certificate(s) remain unpaid beyond the 56-day contractual period. Total outstanding: KES ${totalUnpaid.toLocaleString()}.`,
          event_start_date: overdue[0]?.certified_date,
          cost_claimed: calculateInterest(overdue),
          trigger_data: { overdue_ipcs: overdue.length, total_unpaid: totalUnpaid },
          events: overdue.map(ipc => ({
            event_type: 'late_payment',
            event_date: ipc.certified_date,
            description: `IPC ${ipc.ipc_no}: Certified KES ${(ipc.certified_amount || 0).toLocaleString()}, Paid KES ${(ipc.paid_amount || 0).toLocaleString()}`,
            ipc_id: ipc.id,
            cost_impact: (ipc.certified_amount || 0) - (ipc.paid_amount || 0),
          })),
        };
      }
      return null;
    },
  },
  {
    id: 'variation_instruction',
    name: 'Variation Instruction Issued',
    clause: 'Cl. 13.1',
    claim_type: 'eot_and_cost',
    priority: 'medium',
    description: 'Site instruction constituting a variation',
    async detect(projectId, month) {
      const startDate = `${month}-01`;
      const endDate = lastDayOfMonth(month);

      const { data } = await supabase.from('site_instructions')
        .select('*')
        .eq('project_id', projectId)
        .in('instruction_type', ['variation_order', 'additional_work', 'design_change'])
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (!data || data.length === 0) return null;

      return {
        title: `Variation Instructions — ${monthLabel(month)}`,
        description: `${data.length} variation/additional work instruction(s) issued during ${monthLabel(month)}. These may have time and cost implications under Cl. 13.`,
        event_start_date: data[0]?.created_at?.split('T')[0],
        event_end_date: data[data.length - 1]?.created_at?.split('T')[0],
        trigger_data: { instruction_count: data.length, types: data.map(d => d.instruction_type) },
        events: data.map(si => ({
          event_type: 'variation_issued',
          event_date: si.created_at?.split('T')[0],
          description: `${si.instruction_no}: ${si.subject} (${si.instruction_type?.replace(/_/g, ' ')})`,
          instruction_id: si.id,
        })),
      };
    },
  },
  {
    id: 'critical_issues_blocking',
    name: 'Critical Issues Blocking Works',
    clause: 'Cl. 8.4(e)',
    claim_type: 'eot_and_cost',
    priority: 'high',
    description: 'Critical or high severity issues blocking progress',
    async detect(projectId, month) {
      const startDate = `${month}-01`;
      const endDate = lastDayOfMonth(month);

      const { data } = await supabase.from('site_issues')
        .select('*')
        .eq('project_id', projectId)
        .in('severity', ['Critical', 'High'])
        .gte('reported_date', startDate)
        .lte('reported_date', endDate);

      if (!data || data.length === 0) return null;

      const blocking = data.filter(i =>
        i.category?.includes('delay') || i.category?.includes('access') ||
        i.category?.includes('design') || i.category?.includes('employer') ||
        i.title?.toLowerCase().includes('delay') || i.title?.toLowerCase().includes('access') ||
        i.title?.toLowerCase().includes('suspend') || i.title?.toLowerCase().includes('stop')
      );

      if (blocking.length === 0 && data.length < 3) return null;

      const relevantIssues = blocking.length > 0 ? blocking : data;

      return {
        title: `Critical Issues Impacting Progress — ${monthLabel(month)}`,
        description: `${relevantIssues.length} critical/high-severity issue(s) reported that may constitute delay, impediment, or prevention by the Employer or other entitled cause.`,
        event_start_date: relevantIssues[0]?.reported_date,
        event_end_date: relevantIssues[relevantIssues.length - 1]?.reported_date,
        trigger_data: { issue_count: relevantIssues.length, categories: relevantIssues.map(i => i.category) },
        events: relevantIssues.map(i => ({
          event_type: 'instruction_delay',
          event_date: i.reported_date,
          description: `${i.title} (${i.severity} - ${i.category})`,
          issue_id: i.id,
          days_lost: i.severity === 'Critical' ? 1 : 0.5,
        })),
      };
    },
  },
  {
    id: 'equipment_idle',
    name: 'Equipment Idle — Non-Contractor Cause',
    clause: 'Cl. 8.9',
    claim_type: 'cost',
    priority: 'medium',
    description: 'Significant equipment idle time not due to contractor',
    async detect(projectId, month) {
      const startDate = `${month}-01`;
      const endDate = lastDayOfMonth(month);

      const { data } = await supabase.from('equipment_daily_status')
        .select('*, equipment:equipment_id(equipment_name, equipment_type)')
        .eq('project_id', projectId)
        .eq('status', 'Idle')
        .gte('status_date', startDate)
        .lte('status_date', endDate);

      if (!data || data.length < 10) return null;

      // Group by equipment
      const byEquip = {};
      data.forEach(d => {
        const name = d.equipment?.equipment_name || 'Unknown';
        if (!byEquip[name]) byEquip[name] = { name, type: d.equipment?.equipment_type, days: 0 };
        byEquip[name].days++;
      });

      const highIdle = Object.values(byEquip).filter(e => e.days > 5);
      if (highIdle.length === 0) return null;

      return {
        title: `Equipment Standing Time — ${monthLabel(month)}`,
        description: `${highIdle.length} equipment item(s) recorded >5 idle days in ${monthLabel(month)}. If idle time is not attributable to the Contractor, compensation may be due.`,
        event_start_date: startDate,
        event_end_date: endDate,
        trigger_data: { idle_equipment: highIdle, total_idle_days: data.length },
        events: highIdle.map(e => ({
          event_type: 'equipment_idle',
          event_date: startDate,
          description: `${e.name} (${e.type}): ${e.days} idle days`,
          days_lost: 0,
          cost_impact: 0, // RE to fill in hourly rates
        })),
      };
    },
  },
  {
    id: 'suspension_instruction',
    name: 'Suspension of Works',
    clause: 'Cl. 8.8',
    claim_type: 'eot_and_cost',
    priority: 'critical',
    description: 'Engineer instructs suspension of the Works',
    async detect(projectId, month) {
      const startDate = `${month}-01`;
      const endDate = lastDayOfMonth(month);

      const { data } = await supabase.from('site_instructions')
        .select('*')
        .eq('project_id', projectId)
        .in('instruction_type', ['suspension', 'stop_work'])
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (!data || data.length === 0) return null;

      return {
        title: `Suspension of Works — ${monthLabel(month)}`,
        description: `${data.length} suspension instruction(s) issued. The Contractor is entitled to EOT and cost under Cl. 8.9 if suspension is not due to Contractor's fault.`,
        event_start_date: data[0]?.created_at?.split('T')[0],
        priority: 'critical',
        trigger_data: { suspensions: data.length },
        events: data.map(si => ({
          event_type: 'suspension',
          event_date: si.created_at?.split('T')[0],
          description: `${si.instruction_no}: ${si.subject}`,
          instruction_id: si.id,
        })),
      };
    },
  },
];

/**
 * Run all detection rules for a project and month.
 * Returns array of potential claims with supporting events.
 */
export async function detectClaimTriggers(projectId, month) {
  const results = [];

  for (const rule of DETECTION_RULES) {
    try {
      const result = await rule.detect(projectId, month);
      if (result) {
        results.push({
          ...result,
          rule_id: rule.id,
          rule_name: rule.name,
          fidic_clause: rule.clause,
          claim_type: rule.claim_type,
          priority: result.priority || rule.priority,
        });
      }
    } catch (err) {
      console.error(`Detection rule ${rule.id} failed:`, err);
    }
  }

  return results;
}

/**
 * Create a claim from a detected trigger.
 */
export async function createClaimFromTrigger(trigger, projectId, profileId) {
  // Insert claim
  const { data: claim, error } = await supabase.from('claims').insert({
    project_id: projectId,
    claim_number: '', // auto-generated by trigger
    title: trigger.title,
    claim_type: trigger.claim_type,
    fidic_clause: trigger.fidic_clause,
    description: trigger.description,
    event_start_date: trigger.event_start_date,
    event_end_date: trigger.event_end_date,
    eot_days_claimed: trigger.eot_days_claimed || 0,
    cost_claimed: trigger.cost_claimed || 0,
    status: 'detected',
    priority: trigger.priority,
    auto_detected: true,
    detection_rule: trigger.rule_id,
    trigger_data: trigger.trigger_data,
    prepared_by: profileId,
  }).select().single();

  if (error) throw error;

  // Insert supporting events
  if (trigger.events?.length > 0) {
    const events = trigger.events.map(e => ({
      claim_id: claim.id,
      project_id: projectId,
      ...e,
    }));
    await supabase.from('claim_events').insert(events);
  }

  // Send notifications up the chain
  await sendClaimNotifications(claim, projectId, 'claim_detected');

  return claim;
}

/**
 * Send notifications up the role hierarchy for a claim.
 * RE → PE → Engineer → Super Admin
 */
export async function sendClaimNotifications(claim, projectId, notifType) {
  const roleChain = ['resident_engineer', 'project_engineer', 'engineer', 'super_admin', 'director_general'];

  // Get users assigned to this project with relevant roles
  const { data: assignments } = await supabase
    .from('project_role_assignments')
    .select('user_id, role')
    .eq('project_id', projectId);

  if (!assignments) return;

  // Get profiles for role info
  const userIds = assignments.map(a => a.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .in('id', userIds);

  if (!profiles) return;

  const messages = {
    claim_detected: `🚨 New claim auto-detected: ${claim.title} (${claim.fidic_clause})`,
    notice_due: `⏰ 28-day notice deadline approaching for: ${claim.title}`,
    notice_overdue: `🔴 URGENT: 28-day notice deadline MISSED for: ${claim.title}`,
    claim_submitted: `📋 Claim submitted for review: ${claim.title}`,
    review_required: `📝 Your review required: ${claim.title}`,
    claim_decided: `✅ Claim decision made: ${claim.title}`,
  };

  const notifications = [];
  const isUrgent = claim.priority === 'critical' || notifType === 'notice_overdue';

  for (const profile of profiles) {
    if (roleChain.includes(profile.role)) {
      notifications.push({
        claim_id: claim.id,
        project_id: projectId,
        recipient_id: profile.id,
        recipient_role: profile.role,
        notification_type: notifType,
        message: messages[notifType] || `Claim update: ${claim.title}`,
        is_urgent: isUrgent,
      });
    }
  }

  // Also notify platform admins
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_platform_admin', true);

  if (admins) {
    for (const admin of admins) {
      if (!notifications.find(n => n.recipient_id === admin.id)) {
        notifications.push({
          claim_id: claim.id,
          project_id: projectId,
          recipient_id: admin.id,
          recipient_role: 'platform_admin',
          notification_type: notifType,
          message: messages[notifType] || `Claim update: ${claim.title}`,
          is_urgent: isUrgent,
        });
      }
    }
  }

  if (notifications.length > 0) {
    await supabase.from('claim_notifications').insert(notifications);
  }

  return notifications.length;
}

// ── Helpers ──

function calculateInterest(overdueIPCs) {
  // Kenya: CBK rate + 3% per FIDIC Cl. 14.8
  const annualRate = 0.13 + 0.03; // ~16% (approx CBK base + 3%)
  let totalInterest = 0;

  const today = new Date();
  overdueIPCs.forEach(ipc => {
    const unpaid = (ipc.certified_amount || 0) - (ipc.paid_amount || 0);
    const certDate = new Date(ipc.certified_date);
    const daysOverdue = Math.max(0, Math.floor((today - certDate) / 86400000) - 56);
    totalInterest += unpaid * (annualRate / 365) * daysOverdue;
  });

  return Math.round(totalInterest * 100) / 100;
}

function lastDayOfMonth(month) {
  const [y, m] = month.split('-');
  return new Date(parseInt(y), parseInt(m), 0).toISOString().split('T')[0];
}

function monthLabel(month) {
  const [y, m] = month.split('-');
  const months = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[parseInt(m)]} ${y}`;
}

export { DETECTION_RULES };
