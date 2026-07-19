-- ============================================================
-- ei8ht plants Supabase schema
-- Supabaseダッシュボードの SQL Editor で実行してください
-- ============================================================

-- イベント
create table if not exists events (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  start_date      date not null,
  end_date        date,
  time            text,
  location        text not null,
  booth_number    text,
  address         text,
  official_url    text,
  brands          text[] default '{}',
  has_workshop    boolean default false,
  ws_requires_reservation boolean default true,
  is_past         boolean default false,
  display_order   int default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- イベント画像（複数枚対応）
create table if not exists event_images (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid references events(id) on delete cascade,
  url           text not null,
  display_order int default 0
);

-- ワークショップ予約
create table if not exists workshop_reservations (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references events(id) on delete cascade,
  name         text not null,
  email        text not null,
  phone        text,
  participants int default 1,
  note         text,
  created_at   timestamptz default now()
);

-- ギャラリー画像
create table if not exists gallery_images (
  id            uuid primary key default gen_random_uuid(),
  url           text not null,
  alt           text,
  display_order int default 0,
  created_at    timestamptz default now()
);

-- ストックリスト（取扱店）
create table if not exists stockists (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  area          text,
  address       text,
  url           text,
  display_order int default 0
);

-- ============================================================
-- RLS ポリシー
-- ============================================================

alter table events enable row level security;
alter table event_images enable row level security;
alter table workshop_reservations enable row level security;
alter table gallery_images enable row level security;
alter table stockists enable row level security;

-- 公開データ: 誰でも読める
create policy "events: public read" on events for select using (true);
create policy "event_images: public read" on event_images for select using (true);
create policy "gallery_images: public read" on gallery_images for select using (true);
create policy "stockists: public read" on stockists for select using (true);

-- 管理者のみ書き込み（service_role キーを使用）
create policy "events: admin write" on events
  for all using (auth.role() = 'service_role');
create policy "event_images: admin write" on event_images
  for all using (auth.role() = 'service_role');
create policy "workshop_reservations: admin write" on workshop_reservations
  for all using (auth.role() = 'service_role');
create policy "gallery_images: admin write" on gallery_images
  for all using (auth.role() = 'service_role');
create policy "stockists: admin write" on stockists
  for all using (auth.role() = 'service_role');

-- WS予約は誰でも挿入可能（送信フォームから）
create policy "workshop_reservations: public insert" on workshop_reservations
  for insert with check (true);

-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger events_updated_at
  before update on events
  for each row execute function update_updated_at();
