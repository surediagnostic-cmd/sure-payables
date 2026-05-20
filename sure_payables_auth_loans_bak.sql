-- ============================================================
-- SURE PAYABLES — Auth + Loan Register Migration
-- Run in SureDiagnostics Supabase SQL Editor
-- ============================================================

-- ============================================================
-- STEP 1: ENABLE AUTH + CREATE USER ROLES
-- ============================================================

-- Role table to track MD vs Accountant
create table if not exists user_roles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('md', 'accountant')),
  full_name  text,
  created_at timestamptz not null default now()
);

alter table user_roles enable row level security;
create policy "users_read_own_role" on user_roles for select using (auth.uid() = id);
create policy "md_manage_roles" on user_roles for all using (
  exists (select 1 from user_roles where id = auth.uid() and role = 'md')
);
grant select on user_roles to authenticated;

-- ============================================================
-- STEP 2: UPDATE RLS ON EXISTING TABLES
-- Replace open anon policies with auth-aware policies
-- ============================================================

-- Drop old open policies
drop policy if exists "vendors_all"     on vendors;
drop policy if exists "txn_all"         on vendor_transactions;
drop policy if exists "plan_all"        on repayment_plan;

-- VENDORS — authenticated read, MD-only delete
create policy "vendors_read"   on vendors for select using (auth.role() = 'authenticated');
create policy "vendors_insert" on vendors for insert with check (auth.role() = 'authenticated');
create policy "vendors_update" on vendors for update using (auth.role() = 'authenticated');
create policy "vendors_delete" on vendors for delete using (
  exists (select 1 from user_roles where id = auth.uid() and role = 'md')
);

-- VENDOR_TRANSACTIONS — all authenticated can read/write
create policy "txn_read"   on vendor_transactions for select using (auth.role() = 'authenticated');
create policy "txn_insert" on vendor_transactions for insert with check (auth.role() = 'authenticated');
create policy "txn_update" on vendor_transactions for update using (auth.role() = 'authenticated');
create policy "txn_delete" on vendor_transactions for delete using (
  exists (select 1 from user_roles where id = auth.uid() and role = 'md')
);

-- REPAYMENT_PLAN — all authenticated can read/write, MD-only delete
create policy "plan_read"   on repayment_plan for select using (auth.role() = 'authenticated');
create policy "plan_insert" on repayment_plan for insert with check (auth.role() = 'authenticated');
create policy "plan_update" on repayment_plan for update using (auth.role() = 'authenticated');
create policy "plan_delete" on repayment_plan for delete using (
  exists (select 1 from user_roles where id = auth.uid() and role = 'md')
);

-- Grant authenticated access to views
grant select on vendor_balances                  to authenticated;
grant select on vendor_transactions_with_balance to authenticated;
grant select on repayment_plan_status            to authenticated;

-- ============================================================
-- STEP 3: LOAN REGISTER TABLES
-- ============================================================

create type loan_status_enum    as enum ('Active', 'Settled', 'Overdue', 'Restructured');
create type loan_type_enum_new  as enum ('Director Loan', 'Inter-Company');
create type interest_type_enum  as enum ('Simple', 'Compound');

