import { useState, useMemo } from 'react'
import { fmt, fmtShort, getDaysOverdue, ageBand, toCSV, triggerDownload, BRANCHES, MONTHS_SHORT } from '../lib/helpers.jsx'
import DownloadMenu from './DownloadMenu.jsx'

export default function AgingReport({ data }) {
  const [branch, setBranch] = useState('')
  const [vendor, setVendor] = useState('')
  const vendors = useMemo(() => [...new Set(data.payables.map(p=>p.supplier).filter(Boolean))].sort(), [data.payables])

  // Combine regular payables + loan entries (same logic as PayablesRegister)
  const allRows = useMemo(() => {
    const regular = data.payables.filter(p => p.outstanding > 0).map(p => ({ ...p }))
    const lenderRepaid = {}
    data.loanEntries.filter(l=>l.entry_type==='Repayment').forEach(l => {
      lenderRepaid[l.source] = (lenderRepaid[l.source]||0) + Number(l.amount)
    })
    let lenderRemaining = { ...lenderRepaid }
    const drawdowns = [...data.loanEntries].filter(l=>l.entry_type==='Drawdown')
      .sort((a,b) => {
        const ya=parseInt(String(a.entry_year).split('/')[0])||0
        const yb=parseInt(String(b.entry_year).split('/')[0])||0
        if(ya!==yb) return ya-yb
        return MONTHS_SHORT.indexOf(a.entry_month||'JAN') - MONTHS_SHORT.indexOf(b.entry_month||'JAN')
      })
    const loanRows = drawdowns.map(l => {
      const lender=l.source||'DR ADENIRAN', amount=Number(l.amount)
      const repaid=Math.min(amount,lenderRemaining[lender]||0)
      lenderRemaining[lender]=Math.max(0,(lenderRemaining[lender]||0)-repaid)
      const outstanding=Math.max(0,amount-repaid)
      return { id:l.id, description:l.notes||`Loan ${l.entry_year}`, branch:l.location||'—',
        category:'MD Loan', supplier:lender, outstanding, due_date:null }
    }).filter(l=>l.outstanding>0)
    return [...regular, ...loanRows]
  }, [data.payables, data.loanEntries])

  const outstanding = useMemo(() => allRows.filter(p => {
    if (branch && p.branch !== branch) return false
    if (vendor && p.supplier !== vendor) return false
    return true
  }), [allRows, branch, vendor])

  const bands = { nd:[], d30:[], d60:[], d90:[] }
  outstanding.forEach(p => {
    const d = getDaysOverdue(p.due_date)||0
    if (d<=0) bands.nd.push(p)
    else if(d<=30) bands.d30.push(p)
    else if(d<=60) bands.d60.push(p)
    else bands.d90.push(p)
  })
  const sum = arr => arr.reduce((s,p)=>s+Number(p.outstanding),0)
  const sorted = [...outstanding].sort((a,b)=>(getDaysOverdue(b.due_date)||0)-(getDaysOverdue(a.due_date)||0))

  function dl() {
    const rows=[['Item','Branch','Category','Vendor','Outstanding (N)','Due Date','Days Overdue','Age Band']]
    sorted.forEach(p=>{const d=getDaysOverdue(p.due_date)||0;const ab=ageBand(d);rows.push([p.description,p.branch,p.category,p.supplier||'',p.outstanding,p.due_date||'',d>0?d:'Not due',ab.label])})
    triggerDownload(toCSV(rows),`sure_aging_${new Date().toISOString().split('T')[0]}.csv`)
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Aging Report</h1>
        <div className="section-actions">
          <span style={{fontSize:11,color:'var(--text-muted)'}}>As at {new Date().toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}</span>
          <DownloadMenu items={[{label:'📄 CSV — Aging Report',fn:dl}]} />
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

      <div className="aging-row">
        {[
          {label:'Not Yet Due',  color:'var(--green)',  data:bands.nd},
          {label:'1–30 Days',   color:'var(--amber)',  data:bands.d30},
          {label:'31–60 Days',  color:'var(--brand-orange)', data:bands.d60},
          {label:'60+ Days',    color:'var(--red)',    data:bands.d90},
        ].map(b => (
          <div key={b.label} className="aging-card">
            <div className="aging-band" style={{color:b.color}}>{b.label}</div>
            <div className="aging-amount">{fmtShort(sum(b.data))}</div>
            <div className="aging-count">{b.data.length} items</div>
          </div>
        ))}
      </div>

      <div className="table-card">
        <div className="table-header"><span className="table-title">All Outstanding by Age</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Item</th><th>Branch</th><th>Category</th><th>Vendor</th>
              <th>Outstanding (₦)</th><th>Due Date</th><th>Days Overdue</th><th>Age Band</th>
            </tr></thead>
            <tbody>
              {sorted.length===0
                ? <tr><td colSpan={8}><div className="empty"><div className="empty-icon">🎉</div><div className="empty-text">No outstanding payables</div></div></td></tr>
                : sorted.map(p=>{const days=getDaysOverdue(p.due_date)||0;const ab=ageBand(days);return(
                  <tr key={p.id}>
                    <td><strong style={{fontSize:12}}>{p.description}</strong></td>
                    <td><span className="badge badge-navy">{p.branch}</span></td>
                    <td style={{fontSize:11,color:'var(--text-muted)'}}>{p.category}</td>
                    <td style={{fontSize:11,color:'var(--text-muted)'}}>{p.supplier||'—'}</td>
                    <td className="mono" style={{fontWeight:700,color:'var(--red)'}}>{fmt(p.outstanding)}</td>
                    <td className="mono">{p.due_date||'—'}</td>
                    <td className="mono" style={{color:days>0?'var(--red)':'var(--green)'}}>{days>0?`${days} days`:'Not due'}</td>
                    <td><span className={`badge ${ab.cls}`}>{ab.label}</span></td>
                  </tr>
                )})
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
