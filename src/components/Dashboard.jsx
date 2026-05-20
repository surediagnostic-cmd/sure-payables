import { useState, useMemo, useEffect } from 'react'
import { fmt, fmtShort, BRANCHES, MONTHS_SHORT, curMonthLabel } from '../lib/helpers.jsx'
import { loadMdLoanByBranch } from '../lib/useData.js'

export default function Dashboard({ data, onSelectVendor }) {
  const [branch, setBranch]         = useState('')
  const [mdByBranch, setMdByBranch] = useState([])

  const now      = new Date()
  const curLabel = curMonthLabel()
  const months   = MONTHS_SHORT
  const lt       = data.loanTotals  // loan totals pre-computed in useData

  const mdLoan = data.vendors.find(v => v.name.includes("MD'S LOAN") || v.name.includes("MD LOAN"))

  useEffect(() => {
    if (!mdLoan?.id) return
    loadMdLoanByBranch(mdLoan.id).then(setMdByBranch).catch(() => {})
  }, [mdLoan?.id])

  // MD Loan card values (Option C — two separate lines)
  const mdVendorBalance = useMemo(() => {
    if (!branch) return Math.max(0, Number(mdLoan?.balance || 0))
    const row = mdByBranch.find(r => r.branch === branch)
    return row ? Math.max(0, row.balance) : 0
  }, [branch, mdLoan, mdByBranch])

  const directorLoanBalance = branch ? 0 : (lt?.directorBalance || 0)

  // Branch filter — null-branch vendors always included
  const filtered = useMemo(() =>
    branch ? data.vendors.filter(v => v.branch === branch || !v.branch) : data.vendors
  , [data.vendors, branch])

  // KPI calcs
  const vendorOwed  = filtered.reduce((s,v) => s + Math.max(0, Number(v.balance)), 0)
  const loanBalance = branch ? 0 : (lt?.totalBalance || 0)  // loan register only in All Branches
  const totalOwed   = vendorOwed + loanBalance
  const totalCredit = filtered.reduce((s,v) => s + Math.min(0, Number(v.balance)), 0)
  const tradeOwed   = filtered.filter(v=>v.vendor_type==='Trade Payable').reduce((s,v)=>s+Math.max(0,Number(v.balance)),0)
  const otherOwed   = filtered.filter(v=>v.vendor_type==='Other Payables').reduce((s,v)=>s+Math.max(0,Number(v.balance)),0)
  const creditCount = filtered.filter(v=>Number(v.balance)<0).length

  const planThisMonth = data.planEntries
    .filter(pl => pl.scheduled_month === curLabel)
    .reduce((s,pl) => s + Number(pl.planned_amount), 0)

  const top5 = [...filtered]
    .filter(v => Number(v.balance) > 0)
    .sort((a,b) => Number(b.balance) - Number(a.balance))
    .slice(0, 5)

  const stale = filtered.filter(v => {
    if (Number(v.balance) <= 0) return false
    if (!v.last_txn_date) return true
    return Math.floor((now - new Date(v.last_txn_date)) / 86400000) >= 30
  })

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
    }).slice(0, 6)

  const nullBranchTotal = data.vendors
    .filter(v => !v.branch && Number(v.balance) > 0)
    .reduce((s,v) => s + Number(v.balance), 0)

  const byBranch = BRANCHES.map(b => ({
    branch: b,
    total: data.vendors.filter(v => v.branch === b).reduce((s,v) => s + Math.max(0, Number(v.balance)), 0),
    count: data.vendors.filter(v => v.branch === b && Number(v.balance) > 0).length,
  })).filter(b => b.total > 0).sort((a,b) => b.total - a.total)

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Dashboard</h1>
        <div className="section-actions">
          <select className="filter-select" value={branch} onChange={e=>setBranch(e.target.value)}>
            <option value="">All Branches</option>
            {BRANCHES.map(b=><option key={b}>{b}</option>)}
          </select>
          {branch && <button className="btn btn-ghost btn-sm" onClick={()=>setBranch('')}>Clear ✕</button>}
        </div>
      </div>

      {branch && (
        <div className="info-banner" style={{marginBottom:14}}>
          📍 Showing figures for <strong>{branch}</strong> — includes shared/unassigned vendors.
          Loan Register totals only shown in All Branches view.
        </div>
      )}

      {/* KPI cards */}
      <div className="cards-row">
        {/* Total Outstanding — combined */}
        <div className="stat-card red">
          <div className="stat-label">Total Outstanding</div>
          <div className="stat-value">{fmtShort(totalOwed)}</div>
          {!branch && lt && (
            <div style={{marginTop:6,paddingTop:6,borderTop:'1px solid var(--border)',fontSize:10,color:'var(--text-4)',display:'flex',flexDirection:'column',gap:2}}>
              <span>Vendors: {fmtShort(vendorOwed)}</span>
              <span>Loans: {fmtShort(loanBalance)}</span>
            </div>
          )}
          {branch && <div className="stat-sub">vendor payables only</div>}
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

        {/* MD Loan — Option C: two lines */}
        <div className="stat-card navy">
          <div className="stat-label">MD / Director Loans</div>
          <div className="stat-value">{fmtShort(mdVendorBalance + directorLoanBalance)}</div>
          <div style={{marginTop:6,paddingTop:6,borderTop:'1px solid rgba(255,255,255,0.1)',fontSize:10,color:'var(--text-4)',display:'flex',flexDirection:'column',gap:2}}>
            <span>MD Ledger: {fmtShort(mdVendorBalance)}</span>
            {!branch && <span>Loan Register: {fmtShort(directorLoanBalance)}</span>}
          </div>
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

      {/* Loan Register summary strip — only when All Branches */}
      {!branch && lt && (
        <div style={{
          background:'linear-gradient(135deg,var(--navy-bg) 0%,#0d3d80 100%)',
          borderRadius:'var(--r)',padding:'14px 20px',marginBottom:16,
          display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,color:'white'
        }}>
          <div>
            <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.8px',color:'rgba(255,255,255,.45)',marginBottom:4}}>Loan Register Total Due</div>
            <div style={{fontFamily:'DM Mono,monospace',fontSize:18,fontWeight:500,color:'#f87171'}}>{fmtShort(lt.totalBalance)}</div>
          </div>
          <div>
            <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.8px',color:'rgba(255,255,255,.45)',marginBottom:4}}>Director Loans</div>
            <div style={{fontFamily:'DM Mono,monospace',fontSize:18,fontWeight:500,color:'var(--brand-light)'}}>{fmtShort(lt.directorBalance)}</div>
          </div>
          <div>
            <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.8px',color:'rgba(255,255,255,.45)',marginBottom:4}}>Accrued Interest</div>
            <div style={{fontFamily:'DM Mono,monospace',fontSize:18,fontWeight:500,color:'#fcd34d'}}>{fmtShort(lt.totalAccrued)}</div>
          </div>
          <div>
            <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.8px',color:'rgba(255,255,255,.45)',marginBottom:4}}>Active Loans</div>
            <div style={{fontFamily:'DM Mono,monospace',fontSize:18,fontWeight:500}}>{lt.activeCount}</div>
          </div>
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
        {/* Top 5 */}
        <div className="table-card">
          <div className="table-header">
            <span className="table-title">🔴 Top Vendors by Outstanding</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Vendor</th><th>Type</th><th style={{textAlign:'right'}}>Balance</th></tr></thead>
              <tbody>
                {top5.length===0
                  ? <tr><td colSpan={4}><div className="empty" style={{padding:20}}><div className="empty-text">No outstanding balances</div></div></td></tr>
                  : top5.map((v,i)=>(
                    <tr key={v.id} style={{cursor:'pointer'}} onClick={()=>onSelectVendor(v)}>
                      <td className="mono" style={{color:'var(--text-4)',width:28}}>{i+1}</td>
                      <td>
                        <div style={{fontWeight:700,fontSize:12}}>{v.name}</div>
                        {v.branch&&<div style={{fontSize:10,color:'var(--text-4)'}}>{v.branch}</div>}
                      </td>
                      <td><span className="badge badge-slate" style={{fontSize:9}}>{v.vendor_type==='Trade Payable'?'Trade':'Other'}</span></td>
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
              <span style={{fontSize:11,color:'var(--amber)'}}>⚠ {fmtShort(nullBranchTotal)} unassigned</span>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Branch</th><th>Vendors</th><th style={{textAlign:'right'}}>Outstanding</th><th>Share</th></tr></thead>
              <tbody>
                {byBranch.map(b=>{
                  const pct = vendorOwed > 0 ? (b.total/vendorOwed)*100 : 0
                  return (
                    <tr key={b.branch}>
                      <td style={{fontWeight:600,fontSize:12}}>{b.branch}</td>
                      <td style={{fontSize:11,color:'var(--text-3)'}}>{b.count}</td>
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
                })}
                {nullBranchTotal > 0 && (
                  <tr style={{borderTop:'2px solid var(--border)'}}>
                    <td style={{fontSize:12,color:'var(--amber)',fontWeight:600}}>⚠ Unassigned</td>
                    <td style={{fontSize:11,color:'var(--text-3)'}}>{data.vendors.filter(v=>!v.branch&&Number(v.balance)>0).length}</td>
                    <td className="mono" style={{textAlign:'right',fontWeight:700,color:'var(--amber)'}}>{fmtShort(nullBranchTotal)}</td>
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
              <thead><tr><th>Month</th><th style={{textAlign:'right'}}>Planned</th><th>Status</th></tr></thead>
              <tbody>
                {upcomingMonths.map(m=>{
                  const amt = planByMonth[m]||0
                  const isCur = m===curLabel
                  return (
                    <tr key={m}>
                      <td style={{fontWeight:isCur?700:400,color:isCur?'var(--brand)':'var(--text)',fontSize:12}}>
                        {m}{isCur&&<span className="badge badge-orange" style={{marginLeft:6,fontSize:9}}>THIS MONTH</span>}
                      </td>
                      <td className="mono" style={{textAlign:'right',fontWeight:700,color:amt>0?'var(--text)':'var(--text-4)'}}>{amt>0?fmt(amt):'—'}</td>
                      <td>{amt>0?<span className="badge badge-amber">Scheduled</span>:<span style={{fontSize:11,color:'var(--text-4)'}}>No plan</span>}</td>
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
              <thead><tr><th>Vendor</th><th style={{textAlign:'right'}}>Balance</th><th>Last Txn</th><th>Days</th></tr></thead>
              <tbody>
                {stale.length===0
                  ? <tr><td colSpan={4}><div className="empty" style={{padding:20}}>
                      <div className="empty-icon" style={{fontSize:24}}>✅</div>
                      <div className="empty-text">All active vendors have recent activity</div>
                    </div></td></tr>
                  : stale.map(v=>{
                      const days = v.last_txn_date ? Math.floor((now-new Date(v.last_txn_date))/86400000) : null
                      return (
                        <tr key={v.id} style={{cursor:'pointer'}} onClick={()=>onSelectVendor(v)}>
                          <td style={{fontWeight:700,fontSize:12}}>{v.name}</td>
                          <td className="mono" style={{textAlign:'right',color:'var(--red)',fontWeight:700}}>{fmtShort(v.balance)}</td>
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
