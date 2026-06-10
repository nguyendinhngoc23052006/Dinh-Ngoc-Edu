-- Baseline migration: enable pgcrypto (needed later for crypt() when seeding auth users).
-- Tables, RLS, and buckets arrive with the features that use them.
create extension if not exists pgcrypto with schema extensions;
