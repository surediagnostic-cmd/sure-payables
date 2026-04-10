import { useState, useMemo } from 'react'
import { fmt, fmtShort, StatusBadge, toCSV, triggerDownload, BRANCHES, MONTHS_SHORT, PLAN_MONTHS, curMonthLabel } from '../lib/helpers.jsx'
import DownloadMenu from './DownloadMenu.jsx'
import Modal from './Modal.jsx'
import { supabase } from '../lib/supabase.js'
import { useToast } from '../lib/ToastContext.jsx'

export default function RepaymentPlan({ data, onAddPlan, reload }) {
  const [branch,  setBranch]  = useState('')
  const [vendor,  setVendor]  = useState('')
  const [month,   setMonth]   = useState('')
  const [editEntry, setEditEntry] = useState(null)   // plan entry being edited
  const [saving,  setSaving]  = useState(false)
  const toast = useToast()

  // Edit form fields
  const [eMonth,  setEMonth]  = useState('')
  const [eAmount, setEAmount] = useState('')
  const [eNotes,  setENotes]  = useState('')

  const vendors  = useMemo(() => [...new Set(data.payables.map(p=>p.supplier).filter(Boolean))].sort(), [data.payables])
  const allMonths= useMemo(() => [...new Set(data.planEntries.map(p=>p.scheduled_month))].sort(), [data.planEntries])
  const curLabel = curMonthLabel()
  const now      = new Date()

  const totalPlanned  = data.planEntries.reduce((s,pl)=>s+Number(pl.planned_amount),0)
  const totalPaidPlan = data.planEntries.reduce((s,pl)=>s+Number(pl.plan_paid||0),0)
  const thisMonthPlan = data.planEntries.filter(pl=>pl.scheduled_month===curLabel).reduce((s,pl)=>s+Number(pl.planned_amount),0)

  const monthMap = useMemo(()=>{
    const m={}
    data.planEntries.forEach(pl=>{
      if(branch&&pl.branch!==branch) return
      if(vendor&&pl.supplier!==vendor) return
      if(!m[pl.scheduled_month]) m[pl.scheduled_month]={total:0,count:0}
      m[pl.scheduled_month].total+=Number(pl.planned_amount)
      m[pl.scheduled_month].count++
    })
    return m
  },[data.planEntries,branch,vendor])

  const monthOrder = Object.keys(monthMap).sort((a,b)=>{
    const[ma,ya]=a.split(' ');const[mb,yb]=b.split(' ')
    if(ya!==yb) return Number(ya)-Number(yb)
    return MONTHS_SHORT.indexOf(ma)-MONTHS_SHORT.indexOf(mb)
  })

  const entries = useMemo(()=>data.planEntries.filter(pl=>{
    if(month&&pl.scheduled_month!==month) return false
    if(branch&&pl.branch!==branch) return false
    if(vendor&&pl.supplier!==vendor) return false
    return true
  }),[data.planEntries,month,branch,vendor])

  function isOverdue(m) {
    const[mm,yy]=m.split(' ')
    return Number(yy)<now.getFullYear()||(Number(yy)===now.getFullYear()&&MONTHS_SHORT.indexOf(mm)<now.getMonth())
  }

  function openEdit(pl) {
    setEditEntry(pl)
    setEMonth(pl.scheduled_month)
    setEAmount(pl.planned_amount)
    setENotes(pl.notes||'')
  }

  async function saveEdit() {
    const amount = parseFloat(eAmount)
    if (!amount) { toast('Enter a valid amount','error'); return }
    setSaving(true)
    const { error } = await supabase.from('repayment_plan').update({
      scheduled_month: eMonth,
      planned_amount: amount,
      notes: eNotes || null,
    }).eq('id', editEntry.id)
    setSaving(false)
    if (error) { toast('Error: '+error.message,'error'); return }
    setEditEntry(null)
    await reload()
    toast('Plan entry updated')
  }

  async function deleteEntry(id) {
    if (!confirm('Remove this plan entry?')) return
    const { error } = await supabase.from('repayment_plan').delete().eq('id',id)
    if (error) { toast('Error: '+error.message,'error'); return }
    await reload()
    toast('Plan entry removed')
  }

  function dl() {
    const rows=[['Item','Branch','Vendor','Month','Planned (N)','Paid (N)','Variance (N)','Status']]
    entries.forEach(pl=>{
      const[mm,yy]=pl.scheduled_month.split(' ')
      const isPast=isOverdue(pl.scheduled_month)
      rows.push([pl.description||'',pl.branch||'',pl.supplier||'',pl.scheduled_month,pl.planned_amount,pl.plan_paid||0,pl.variance||0,isPast&&pl.plan_status!=='Paid'?pl.plan_status+' (Overdue)':pl.plan_status])
    })
    triggerDownload(toCSV(rows),`sure_repayment_plan_${new Date().toISOString().split('T')[0]}.csv`)
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Repayment Plan</h1>
        <div className="section-actions">
          <DownloadMenu items={[{label:'📄 CSV — Repayment Plan',fn:dl}]} />
          <button className="btn btn-primary" onClick={onAddPlan}>+ Add Plan Entry</button>
        </div>
      </div>

      <div className="plan-summary-bar">
        <div><div className="plan-sum-label">Total Planned</div><div className="plan-sum-val orange">{fmtShort(totalPlanned)}</div></div>
        <div><div className="plan-sum-label">Paid Against Plan</div><div className="plan-sum-val" style={{color:'#4ade80'}}>{fmtShort(totalPaidPlan)}</div></div>
        <div><div className="plan-sum-label">Remaining</div><div className="plan-sum-val">{fmtShort(totalPlanned-totalPaidPlan)}</div></div>
        <div><div className="plan-sum-label">Due {curLabel}</div><div className="plan-sum-val orange">{fmtShort(thisMonthPlan)}</div></div>
      </div>

      <div className="filters">
        <select className="filter-select" value={branch} onChange={e=>setBranch(e.target.value)}>
          <option value="">All Branches</option>{BRANCHES.map(b=><option key={b}>{b}</option>)}
        </select>
        <select className="filter-select" value={vendor} onChange={e=>setVendor(e.target.value)}>
          <option value="">All Vendors</option>{vendors.map(v=><option key={v}>{v}</option>)}
        </select>
        <select className="filter-select" value={month} onChange={e=>setMonth(e.target.value)}>
          <option value="">All Months</option>{allMonths.map(m=><option key={m}>{m}</option>)}
        </select>
      </div>

      <div className="plan-timeline">
        {monthOrder.map(m=>{
          const isCur=m===curLabel, isPast=isOverdue(m)
          return (
            <div key={m} className={`plan-month-card ${isCur?'current':''} ${isPast&&monthMap[m].total>0?'overdue':''}`}
                 onClick={()=>setMonth(month===m?'':m)} style={{cursor:'pointer'}}>
              <div className="plan-month-label">{m}</div>
              <div className="plan-month-amount">{fmtShort(monthMap[m].total)}</div>
              <div className="plan-month-items">{monthMap[m].count} item{monthMap[m].count!==1?'s':''}</div>
            </div>
          )
        })}
      </div>

      <div className="table-card">
        <div className="table-header"><span className="table-title">Scheduled Repayments</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Item</th><th>Branch</th><th>Vendor</th><th>Month</th>
              <th>Planned (₦)</th><th>Paid (₦)</th><th>Variance</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {entries.length===0
                ? <tr><td colSpan={9}><div className="empty"><div className="empty-icon">📅</div><div className="empty-text">No plan entries</div></div></td></tr>
                : entries.map(pl=>{
                    const variance=Number(pl.variance||0)
                    const past=isOverdue(pl.scheduled_month)
                    return (
                      <tr key={pl.id}>
                        <td>
                          <div style={{fontWeight:600,fontSize:12}}>{pl.description||'—'}</div>
                          {pl.notes&&<div style={{fontSize:10,color:'var(--text-faint)'}}>{pl.notes}</div>}
                        </td>
                        <td>{pl.branch?<span className="badge badge-navy">{pl.branch}</span>:'—'}</td>
                        <td style={{fontSize:11,color:'var(--text-muted)'}}>{pl.supplier||'—'}</td>
                        <td className="mono" style={{fontSize:11}}>{pl.scheduled_month}</td>
                        <td className="mono">{fmt(pl.planned_amount)}</td>
                        <td className="mono" style={{color:'var(--green)'}}>{fmt(pl.plan_paid)}</td>
                        <td className="mono" style={{color:variance>=0?'var(--green)':'var(--red)'}}>
                          {variance>=0?'+':''}{fmt(variance)}
                        </td>
                        <td>
                          <StatusBadge status={pl.plan_status||'Pending'} />
                          {past&&pl.plan_status!=='Paid'&&<span className="badge badge-red" style={{marginLeft:3}}>Overdue</span>}
                        </td>
                        <td style={{display:'flex',gap:3}}>
                          <button className="btn btn-ghost btn-xs" onClick={()=>openEdit(pl)}>✏️</button>
                          <button className="btn btn-ghost btn-xs" onClick={()=>deleteEntry(pl.id)}>🗑️</button>
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editEntry && (
        <Modal
          title="Edit Plan Entry"
          onClose={()=>setEditEntry(null)}
          footer={<>
            <button className="btn btn-outline" onClick={()=>setEditEntry(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={saveEdit}>
              {saving?<><span className="spinner"/> Saving…</>:'Update Plan'}
            </button>
          </>}
        >
          <div style={{marginBottom:12,padding:'10px 14px',background:'var(--bg-table-head)',borderRadius:'var(--radius-sm)',fontSize:12,color:'var(--text-muted)'}}>
            Editing: <strong style={{color:'var(--text)'}}>{editEntry.description}</strong>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Scheduled Month</label>
              <select className="form-select" value={eMonth} onChange={e=>setEMonth(e.target.value)}>
                {PLAN_MONTHS.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Planned Amount (₦)</label>
              <input className="form-input" type="number" value={eAmount} onChange={e=>setEAmount(e.target.value)} />
            </div>
            <div className="form-group span2">
              <label className="form-label">Notes</label>
              <input className="form-input" placeholder="e.g. Instalment 2 of 4" value={eNotes} onChange={e=>setENotes(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
