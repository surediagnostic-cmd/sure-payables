-- ============================================================
-- SURE PAYABLES — Migration: Auth + Loan Register
-- Run in Supabase SQL Editor (SureDiagnostics project)
-- ============================================================

-- ============================================================
-- PART 1: LOAN REGISTER TABLES
-- ============================================================

create table if not exists loan_register (
  id                uuid primary key default gen_random_uuid(),
  loan_id           text unique not null,
  lender            text not null,
  borrower          text not null,
  loan_type         text not null,
  purpose           text,
  disbursement_date date,
  maturity_date     date,
  principal         numeric(15,2) not null check (principal > 0),
  interest_rate     numeric(6,4)  not null default 0,
  interest_type     text not null default 'Simple',
  repayments_made   numeric(15,2) not null default 0,
  status            text not null default 'Active',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists loan_repayments (
  id           uuid primary key default gen_random_uuid(),
  loan_id      uuid not null references loan_register(id) on delete cascade,
  payment_date date not null,
  amount       numeric(15,2) not null check (amount > 0),
  notes        text,
  created_at   timestamptz not null default now()
);

create trigger if not exists loan_register_updated_at
  before update on loan_register
  for each row execute function set_updated_at();

alter table loan_register   enable row level security;
alter table loan_repayments enable row level security;

-- ============================================================
-- PART 2: DROP OLD OPEN POLICIES, ADD ROLE-BASED RLS
-- ============================================================

drop policy if exists "vendors_all"     on vendors;
drop policy if exists "txn_all"         on vendor_transactions;
drop policy if exists "plan_all"        on repayment_plan;
drop policy if exists "vendors_select"  on vendors;
drop policy if exists "vendors_insert"  on vendors;
drop policy if exists "vendors_update"  on vendors;
drop policy if exists "vendors_delete"  on vendors;

-- VENDORS
create policy "vendors_select" on vendors for select using (auth.role() = 'authenticated');
create policy "vendors_insert" on vendors for insert with check (auth.role() = 'authenticated');
create policy "vendors_update" on vendors for update using (auth.role() = 'authenticated');
create policy "vendors_delete" on vendors for delete using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- VENDOR TRANSACTIONS — both roles full access
create policy "txn_all" on vendor_transactions for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- REPAYMENT PLAN — both roles full access
create policy "plan_all" on repayment_plan for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- LOAN REGISTER — read for all, write for admin only
create policy "loan_register_select" on loan_register for select using (auth.role() = 'authenticated');
create policy "loan_register_insert" on loan_register for insert with check (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);
create policy "loan_register_update" on loan_register for update using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- LOAN REPAYMENTS — both roles can insert repayments
create policy "loan_repayments_select" on loan_repayments for select using (auth.role() = 'authenticated');
create policy "loan_repayments_insert" on loan_repayments for insert with check (auth.role() = 'authenticated');

-- GRANTS
grant usage on schema public to authenticated;
grant select, insert, update, delete on vendors             to authenticated;
grant select, insert, update, delete on vendor_transactions to authenticated;
grant select, insert, update, delete on repayment_plan      to authenticated;
grant select, insert, update, delete on loan_register       to authenticated;
grant select, insert                 on loan_repayments     to authenticated;
grant select on vendor_balances                  to authenticated;
grant select on vendor_transactions_with_balance to authenticated;
grant select on repayment_plan_status            to authenticated;

-- ============================================================
-- PART 3: SEED LOAN REGISTER
-- ============================================================

insert into loan_register (loan_id, lender, borrower, loan_type, purpose, disbursement_date, maturity_date, principal, interest_rate, status) values
  ('LN-2026-001', 'Director',                  'OAUTH-SDL',       'Director Loan',  'Working Capital',          '2026-01-15', '2026-12-28', 2000000, 0.10, 'Active'),
  ('LN-2026-002', 'Ijofi-Sure Diagnostic Ltd', 'OAUTH-SDL',       'Inter-Company',  'Working Capital',          '2026-01-15', '2026-12-28', 1000000, 0.10, 'Active'),
  ('LN-2026-003', 'Director',                  'OAUTH-SDL',       'Director Loan',  'Working Capital',          '2026-01-21', '2026-12-28',  100000, 0.10, 'Active'),
  ('LN-2026-004', 'Director',                  'OAUTH-SDL',       'Director Loan',  'Working Capital',          '2026-01-21', '2026-12-28',   46000, 0.05, 'Active'),
  ('LN-2026-005', 'Ijofi-Sure Diagnostic Ltd', 'OAUTH-SDL',       'Inter-Company',  'Working Capital',          '2026-01-21', '2026-12-28', 1500000, 0.05, 'Active'),
  ('LN-2026-006', 'Oauth-Sure Diagnostic Ltd', 'UOFI-SDL',        'Inter-Company',  'Working Capital',          '2026-03-09', '2026-12-28',  700000, 0.09, 'Active'),
  ('LN-2026-007', 'Oauth-Sure Diagnostic Ltd', 'ILASA-SDL',       'Inter-Company',  'Regulatory',               '2026-03-16', '2026-12-28',  200000, 0.09, 'Active'),
  ('LN-2026-008', 'Ijofi-Sure Diagnostic Ltd', 'ILASA-SDL',       'Inter-Company',  'Operational Expenses',     '2026-03-16', '2026-12-28',  200000, 0.05, 'Active'),
  ('LN-2026-009', 'Oauth-Sure Diagnostic Ltd', 'ILASA-SDL',       'Inter-Company',  'Working Capital',          '2026-04-04', '2026-12-28',  500000, 0.05, 'Active'),
  ('LN-2026-010', 'Ilasa-Sure Diagnostic Ltd', 'PALM AVENUE-SDL', 'Inter-Company',  'Working Capital/Salary',   '2026-04-05', '2026-12-28',  250000, 0.07, 'Active'),
  ('LN-2026-011', 'Ilasa-Sure Diagnostic Ltd', 'PALM AVENUE-SDL', 'Inter-Company',  'Working Capital/Salary',   '2026-04-09', '2026-12-28',   50000, 0.09, 'Active'),
  ('LN-2026-012', 'Ijofi-Sure Diagnostic Ltd', 'IKEJA-SDL',       'Inter-Company',  'Working Capital',          '2026-04-10', '2026-12-28',  300000, 0.05, 'Active'),
  ('LN-2026-013', 'Director',                  'IKEJA-SDL',       'Director Loan',  'BDM Half Salary+Allowance','2026-04-14', '2026-12-28',  200000, 0.05, 'Active')
on conflict (loan_id) do nothing;
