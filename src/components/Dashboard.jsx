import { useState, useMemo } from 'react'
import { fmt, fmtShort, getDaysOverdue, ageBand, curMonthLabel, toCSV, triggerDownload, BRANCHES } from '../lib/helpers.jsx'
import DownloadMenu from './DownloadMenu.jsx'

export default function Dashboard({ data, onQuickPay, onAddPayable }) {
  const [branch, setBranch] = useState('')
  const [vendor, setVendor] = useState('')
  const vendors  = useMemo(() => [...new Set(data.payables.map(p=>p.supplier).filter(Boolean))].sort(), [data.payables])
  const curLabel = curMonthLabel()
  const now      = new Date()

  // Combine regular payables + consolidated loan balance as pseudo-payable
  const allRows  = useMemo(() => {
    const regular = data.payables.filter(p => p.category !== 'MD Loan')
    // Aggregate loan entries per lender into a single outstanding balance row each
    const loanByLender = {}
    data.loanEntries.forEach(l => {
      const lender = l.source || 'DR ADENIRAN'
      if (!loanByLender[lender]) loanByLender[lender] = { drawn:0, repaid:0 }
      if (l.entry_type === 'Drawdown')   loanByLender[lender].drawn   += Number(l.amount)
      if (l.entry_type === 'Repayment')  loanByLender[lender].repaid  += Number(l.amount)
    })
    const loanRows = Object.entries(loanByLender).map(([lender, { drawn, repaid }]) => ({
      id: `loan_${lender}`, description: `MD Loan — ${lender}`,
      branch:'All', category:'MD Loan', supplier: lender,
      total_amount: drawn, total_paid: repaid, outstanding: Math.max(0, drawn - repaid),
      status: repaid >= drawn ? 'Paid' : repaid > 0 ? 'Partial' : 'Outstanding',
      due_date: null, notes: 'Consolidated loan balance',
    }))
    return [...regular, ...loanRows]
  }, [data.payables, data.loanEntries])

  const filtered = useMemo(() => allRows.filter(p => {
    if (branch && p.branch !== branch && p.branch !== 'All') return false
    if (vendor && p.supplier !== vendor) return false
    return true
  }), [allRows, branch, vendor])

  const totalOut  = filtered.reduce((s,p) => s + Number(p.outstanding), 0)
  const totalPd   = filtered.reduce((s,p) => s + Number(p.total_paid),  0)
  const totalAmt  = filtered.reduce((s,p) => s + Number(p.total_amount),0)
  const overdue   = filtered.filter(p => p.outstanding>0 && p.due_date && new Date(p.due_date)<now)
  const overdueAmt= overdue.reduce((s,p) => s + Number(p.outstanding), 0)

  const dueThisMonth = data.planEntries.filter(pl => {
    if (pl.scheduled_month !== curLabel) return false
    if (branch && pl.branch !== branch)  return false
    if (vendor && pl.supplier !== vendor) return false
    return true
  })
  const dueAmt = dueThisMonth.reduce((s,pl) => s + Number(pl.planned_amount), 0)

  const urgent = [...filtered].filter(p=>p.outstanding>0)
    .sort((a,b) => (getDaysOverdue(b.due_date)||0) - (getDaysOverdue(a.due_date)||0))
    .slice(0,10)

  function dl() {
    const rows=[['Item','Branch','Category','Vendor','Outstanding (N)','Due Date','Status']]
    filtered.filter(p=>p.outstanding>0).forEach(p=>rows.push([p.description,p.branch,p.category,p.supplier||'',p.outstanding,p.due_date||'',p.status]))
    triggerDownload(toCSV(rows),`sure_dashboard_${new Date().toISOString().split('T')[0]}.csv`)
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Payables Overview</h1>
        <div className="section-actions">
          <DownloadMenu items={[{label:'📄 CSV — Dashboard',fn:dl}]} />
          <button className="btn btn-primary" onClick={onAddPayable}>+ Add Payable</button>
        </div>
      </div>

      <div className="filters">
        <select className="filter-select" value={branch} onChange={e=>setBranch(e.target.value)}>
          <option value="">All Branches</option>
          {BRANCHES.map(b=><option key={b}>{b}</option>)}
        </select>
        <select className="filter-select" value={vendor} onChange={e=>setVendor(e.target.value)}>
          <option value="">All Vendors</option>
          {vendors.map(v=><option key={v}>{v}</option>)}
        </select>
      </div>

      <div className="cards-row">
        <div className="stat-card">
          <div className="stat-label">Total Outstanding</div>
          <div className="stat-value">{fmtShort(totalOut)}</div>
          <div className="stat-sub">{filtered.filter(p=>p.outstanding>0).length} open items</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Overdue</div>
          <div className="stat-value">{fmtShort(overdueAmt)}</div>
          <div className="stat-sub">{overdue.length} item{overdue.length!==1?'s':''} past due</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">Due This Month</div>
          <div className="stat-value">{fmtShort(dueAmt)}</div>
          <div className="stat-sub">{dueThisMonth.length} scheduled ({curLabel})</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Total Paid</div>
          <div className="stat-value">{fmtShort(totalPd)}</div>
          <div className="stat-sub">of {fmtShort(totalAmt)}</div>
        </div>
        <div className="stat-card navy">
          <div className="stat-label">MD Loan Balance</div>
          <div className="stat-value">{fmtShort(filtered.find(p=>p.category==='MD Loan')?.outstanding || 0)}</div>
          <div className="stat-sub">included in outstanding</div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-header">
          <span className="table-title">Urgent — Due & Overdue</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Item</th><th>Branch</th><th>Outstanding</th><th>Due Date</th><th>Age</th><th></th>
            </tr></thead>
            <tbody>
              {urgent.length===0
                ? <tr><td colSpan={6}><div className="empty"><div className="empty-icon">✅</div><div className="empty-text">No urgent items</div></div></td></tr>
                : urgent.map(p=>{
                    const days=getDaysOverdue(p.due_date); const ab=ageBand(days||0)
                    return (
                      <tr key={p.id}>
                        <td><strong style={{fontSize:12}}>{p.description}</strong><div style={{fontSize:10,color:'var(--text-faint)'}}>{p.category}</div></td>
                        <td><span className="badge badge-navy">{p.branch}</span></td>
                        <td className="mono" style={{fontWeight:700,color:'var(--red)'}}>{fmt(p.outstanding)}</td>
                        <td className="mono">{p.due_date||'—'}</td>
                        <td><span className={`badge ${ab.cls}`}>{ab.label}</span></td>
                        <td>{p.outstanding>0 && !p.id?.startsWith('loan_') &&
                          <button className="btn btn-primary btn-sm" onClick={()=>onQuickPay(p.id)}>Pay</button>
                        }</td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
