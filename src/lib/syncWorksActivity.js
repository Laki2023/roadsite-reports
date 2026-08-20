import { supabase } from './supabase';

/**
 * Sync works_activities completed_quantity and status from works_progress entries.
 *
 * After inserting/updating/deleting a works_progress row, call this to roll up
 * the total completed quantity back into the works_activities master record so
 * the Dashboard's Physical Progress metric stays accurate.
 *
 * @param {string} projectId - The project UUID
 * @param {string|null} activityId - The works_activities UUID to sync.
 *   If null, attempts to find-or-create a works_activities row by name.
 * @param {string} [activityName] - Activity name (used for find-or-create when activityId is null)
 * @param {string} [category] - Activity category (used when creating a new works_activities row)
 * @returns {Promise<string|null>} The activityId that was synced, or null if nothing to sync
 */
export async function syncWorksActivity(projectId, activityId, activityName, category) {
  if (!projectId) return null;

  // If no activityId, try to find by name or create one
  if (!activityId && activityName) {
    const { data: existing } = await supabase
      .from('works_activities')
      .select('id')
      .eq('project_id', projectId)
      .ilike('activity_name', activityName.trim())
      .limit(1)
      .single();

    if (existing) {
      activityId = existing.id;
    } else {
      // Create a new works_activities record so the Dashboard can pick it up
      const { data: created, error: createErr } = await supabase
        .from('works_activities')
        .insert({
          project_id: projectId,
          activity_name: activityName.trim(),
          category: category || 'Other',
          status: 'In Progress',
          planned_quantity: 0,
          completed_quantity: 0,
        })
        .select('id')
        .single();

      if (createErr) {
        console.error('syncWorksActivity: failed to create activity:', createErr.message);
        return null;
      }
      activityId = created.id;
    }
  }

  if (!activityId) return null;

  // Sum all works_progress quantities for this activity
  const { data: progressRows, error: fetchErr } = await supabase
    .from('works_progress')
    .select('quantity')
    .eq('project_id', projectId)
    .eq('activity_id', activityId);

  if (fetchErr) {
    console.error('syncWorksActivity: failed to fetch progress:', fetchErr.message);
    return activityId;
  }

  const totalCompleted = (progressRows || []).reduce(
    (sum, row) => sum + (parseFloat(row.quantity) || 0),
    0
  );

  // Get the planned quantity so we can determine status
  const { data: activity } = await supabase
    .from('works_activities')
    .select('planned_quantity')
    .eq('id', activityId)
    .single();

  const planned = activity?.planned_quantity || 0;

  // Determine status based on completion
  let status = 'Not Started';
  if (totalCompleted > 0 && planned > 0) {
    status = totalCompleted >= planned ? 'Completed' : 'In Progress';
  } else if (totalCompleted > 0) {
    status = 'In Progress';
  }

  // Update the works_activities row
  const { error: updateErr } = await supabase
    .from('works_activities')
    .update({
      completed_quantity: Math.round(totalCompleted * 1000) / 1000,
      status,
    })
    .eq('id', activityId);

  if (updateErr) {
    console.error('syncWorksActivity: failed to update activity:', updateErr.message);
  }

  return activityId;
}
