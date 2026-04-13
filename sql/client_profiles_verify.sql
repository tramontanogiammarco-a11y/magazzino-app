-- In SQL Editor: deve dare una riga con client_profiles_esiste = true
select exists (
  select 1
  from information_schema.tables
  where table_schema = 'public'
    and table_name = 'client_profiles'
) as client_profiles_esiste;
