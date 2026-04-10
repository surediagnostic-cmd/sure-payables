import { useState, useMemo } from 'react'
import { fmt, fmtShort, toCSV, triggerDownload, BRANCHES } from '../lib/helpers.jsx'
import DownloadMenu from './DownloadMenu.jsx'

export default function PaymentLog({ data, onAddPayment }) {
  const [branch, setBranch] = useState('')
  const [vendor, setVendor] = useState('')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState({})

  const vendors = useMemo(() => [...new Set(data.payables.map(p=>p.supplier).filter(Boolean))].sort(), [data.payables])

  const filtered = useMemo(() => data.payments.filter(pm => {
    const pay = pm.payables
    if (branch && pay?.branch !== branch) return false
    if (vendor && pay?.supplier !== vendor) return false
    if (search && !pay?.description?.toLowerCase().includes(search.toLowerCase()) && !(pm.reference||'').toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [data.payments, branch, vendor, search])

  // Group by vendor
  const grouped = useMemo(() => {
    const map = {}
    filtered.forEach(pm => {
      const key = pm.payables?.supplier || '(No Vendor)'
      if (!map[key]) map[key] = []
      map[key].push(pm)
    })
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b))
  }, [filtered])

  const toggle = (v) => setCollapsed(c => ({ ...c, [v]: !c[v] }))
  const today  = new Date().toISOString().split('T')[0]

  function dl() {
    const rows=[['Date','Item','Branch','Vendor','Amount (N)','Method','Bank','Reference','By']]
    filtered.forEach(pm=>{const pay=pm.payables;rows.push([pm.payment_date,pay?.description||'',pay?.branch||'',pay?.supplier||'',pm.amount,pm.method,pm.bank,pm.reference||'',pm.recorded_by])})
    triggerDownload(toCSV(rows),`sure_payments_${today}.csv`)
  }

  const totalPaid = filtered.reduce((s,pm)=>s+Number(pm.amount),0)

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Payment Log</h1>
        <div className="section-actions">
          <DownloadMenu items={[{label:'📄 CSV — Payment Log',fn:dl}]} />
          <button className="btn btn-primary" onClick={onAddPayment}>+ Record Payment</button>
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
        <input className="search-input" placeholder="Search payments…" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      {filtered.length > 0 && (
        <div style={{marginBottom:12,fontSize:12,color:'var(--text-muted)'}}>
          {filtered.length} payment{filtered.length!==1?'s':''} · total paid: <strong style={{color:'var(--green)'}}>{fmtShort(totalPaid)}</strong>
        </div>
      )}

      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Date</th><th>Item</th><th>Branch</th><th>Amount (₦)</th>
              <th>Method</th><th>Bank</th><th>Reference</th><th>By</th>
            </tr></thead>
            <tbody>
              {grouped.length===0
                ? <tr><td colSpan={8}><div className="empty"><div className="empty-icon">💳</div><div className="empty-text">No payments recorded yet</div></div></td></tr>
                : grouped.map(([vendorName, rows]) => {
                    const isOpen = !collapsed[vendorName]
                    const groupTotal = rows.reduce((s,pm)=>s+Number(pm.amount),0)
                    return [
                      <tr key={`g_${vendorName}`} className="group-row" onClick={()=>toggle(vendorName)}>
                        <td colSpan={8}>
                          <em className={`group-chevron ${isOpen?'open':''}`}>▶</em>
                          <strong>{vendorName}</strong>
                          <span className="group-summary">{rows.length} payment{rows.length!==1?'s':''} · {fmtShort(groupTotal)} paid</span>
                        </td>
                      </tr>,
                      ...(isOpen ? rows.map(pm => {
                        const pay = pm.payables
                        return (
                          <tr key={pm.id}>
                            <td className="mono">{pm.payment_date}</td>
                            <td>
                              <div style={{fontWeight:600,fontSize:12}}>{pay?.description||'—'}</div>
                              {pay?.branch && <span className="badge badge-navy" style={{fontSize:9,marginTop:2}}>{pay.branch}</span>}
                            </td>
                            <td style={{fontSize:11,color:'var(--text-muted)'}}>{pay?.branch||'—'}</td>
                            <td className="mono" style={{fontWeight:700,color:'var(--green)'}}>{fmt(pm.amount)}</td>
                            <td style={{fontSize:11}}>{pm.method}</td>
                            <td style={{fontSize:11}}>{pm.bank}</td>
                            <td style={{fontSize:11,color:'var(--text-muted)'}}>{pm.reference||'—'}</td>
                            <td style={{fontSize:11}}>{pm.recorded_by}</td>
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
