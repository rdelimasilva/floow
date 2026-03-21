-- Performance indexes for transaction list page
-- Covers common filter patterns: date range, category, description search

-- org_id + date: used by date range filters without account filter
CREATE INDEX IF NOT EXISTS idx_transactions_org_date
  ON transactions (org_id, date DESC);

-- org_id + category_id: used by category filter (inArray)
CREATE INDEX IF NOT EXISTS idx_transactions_org_category
  ON transactions (org_id, category_id);

-- org_id + balance_applied + date: used by ORDER BY balance_applied, date
CREATE INDEX IF NOT EXISTS idx_transactions_org_balance_date
  ON transactions (org_id, balance_applied, date DESC);

-- pg_trgm for ILIKE %search% on description (requires extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_transactions_description_trgm
  ON transactions USING gin (description gin_trgm_ops);
