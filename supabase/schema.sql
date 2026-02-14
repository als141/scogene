-- ScoGene - 数学採点アプリ データベーススキーマ
-- Supabase SQL Editor で実行してください

-- submissions テーブル
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'grading', 'completed', 'error')),
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);

-- RLS（Row Level Security）
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- 全ユーザーに読み書き許可（認証なしの場合）
CREATE POLICY "Allow all access" ON submissions
    FOR ALL USING (true) WITH CHECK (true);

-- Storage バケット作成
INSERT INTO storage.buckets (id, name, public)
VALUES ('annotations', 'annotations', true)
ON CONFLICT (id) DO NOTHING;

-- Storage ポリシー
CREATE POLICY "Allow public read annotations" ON storage.objects
    FOR SELECT USING (bucket_id = 'annotations');

CREATE POLICY "Allow service role upload annotations" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'annotations');
