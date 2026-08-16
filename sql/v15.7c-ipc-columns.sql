-- V15.7c: Add VoP, Materials on Site, and Works Value columns to ipc_certificates
ALTER TABLE ipc_certificates ADD COLUMN IF NOT EXISTS works_value NUMERIC DEFAULT 0;
ALTER TABLE ipc_certificates ADD COLUMN IF NOT EXISTS materials_on_site NUMERIC DEFAULT 0;
ALTER TABLE ipc_certificates ADD COLUMN IF NOT EXISTS vop_amount NUMERIC DEFAULT 0;
ALTER TABLE ipc_certificates ADD COLUMN IF NOT EXISTS submitted_date DATE;

SELECT 'V15.7c IPC columns added — works_value, materials_on_site, vop_amount, submitted_date' AS result;
