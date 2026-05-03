-- ============================================================
-- SURE PAYABLES MANAGER — Vendor Ledger Schema v2
-- Run in Supabase SQL Editor (RAMP project)
-- Drop old tables first if migrating from v1
-- ============================================================

-- ============================================================
-- DROP OLD TABLES (if they exist from v1)
-- ============================================================
drop view  if exists repayment_plan_with_status cascade;
drop view  if exists aging_report               cascade;
drop view  if exists payables_with_balance      cascade;
drop view  if exists loan_running_balance       cascade;
drop table if exists repayment_plan             cascade;
drop table if exists payments                   cascade;
drop table if exists loan_entries               cascade;
drop table if exists payables                   cascade;

-- ============================================================
-- ENUMS
-- ============================================================
drop type if exists vendor_type_enum    cascade;
drop type if exists txn_type_enum       cascade;
drop type if exists payment_bank_enum   cascade;

create type vendor_type_enum  as enum ('Trade Payable', 'Other Payables');
create type txn_type_enum     as enum ('Credit', 'Debit');  -- Credit=invoice raised, Debit=payment made
create type payment_bank_enum as enum ('Zenith Bank','Moniepoint','Kuda','Access Bank','GTBank','First Bank','Other');

-- ============================================================
-- TABLE: vendors
-- One row per vendor (replaces per-sheet tabs in Excel)
-- ============================================================
create table vendors (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    text unique not null,          -- e.g. V1, V2, V3
  name         text not null,
  vendor_type  vendor_type_enum not null default 'Trade Payable',
  branch       text,                          -- e.g. Ilasa/Palm Ave Lagos
  is_active    boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- TABLE: vendor_transactions
-- Every debit/credit line entry (like rows in each vendor sheet)
-- Credit = invoice/bill raised (amount owed increases)
-- Debit  = payment made (amount owed decreases)
-- ============================================================
create table vendor_transactions (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references vendors(id) on delete cascade,
  txn_month       text,                       -- e.g. JAN, FEBRUARY, OCT
  txn_date        date,
  doc_ref         text,                       -- invoice/receipt reference
  details         text not null,             -- description of transaction
  txn_type        txn_type_enum not null,    -- Credit (invoice) or Debit (payment)
  amount          numeric(15,2) not null check (amount >= 0),
  payment_bank    payment_bank_enum,          -- only for Debit (payment) entries
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- TABLE: repayment_plan
-- Monthly scheduled repayments per vendor
-- ============================================================
create table repayment_plan (
  id               uuid primary key default gen_random_uuid(),
  vendor_id        uuid not null references vendors(id) on delete cascade,
  scheduled_month  text not null,             -- e.g. MAY 2026
  planned_amount   numeric(15,2) not null check (planned_amount > 0),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(vendor_id, scheduled_month)
);

-- ============================================================
-- VIEW: vendor_balances
-- Running balance per vendor:
--   balance = SUM(credits) - SUM(debits)
--   positive = vendor is owed money (we owe them)
--   negative = we overpaid (credit balance in our favour)
-- ============================================================
create or replace view vendor_balances as
select
  v.id,
  v.vendor_id,
  v.name,
  v.vendor_type,
  v.branch,
  v.is_active,
  v.notes,
  v.created_at,
  coalesce(t.total_credits, 0)                              as total_credits,
  coalesce(t.total_debits, 0)                               as total_debits,
  coalesce(t.total_credits, 0) - coalesce(t.total_debits, 0) as balance,
  coalesce(t.txn_count, 0)                                  as txn_count,
  t.last_txn_date
from vendors v
left join (
  select
    vendor_id,
    sum(case when txn_type = 'Credit' then amount else 0 end) as total_credits,
    sum(case when txn_type = 'Debit'  then amount else 0 end) as total_debits,
    count(*)                                                   as txn_count,
    max(txn_date)                                              as last_txn_date
  from vendor_transactions
  group by vendor_id
) t on t.vendor_id = v.id;

-- ============================================================
-- VIEW: vendor_transactions_with_balance
-- Running balance per transaction line (like Excel running total)
-- ============================================================
create or replace view vendor_transactions_with_balance as
select
  vt.id,
  vt.vendor_id,
  v.name        as vendor_name,
  v.vendor_type,
  v.branch,
  vt.txn_month,
  vt.txn_date,
  vt.doc_ref,
  vt.details,
  vt.txn_type,
  vt.amount,
  vt.payment_bank,
  vt.created_at,
  -- running balance: credits add, debits subtract
  sum(
    case when vt2.txn_type = 'Credit' then vt2.amount
         when vt2.txn_type = 'Debit'  then -vt2.amount
         else 0 end
  ) over (
    partition by vt.vendor_id
    order by coalesce(vt.txn_date, '1900-01-01'::date), vt.created_at
    rows between unbounded preceding and current row
  ) as running_balance
from vendor_transactions vt
join vendors v on v.id = vt.vendor_id
join vendor_transactions vt2 on vt2.vendor_id = vt.vendor_id;

-- ============================================================
-- VIEW: repayment_plan_status
-- Plan entries with actual payment comparison
-- ============================================================
create or replace view repayment_plan_status as
select
  rp.id,
  rp.vendor_id,
  rp.scheduled_month,
  rp.planned_amount,
  rp.notes,
  rp.created_at,
  rp.updated_at,
  v.name        as vendor_name,
  v.vendor_type,
  v.branch,
  vb.total_debits as vendor_total_paid,
  vb.balance      as vendor_balance,
  case
    when vb.balance <= 0         then 'Paid'
    when vb.total_debits > 0     then 'Partial'
    else                              'Pending'
  end as plan_status
from repayment_plan rp
join vendors v  on v.id  = rp.vendor_id
join vendor_balances vb on vb.id = rp.vendor_id;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger vendors_updated_at
  before update on vendors
  for each row execute function set_updated_at();

create trigger vendor_txn_updated_at
  before update on vendor_transactions
  for each row execute function set_updated_at();

create trigger repayment_plan_updated_at
  before update on repayment_plan
  for each row execute function set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (open — no auth yet)
-- ============================================================
alter table vendors              enable row level security;
alter table vendor_transactions  enable row level security;
alter table repayment_plan       enable row level security;

create policy "vendors_all"     on vendors             for all using (true) with check (true);
create policy "txn_all"         on vendor_transactions for all using (true) with check (true);
create policy "plan_all"        on repayment_plan      for all using (true) with check (true);

-- ============================================================
-- SEED DATA — from Sure_Lagos_Payables_2023-25.xlsx
-- ============================================================

-- VENDORS (from Payable Summary sheet)
insert into vendors (vendor_id, name, vendor_type, branch) values
  ('V1',  'MR DEMOLA (DEMTOS)',            'Trade Payable',  'Ilasa/Palm Ave Lagos'),
  ('V2',  'BOULOS',                         'Trade Payable',  'Lagos'),
  ('V3',  'STAFF SAVINGS',                  'Other Payables', 'Lagos'),
  ('V4',  'IKONS MEDICALS',                 'Trade Payable',  'Ilasa/Palm Ave Lagos'),
  ('V5',  'MEDICAL LAWMA',                  'Other Payables', 'Ilasa/Palm Ave Lagos'),
  ('V6',  'SHAS WORLD GLOBAL ENTERPRISES',  'Other Payables', 'Lagos'),
  ('V7',  'MR SUNDAY',                      'Other Payables', 'Lagos'),
  ('V8',  'LASAA',                          'Other Payables', 'Ilasa/Palm Ave Lagos'),
  ('V9',  'SEMED',                          'Other Payables', 'Lagos'),
  ('V10', 'EVAULT INVERTER',                'Other Payables', 'Lagos Ilasa'),
  ('V11', 'SCAN MACHINE REPAIRER',          'Other Payables', 'Ilasa/Avenue'),
  ('V12', 'DOMESTIC LAWMA',                 'Other Payables', 'Ilasa Lagos'),
  ('V13', 'LIRS',                           'Other Payables', 'Ilasa/Palm Ave Lagos'),
  ('V14', 'FIRE REGULATORY',                'Other Payables', 'Ilasa/Palm Ave Lagos'),
  ('V15', 'RRBN',                           'Other Payables', 'Ilasa Lagos'),
  ('V16', 'MR ABDULSAMAD REAGENT',          'Trade Payable',  'Ilasa/Palm Ave Lagos'),
  ('V17', 'EROM',                           'Trade Payable',  'Ilasa/Palm Ave Lagos'),
  ('V18', 'RENT',                           'Other Payables', 'Lagos'),
  ('V19', 'HEFAMMA',                        'Other Payables', 'Lagos'),
  ('V20', 'NNRA',                           'Other Payables', 'Ilesha'),
  ('V22', 'MD''S LOAN/BANK',               'Other Payables', 'Lagos'),
  ('V23', 'MANI VENTURES',                  'Trade Payable',  'Ilasa/Palm Ave Lagos'),
  ('V24', 'OLUWARANTI',                     'Other Payables', 'Ilesha'),
  ('V25', 'HOPESTONE',                      'Trade Payable',  'Ilasa/Palm Ave Lagos'),
  ('V26', 'MR SAMUEL',                      'Other Payables', 'Ilesha'),
  ('V27', 'STAFF SALARY ARREARS',           'Other Payables', 'Lagos');

-- TRANSACTIONS — MR DEMOLA (target balance: ₦110,000)
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount, payment_bank)
select id, 'JUN', '2024-06-10', 'OUTSTANDING BAL (AVENUE)',     'Credit', 5000,  null from vendors where vendor_id='V1';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUN', '2024-06-10', 'Payment — AVENUE',             'Debit',  5000        from vendors where vendor_id='V1';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'SEP', '2024-09-06', 'OUTSTANDING BAL (ILASA)',       'Credit', 33000       from vendors where vendor_id='V1';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'SEP', '2024-09-06', 'OUTSTANDING BAL (AVENUE)',      'Credit', 37000       from vendors where vendor_id='V1';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JAN', '2025-04-01', 'OUTSTANDING (ILASA)',           'Credit', 35000       from vendors where vendor_id='V1';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JAN', '2025-01-01', 'BALANCE RECONCILIATION (AVENUE OUTSTANDING)', 'Credit', 5000 from vendors where vendor_id='V1';

-- TRANSACTIONS — IKONS MEDICALS
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'AUG', '2024-08-31', 'HORMONAL MACHINE OUTSTANDING BALANCE', 'Credit', 900000  from vendors where vendor_id='V4';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'AUG', '2024-08-31', 'HORMONAL REAGENT BALANCE',             'Credit', 153000  from vendors where vendor_id='V4';

-- TRANSACTIONS — MEDICAL LAWMA
insert into vendor_transactions (vendor_id, txn_month, txn_date, doc_ref, details, txn_type, amount)
select id, 'JANUARY', '2023-01-01', 'LAWMAHCWC5096', 'AUGUST-DECEMBER 2022 BILL FOR ILASA',   'Credit', 27500 from vendors where vendor_id='V5';
insert into vendor_transactions (vendor_id, txn_month, txn_date, doc_ref, details, txn_type, amount)
select id, 'JANUARY', '2023-01-01', 'LAWMAHCWC5096', 'Payment',                               'Debit',  27500 from vendors where vendor_id='V5';
insert into vendor_transactions (vendor_id, txn_month, txn_date, doc_ref, details, txn_type, amount)
select id, 'MAY',     '2023-05-01', 'LAWMAHCWC5096', 'MARCH-APRIL 2023 BILL FOR ILASA',       'Credit', 19000 from vendors where vendor_id='V5';
insert into vendor_transactions (vendor_id, txn_month, txn_date, doc_ref, details, txn_type, amount)
select id, 'MAY',     '2023-05-01', 'LAWMAHCWC5096', 'Payment',                               'Debit',  19000 from vendors where vendor_id='V5';
insert into vendor_transactions (vendor_id, txn_month, txn_date, doc_ref, details, txn_type, amount)
select id, 'AUG',     '2024-08-01', null,             'ILASA BAL AS AT AUG 2024',              'Credit', 105500 from vendors where vendor_id='V5';
insert into vendor_transactions (vendor_id, txn_month, txn_date, doc_ref, details, txn_type, amount)
select id, 'AUG',     '2024-08-01', null,             'Payment',                               'Debit',  105500 from vendors where vendor_id='V5';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUNE',    '2025-06-01', 'ILASA BILL MAY-JUNE 2025',                               'Credit', 10500 from vendors where vendor_id='V5';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUNE',    '2025-06-01', 'Payment — partial',                                      'Debit',  8500  from vendors where vendor_id='V5';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUNE',    '2025-06-01', 'ILASA BILL JULY-AUG 2025',                               'Credit', 15500 from vendors where vendor_id='V5';

-- TRANSACTIONS — LASAA
insert into vendor_transactions (vendor_id, txn_month, txn_date, doc_ref, details, txn_type, amount)
select id, 'AUGUST',  '2023-08-15', '353461', 'FLAT SIGNAGE-ILASA',          'Credit', 15000 from vendors where vendor_id='V8';
insert into vendor_transactions (vendor_id, txn_month, txn_date, doc_ref, details, txn_type, amount)
select id, 'AUGUST',  '2023-08-15', '353461', 'Payment — FLAT SIGNAGE-ILASA','Debit',  14784 from vendors where vendor_id='V8';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JANUARY', '2024-12-31', 'PALM AVENUE OUTSTANDING BALANCE 2024', 'Credit', 21120 from vendors where vendor_id='V8';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JANUARY', '2024-12-31', 'Payment — PALM AVENUE 2024',           'Debit',  21120 from vendors where vendor_id='V8';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MARCH',   '2025-03-31', 'PALM AVENUE 2025 BILL',                'Credit', 12500 from vendors where vendor_id='V8';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MARCH',   '2025-03-31', 'Payment — PALM AVENUE',                'Debit',  12500 from vendors where vendor_id='V8';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MARCH',   '2025-03-31', 'ILASA 2025 BILL',                      'Credit', 46824 from vendors where vendor_id='V8';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MARCH',   '2025-03-31', 'Payment — ILASA partial',              'Debit',  8504  from vendors where vendor_id='V8';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MAY',     '2025-05-01', 'Payment — ILASA balance',              'Debit',  10000 from vendors where vendor_id='V8';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MAY',     '2025-05-01', 'Payment — balance reconciliation',      'Debit',  5944  from vendors where vendor_id='V8';

-- TRANSACTIONS — EVAULT INVERTER (target balance: ₦34,000)
-- Excel total credits = 2,281,500 | total debits = 2,247,500 | balance = 34,000
insert into vendor_transactions (vendor_id, txn_month, txn_date, doc_ref, details, txn_type, amount, payment_bank)
select id, 'SEPTEMBER','2023-09-26','011','INVERTER FIXING BILL — invoice',         'Credit', 1085000,    null         from vendors where vendor_id='V10';
insert into vendor_transactions (vendor_id, txn_month, txn_date, doc_ref, details, txn_type, amount, payment_bank)
select id, 'SEPTEMBER','2023-09-26','011','Payment — INVERTER (Access Bank)',        'Debit',  1666250,    'Access Bank' from vendors where vendor_id='V10';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCTOBER',  '2024-08-31','INVERTER BALANCE CREDIT NOTE 2024',            'Credit', 1162500                  from vendors where vendor_id='V10';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCTOBER',  '2024-08-31','Payment — instalment',                         'Debit',  500000                   from vendors where vendor_id='V10';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'DECEMBER', '2024-08-31','Payment — INVERTER OUTSTANDING 2024',          'Debit',  81250                    from vendors where vendor_id='V10';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'SEPTEMBER','2025-10-31','INVERTER MAINTENANCE',                          'Credit', 34000                    from vendors where vendor_id='V10';

-- TRANSACTIONS — LIRS
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCTOBER',  '2024-10-31', 'LIRS OUTSTANDING 2024 (OCT-DEC)',    'Credit', 26800 from vendors where vendor_id='V13';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCTOBER',  '2024-10-31', 'Payment',                             'Debit',  26800 from vendors where vendor_id='V13';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUNE',     '2025-06-01', 'DEVELOPMENTAL LEVY 2025',             'Credit', 300   from vendors where vendor_id='V13';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUNE',     '2025-06-01', 'BUSINESS PREMISES 2025',              'Credit', 5000  from vendors where vendor_id='V13';

-- TRANSACTIONS — RRBN
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUN', '2025-06-01', 'OUTSTANDING BALANCE TILL 2025', 'Credit', 150000 from vendors where vendor_id='V15';

-- TRANSACTIONS — MR ABDULSAMAD REAGENT
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCT', '2024-10-31', 'ELECTROLYTE REAGENT BALANCE 2024', 'Credit', 460000 from vendors where vendor_id='V16';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCT', '2024-10-31', 'Payment',                          'Debit',  410000 from vendors where vendor_id='V16';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCT', '2024-10-31', 'Payment — balance',                'Debit',  50000  from vendors where vendor_id='V16';

-- TRANSACTIONS — EROM (major ongoing vendor)
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MARCH',     '2025-03-31', 'MARCH 2025 OUTSTANDING ILASA',   'Credit', 191120 from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MARCH',     '2025-03-31', 'Payment — ILASA',                'Debit',  174020 from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MARCH',     '2025-03-31', 'MARCH 2025 OUTSTANDING AVENUE',  'Credit', 96600  from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MARCH',     '2025-03-31', 'Payment — AVENUE',               'Debit',  96600  from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'APRIL',     '2025-04-30', 'APRIL 2025 BILL ILASA',          'Credit', 178180 from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'APRIL',     '2025-04-30', 'Payment — ILASA',                'Debit',  178180 from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'APRIL',     '2025-04-30', 'APRIL 2025 BILL AVENUE',         'Credit', 105420 from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'APRIL',     '2025-04-30', 'Payment — AVENUE partial',       'Debit',  34360  from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MAY',       '2025-05-31', 'MAY 2025 BILL ILASA',            'Credit', 140790 from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MAY',       '2025-05-31', 'MAY 2025 BILL AVENUE',           'Credit', 112980 from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUNE',      '2025-06-30', 'JUNE 2025 BILL ILASA',           'Credit', 167160 from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUNE',      '2025-06-30', 'JUNE 2025 BILL AVENUE',          'Credit', 80640  from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JULY',      '2025-07-31', 'JULY 2025 BILL ILASA',           'Credit', 497070 from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JULY',      '2025-07-31', 'JULY 2025 BILL AVENUE',          'Credit', 56330  from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'AUGUST',    '2025-08-31', 'AUGUST 2025 BILL ILASA',         'Credit', 252420 from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'AUGUST',    '2025-08-31', 'AUGUST 2025 BILL AVENUE',        'Credit', 55650  from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'SEPTEMBER', '2025-09-30', 'SEPT 2025 BILL ILASA',           'Credit', 347340 from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'SEPTEMBER', '2025-09-30', 'SEPT 2025 BILL AVENUE',          'Credit', 99400  from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCTOBER',   '2025-10-24', 'OCT 2025 BILL ILASA',            'Credit', 230120 from vendors where vendor_id='V17';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCTOBER',   '2025-10-24', 'OCT 2025 BILL AVENUE',           'Credit', 40320  from vendors where vendor_id='V17';

-- TRANSACTIONS — RENT
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'APR', '2025-04-30', 'ILASA RENT',       'Credit', 1600000 from vendors where vendor_id='V18';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'APR', '2025-04-30', 'Payment — ILASA',  'Debit',  1000000 from vendors where vendor_id='V18';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'APR', '2025-04-30', 'PALM AVE RENT',    'Credit', 550000  from vendors where vendor_id='V18';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'APR', '2025-04-30', 'Payment — AVENUE', 'Debit',  450000  from vendors where vendor_id='V18';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUN', '2025-06-02', 'Payment — AVENUE BAL', 'Debit', 100000 from vendors where vendor_id='V18';

-- TRANSACTIONS — NNRA (target balance: ₦200,000)
-- Opening balance 14,000 debit+credit cancel — only seed the actual outstanding bill
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JULY', '2025-03-07', 'Authorization Fees 2025', 'Credit', 200000 from vendors where vendor_id='V20';

-- TRANSACTIONS — MD'S LOAN (most significant)
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'DEC', '2022-01-01', 'OPERATIONAL COST SUPPORT AT VARIOUS TIMES UPTO 2022',                                                                    'Credit', 6700000  from vendors where vendor_id='V22';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'DEC', '2023-12-31', 'HEFEMAA PREPARATION, SOLAR INVERTER/CCTV/ETC, OTHERS: SMALL EQUIPMENT',                                                   'Credit', 3380000  from vendors where vendor_id='V22';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'DEC', '2024-12-31', 'RENOVATION & UPGRADE; XRAY MACHINE; ILASA ACCOM; PAYROLL; FUJI DIGITISER; STAFF GIFTS; HAEMATOLOGY REAGENT; SCAN MACHINE', 'Credit', 27750000 from vendors where vendor_id='V22';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JAN', '2025-01-31', 'SUPPORT OPERATIONS',                                                                                                       'Credit', 200000   from vendors where vendor_id='V22';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'APR', '2025-04-30', 'SUPPORT PAYROLL',                                                                                                          'Credit', 300000   from vendors where vendor_id='V22';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MAY', '2025-05-20', 'REPAIR OF CHEMISTRY ANALYZER',                                                                                             'Credit', 500000   from vendors where vendor_id='V22';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUN', '2025-06-05', 'PALM AVE RENT & HEFAMMA PAYMENTS',                                                                                         'Credit', 800000   from vendors where vendor_id='V22';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUN', '2025-06-18', 'TOWARDS HEFAMMA PAYMENTS',                                                                                                 'Credit', 200000   from vendors where vendor_id='V22';

-- TRANSACTIONS — MANI VENTURES
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JANUARY', '2025-01-01', 'REPAIR OF HAEMATOLOGY MACHINE BOARD', 'Credit', 700000 from vendors where vendor_id='V23';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JANUARY', '2025-01-01', 'Payment',                              'Debit',  400000 from vendors where vendor_id='V23';

-- TRANSACTIONS — OLUWARANTI
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'FEB',  '2025-02-03', 'AVENUE LAB FRIDGE',      'Credit', 145000 from vendors where vendor_id='V24';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'FEB',  '2025-02-03', 'Payment',                'Debit',  145000 from vendors where vendor_id='V24';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MAY',  '2025-05-05', 'NNRA RSA PAYMENT',       'Credit', 150000 from vendors where vendor_id='V24';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MAY',  '2025-05-05', 'Payment',                'Debit',  150000 from vendors where vendor_id='V24';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUNE', '2025-05-06', 'HSG APPARATUS',          'Credit', 95500  from vendors where vendor_id='V24';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JUNE', '2025-05-06', 'Payment',                'Debit',  95500  from vendors where vendor_id='V24';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCT',  '2025-05-10', 'IKEJA ACCRUED EXPENSES', 'Credit', 88000  from vendors where vendor_id='V24';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCT',  '2025-05-10', 'Credit note/adjustment', 'Credit', 3000   from vendors where vendor_id='V24';

-- TRANSACTIONS — HOPESTONE
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'SEPTEMBER', '2025-09-30', 'SEPT 2025 BILL ILASA',   'Credit', 91000  from vendors where vendor_id='V25';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'SEPTEMBER', '2025-09-30', 'SEPT 2025 BILL AVENUE',  'Credit', 18480  from vendors where vendor_id='V25';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCTOBER',   '2025-10-24', 'OCT 2025 BILL AVENUE',   'Credit', 56700  from vendors where vendor_id='V25';

-- TRANSACTIONS — MR SAMUEL
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'DEC', '2024-02-23', 'CLOCKIN TIMER & CCTV BAL (AVENUE)', 'Credit', 30000 from vendors where vendor_id='V26';

-- TRANSACTIONS — DOMESTIC LAWMA
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCTOBER',   '2025-10-24', '2025 SEPT-OCTOBER BILL',      'Credit', 10000 from vendors where vendor_id='V12';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'OCTOBER',   '2025-10-24', 'Payment',                      'Debit',  10000 from vendors where vendor_id='V12';
insert into vendor_transactions (vendor_id, txn_month, txn_date, doc_ref, details, txn_type, amount)
select id, 'OCTOBER',   '2025-10-28', 'EXCESSMISTAKENLYPAID', 'NOVEMBER 2025-FEB 2026 PREPAYMENT', 'Debit', 20000 from vendors where vendor_id='V12';

-- TRANSACTIONS — SHAS WORLD GLOBAL ENTERPRISES (target balance: ₦0)
insert into vendor_transactions (vendor_id, txn_month, txn_date, doc_ref, details, txn_type, amount)
select id, 'MARCH',   '2023-09-03', 'INV01048', 'REPAIR/SERVICE OF MICROSCOPE, LENSE, BUCKET AND HAEMATOCRITE CENTRIFUGE', 'Credit', 135000 from vendors where vendor_id='V6';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'MARCH',   '2023-09-03', 'Payment — partial',     'Debit',  70000 from vendors where vendor_id='V6';
insert into vendor_transactions (vendor_id, txn_month, txn_date, details, txn_type, amount)
select id, 'JANUARY', '2025-01-01', 'Payment — balance',     'Debit',  65000 from vendors where vendor_id='V6';

-- ============================================================
-- STANDARDISE BRANCH VALUES to official branch names
-- ============================================================
update vendors set branch = 'Ilasa'        where branch ilike '%ilasa%' and branch not ilike '%palm%' and branch not ilike '%avenue%';
update vendors set branch = 'Palm Avenue'  where branch ilike '%palm%' or branch ilike '%avenue%' and branch not ilike '%ilasa%';
update vendors set branch = 'All Locations' where branch ilike '%ilasa%' and (branch ilike '%palm%' or branch ilike '%avenue%');
update vendors set branch = 'All Locations' where vendor_id in ('V2','V3','V6','V7','V9','V19','V22');
update vendors set branch = 'Ilesha'       where branch ilike '%ilesa%' or branch ilike '%ilesha%';
update vendors set branch = 'Ikeja'        where branch ilike '%ikeja%';
