-- ExamSpace only. No application rows, columns, or Prisma migration checksums change.
-- The application and Prisma connect as the table owner (postgres).
-- Anonymous browser clients must never manage migration metadata.
REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM anon, authenticated, PUBLIC;
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
