-- V3b: Profile fields for registration + Project Admin role
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS bio text;

-- Update staff_assignments to allow 'Project Admin' role
ALTER TABLE public.staff_assignments DROP CONSTRAINT IF EXISTS staff_assignments_role_on_project_check;
ALTER TABLE public.staff_assignments ADD CONSTRAINT staff_assignments_role_on_project_check
  CHECK (role_on_project IN (
    'Project Manager','Project Admin','Resident Engineer','Inspector','Surveyor',
    'Materials Technician','Environmental Officer','Accounts Officer'
  ));
