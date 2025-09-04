-- Required for gen_random_uuid()
create extension if not exists pgcrypto;
-- Vector extension for embeddings
create extension if not exists vector;
-- Users (optional minimal)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamp with time zone default now()
);

-- Orders (simplified for demo)
create table if not exists public.orders (
  id text primary key,
  user_id uuid references public.users(id) on delete set null,
  status text not null default 'processing',
  total_cents integer not null default 0,
  delivery_eta date,
  created_at timestamp with time zone default now()
);

-- Conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  escalated boolean not null default false,
  created_at timestamp with time zone default now()
);

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  role text check (role in ('user','assistant')) not null,
  content text not null,
  created_at timestamp with time zone default now()
);

-- Convenience view to get last message per conversation can be added later

-- Demo seed data
insert into public.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'demo1@example.com')
on conflict (id) do nothing;

-- FAQs with embeddings (vector store)
create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  embedding vector(1536)
);

-- Index for ANN search (after some rows exist); uses cosine distance
create index if not exists faqs_embedding_ivfflat on public.faqs using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Similarity search function
create or replace function public.match_faqs(query_embedding vector(1536), match_count int)
returns table(id uuid, question text, answer text, similarity float)
language sql stable as $$
  select f.id, f.question, f.answer,
         1 - (f.embedding <#> query_embedding) as similarity
  from public.faqs f
  where f.embedding is not null
  order by f.embedding <#> query_embedding
  limit match_count;
$$;

-- Sample FAQs (questions/answers; embeddings should be added via server script)
insert into public.faqs (id, question, answer)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'What is your return policy?', 'You can return most items within 30 days of delivery in original condition.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'How do I track my order?', 'Use your Order ID on the tracking page; we show live status and ETA.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'How are refunds processed?', 'Refunds are issued to the original payment method within 5–7 business days.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Can I change my delivery address?', 'Address changes are possible before shipment. If already shipped, contact support.')
on conflict (id) do nothing;

-- Behavioral tracking
create table if not exists public.user_behavior (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  session_id text,
  event_type text not null,
  event_payload jsonb,
  created_at timestamp with time zone default now()
);

-- Proactive prompts and CTR logging
create table if not exists public.proactive_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  session_id text,
  classification text, -- e.g., 'Anxious Browser', 'Hesitant Buyer'
  prompt text not null,
  engaged boolean default null, -- null unknown, true clicked/replied, false ignored
  created_at timestamp with time zone default now()
);

-- Catalog: products and simple recommendations
create table if not exists public.products (
  sku text primary key,
  title text not null,
  blurb text,
  price_cents integer not null default 0,
  created_at timestamp with time zone default now()
);

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  anchor_sku text references public.products(sku) on delete cascade,
  rec_sku text references public.products(sku) on delete cascade,
  kind text check (kind in ('bundle','cross_sell','upsell')) not null default 'cross_sell'
);

-- Seed products
insert into public.products (sku, title, blurb, price_cents) values
  ('SKU-CASE-01', 'Protective Case', 'Slim, shock-absorbent protection.', 1999),
  ('SKU-SCREEN-01', 'Tempered Glass Screen Guard', 'Scratch protection with 9H hardness.', 1299),
  ('SKU-CHARGER-30W', 'USB-C 30W Fast Charger', 'Charge compatible devices up to 2x faster.', 2499),
  ('SKU-WARRANTY-2Y', '2-Year Protection Plan', 'Covers accidental damage for 2 years.', 2999)
on conflict (sku) do nothing;

-- Seed recommendations (simple bundles/cross-sells)
insert into public.recommendations (anchor_sku, rec_sku, kind) values
  ('SKU-CASE-01', 'SKU-SCREEN-01', 'bundle'),
  ('SKU-CASE-01', 'SKU-WARRANTY-2Y', 'upsell'),
  ('SKU-SCREEN-01', 'SKU-CASE-01', 'bundle'),
  ('SKU-CHARGER-30W', 'SKU-WARRANTY-2Y', 'upsell')
on conflict do nothing;

insert into public.orders (id, user_id, status, total_cents, delivery_eta)
values
  ('ORDER-1001', '11111111-1111-1111-1111-111111111111', 'in_transit', 4599, current_date + interval '3 day'),
  ('ORDER-1002', '11111111-1111-1111-1111-111111111111', 'delivered', 2599, current_date - interval '2 day'),
  ('ORDER-1003', '11111111-1111-1111-1111-111111111111', 'processing', 1299, current_date + interval '5 day')
on conflict (id) do nothing;

-- Additional demo users
insert into public.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'demo2@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'demo3@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'demo4@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'demo5@example.com')
on conflict (id) do nothing;

-- Bulk orders for multiple statuses and ETAs
insert into public.orders (id, user_id, status, total_cents, delivery_eta)
values
  ('ORDER-2001', '22222222-2222-2222-2222-222222222222', 'processing', 3499, current_date + interval '2 day'),
  ('ORDER-2002', '22222222-2222-2222-2222-222222222222', 'in_transit', 8999, current_date + interval '1 day'),
  ('ORDER-2003', '22222222-2222-2222-2222-222222222222', 'delivered', 1599, current_date - interval '1 day'),

  ('ORDER-3001', '33333333-3333-3333-3333-333333333333', 'cancelled', 12999, null),
  ('ORDER-3002', '33333333-3333-3333-3333-333333333333', 'returned', 4599, current_date - interval '5 day'),
  ('ORDER-3003', '33333333-3333-3333-3333-333333333333', 'in_transit', 2499, current_date + interval '4 day'),

  ('ORDER-4001', '44444444-4444-4444-4444-444444444444', 'delivered', 2099, current_date - interval '7 day'),
  ('ORDER-4002', '44444444-4444-4444-4444-444444444444', 'processing', 7199, current_date + interval '6 day'),
  ('ORDER-4003', '44444444-4444-4444-4444-444444444444', 'in_transit', 5599, current_date + interval '2 day'),

  ('ORDER-5001', '55555555-5555-5555-5555-555555555555', 'in_transit', 3299, current_date + interval '1 day'),
  ('ORDER-5002', '55555555-5555-5555-5555-555555555555', 'processing', 9999, current_date + interval '8 day'),
  ('ORDER-5003', '55555555-5555-5555-5555-555555555555', 'delivered', 4099, current_date - interval '3 day')
on conflict (id) do nothing;
