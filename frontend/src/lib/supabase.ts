// 管理画面のログイン（Supabase Auth）に使うクライアントを作るファイル
import { createClient } from '@supabase/supabase-js'

/** Supabase のプロジェクト URL（.env の VITE_SUPABASE_URL） */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
/** ブラウザに出してよい公開用のキー（.env の VITE_SUPABASE_ANON_KEY） */
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** 環境変数が未設定の場合は null にして、認証不要な環境でもビルドを通す */
export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null
