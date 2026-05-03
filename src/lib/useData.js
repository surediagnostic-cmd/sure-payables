import { useState, useCallback } from 'react'
import { supabase } from './supabase.js'

export function useData() {
  const [data, setData]     = useState({ vendors: [], planEntries: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [v, rp] = await Promise.all([
        supabase.from('vendor_balances').select('*').order('name'),
        supabase.from('repayment_plan_status').select('*').order('scheduled_month'),
      ])
      if (v.error)  throw v.error
      if (rp.error) throw rp.error
      setData({ vendors: v.data||[], planEntries: rp.data||[] })
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

// Load MD loan balance broken down by branch from raw transactions
export async function loadMdLoanByBranch(vendorId) {
  const { data, error } = await supabase
    .from('vendor_transactions')
    .select('branch, txn_type, amount')
    .eq('vendor_id', vendorId)
  if (error) throw error
  const rows = data || []
  // Group by branch
  const map = {}
  rows.forEach(t => {
    const b = t.branch || '(Unassigned)'
    if (!map[b]) map[b] = { credits: 0, debits: 0 }
    if (t.txn_type === 'Credit') map[b].credits += Number(t.amount)
    if (t.txn_type === 'Debit')  map[b].debits  += Number(t.amount)
  })
  return Object.entries(map).map(([branch, { credits, debits }]) => ({
    branch,
    balance: credits - debits,
    credits,
    debits,
  })).sort((a,b) => b.balance - a.balance)
}
