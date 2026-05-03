import { useMemo } from 'react'
import { fmt, fmtShort, toCSV, triggerDownload } from '../lib/helpers.jsx'

export default function AgingReport({ data, onSelectVendor }) {
  // Aging here = how long vendor has had outstanding balance
  // Based on last transaction date vs today
  const now = new Date(); now.setHours(0,0,0,0)

  const outstanding = useMemo(() =>
    data.vendors.filter(v => Number(v.balance) > 0).map(v => {
      const lastDate = v.last_txn_date ? new Date(v.last_txn_date) : null
      const days = lastDate ? Math.floor((now - lastDate) / 86400000) : null
      return { ...v, days_since_last_txn: days }
    }).sort((a,b) => (b.days_since_last_txn||0) - (a.days_since_last_txn||0))
  , [data.vendors])

  function band(days) {
    if (days === null) return { label:'Unknown', cls:'badge-slate', color:'var(--text-3)' }
    if (days <= 30)    return { label:'0–30 Days',  cls:'badge-green',  color:'var(--green)' }
    if (days <= 60)    return { label:'31–60 Days', cls:'badge-amber',  color:'var(--amber)' }
    if (days <= 90)    return { label:'61–90 Days', cls:'badge-orange', color:'var(--brand)' }
    return                    { label:'90+ Days',   cls:'badge-red',    color:'var(--red)' }
  }

  const bands = [
    { label:'0–30 Days',  color:'var(--green)',  items: outstanding.filter(v=>(v.days_since_last_txn||0)<=30) },
    { label:'31–60 Days', color:'var(--amber)',  items: outstanding.filter(v=>v.days_since_last_txn>30&&v.days_since_last_txn<=60) },
    { label:'61–90 Days', color:'var(--brand)',  items: outstanding.filter(v=>v.days_since_last_txn>60&&v.days_since_last_txn<=90) },
    { label:'90+ Days',   color:'var(--red)',    items: outstanding.filter(v=>v.days_since_last_txn>90||(v.days_since_last_txn===null)) },
  ]
  const sum = arr => arr.reduce((s,v)=>s+Number(v.balance),0)

  const today = new Date().toISOString().split('T')[0]
  function dl() {
    const rows=[['Vendor','Type','Branch','Balance (N)','Last Transaction','Days Since Last Txn','Age Band']]
    outstanding.forEach(v=>{
      const b=band(v.days_since_last_txn)
      rows.push([v.name,v.vendor_type,v.branch||'',v.balance,v.last_txn_date||'',v.days_since_last_txn??'Unknown',b.label])
    })
    triggerDownload(toCSV(rows), `sure_aging_${today}.csv`)
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Aging Report</h1>
        <div className="section-actions">
          <span style={{fontSize:11,color:'var(--text-3)'}}>
            As at {new Date().toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}
          </span>
          <button className="btn btn-green" onClick={dl}>⬇ Export CSV</button>
        </div>
      </div>

      <div style={{fontSize:12,color:'var(--text-3)',marginBottom:12,background:'var(--bg-thead)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'8px 12px'}}>
        ℹ️ Age bands are based on <strong>days since last transaction</strong> per vendor with an outstanding balance.
      </div>

      <div className="aging-cards">
        {bands.map(b => (
          <div key={b.label} className="aging-card">
            <div className="ag-band" style={{color:b.color}}>{b.label}</div>
            <div className="ag-amount">{fmtShort(sum(b.items))}</div>
            <div className="ag-count">{b.items.length} vendor{b.items.length!==1?'s':''}</div>
          </div>
        ))}
      </div>

      <div className="table-card">
        <div className="table-header">
          <span className="table-title">Outstanding Vendors by Age</span>
          <span style={{fontSize:11,color:'var(--text-3)'}}>{outstanding.length} vendor{outstanding.length!==1?'s':''} outstanding</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Vendor</th><th>Type</th><th>Branch</th>
              <th style={{textAlign:'right'}}>Balance (₦)</th>
              <th>Last Transaction</th><th>Days Since</th><th>Age Band</th><th></th>
            </tr></thead>
            <tbody>
              {outstanding.length === 0
                ? <tr><td colSpan={8}><div className="empty"><div className="empty-icon">🎉</div><div className="empty-text">No outstanding balances</div></div></td></tr>
                : outstanding.map(v => {
                    const b = band(v.days_since_last_txn)
                    return (
                      <tr key={v.id} style={{cursor:'pointer'}} onClick={() => onSelectVendor(v)}>
                        <td><strong style={{fontSize:12}}>{v.name}</strong><div style={{fontSize:10,color:'var(--text-4)'}}>{v.vendor_id}</div></td>
                        <td><span className="badge badge-slate">{v.vendor_type}</span></td>
                        <td style={{fontSize:11,color:'var(--text-3)'}}>{v.branch||'—'}</td>
                        <td className="mono" style={{textAlign:'right',fontWeight:700,color:'var(--red)'}}>{fmt(v.balance)}</td>
                        <td className="mono" style={{fontSize:11}}>{v.last_txn_date||'—'}</td>
                        <td className="mono" style={{color:b.color}}>{v.days_since_last_txn !== null ? `${v.days_since_last_txn}d` : '—'}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td><button className="btn btn-ghost btn-xs">View →</button></td>
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
