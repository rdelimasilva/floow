-- Additional indexes aligned with high-traffic transaction list filters.

-- Account-scoped list pages sort by balance_applied + date and almost always filter by org/account.
CREATE INDEX IF NOT EXISTS idx_transactions_org_account_balance_date
  ON public.transactions (org_id, account_id, balance_applied, date DESC);

-- Amount-range filters use ABS(amount_cents); expression indexes avoid full scans.
CREATE INDEX IF NOT EXISTS idx_transactions_org_abs_amount
  ON public.transactions (org_id, ABS(amount_cents));

CREATE INDEX IF NOT EXISTS idx_transactions_org_account_abs_amount
  ON public.transactions (org_id, account_id, ABS(amount_cents));
