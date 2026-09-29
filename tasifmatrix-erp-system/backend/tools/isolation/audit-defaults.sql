-- TEST-ONLY convenience: default the audit columns so seed inserts stay short.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT table_name, column_name FROM information_schema.columns
           WHERE table_schema='public' AND column_name IN ('revision','created_date','updated_date','created_by_user_uuid','updated_by_user_uuid','created_by_user_name','updated_by_user_name')
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s', r.table_name, r.column_name,
      CASE WHEN r.column_name='revision' THEN 'gen_random_uuid()'
           WHEN r.column_name LIKE '%_date' THEN 'now()'
           WHEN r.column_name LIKE '%_uuid' THEN '''00000000-0000-0000-0000-000000000001'''
           ELSE '''seed''' END);
  END LOOP;
END $$;
