-- Esegui questo SOLO dopo che `client_profiles` risulta creata in Table Editor
-- ma l’app mostra ancora: "Could not find the table ... in the schema cache".
-- Ricarica la cache dell’API PostgREST su Supabase.
notify pgrst, 'reload schema';
