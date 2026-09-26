-- Catálogo ABNT — esquema do Supabase
-- Rode isto uma vez em: painel do Supabase > SQL Editor > New query > Run.

create extension if not exists "pgcrypto";

create table if not exists public.references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  et_al boolean not null default false,
  ref_html text,
  ref_plain text,
  cite_authors jsonb not null default '[]'::jsonb,
  cite_year text,
  created_at timestamptz not null default now()
);

create index if not exists references_user_id_idx on public.references (user_id);

-- Row Level Security: cada pessoa só enxerga e só edita as próprias
-- referências. Sem isso, qualquer pessoa logada veria a biblioteca de
-- todo mundo.
alter table public.references enable row level security;

drop policy if exists "Cada pessoa gerencia só as próprias referências" on public.references;
create policy "Cada pessoa gerencia só as próprias referências"
  on public.references
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Opcional: confirmação de e-mail no cadastro.
-- Painel do Supabase > Authentication > Providers > Email:
-- ligue/desligue "Confirm email" conforme preferir. Com confirmação
-- ligada, quem cria conta recebe um e-mail antes de conseguir entrar.
