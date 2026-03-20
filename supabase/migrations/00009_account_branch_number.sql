-- Add branch and account_number columns to accounts table
ALTER TABLE public.accounts ADD COLUMN branch text;
ALTER TABLE public.accounts ADD COLUMN account_number text;
