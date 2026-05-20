import { useState, useCallback } from 'react'
import { supabase } from './supabase.js'

export function useData() {
  const [data, setData]       = useState({ vendors: [], planEntries: [], loanTotals: null })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [v, rp, lr] = await Promise.all([
        supabase.from('vendor_balances').select('*').order('name'),
        supabase.from('repayment_plan_status').select('*').order('scheduled_month'),
        supabase.from('loan_register').select('loan_id,lender,borrower,principal,interest_rate,repayments_made,status'),
      ])
      if (v.error)  throw v.error
      if (rp.error) throw rp.error
      if (lr.error) throw lr.error

      const loans = lr.data || []
      const accrued  = l => Math.round(Number(l.principal) * Number(l.interest_rate))
      const totalOut = l => Number(l.principal) + accrued(l)
      const balDue   = l => Math.max(0, totalOut(l) - Number(l.repayments_made || 0))

      const loanTotals = {
        totalBalance:    loans.reduce((s,l) => s + balDue(l), 0),
        totalPrincipal:  loans.reduce((s,l) => s + Number(l.principal), 0),
        totalAccrued:    loans.reduce((s,l) => s + accrued(l), 0),
        totalRepaid:     loans.reduce((s,l) => s + Number(l.repayments_made || 0), 0),
        directorBalance: loans.filter(l=>l.lender==='Director').reduce((s,l) => s + balDue(l), 0),
        activeCount:     loans.filter(l=>l.status==='Active').length,
      }

      setData({ vendors: v.data||[], planEntries: rp.data||[], loanTotals })
    } catch(e) { setError(e.message) }
    setLoading(false)
  }, [])

  return { data, loading, error, reload: load }
}

export async function loadVendorLedger(vendorId) {
  const { data, error } = await supabase
    .from('vendor_transactions_with_balance')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('txn_date', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function loadMdLoanByBranch(vendorId) {
  const { data, error } = await supabase
    .from('vendor_transactions')
    .select('branch, txn_type, amount')
    .eq('vendor_id', vendorId)
  if (error) throw error
  const rows = data || []
  const map = {}
  rows.forEach(t => {
    const b = t.branch || '(Unassigned)'
    if (!map[b]) map[b] = { credits: 0, debits: 0 }
    if (t.txn_type === 'Credit') map[b].credits += Number(t.amount)
    if (t.txn_type === 'Debit')  map[b].debits  += Number(t.amount)
  })
  return Object.entries(map).map(([branch, { credits, debits }]) => ({
    branch, balance: credits - debits, credits, debits,
  })).sort((a,b) => b.balance - a.balance)
}
