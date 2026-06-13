-- Throwaway no-op migration. Its only purpose is to make this PR touch
-- supabase/, so the Supabase->GitHub integration creates a preview branch and
-- runs seed.sql (which seeds the demo@example.com / password123 login). A PR
-- that touches no supabase/ files gets no branch and no seeded credentials.
-- Touches no schema. Safe to revert with the rest of this throwaway PR.
select 1;
