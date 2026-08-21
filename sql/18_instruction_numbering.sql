-- ============================================================
-- RoadSite Reports — Atomic Instruction Numbering (V15.17)
-- Fixes race condition where concurrent submissions get
-- duplicate instruction numbers.
-- ============================================================

-- This function atomically generates the next instruction number
-- for a given project. It uses FOR UPDATE to lock the relevant
-- rows during the count, preventing duplicates.
CREATE OR REPLACE FUNCTION next_instruction_no(p_project_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  -- Lock and count in one atomic operation
  SELECT COUNT(*) + 1 INTO next_num
  FROM site_instructions
  WHERE project_id = p_project_id
  FOR UPDATE;

  RETURN 'SI-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

-- Grant execute to authenticated users (needed for RLS context)
GRANT EXECUTE ON FUNCTION next_instruction_no(UUID) TO authenticated;
