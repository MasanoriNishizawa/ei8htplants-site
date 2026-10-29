-- ============================================================
-- ei8ht plants Supabase schema
-- Supabaseダッシュボードの SQL Editor で実行してください
-- ============================================================

-- イベント本体を保存する。公開ページの開催情報と管理画面の表示順の基礎データになる。
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

-- イベントに紐づく画像を複数枚保存する。event_id のイベント削除に合わせて画像行も削除する。
create table if not exists event_images (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid references events(id) on delete cascade,
  url           text not null,
  display_order int default 0
);

-- イベントのワークショップ予約を保存する。公開フォームから登録され、管理画面で確認・管理する。
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

-- サイトのギャラリーに掲載する画像と代替テキスト、表示順を保存する。
create table if not exists gallery_images (
  id            uuid primary key default gen_random_uuid(),
  url           text not null,
  alt           text,
  display_order int default 0,
  created_at    timestamptz default now()
);

-- ブランド商品の取扱店と所在地・リンクを保存し、公開ストックリストに表示する。
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

-- 各テーブルで行単位のアクセス制御を有効化し、下記ポリシーに権限判定を委ねる。
alter table events enable row level security;
alter table event_images enable row level security;
alter table workshop_reservations enable row level security;
alter table gallery_images enable row level security;
alter table stockists enable row level security;

-- 公開読み取り対象: 開催イベント、イベント画像、ギャラリー画像、取扱店。全行を公開ページに返す。
create policy "events: public read" on events for select using (true);
create policy "event_images: public read" on event_images for select using (true);
create policy "gallery_images: public read" on gallery_images for select using (true);
create policy "stockists: public read" on stockists for select using (true);

-- 管理操作対象: 各テーブルの全操作をバックエンドの service_role に限定する。
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

-- 予約フォームから未認証の公開利用者が予約行を追加できるようにする。
-- このポリシーは挿入のみ許可し、予約の読み取り・変更は下の service_role ポリシーに限定する。
create policy "workshop_reservations: public insert" on workshop_reservations
  for insert with check (true);

-- ============================================================
-- events の更新日時を更新時刻に揃えるためのトリガー関数。
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- events の各行が更新される直前に update_updated_at() を実行する。
create trigger events_updated_at
  before update on events
  for each row execute function update_updated_at();
