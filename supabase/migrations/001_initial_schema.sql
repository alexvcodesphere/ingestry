-- Supabase SQL Migration
-- Run this in the Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Suppliers table (brand -> supplier mappings from core_shop.py)
create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  brand_name text unique not null,
  supplier_name text not null,
  brand_code text not null,
  created_at timestamptz default now()
);

-- Categories table (article tree from core_shop.py)
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  name text not null,
  article_tree text[] default '{}',
  created_at timestamptz default now()
);

-- Colors table with aliases for fuzzy matching
create table if not exists colors (
  id uuid primary key default uuid_generate_v4(),
  canonical_name text unique not null,
  code text not null,
  aliases text[] default '{}',
  created_at timestamptz default now()
);

-- Catalogues table (replaces CSV files)
create table if not exists catalogues (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,
  headers text[] not null,
  file_path text not null,
  created_at timestamptz default now()
);

-- Jobs table for async processing
create table if not exists jobs (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('pdf_extraction', 'shopware_upload', 'xentral_upload', 'sku_regeneration')),
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  input jsonb,
  result jsonb,
  error text,
  user_id uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table suppliers enable row level security;
alter table categories enable row level security;
alter table colors enable row level security;
alter table catalogues enable row level security;
alter table jobs enable row level security;

-- RLS Policies (authenticated users can read, only service role can write)
create policy "Allow authenticated read" on suppliers for select to authenticated using (true);
create policy "Allow authenticated read" on categories for select to authenticated using (true);
create policy "Allow authenticated read" on colors for select to authenticated using (true);
create policy "Allow authenticated read" on catalogues for select to authenticated using (true);
create policy "Users can read own jobs" on jobs for select to authenticated using (auth.uid() = user_id);
create policy "Users can create jobs" on jobs for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own jobs" on jobs for update to authenticated using (auth.uid() = user_id);

-- Create storage bucket for PDFs
insert into storage.buckets (id, name, public) 
values ('pdfs', 'pdfs', false)
on conflict (id) do nothing;

-- Storage policy for PDFs
create policy "Authenticated users can upload PDFs"
on storage.objects for insert to authenticated
with check (bucket_id = 'pdfs');

create policy "Authenticated users can read PDFs"
on storage.objects for select to authenticated
using (bucket_id = 'pdfs');

-- Create storage bucket for catalogues
insert into storage.buckets (id, name, public)
values ('catalogues', 'catalogues', false)
on conflict (id) do nothing;

create policy "Authenticated users can upload catalogues"
on storage.objects for insert to authenticated
with check (bucket_id = 'catalogues');

create policy "Authenticated users can read catalogues"
on storage.objects for select to authenticated
using (bucket_id = 'catalogues');
