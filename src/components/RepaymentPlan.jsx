import { useState, useMemo } from 'react'
import { fmt, fmtShort, PLAN_MONTHS, MONTHS_SHORT, curMonthLabel, toCSV, triggerDownload } from '../lib/helpers.jsx'
import Modal from './Modal.jsx'
import { supabase } from '../lib/supabase.js'
import { useToast } from '../lib/ToastContext.jsx'

export default function RepaymentPlan({ data, reload }) {
  const toast = useToast()
  const [filterMonth,  setFilterMonth]  = useState('')
  const [showAdd,      setShowAdd]      = useState(false)
  const [editEntry,    setEditEntry]    = useState(null)
  const [saving,       setSaving]       = useState(false)

  // Form
  const [fVendor,  setFVendor]  = useState('')
  const [fMonth,   setFMonth]   = useState('JAN 2026')
  const [fAmount,  setFAmount]  = useState('')
  const [fNotes,   setFNotes]   = useState('')

  const vendors    = data.vendors
  const entries    = data.planEntries
  const curLabel   = curMonthLabel()
  const now        = new Date()

  const totalPlanned  = entries.reduce((s,pl)=>s+Number(pl.planned_amount),0)
  const thisMonthPlan = entries.filter(pl=>pl.scheduled_month===curLabel).reduce((s,pl)=>s+Number(pl.planned_amount),0)

  const allMonths = useMemo(() => [...new Set(entries.map(p=>p.scheduled_month))].sort(), [entries])

  const monthMap = useMemo(() => {
    const m = {}
    entries.forEach(pl => {
      if (!m[pl.scheduled_month]) m[pl.scheduled_month] = { total:0, count:0 }
      m[pl.scheduled_month].total += Number(pl.planned_amount)
      m[pl.scheduled_month].count++
    })
    return m
  }, [entries])

  const monthOrder = Object.keys(monthMap).sort((a,b) => {
    const [ma,ya]=a.split(' '); const [mb,yb]=b.split(' ')
    if(ya!==yb) return Number(ya)-Number(yb)
    return MONTHS_SHORT.indexOf(ma)-MONTHS_SHORT.indexOf(mb)
  })

  const filtered = filterMonth ? entries.filter(pl=>pl.scheduled_month===filterMonth) : entries

  function isOverdue(m) {
    const [mm,yy]=m.split(' ')
    return Number(yy)<now.getFullYear()||(Number(yy)===now.getFullYear()&&MONTHS_SHORT.indexOf(mm)<now.getMonth())
  }

  function openAdd() {
    setEditEntry(null)
    setFVendor(vendors[0]?.id||''); setFMonth('JAN 2026'); setFAmount(''); setFNotes('')
    setShowAdd(true)
  }

  function openEdit(pl) {
    setEditEntry(pl)
    setFVendor(pl.vendor_id); setFMonth(pl.scheduled_month); setFAmount(pl.planned_amount); setFNotes(pl.notes||'')
    setShowAdd(true)
  }

  async function save() {
    const amount = parseFloat(fAmount)
    if (!amount || !fVendor) { toast('Select a vendor and enter amount','error'); return }
    setSaving(true)
    const payload = { vendor_id:fVendor, scheduled_month:fMonth, planned_amount:amount, notes:fNotes||null }
    const { error } = editEntry
      ? await supabase.from('repayment_plan').update(payload).eq('id',editEntry.id)
      : await supabase.from('repayment_plan').insert(payload)
    setSaving(false)
    if (error) { toast('Error: '+(error.message.includes('unique')?'Entry already exists for this vendor + month':error.message),'error'); return }
    setShowAdd(false); setEditEntry(null)
    await reload(); toast(editEntry ? 'Plan updated' : 'Plan entry added')
  }

  async function del(id) {
    if (!confirm('Remove this plan entry?')) return
    const { error } = await supabase.from('repayment_plan').delete().eq('id',id)
    if (error) { toast('Error: '+error.message,'error'); return }
    await reload(); toast('Plan entry removed')
  }

  const today = new Date().toISOString().split('T')[0]
  function dl() {
    const rows=[['Vendor','Type','Month','Planned (N)','Notes','Vendor Balance (N)','Status']]
    filtered.forEach(pl=>rows.push([pl.vendor_name||'',pl.vendor_type||'',pl.scheduled_month,pl.planned_amount,pl.notes||'',pl.vendor_balance||'',pl.plan_status]))
    triggerDownload(toCSV(rows), `sure_repayment_plan_${today}.csv`)
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Repayment Plan</h1>
        <div className="section-actions">
          <button className="btn btn-green" onClick={dl}>⬇ Export</button>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Plan Entry</button>
        </div>
      </div>

      <div className="plan-bar">
        <div><div className="pb-label">Total Planned</div><div className="pb-val orange">{fmtShort(totalPlanned)}</div></div>
        <div><div className="pb-label">Scheduled Entries</div><div className="pb-val">{entries.length}</div></div>
        <div><div className="pb-label">Due This Month ({curLabel})</div><div className="pb-val orange">{fmtShort(thisMonthPlan)}</div></div>
        <div><div className="pb-label">Months Planned</div><div className="pb-val">{monthOrder.length}</div></div>
      </div>

      {/* Month timeline */}
      <div className="month-grid">
        {monthOrder.map(m => {
          const isCur = m === curLabel
          const isPast = isOverdue(m)
          const isSel = filterMonth === m
          return (
            <div key={m}
              className={`month-card ${isCur?'current':''} ${isPast?'overdue':''} ${isSel?'selected':''}`}
              onClick={() => setFilterMonth(isSel ? '' : m)}
            >
              <div className="mc-label">{m}</div>
              <div className="mc-amount">{fmtShort(monthMap[m].total)}</div>
              <div className="mc-count">{monthMap[m].count} item{monthMap[m].count!==1?'s':''}</div>
            </div>
          )
        })}
      </div>

      {filterMonth && (
        <div style={{marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:12,color:'var(--text-3)'}}>Showing: <strong>{filterMonth}</strong></span>
          <button className="btn btn-ghost btn-xs" onClick={()=>setFilterMonth('')}>Clear ✕</button>
        </div>
      )}

      <div className="table-card">
        <div className="table-header">
          <span className="table-title">Scheduled Repayments{filterMonth ? ` — ${filterMonth}` : ''}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Vendor</th><th>Type</th><th>Month</th>
              <th style={{textAlign:'right'}}>Planned (₦)</th>
              <th style={{textAlign:'right'}}>Vendor Balance (₦)</th>
              <th>Notes</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={8}><div className="empty"><div className="empty-icon">📅</div><div className="empty-text">No plan entries{filterMonth?` for ${filterMonth}`:''}</div></div></td></tr>
                : filtered.map(pl => {
                    const past = isOverdue(pl.scheduled_month)
                    const statusCls = pl.plan_status==='Paid'?'badge-green':pl.plan_status==='Partial'?'badge-amber':'badge-slate'
                    return (
                      <tr key={pl.id}>
                        <td><strong style={{fontSize:12}}>{pl.vendor_name}</strong></td>
                        <td><span className="badge badge-slate" style={{fontSize:9}}>{pl.vendor_type}</span></td>
                        <td className="mono" style={{fontSize:11}}>{pl.scheduled_month}</td>
                        <td className="mono" style={{textAlign:'right',fontWeight:700}}>{fmt(pl.planned_amount)}</td>
                        <td className="mono" style={{textAlign:'right',color:Number(pl.vendor_balance)>0?'var(--red)':'var(--green)',fontWeight:600}}>
                          {fmt(pl.vendor_balance)}
                        </td>
                        <td style={{fontSize:11,color:'var(--text-3)'}}>{pl.notes||'—'}</td>
                        <td>
                          <span className={`badge ${statusCls}`}>{pl.plan_status}</span>
                          {past && pl.plan_status!=='Paid' && <span className="badge badge-red" style={{marginLeft:3}}>Overdue</span>}
                        </td>
                        <td>
                          <div style={{display:'flex',gap:3}}>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openEdit(pl)}>✏️</button>
                            <button className="btn btn-ghost btn-xs" onClick={()=>del(pl.id)}>🗑️</button>
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

      {/* Add/Edit modal */}
      {showAdd && (
        <Modal title={editEntry ? 'Edit Plan Entry' : 'Add Repayment Plan Entry'} onClose={()=>{setShowAdd(false);setEditEntry(null)}}
          footer={<>
            <button className="btn btn-outline" onClick={()=>{setShowAdd(false);setEditEntry(null)}}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              {saving?<><span className="spinner"/> Saving…</>:(editEntry?'Update Plan':'Save Plan')}
            </button>
          </>}
        >
          <div className="form-grid">
            <div className="form-group span2">
              <label className="form-label">Vendor</label>
              <select className="form-select" value={fVendor} onChange={e=>setFVendor(e.target.value)}>
                <option value="">— Select vendor —</option>
                {vendors.filter(v=>Number(v.balance)>0).map(v=>(
                  <option key={v.id} value={v.id}>{v.name} — {fmt(v.balance)} outstanding</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Scheduled Month</label>
              <select className="form-select" value={fMonth} onChange={e=>setFMonth(e.target.value)}>
                {PLAN_MONTHS.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Planned Amount (₦)</label>
              <input className="form-input" type="number" placeholder="0" value={fAmount} onChange={e=>setFAmount(e.target.value)} />
            </div>
            <div className="form-group span2">
              <label className="form-label">Notes</label>
              <input className="form-input" placeholder="e.g. Instalment 2 of 4" value={fNotes} onChange={e=>setFNotes(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