create table loans (
  id                  uuid primary key default gen_random_uuid(),
  loan_id             text unique not null,          -- e.g. LN-2026-001
  lender              text not null,                 -- Director / Ijofi-SDL etc.
  borrower            text not null,                 -- OAUTH-SDL / ILASA-SDL etc.
  borrower_branch     text,                          -- maps to our branch enum
  loan_type           loan_type_enum_new not null,
  purpose             text,
  disbursement_date   date not null,
  maturity_date       date,
  principal           numeric(15,2) not null check (principal > 0),
  interest_rate       numeric(6,4) not null default 0,  -- e.g. 0.10 = 10%
  interest_type       interest_type_enum not null default 'Simple',
  accrued_interest    numeric(15,2) not null default 0,  -- simple: principal * rate
  repayments_made     numeric(15,2) not null default 0,
  status              loan_status_enum not null default 'Active',
  next_payment_date   date,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Computed columns as generated expressions
alter table loans
  add column if not exists total_outstanding numeric(15,2)
    generated always as (principal + accrued_interest) stored,
  add column if not exists balance_due numeric(15,2)
    generated always as (principal + accrued_interest - repayments_made) stored;

create table loan_repayments (
  id              uuid primary key default gen_random_uuid(),
  loan_id         uuid not null references loans(id) on delete cascade,
  payment_date    date not null,
  amount          numeric(15,2) not null check (amount > 0),
  payment_bank    text,
  reference       text,
  recorded_by     text,
  notes           text,
  created_at      timestamptz not null default now()
);

-- Updated_at trigger
create trigger loans_updated_at
  before update on loans
  for each row execute function set_updated_at();

-- ============================================================
-- STEP 4: VIEWS FOR LOAN REGISTER
-- ============================================================

create or replace view loans_with_repayments as
select
  l.*,
  coalesce(r.total_repaid, 0)                              as actual_repaid,
  l.principal + l.accrued_interest - coalesce(r.total_repaid, 0) as actual_balance,
  r.repayment_count,
  r.last_payment_date,
  case
    when l.principal + l.accrued_interest - coalesce(r.total_repaid, 0) <= 0
      then 'Settled'::loan_status_enum
    when l.maturity_date < current_date
      then 'Overdue'::loan_status_enum
    else l.status
  end as computed_status,
  case
    when l.maturity_date is not null
    then l.maturity_date - current_date
    else null
  end as days_to_maturity
from loans l
left join (
  select
    loan_id,
    sum(amount)    as total_repaid,
    count(*)       as repayment_count,
    max(payment_date) as last_payment_date
  from loan_repayments
  group by loan_id
) r on r.loan_id = l.id;

-- ============================================================
-- STEP 5: RLS ON LOAN TABLES
-- ============================================================

alter table loans            enable row level security;
alter table loan_repayments  enable row level security;

-- All authenticated can read
create policy "loans_read"   on loans for select using (auth.role() = 'authenticated');
create policy "loans_insert" on loans for insert with check (
  exists (select 1 from user_roles where id = auth.uid() and role = 'md')
);
create policy "loans_update" on loans for update using (
  exists (select 1 from user_roles where id = auth.uid() and role = 'md')
);
create policy "loans_delete" on loans for delete using (
  exists (select 1 from user_roles where id = auth.uid() and role = 'md')
);

-- Repayments — all authenticated can record, MD-only delete
create policy "loan_repay_read"   on loan_repayments for select using (auth.role() = 'authenticated');
create policy "loan_repay_insert" on loan_repayments for insert with check (auth.role() = 'authenticated');
create policy "loan_repay_delete" on loan_repayments for delete using (
  exists (select 1 from user_roles where id = auth.uid() and role = 'md')
);

grant select on loans_with_repayments to authenticated;
grant select, insert, update, delete on loans           to authenticated;
grant select, insert, update, delete on loan_repayments to authenticated;

-- ============================================================
-- STEP 6: SEED LOAN DATA from Sure_Diagnostics_Loan_Register.xlsx
-- ============================================================

insert into loans (loan_id, lender, borrower, borrower_branch, loan_type, purpose,
  disbursement_date, maturity_date, principal, interest_rate, interest_type,
  accrued_interest, repayments_made, status, next_payment_date) values

('LN-2026-001','Director','OAUTH-SDL','OAUTH','Director Loan','Working Capital',
  '2026-01-15','2026-12-28',2000000,0.10,'Simple',200000,0,'Active','2026-12-28'),

('LN-2026-002','Ijofi-Sure Diagnostics Ltd','OAUTH-SDL','OAUTH','Inter-Company','Working Capital',
  '2026-01-15','2026-12-28',1000000,0.10,'Simple',100000,0,'Active','2026-12-28'),

('LN-2026-003','Director','OAUTH-SDL','OAUTH','Director Loan','Working Capital',
  '2026-01-21','2026-12-28',100000,0.10,'Simple',10000,0,'Active','2026-12-28'),

('LN-2026-004','Director','OAUTH-SDL','OAUTH','Director Loan','Working Capital',
  '2026-01-21','2026-12-28',46000,0.05,'Simple',2300,0,'Active','2026-12-28'),

('LN-2026-005','Ijofi-Sure Diagnostics Ltd','OAUTH-SDL','OAUTH','Inter-Company','Working Capital',
  '2026-01-21','2026-12-28',1500000,0.05,'Simple',75000,0,'Active','2026-12-28'),

('LN-2026-006','Oauth-Sure Diagnostics Ltd','UOFI-SDL','Ilesha','Inter-Company','Working Capital',
  '2026-03-09','2026-12-28',700000,0.09,'Simple',63000,0,'Active','2026-12-28'),

('LN-2026-007','Oauth-Sure Diagnostics Ltd','ILASA-SDL','Ilasa','Inter-Company','Regulatory',
  '2026-03-16','2026-12-28',200000,0.09,'Simple',17000,0,'Active','2026-12-28'),

('LN-2026-008','Ijofi-Sure Diagnostics Ltd','ILASA-SDL','Ilasa','Inter-Company','Operational Expenses',
  '2026-03-16','2026-12-28',200000,0.05,'Simple',10000,0,'Active','2026-12-28'),

('LN-2026-009','Oauth-Sure Diagnostics Ltd','ILASA-SDL','Ilasa','Inter-Company','Working Capital',
  '2026-04-04','2026-12-28',500000,0.05,'Simple',25000,0,'Active','2026-12-28'),

('LN-2026-010','Ilasa-Sure Diagnostics Ltd','PALM AVENUE-SDL','Palm Avenue','Inter-Company','Working Capital/Salary',
  '2026-04-05','2026-12-28',250000,0.07,'Simple',17500,0,'Active','2026-12-28'),

('LN-2026-011','Ilasa-Sure Diagnostics Ltd','PALM AVENUE-SDL','Palm Avenue','Inter-Company','Working Capital/Salary',
  '2026-04-09','2026-12-28',50000,0.09,'Simple',4250,0,'Active','2026-12-28'),

('LN-2026-012','Ijofi-Sure Diagnostics Ltd','IKEJA-SDL','Ikeja','Inter-Company','Working Capital',
  '2026-04-10','2026-12-28',300000,0.05,'Simple',15000,0,'Active','2026-12-28'),

('LN-2026-013','Director','IKEJA-SDL','Ikeja','Director Loan','BDM Half Salary+Allowance',
  '2026-04-14','2026-12-28',200000,0.05,'Simple',10000,0,'Active','2026-12-28');
