import { useState, useCallback } from 'react'
import { supabase } from './supabase.js'

export function useData() {
  const [data, setData]     = useState({ payables:[], payments:[], loanEntries:[], planEntries:[] })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [p, pm, l, rp] = await Promise.all([
        supabase.from('payables_with_balance').select('*').order('created_at'),
        supabase.from('payments')
          .select('*, payables(description,branch,supplier,category)')
          .order('payment_date', { ascending:false }),
        supabase.from('loan_running_balance').select('*'),
        supabase.from('repayment_plan_with_status').select('*').order('scheduled_month'),
      ])
      if (p.error)  throw p.error
      if (pm.error) throw pm.error
      if (l.error)  throw l.error
      if (rp.error) throw rp.error
      setData({ payables:p.data||[], payments:pm.data||[], loanEntries:l.data||[], planEntries:rp.data||[] })
    } catch(e) { setError(e.message) }
    setLoading(false)
  }, [])

  return { data, loading, error, reload:load }
}
