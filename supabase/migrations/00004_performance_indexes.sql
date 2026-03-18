-- Performance indexes for real query patterns
-- Addresses P1.4: indexes aligned with actual application queries

-- asset_prices: org_id filter used by getLatestPrices() DISTINCT ON query
CREATE INDEX IF NOT EXISTS idx_asset_prices_org_id
  ON asset_prices (org_id);

-- asset_prices: composite for org + asset + date (used by getPriceHistory)
CREATE INDEX IF NOT EXISTS idx_asset_prices_org_asset_date
  ON asset_prices (org_id, asset_id, price_date DESC);

-- transactions: category_id FK (used in JOIN with categories)
CREATE INDEX IF NOT EXISTS idx_transactions_category_id
  ON transactions (category_id);

-- portfolio_events: composite for income event queries (type + date filter)
CREATE INDEX IF NOT EXISTS idx_portfolio_events_type_date
  ON portfolio_events (org_id, event_type, event_date DESC);

-- portfolio_events: transaction_id FK (used in audit trail lookups)
CREATE INDEX IF NOT EXISTS idx_portfolio_events_transaction_id
  ON portfolio_events (transaction_id)
  WHERE transaction_id IS NOT NULL;
