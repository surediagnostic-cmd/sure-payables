import { useState, useMemo } from 'react'
import { fmt, fmtShort, balanceStatus, toCSV, triggerDownload, VENDOR_TYPES, BRANCHES } from '../lib/helpers.jsx'
import DownloadMenu from './DownloadMenu.jsx'

export default function VendorSummary({ data, onSelectVendor, onAddVendor, onEditVendor, onDeleteVendor }) {
  const [search,   setSearch]   = useState('')
  const [type,     setType]     = useState('')
  const [branch,   setBranch]   = useState('')
  const [status,   setStatus]   = useState('')
  const [viewMode, setViewMode] = useState('card')

  const vendors = useMemo(() => data.vendors.filter(v => {
    if (search && !v.name.toLowerCase().includes(search.toLowerCase())) return false
    if (type   && v.vendor_type !== type) return false
    if (branch && v.branch !== branch && v.branch) return false  // null branch always shown
    if (status === 'owed'   && Number(v.balance) <= 0) return false
    if (status === 'clear'  && Number(v.balance) !== 0) return false
    if (status === 'credit' && Number(v.balance) >= 0) return false
    return true
  }), [data.vendors, search, type, branch, status])

  const totalOwed   = vendors.reduce((s,v) => s + Math.max(0, Number(v.balance)), 0)
  const totalCredit = vendors.reduce((s,v) => s + Math.min(0, Number(v.balance)), 0)
  const tradeOwed   = vendors.filter(v=>v.vendor_type==='Trade Payable').reduce((s,v)=>s+Math.max(0,Number(v.balance)),0)
  const otherOwed   = vendors.filter(v=>v.vendor_type==='Other Payables').reduce((s,v)=>s+Math.max(0,Number(v.balance)),0)
  const mdLoan      = data.vendors.find(v=>v.name.includes("MD'S LOAN")||v.name.includes("MD LOAN"))

  const today = new Date().toISOString().split('T')[0]
  function dl() {
    const rows=[['ID','Name','Type','Branch','Invoiced (N)','Paid (N)','Balance (N)','Status','Last Txn']]
    vendors.forEach(v=>{
      const st=Number(v.balance)>0?'Owed':Number(v.balance)<0?'Credit Balance':'Settled'
      rows.push([v.vendor_id,v.name,v.vendor_type,v.branch||'',v.total_credits,v.total_debits,v.balance,st,v.last_txn_date||''])
    })
    triggerDownload(toCSV(rows),`sure_payables_summary_${today}.csv`)
  }

  const ToggleBtn = ({mode, label}) => (
    <button onClick={()=>setViewMode(mode)} style={{
      padding:'6px 12px', fontSize:12, cursor:'pointer', border:'none',
      fontFamily:'Outfit,sans-serif', transition:'all .15s',
      background:viewMode===mode?'var(--navy)':'var(--bg-card)',
      color:viewMode===mode?'white':'var(--text-3)',
    }}>{label}</button>
  )

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Vendor Payables</h1>
        <div className="section-actions">
          <DownloadMenu items={[{label:'📄 CSV — Vendor List', fn:dl}]} />
          <button className="btn btn-primary" onClick={onAddVendor}>+ Add Vendor</button>
        </div>
      </div>

      {/* KPI stats */}
      <div className="cards-row">
        <div className="stat-card red">
          <div className="stat-label">Total Outstanding</div>
          <div className="stat-value">{fmtShort(totalOwed)}</div>
          <div className="stat-sub">{vendors.filter(v=>Number(v.balance)>0).length} vendors owing</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Trade Payables</div>
          <div className="stat-value">{fmtShort(tradeOwed)}</div>
          <div className="stat-sub">suppliers &amp; vendors</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">Other Payables</div>
          <div className="stat-value">{fmtShort(otherOwed)}</div>
          <div className="stat-sub">regulatory, utilities etc</div>
        </div>
        <div className="stat-card navy">
          <div className="stat-label">MD Loan Balance</div>
          <div className="stat-value">{fmtShort(Math.max(0,Number(mdLoan?.balance||0)))}</div>
          <div className="stat-sub">director loan account</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Settled Vendors</div>
          <div className="stat-value">{vendors.filter(v=>Number(v.balance)===0).length}</div>
          <div className="stat-sub">zero balance</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Credit Balances</div>
          <div className="stat-value">{fmtShort(Math.abs(totalCredit))}</div>
          <div className="stat-sub">{vendors.filter(v=>Number(v.balance)<0).length} overpaid</div>
        </div>
      </div>

      {/* Filters + view toggle row */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10,marginBottom:10}}>
        <div className="filters" style={{marginBottom:0,flex:1,minWidth:0}}>
          <input className="search-input" placeholder="Search vendors…" value={search} onChange={e=>setSearch(e.target.value)} />
          <select className="filter-select" value={branch} onChange={e=>setBranch(e.target.value)}>
            <option value="">All Branches</option>
            {BRANCHES.map(b=><option key={b}>{b}</option>)}
          </select>
          <select className="filter-select" value={type} onChange={e=>setType(e.target.value)}>
            <option value="">All Types</option>
            {VENDOR_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
          <select className="filter-select" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="owed">Outstanding</option>
            <option value="clear">Settled</option>
            <option value="credit">Credit Balance</option>
          </select>
        </div>
        <div style={{display:'flex',border:'1px solid var(--border-2)',borderRadius:'var(--r-sm)',overflow:'hidden',flexShrink:0}}>
          <ToggleBtn mode="card" label="⊞ Cards" />
          <ToggleBtn mode="list" label="☰ List" />
        </div>
      </div>

      <div style={{fontSize:11,color:'var(--text-4)',marginBottom:12}}>
        {vendors.length} of {data.vendors.length} vendors
        {branch && <> · <strong style={{color:'var(--navy)'}}>{branch}</strong></>}
        {status==='owed' && <> · <strong style={{color:'var(--red)'}}>Outstanding only</strong></>}
      </div>

      {/* CARD VIEW */}
      {viewMode==='card' && (
        <div className="vendor-grid">
          {vendors.length===0
            ? <div style={{gridColumn:'1/-1'}}><div className="empty"><div className="empty-icon">🏪</div><div className="empty-text">No vendors found</div></div></div>
            : vendors.map(v=>{
                const bal=Number(v.balance), st=balanceStatus(bal)
                return (
                  <div key={v.id} className={`vendor-card ${st}`} style={{position:'relative'}}>
                    {/* Edit/Delete — stop propagation so click doesn't open ledger */}
                    <div style={{position:'absolute',top:8,right:8,display:'flex',gap:2}} onClick={e=>e.stopPropagation()}>
                      <button className="btn btn-ghost btn-xs" style={{padding:'2px 6px'}} onClick={()=>onEditVendor(v)}>✏️</button>
                      <button className="btn btn-ghost btn-xs" style={{padding:'2px 6px',color:'var(--red)'}} onClick={()=>onDeleteVendor(v)}>🗑️</button>
                    </div>
                    <div onClick={()=>onSelectVendor(v)} style={{cursor:'pointer'}}>
                      <div className="vc-name" style={{paddingRight:52}}>{v.name}</div>
                      <div className="vc-type">{v.vendor_id} · {v.vendor_type}</div>
                      <div className={`vc-bal ${st}`} style={{marginTop:8}}>
                        {bal<0?`(${fmtShort(Math.abs(bal))}) CR`:fmtShort(bal)}
                      </div>
                      <div className="vc-meta">
                        {v.branch&&<span>📍 {v.branch}</span>}
                        <span>{v.txn_count} txn{v.txn_count!==1?'s':''}</span>
                        {v.last_txn_date&&<span>Last: {v.last_txn_date}</span>}
                      </div>
                    </div>
                  </div>
                )
              })
          }
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode==='list' && (
        <div className="table-card">
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>ID</th><th>Name</th><th>Type</th><th>Branch</th>
                <th style={{textAlign:'right'}}>Invoiced (₦)</th>
                <th style={{textAlign:'right'}}>Paid (₦)</th>
                <th style={{textAlign:'right'}}>Balance (₦)</th>
                <th>Last Txn</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {vendors.length===0
                  ? <tr><td colSpan={10}><div className="empty"><div className="empty-icon">🏪</div><div className="empty-text">No vendors found</div></div></td></tr>
                  : vendors.map(v=>{
                      const bal=Number(v.balance)
                      const statusLabel=bal>0?'Outstanding':bal<0?'Credit':'Settled'
                      const statusCls=bal>0?'badge-red':bal<0?'badge-blue':'badge-green'
                      return (
                        <tr key={v.id}>
                          <td className="mono" style={{color:'var(--text-4)',fontSize:11}}>{v.vendor_id}</td>
                          <td>
                            <span style={{fontWeight:700,fontSize:12,cursor:'pointer',color:'var(--navy)'}}
                              onClick={()=>onSelectVendor(v)}>{v.name}</span>
                          </td>
                          <td><span className="badge badge-slate" style={{fontSize:9}}>{v.vendor_type}</span></td>
                          <td style={{fontSize:11,color:'var(--text-3)'}}>{v.branch||'—'}</td>
                          <td className="mono" style={{textAlign:'right'}}>{fmt(v.total_credits)}</td>
                          <td className="mono" style={{textAlign:'right',color:'var(--green)'}}>{fmt(v.total_debits)}</td>
                          <td className="mono" style={{textAlign:'right',fontWeight:700,
                            color:bal>0?'var(--red)':bal<0?'var(--blue)':'var(--green)'}}>
                            {bal<0?`(${fmt(Math.abs(bal))}) CR`:fmt(bal)}
                          </td>
                          <td className="mono" style={{fontSize:11}}>{v.last_txn_date||'—'}</td>
                          <td><span className={`badge ${statusCls}`}>{statusLabel}</span></td>
                          <td>
                            <div style={{display:'flex',gap:3}}>
                              <button className="btn btn-ghost btn-xs" onClick={()=>onSelectVendor(v)}>View →</button>
                              <button className="btn btn-ghost btn-xs" onClick={()=>onEditVendor(v)}>✏️</button>
                              <button className="btn btn-ghost btn-xs" style={{color:'var(--red)'}} onClick={()=>onDeleteVendor(v)}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
