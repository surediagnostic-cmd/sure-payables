import { useState, useMemo } from 'react'
import { fmt, fmtShort, getDaysOverdue, ageBand, StatusBadge, ProgressBar, toCSV, triggerDownload, BRANCHES, CATEGORIES, MONTHS_SHORT } from '../lib/helpers.jsx'
import DownloadMenu from './DownloadMenu.jsx'

export default function PayablesRegister({ data, onQuickPay, onEdit, onAddPayable }) {
  const [search,  setSearch]  = useState('')
  const [branch,  setBranch]  = useState('')
  const [vendor,  setVendor]  = useState('')
  const [cat,     setCat]     = useState('')
  const [status,  setStatus]  = useState('')
  const [collapsed, setCollapsed] = useState({})  // vendorName -> bool

  const vendors = useMemo(() => [...new Set(data.payables.map(p=>p.supplier).filter(Boolean))].sort(), [data.payables])

  // Build combined list: regular payables + one row per loan event (grouped by lender/year/purpose)
  const allRows = useMemo(() => {
    const regular = data.payables.map(p => ({ ...p, _isLoan: false }))

    // Loan entries: each drawdown = one row; repayments reduce lender balance pool
    const lenderRepaid = {}
    data.loanEntries.filter(l=>l.entry_type==='Repayment').forEach(l => {
      lenderRepaid[l.source] = (lenderRepaid[l.source]||0) + Number(l.amount)
    })

    let lenderRemaining = { ...lenderRepaid }
    // Sort drawdowns oldest first so repayments reduce oldest first
    const drawdowns = [...data.loanEntries].filter(l=>l.entry_type==='Drawdown')
      .sort((a,b) => {
        const ya = parseInt(String(a.entry_year).split('/')[0])||0
        const yb = parseInt(String(b.entry_year).split('/')[0])||0
        if (ya !== yb) return ya - yb
        const ma = MONTHS_SHORT.indexOf(a.entry_month||'JAN')
        const mb = MONTHS_SHORT.indexOf(b.entry_month||'JAN')
        return ma - mb
      })

    const loanRows = drawdowns.map(l => {
      const lender = l.source || 'DR ADENIRAN'
      const amount = Number(l.amount)
      const repaid = Math.min(amount, lenderRemaining[lender] || 0)
      lenderRemaining[lender] = Math.max(0, (lenderRemaining[lender]||0) - repaid)
      const outstanding = Math.max(0, amount - repaid)
      const status = outstanding <= 0 ? 'Paid' : repaid > 0 ? 'Partial' : 'Outstanding'
      return {
        id: l.id,
        description: l.notes || `Loan — ${l.entry_year}${l.entry_month ? ' '+l.entry_month : ''}`,
        branch: l.location || '—',
        category: 'MD Loan',
        supplier: lender,
        total_amount: amount,
        total_paid: repaid,
        outstanding,
        status,
        due_date: null,
        notes: `${l.entry_year}${l.entry_month ? ' '+l.entry_month : ''}`,
        _isLoan: true,
        _loanEntry: l,
      }
    })

    return [...regular, ...loanRows]
  }, [data.payables, data.loanEntries])

  const filtered = useMemo(() => allRows.filter(p => {
    if (search && !p.description.toLowerCase().includes(search.toLowerCase()) && !(p.supplier||'').toLowerCase().includes(search.toLowerCase())) return false
    if (branch && p.branch !== branch) return false
    if (vendor && p.supplier !== vendor) return false
    if (cat    && p.category !== cat)   return false
    if (status && p.status !== status)  return false
    return true
  }), [allRows, search, branch, vendor, cat, status])

  // Group by vendor/supplier
  const grouped = useMemo(() => {
    const map = {}
    filtered.forEach(p => {
      const key = p.supplier || '(No Vendor)'
      if (!map[key]) map[key] = []
      map[key].push(p)
    })
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b))
  }, [filtered])

  function toggleGroup(vendor) {
    setCollapsed(c => ({ ...c, [vendor]: !c[vendor] }))
  }

  const today = new Date().toISOString().split('T')[0]

  function dlAll() {
    const rows=[['Item','Branch','Category','Vendor','Total (N)','Paid (N)','Outstanding (N)','Due Date','Status']]
    allRows.forEach(p=>{rows.push([p.description,p.branch,p.category,p.supplier||'',p.total_amount,p.total_paid,p.outstanding,p.due_date||'',p.status])})
    triggerDownload(toCSV(rows),`sure_payables_${today}.csv`)
  }
  function dlFiltered() {
    const rows=[['Item','Branch','Category','Vendor','Total (N)','Paid (N)','Outstanding (N)','Due Date','Status']]
    filtered.forEach(p=>{rows.push([p.description,p.branch,p.category,p.supplier||'',p.total_amount,p.total_paid,p.outstanding,p.due_date||'',p.status])})
    triggerDownload(toCSV(rows),`sure_payables_filtered_${today}.csv`)
  }

  const openCount = allRows.filter(p=>p.outstanding>0).length

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Payables Register</h1>
        <div className="section-actions">
          <DownloadMenu items={[
            {label:'📄 CSV — All Payables', fn:dlAll},
            {label:'📄 CSV — Current Filter', fn:dlFiltered},
          ]} />
          <button className="btn btn-primary" onClick={onAddPayable}>+ Add Payable</button>
        </div>
      </div>

      <div className="filters">
        <input className="search-input" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="filter-select" value={branch} onChange={e=>setBranch(e.target.value)}>
          <option value="">All Branches</option>
          {BRANCHES.map(b=><option key={b}>{b}</option>)}
        </select>
        <select className="filter-select" value={vendor} onChange={e=>setVendor(e.target.value)}>
          <option value="">All Vendors</option>
          {vendors.map(v=><option key={v}>{v}</option>)}
        </select>
        <select className="filter-select" value={cat} onChange={e=>setCat(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c=><option key={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option>Outstanding</option><option>Partial</option><option>Paid</option>
        </select>
      </div>

      <div className="table-card">
        <div className="table-header">
          <span className="table-title">All Payables — grouped by vendor</span>
          <span style={{fontSize:11,color:'var(--text-muted)'}}>{openCount} open items</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Item / Description</th><th>Branch</th><th>Cat.</th>
              <th>Total (₦)</th><th>Paid (₦)</th><th>Outstanding (₦)</th>
              <th>Due Date</th><th>Progress</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {grouped.length === 0
                ? <tr><td colSpan={10}><div className="empty"><div className="empty-icon">📋</div><div className="empty-text">No payables found</div></div></td></tr>
                : grouped.map(([vendorName, rows]) => {
                    const isOpen = !collapsed[vendorName]
                    const groupOutstanding = rows.reduce((s,p)=>s+Number(p.outstanding),0)
                    const groupTotal       = rows.reduce((s,p)=>s+Number(p.total_amount),0)
                    return [
                      // Group header row
                      <tr key={`g_${vendorName}`} className="group-row" onClick={()=>toggleGroup(vendorName)}>
                        <td colSpan={10}>
                          <em className={`group-chevron ${isOpen?'open':''}`}>▶</em>
                          <strong>{vendorName}</strong>
                          <span className="group-summary">
                            {rows.length} item{rows.length!==1?'s':''} · {fmtShort(groupOutstanding)} outstanding of {fmtShort(groupTotal)}
                          </span>
                        </td>
                      </tr>,
                      // Detail rows
                      ...( isOpen ? rows.map(p => {
                        const pct = p.total_amount > 0 ? (Number(p.total_paid)/Number(p.total_amount))*100 : 0
                        const days = getDaysOverdue(p.due_date)
                        return (
                          <tr key={p.id}>
                            <td>
                              <div style={{fontWeight:600,fontSize:12}}>{p.description}</div>
                              {p.notes && <div style={{fontSize:10,color:'var(--text-faint)'}}>{p.notes}</div>}
                              {p._isLoan && <span className="badge badge-orange" style={{marginTop:2}}>Loan Entry</span>}
                            </td>
                            <td><span className="badge badge-navy" style={{fontSize:10}}>{p.branch}</span></td>
                            <td style={{fontSize:11,color:'var(--text-muted)'}}>{p.category}</td>
                            <td className="mono">{fmt(p.total_amount)}</td>
                            <td className="mono" style={{color:'var(--green)'}}>{fmt(p.total_paid)}</td>
                            <td className="mono" style={{fontWeight:700,color:p.outstanding>0?'var(--red)':'var(--green)'}}>{fmt(p.outstanding)}</td>
                            <td className="mono" style={{fontSize:11}}>
                              {p.due_date || '—'}
                              {days && days > 0 ? <div style={{color:'var(--red)',fontSize:10}}>{days}d overdue</div> : null}
                            </td>
                            <td><ProgressBar pct={pct} /></td>
                            <td><StatusBadge status={p.status} /></td>
                            <td style={{display:'flex',gap:4}}>
                              {p.outstanding > 0 && !p._isLoan &&
                                <button className="btn btn-primary btn-xs" onClick={()=>onQuickPay(p.id)}>Pay</button>
                              }
                              {!p._isLoan &&
                                <button className="btn btn-ghost btn-xs" onClick={()=>onEdit(p)}>✏️</button>
                              }
                            </td>
                          </tr>
                        )
                      }) : [])
                    ]
                  })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
