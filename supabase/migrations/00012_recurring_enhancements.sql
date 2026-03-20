-- =============================================================================
-- Floow Recurring Enhancements Migration 00012
-- Adds new columns to recurring_templates and transactions for batch recurring
-- Updates deduplication index to support transfer pairs
-- =============================================================================

-- New columns on recurring_templates for batch generation metadata
ALTER TABLE public.recurring_templates
  ADD COLUMN end_mode text NOT NULL DEFAULT 'count',
  ADD COLUMN installment_count integer,
  ADD COLUMN end_date date,
  ADD COLUMN transfer_destination_account_id uuid REFERENCES public.accounts(id);

-- New columns on transactions for recurring tracking and balance reconciliation
ALTER TABLE public.transactions
  ADD COLUMN balance_applied boolean NOT NULL DEFAULT true,
  ADD COLUMN installment_number integer,
  ADD COLUMN installment_total integer;

-- Update deduplication index to include account_id (allows transfer pairs: same template+date, different accounts)
DROP INDEX IF EXISTS uq_generated_transactions;
CREATE UNIQUE INDEX uq_generated_transactions
  ON public.transactions (recurring_template_id, date, account_id)
  WHERE recurring_template_id IS NOT NULL;

-- Partial index for efficient reconciliation queries (only pending rows)
CREATE INDEX idx_transactions_balance_pending
  ON public.transactions (org_id, date)
  WHERE balance_applied = false AND recurring_template_id IS NOT NULL;
