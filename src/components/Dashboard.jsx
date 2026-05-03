import { useState, useMemo, useEffect } from 'react'
import { fmt, fmtShort, BRANCHES, MONTHS_SHORT, curMonthLabel } from '../lib/helpers.jsx'
import { loadMdLoanByBranch } from '../lib/useData.js'

export default function Dashboard({ data, onSelectVendor }) {
  const [branch, setBranch]         = useState('')
  const [mdByBranch, setMdByBranch] = useState([])  // MD loan breakdown by branch

  const now      = new Date()
  const curLabel = curMonthLabel()
  const months   = MONTHS_SHORT

  // Load MD loan branch breakdown once vendor list is available
  const mdLoan = data.vendors.find(v => v.name.includes("MD'S LOAN") || v.name.includes("MD LOAN"))
  useEffect(() => {
    if (!mdLoan?.id) return
    loadMdLoanByBranch(mdLoan.id).then(setMdByBranch).catch(() => {})
  }, [mdLoan?.id])

  // MD loan balance: full total when no branch selected, branch-specific when filtered
  const mdBalance = useMemo(() => {
    if (!branch) return Math.max(0, Number(mdLoan?.balance || 0))
    const row = mdByBranch.find(r => r.branch === branch)
    return row ? Math.max(0, row.balance) : 0
  }, [branch, mdLoan, mdByBranch])

  // Apply branch filter — null-branch vendors (formerly All Locations) always included
  const filtered = useMemo(() =>
    branch
      ? data.vendors.filter(v => v.branch === branch || !v.branch)
      : data.vendors
  , [data.vendors, branch])

  // KPI cards — all respond to branch filter
  const totalOwed   = filtered.reduce((s,v) => s + Math.max(0, Number(v.balance)), 0)
  const totalCredit = filtered.reduce((s,v) => s + Math.min(0, Number(v.balance)), 0)
  const tradeOwed   = filtered.filter(v=>v.vendor_type==='Trade Payable').reduce((s,v)=>s+Math.max(0,Number(v.balance)),0)
  const otherOwed   = filtered.filter(v=>v.vendor_type==='Other Payables').reduce((s,v)=>s+Math.max(0,Number(v.balance)),0)
  const mdLoanVendor = mdLoan  // alias for clarity below
  const creditCount = filtered.filter(v=>Number(v.balance)<0).length

  const planThisMonth = data.planEntries
    .filter(pl => pl.scheduled_month === curLabel)
    .reduce((s,pl) => s + Number(pl.planned_amount), 0)

  // Top 5 by balance
  const top5 = [...filtered]
    .filter(v => Number(v.balance) > 0)
    .sort((a,b) => Number(b.balance) - Number(a.balance))
    .slice(0, 5)

  // Stale vendors — outstanding but no activity 30+ days
  const stale = filtered.filter(v => {
    if (Number(v.balance) <= 0) return false
    if (!v.last_txn_date) return true
    return Math.floor((now - new Date(v.last_txn_date)) / 86400000) >= 30
  })

  // Plan months — next 6
  const planByMonth = {}
  data.planEntries.forEach(pl => {
    if (!planByMonth[pl.scheduled_month]) planByMonth[pl.scheduled_month] = 0
    planByMonth[pl.scheduled_month] += Number(pl.planned_amount)
  })
  const upcomingMonths = months
    .map(m => `${m} ${now.getFullYear()}`)
    .filter(m => {
      const [mm,yy] = m.split(' ')
      return Number(yy) > now.getFullYear() ||
        (Number(yy) === now.getFullYear() && months.indexOf(mm) >= now.getMonth())
    })
    .slice(0, 6)

  // Branch breakdown — null-branch vendors split across all branches
  const nullBranchTotal = data.vendors
    .filter(v => !v.branch && Number(v.balance) > 0)
    .reduce((s,v) => s + Number(v.balance), 0)

  const byBranch = BRANCHES.map(b => {
    const branchVendors = data.vendors.filter(v => v.branch === b)
    const total = branchVendors.reduce((s,v) => s + Math.max(0, Number(v.balance)), 0)
    const count = branchVendors.filter(v => Number(v.balance) > 0).length
    return { branch: b, total, count }
  }).filter(b => b.total > 0).sort((a,b) => b.total - a.total)

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Dashboard</h1>
        <div className="section-actions">
          <select className="filter-select" value={branch} onChange={e=>setBranch(e.target.value)}>
            <option value="">All Branches</option>
            {BRANCHES.map(b=><option key={b}>{b}</option>)}
          </select>
          {branch && (
            <button className="btn btn-ghost btn-sm" onClick={()=>setBranch('')}>Clear ✕</button>
          )}
        </div>
      </div>

      {branch && (
        <div className="info-banner" style={{marginBottom:14}}>
          📍 Showing figures for <strong>{branch}</strong> — includes shared/unassigned vendors
        </div>
      )}

      {/* KPI cards */}
      <div className="cards-row">
        <div className="stat-card red">
          <div className="stat-label">Total Outstanding</div>
          <div className="stat-value">{fmtShort(totalOwed)}</div>
          <div className="stat-sub">{filtered.filter(v=>Number(v.balance)>0).length} vendors</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Trade Payables</div>
          <div className="stat-value">{fmtShort(tradeOwed)}</div>
          <div className="stat-sub">{filtered.filter(v=>v.vendor_type==='Trade Payable'&&Number(v.balance)>0).length} vendors</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">Other Payables</div>
          <div className="stat-value">{fmtShort(otherOwed)}</div>
          <div className="stat-sub">{filtered.filter(v=>v.vendor_type==='Other Payables'&&Number(v.balance)>0).length} vendors</div>
        </div>
        <div className="stat-card navy">
          <div className="stat-label">MD Loan Balance</div>
          <div className="stat-value">{fmtShort(mdBalance)}</div>
          <div className="stat-sub">director loan account</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">Due This Month</div>
          <div className="stat-value">{fmtShort(planThisMonth)}</div>
          <div className="stat-sub">{curLabel}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Credit Balances</div>
          <div className="stat-value">{fmtShort(Math.abs(totalCredit))}</div>
          <div className="stat-sub">{creditCount} vendor{creditCount!==1?'s':''} overpaid</div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>

        {/* Top 5 */}
        <div className="table-card">
          <div className="table-header">
            <span className="table-title">🔴 Top Vendors by Outstanding</span>
            <span style={{fontSize:11,color:'var(--text-4)'}}>Highest balances first</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Vendor</th><th>Type</th><th style={{textAlign:'right'}}>Balance (₦)</th></tr></thead>
              <tbody>
                {top5.length===0
                  ? <tr><td colSpan={4}><div className="empty" style={{padding:20}}>
                      <div className="empty-text">No outstanding balances</div>
                    </div></td></tr>
                  : top5.map((v,i)=>(
                    <tr key={v.id} style={{cursor:'pointer'}} onClick={()=>onSelectVendor(v)}>
                      <td className="mono" style={{color:'var(--text-4)',width:28}}>{i+1}</td>
                      <td>
                        <div style={{fontWeight:700,fontSize:12}}>{v.name}</div>
                        {v.branch&&<div style={{fontSize:10,color:'var(--text-4)'}}>{v.branch}</div>}
                      </td>
                      <td><span className="badge badge-slate" style={{fontSize:9}}>
                        {v.vendor_type==='Trade Payable'?'Trade':'Other'}
                      </span></td>
                      <td className="mono" style={{textAlign:'right',fontWeight:700,color:'var(--red)'}}>{fmtShort(v.balance)}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Branch breakdown */}
        <div className="table-card">
          <div className="table-header">
            <span className="table-title">📍 Outstanding by Branch</span>
            {nullBranchTotal > 0 && (
              <span style={{fontSize:11,color:'var(--amber)'}}>
                ⚠ {fmtShort(nullBranchTotal)} unassigned
              </span>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Branch</th><th>Vendors</th><th style={{textAlign:'right'}}>Outstanding (₦)</th><th>Share</th></tr></thead>
              <tbody>
                {byBranch.length===0
                  ? <tr><td colSpan={4}><div className="empty" style={{padding:20}}>
                      <div className="empty-text">No branch data</div>
                    </div></td></tr>
                  : byBranch.map(b=>{
                      const total = data.vendors.reduce((s,v)=>s+Math.max(0,Number(v.balance)),0)
                      const pct = total > 0 ? (b.total/total)*100 : 0
                      return (
                        <tr key={b.branch}>
                          <td style={{fontWeight:600,fontSize:12}}>{b.branch}</td>
                          <td style={{fontSize:11,color:'var(--text-3)'}}>{b.count} vendor{b.count!==1?'s':''}</td>
                          <td className="mono" style={{textAlign:'right',fontWeight:700,color:'var(--red)'}}>{fmtShort(b.total)}</td>
                          <td>
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <div style={{background:'var(--border)',borderRadius:3,height:5,width:60,overflow:'hidden'}}>
                                <div style={{background:'var(--brand)',width:`${pct}%`,height:'100%',borderRadius:3}}/>
                              </div>
                              <span style={{fontSize:10,color:'var(--text-4)'}}>{Math.round(pct)}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                }
                {/* Unassigned row */}
                {nullBranchTotal > 0 && (
                  <tr style={{borderTop:'2px solid var(--border)'}}>
                    <td style={{fontSize:12,color:'var(--amber)',fontWeight:600}}>⚠ Unassigned</td>
                    <td style={{fontSize:11,color:'var(--text-3)'}}>
                      {data.vendors.filter(v=>!v.branch&&Number(v.balance)>0).length} vendors
                    </td>
                    <td className="mono" style={{textAlign:'right',fontWeight:700,color:'var(--amber)'}}>
                      {fmtShort(nullBranchTotal)}
                    </td>
                    <td style={{fontSize:11,color:'var(--text-4)'}}>assign in Vendors tab</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

        {/* Repayment schedule */}
        <div className="table-card">
          <div className="table-header">
            <span className="table-title">📅 Repayment Schedule</span>
            <span style={{fontSize:11,color:'var(--text-4)'}}>Next 6 months</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Month</th><th style={{textAlign:'right'}}>Planned (₦)</th><th>Status</th></tr></thead>
              <tbody>
                {upcomingMonths.map(m=>{
                  const amt = planByMonth[m]||0
                  const isCur = m === curLabel
                  return (
                    <tr key={m}>
                      <td style={{fontWeight:isCur?700:400,color:isCur?'var(--brand)':'var(--text)',fontSize:12}}>
                        {m}
                        {isCur&&<span className="badge badge-orange" style={{marginLeft:6,fontSize:9}}>THIS MONTH</span>}
                      </td>
                      <td className="mono" style={{textAlign:'right',fontWeight:700,color:amt>0?'var(--text)':'var(--text-4)'}}>
                        {amt>0?fmt(amt):'—'}
                      </td>
                      <td>
                        {amt>0
                          ? <span className="badge badge-amber">Scheduled</span>
                          : <span style={{fontSize:11,color:'var(--text-4)'}}>No plan</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stale accounts */}
        <div className="table-card">
          <div className="table-header">
            <span className="table-title">⚠️ Stale Accounts</span>
            <span style={{fontSize:11,color:'var(--text-4)'}}>Outstanding · no activity 30+ days</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vendor</th><th style={{textAlign:'right'}}>Balance (₦)</th><th>Last Txn</th><th>Days</th></tr></thead>
              <tbody>
                {stale.length===0
                  ? <tr><td colSpan={4}><div className="empty" style={{padding:20}}>
                      <div className="empty-icon" style={{fontSize:24}}>✅</div>
                      <div className="empty-text">All active vendors have recent activity</div>
                    </div></td></tr>
                  : stale.map(v=>{
                      const days = v.last_txn_date
                        ? Math.floor((now-new Date(v.last_txn_date))/86400000)
                        : null
                      return (
                        <tr key={v.id} style={{cursor:'pointer'}} onClick={()=>onSelectVendor(v)}>
                          <td style={{fontWeight:700,fontSize:12}}>{v.name}</td>
                          <td className="mono" style={{textAlign:'right',color:'var(--red)',fontWeight:700}}>
                            {fmtShort(v.balance)}
                          </td>
                          <td className="mono" style={{fontSize:11}}>{v.last_txn_date||'Never'}</td>
                          <td><span className="badge badge-amber">{days?`${days}d`:'—'}</span></td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
