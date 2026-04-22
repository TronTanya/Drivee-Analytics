-- Learned SQL / semantic corrections (admin-curated, similarity reuse per workspace)

CREATE TABLE IF NOT EXISTS query_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  original_query TEXT NOT NULL,
  query_normalized TEXT NOT NULL,
  generated_sql TEXT NOT NULL,
  corrected_sql TEXT NOT NULL,
  correction_type TEXT NOT NULL CHECK (correction_type IN ('sql_rewrite', 'semantic_mapping')),
  semantic_terms_before JSONB NOT NULL DEFAULT '[]'::jsonb,
  semantic_terms_after JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_query_corrections_workspace ON query_corrections (workspace_id);
CREATE INDEX IF NOT EXISTS idx_query_corrections_workspace_norm ON query_corrections (workspace_id, query_normalized);
