-- What the person wrote, and which post, so the activity feed can show
-- "@someone on the FIFA reel: fifa pls" instead of a bare comment id.
-- Nullable: rows written before this migration simply have none.
ALTER TABLE sent ADD COLUMN comment_text TEXT;
ALTER TABLE sent ADD COLUMN media_id TEXT;
