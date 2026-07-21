import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth helpers
export const signUp = async (email, password, fullName) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  return { data, error };
};

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
};

export const updateProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
};

// Admin helpers
export const getAllProfiles = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
};

export const approveUser = async (userId, role, adminId) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role, approved_at: new Date().toISOString(), approved_by: adminId })
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
};

// Projects
export const getProjects = async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('*, profiles:re_assigned(full_name, email)')
    .order('created_at', { ascending: false });
  return { data, error };
};

export const createProject = async (project) => {
  const { data, error } = await supabase
    .from('projects')
    .insert(project)
    .select()
    .single();
  return { data, error };
};

export const updateProject = async (id, updates) => {
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error };
};

// Reports
export const submitReport = async (report) => {
  const { data, error } = await supabase
    .from('daily_reports')
    .insert(report)
    .select()
    .single();
  return { data, error };
};

export const getReports = async (filters = {}) => {
  let query = supabase
    .from('daily_reports')
    .select(`
      *,
      profiles:submitted_by(full_name, email),
      projects:project_id(name, contract_number)
    `)
    .order('created_at', { ascending: false });

  if (filters.projectId) query = query.eq('project_id', filters.projectId);
  if (filters.userId) query = query.eq('submitted_by', filters.userId);
  if (filters.isUrgent) query = query.eq('is_urgent', true);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.dateFrom) query = query.gte('report_date', filters.dateFrom);
  if (filters.dateTo) query = query.lte('report_date', filters.dateTo);

  const { data, error } = await query;
  return { data, error };
};

export const getMyReports = async (userId) => {
  const { data, error } = await supabase
    .from('daily_reports')
    .select(`*, projects:project_id(name, contract_number)`)
    .eq('submitted_by', userId)
    .order('created_at', { ascending: false });
  return { data, error };
};

export const updateReportStatus = async (reportId, updates) => {
  const { data, error } = await supabase
    .from('daily_reports')
    .update(updates)
    .eq('id', reportId)
    .select()
    .single();
  return { data, error };
};
