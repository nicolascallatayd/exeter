-- Add status field to transactions table
CREATE TYPE public.transaction_status AS ENUM ('completed', 'pending', 'failed', 'cancelled');

ALTER TABLE public.transactions 
ADD COLUMN status transaction_status NOT NULL DEFAULT 'completed';

-- Add index on status for better query performance
CREATE INDEX idx_transactions_status ON public.transactions(status);
