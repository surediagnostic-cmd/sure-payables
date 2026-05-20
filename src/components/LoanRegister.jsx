import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { fmt, fmtShort, toCSV, triggerDownload } from '../lib/helpers.jsx'
import { useToast } from '../lib/ToastContext.jsx'
import Modal from './Modal.jsx'
import DownloadMenu from './DownloadMenu.jsx'

const LOAN_TYPES  = ['Director Loan','Inter-Company']
const LOAN_STATUS = ['Active','Settled','Defaulted']
const LENDERS     = ['Director','Ijofi-Sure Diagnostic Ltd','Oauth-Sure Diagnostic Ltd','Ilasa-Sure Diagnostic Ltd','Other']
const BORROWERS   = ['OAUTH-SDL','ILASA-SDL','PALM AVENUE-SDL','IKEJA-SDL','SURE ILESHA-SDL','UOFI-SDL']

export default function LoanRegister({ isAdmin }) {
  const toast = useToast()
  const [loans,   setLoans]   = useState([])
  const [loading, setLoading] = useState(true)
  const [view,    setView]    = useState('lender')   // 'lender' | 'borrower' | 'flat'
  const [filterStatus, setFilterStatus] = useState('')
  const [filterLender, setFilterLender] = useState('')
  const [collapsed, setCollapsed] = useState({})

  // Modals
  const [showAdd,   setShowAdd]   = useState(false)
  const [showRepay, setShowRepay] = useState(false)
  const [editLoan,  setEditLoan]  = useState(null)
  const [repayLoan, setRepayLoan] = useState(null)
  const [saving,    setSaving]    = useState(false)

  // Loan form
  const [fLoanId,   setFLoanId]   = useState('')
  const [fLender,   setFLender]   = useState('Director')
  const [fBorrower, setFBorrower] = useState('OAUTH-SDL')
  const [fType,     setFType]     = useState('Director Loan')
  const [fPurpose,  setFPurpose]  = useState('')
  const [fDisbDate, setFDisbDate] = useState('')
  const [fMatDate,  setFMatDate]  = useState('')
  const [fPrinc,    setFPrinc]    = useState('')
  const [fRate,     setFRate]     = useState('')
  const [fStatus,   setFStatus]   = useState('Active')
  const [fNotes,    setFNotes]    = useState('')

  // Repayment form
  const [rAmount, setRAmount] = useState('')
  const [rDate,   setRDate]   = useState(new Date().toISOString().split('T')[0])
  const [rNotes,  setRNotes]  = useState('')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('loan_register').select('*').order('loan_id')
    if (error) toast('Error: '+error.message,'error')
    else setLoans(data||[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Reset collapsed when switching view
  useEffect(() => { setCollapsed({}) }, [view])

  // Helpers
  const accrued  = l => Math.round(Number(l.principal) * Number(l.interest_rate))
  const totalOut = l => Number(l.principal) + accrued(l)
  const balDue   = l => Math.max(0, totalOut(l) - Number(l.repayments_made||0))
  const daysToMat = l => {
    if (!l.maturity_date) return null
    const now = new Date(); now.setHours(0,0,0,0)
    return Math.floor((new Date(l.maturity_date) - now) / 86400000)
  }
  function sCls(l) {
    if (l.status==='Settled') return 'loan-status-settled'
    const d = daysToMat(l)
    if (d!==null&&d<0)  return 'loan-status-overdue'
    if (d!==null&&d<=30) return 'loan-status-maturing'
    return 'loan-status-active'
  }
  function sLbl(l) {
    if (l.status==='Settled') return 'Settled'
    const d = daysToMat(l)
    if (d!==null&&d<0)  return `Overdue ${Math.abs(d)}d`
    if (d!==null&&d<=30) return `Due in ${d}d`
    return 'Active'
  }

  const filtered = useMemo(() => loans.filter(l => {
    if (filterStatus && l.status !== filterStatus) return false
    if (filterLender && l.lender !== filterLender) return false
    return true
  }), [loans, filterStatus, filterLender])

  // KPIs
  const totalPrincipal = loans.reduce((s,l)=>s+Number(l.principal),0)
  const totalAccrued   = loans.reduce((s,l)=>s+accrued(l),0)
  const totalOutAll    = loans.reduce((s,l)=>s+totalOut(l),0)
  const totalRepaid    = loans.reduce((s,l)=>s+Number(l.repayments_made||0),0)
  const totalBalance   = loans.reduce((s,l)=>s+balDue(l),0)
  const activeCount    = loans.filter(l=>l.status==='Active').length
  const overdueCount   = loans.filter(l=>daysToMat(l)!==null&&daysToMat(l)<0&&l.status==='Active').length
  const maturingSoon   = loans.filter(l=>{const d=daysToMat(l);return d!==null&&d>=0&&d<=30&&l.status==='Active'}).length

  // Group by key
  function groupBy(arr, key) {
    const map = {}
    arr.forEach(l => {
      const k = l[key]
      if (!map[k]) map[k] = []
      map[k].push(l)
    })
    return Object.entries(map).sort(([,a],[,b]) =>
      b.reduce((s,l)=>s+balDue(l),0) - a.reduce((s,l)=>s+balDue(l),0)
    )
  }

  function toggle(k) { setCollapsed(c=>({...c,[k]:!c[k]})) }

  // Modals
  function openAdd() {
    setEditLoan(null)
    const maxNum = loans.reduce((m,l)=>Math.max(m,parseInt(l.loan_id?.split('-')[2]||'0')),13)
    setFLoanId(`LN-${new Date().getFullYear()}-${String(maxNum+1).padStart(3,'0')}`)
    setFLender('Director'); setFBorrower('OAUTH-SDL'); setFType('Director Loan')
    setFPurpose(''); setFDisbDate(new Date().toISOString().split('T')[0])
    setFMatDate(''); setFPrinc(''); setFRate(''); setFStatus('Active'); setFNotes('')
    setShowAdd(true)
  }
  function openEdit(l) {
    setEditLoan(l)
    setFLoanId(l.loan_id); setFLender(l.lender); setFBorrower(l.borrower)
    setFType(l.loan_type); setFPurpose(l.purpose||'')
    setFDisbDate(l.disbursement_date||''); setFMatDate(l.maturity_date||'')
    setFPrinc(l.principal); setFRate((l.interest_rate*100).toFixed(1))
    setFStatus(l.status); setFNotes(l.notes||'')
    setShowAdd(true)
  }
  function openRepay(l) {
    setRepayLoan(l); setRAmount(''); setRDate(new Date().toISOString().split('T')[0]); setRNotes('')
    setShowRepay(true)
  }

  async function deleteLoan(l) {
    if (!confirm(`Delete loan ${l.loan_id}?\n\nLender: ${l.lender} → ${l.borrower}\nBalance: ${fmt(balDue(l))}\n\nThis cannot be undone.`)) return
    const { error } = await supabase.from('loan_register').delete().eq('id', l.id)
    if (error) { toast('Error: '+error.message,'error'); return }
    await load()
    toast(`Loan ${l.loan_id} deleted`)
  }

  async function saveLoan() {
    const principal=parseFloat(fPrinc), rate=parseFloat(fRate)/100
    if (!fLoanId||!principal||isNaN(rate)) { toast('Fill in all required fields','error'); return }
    setSaving(true)
    const payload = { loan_id:fLoanId, lender:fLender, borrower:fBorrower, loan_type:fType,
      purpose:fPurpose||null, disbursement_date:fDisbDate||null, maturity_date:fMatDate||null,
      principal, interest_rate:rate, interest_type:'Simple', status:fStatus, notes:fNotes||null }
    const { error } = editLoan
      ? await supabase.from('loan_register').update(payload).eq('id',editLoan.id)
      : await supabase.from('loan_register').insert(payload)
    setSaving(false)
    if (error) { toast('Error: '+error.message,'error'); return }
    setShowAdd(false); setEditLoan(null); await load()
    toast(editLoan?'Loan updated':'Loan added')
  }

  async function saveRepayment() {
    const amount=parseFloat(rAmount)
    if (!amount) { toast('Enter a repayment amount','error'); return }
    const newTotal=Number(repayLoan.repayments_made||0)+amount
    setSaving(true)
    const updates={ repayments_made:newTotal }
    if (newTotal>=totalOut(repayLoan)) updates.status='Settled'
    const { error } = await supabase.from('loan_register').update(updates).eq('id',repayLoan.id)
    if (!error) await supabase.from('loan_repayments').insert({ loan_id:repayLoan.id, payment_date:rDate, amount, notes:rNotes||null })
    setSaving(false)
    if (error) { toast('Error: '+error.message,'error'); return }
    setShowRepay(false); setRepayLoan(null); await load()
    toast(`Repayment of ${fmt(amount)} recorded`)
  }

  const today = new Date().toISOString().split('T')[0]
  function dl() {
    const rows=[['Loan ID','Lender','Borrower','Type','Purpose','Disbursed','Maturity','Principal','Rate (%)','Accrued Interest','Total Outstanding','Repaid','Balance','Status']]
    filtered.forEach(l=>rows.push([l.loan_id,l.lender,l.borrower,l.loan_type,l.purpose||'',l.disbursement_date||'',l.maturity_date||'',l.principal,(l.interest_rate*100).toFixed(1)+'%',accrued(l),totalOut(l),l.repayments_made||0,balDue(l),l.status]))
    triggerDownload(toCSV(rows),`sure_loan_register_${today}.csv`)
  }

  // Table head
  const THead = () => (
    <thead><tr>
      <th>Loan ID</th><th>Lender</th><th>Borrower</th><th>Type</th><th>Purpose</th>
      <th>Disbursed</th><th>Maturity</th>
      <th style={{textAlign:'right'}}>Principal</th>
      <th style={{textAlign:'right'}}>Interest</th>
      <th style={{textAlign:'right'}}>Repaid</th>
      <th style={{textAlign:'right'}}>Balance</th>
      <th>Status</th><th>Actions</th>
    </tr></thead>
  )

  // Single loan row
  function LoanRow({ l, indent=false }) {
    const bal = balDue(l)
    return (
      <tr key={l.id}>
        <td className="mono" style={{fontWeight:700,fontSize:11,paddingLeft:indent?28:12}}>{l.loan_id}</td>
        <td style={{fontSize:11}}>{l.lender}</td>
        <td><span className="badge badge-navy" style={{fontSize:9}}>{l.borrower}</span></td>
        <td><span className="badge badge-slate" style={{fontSize:9}}>{l.loan_type}</span></td>
        <td style={{fontSize:11,color:'var(--text-3)',maxWidth:120}}>{l.purpose||'—'}</td>
        <td className="mono" style={{fontSize:11}}>{l.disbursement_date||'—'}</td>
        <td className="mono" style={{fontSize:11}}>{l.maturity_date||'—'}</td>
        <td className="mono" style={{textAlign:'right'}}>{fmt(l.principal)}</td>
        <td className="mono" style={{textAlign:'right',fontSize:11,color:'var(--amber)'}}>
          {(l.interest_rate*100).toFixed(1)}% = {fmt(accrued(l))}
        </td>
        <td className="mono" style={{textAlign:'right',color:'var(--green)'}}>{fmt(l.repayments_made||0)}</td>
        <td className="mono" style={{textAlign:'right',fontWeight:700,color:bal>0?'var(--red)':'var(--green)'}}>{fmt(bal)}</td>
        <td><span className={`loan-status-badge ${sCls(l)}`}>{sLbl(l)}</span></td>
        <td>
          <div style={{display:'flex',gap:3}}>
            {l.status==='Active' && <button className="btn btn-green btn-xs" onClick={()=>openRepay(l)}>Repay</button>}
            {isAdmin && <button className="btn btn-ghost btn-xs" onClick={()=>openEdit(l)}>✏️</button>}
            {isAdmin && <button className="btn btn-ghost btn-xs" style={{color:'var(--red)'}} onClick={()=>deleteLoan(l)}>🗑️</button>}
          </div>
        </td>
      </tr>
    )
  }

  // Grouped table renderer
  function GroupedTable({ groups }) {
    return (
      <div className="table-wrap">
        {loading
          ? <div className="empty"><div className="empty-icon">⏳</div><div className="empty-text">Loading…</div></div>
          : <table>
              <THead />
              <tbody>
                {groups.length===0
                  ? <tr><td colSpan={13}><div className="empty"><div className="empty-text">No loans found</div></div></td></tr>
                  : groups.map(([groupKey, lns]) => {
                      const isOpen = !collapsed[groupKey]
                      const grpBal   = lns.reduce((s,l)=>s+balDue(l),0)
                      const grpPrinc = lns.reduce((s,l)=>s+Number(l.principal),0)
                      const grpAcc   = lns.reduce((s,l)=>s+accrued(l),0)
                      return [
                        <tr key={`g_${groupKey}`}
                          style={{cursor:'pointer'}}
                          onClick={()=>toggle(groupKey)}
                        >
                          <td colSpan={13} style={{
                            background:'var(--bg-thead)', fontWeight:700, fontSize:12,
                            padding:'10px 12px', borderBottom:'1px solid var(--border)',
                            borderTop:'2px solid var(--border-2)'
                          }}>
                            <em className={`group-chevron ${isOpen?'open':''}`}>▶</em>
                            <strong>{groupKey}</strong>
                            <span className="group-meta">
                              {lns.length} loan{lns.length!==1?'s':''} ·
                              Principal {fmtShort(grpPrinc)} ·
                              Interest {fmtShort(grpAcc)} ·
                              Balance <span style={{color:'var(--red)',fontWeight:700}}>{fmtShort(grpBal)}</span>
                            </span>
                          </td>
                        </tr>,
                        ...(isOpen ? lns.map(l => <LoanRow key={l.id} l={l} indent />) : [])
                      ]
                    })
                }
              </tbody>
            </table>
        }
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Loan Register</h1>
        <div className="section-actions">
          <DownloadMenu items={[{label:'📄 CSV — Loan Register',fn:dl}]} />
          <button className="btn btn-primary" onClick={openAdd}>+ Add Loan</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="loan-summary-grid">
        <div className="stat-card red">
          <div className="stat-label">Total Balance Due</div>
          <div className="stat-value">{fmtShort(totalBalance)}</div>
          <div className="stat-sub">{activeCount} active loan{activeCount!==1?'s':''}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Total Principal</div>
          <div className="stat-value">{fmtShort(totalPrincipal)}</div>
          <div className="stat-sub">{loans.length} loans total</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">Accrued Interest</div>
          <div className="stat-value">{fmtShort(totalAccrued)}</div>
          <div className="stat-sub">simple interest</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Total Repaid</div>
          <div className="stat-value">{fmtShort(totalRepaid)}</div>
          <div className="stat-sub">of {fmtShort(totalOutAll)}</div>
        </div>
        <div className={`stat-card ${overdueCount>0?'red':'navy'}`}>
          <div className="stat-label">Alerts</div>
          <div className="stat-value">{overdueCount+maturingSoon}</div>
          <div className="stat-sub">{overdueCount} overdue · {maturingSoon} due soon</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10,marginBottom:14}}>
        <div className="filters" style={{marginBottom:0}}>
          <select className="filter-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            {LOAN_STATUS.map(s=><option key={s}>{s}</option>)}
          </select>
          <select className="filter-select" value={filterLender} onChange={e=>setFilterLender(e.target.value)}>
            <option value="">All Lenders</option>
            {[...new Set(loans.map(l=>l.lender))].sort().map(l=><option key={l}>{l}</option>)}
          </select>
        </div>

        {/* View tabs — Lender | Borrower | Flat */}
        <div style={{display:'flex',border:'1px solid var(--border-2)',borderRadius:'var(--r-sm)',overflow:'hidden',flexShrink:0}}>
          {[
            {id:'lender',   label:'By Lender'},
            {id:'borrower', label:'By Borrower'},
            {id:'flat',     label:'☰ Flat'},
          ].map(t => (
            <button key={t.id} onClick={()=>setView(t.id)} style={{
              padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer',
              border:'none', fontFamily:'Outfit,sans-serif', transition:'all .15s',
              background: view===t.id ? 'var(--navy-bg)' : 'var(--bg-card)',
              color: view===t.id ? 'white' : 'var(--text-3)',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Main table — switches based on view */}
      <div className="table-card">
        <div className="table-header">
          <span className="table-title">
            {view==='lender'   && 'Loans — Grouped by Lender'}
            {view==='borrower' && 'Loans — Grouped by Borrower'}
            {view==='flat'     && 'All Loans — Flat List'}
          </span>
          <span style={{fontSize:11,color:'var(--text-3)'}}>
            {view!=='flat' && 'Click a group row to expand'}
          </span>
        </div>

        {view==='lender'   && <GroupedTable groups={groupBy(filtered,'lender')} />}
        {view==='borrower' && <GroupedTable groups={groupBy(filtered,'borrower')} />}
        {view==='flat'     && (
          <div className="table-wrap">
            {loading
              ? <div className="empty"><div className="empty-icon">⏳</div><div className="empty-text">Loading…</div></div>
              : <table>
                  <THead />
                  <tbody>
                    {filtered.length===0
                      ? <tr><td colSpan={13}><div className="empty"><div className="empty-text">No loans found</div></div></td></tr>
                      : filtered.map(l => <LoanRow key={l.id} l={l} />)
                    }
                  </tbody>
                </table>
            }
          </div>
        )}
      </div>

      {/* ADD / EDIT MODAL */}
      {showAdd && (
        <Modal title={editLoan?`Edit — ${editLoan.loan_id}`:'Add New Loan'} wide
          onClose={()=>{setShowAdd(false);setEditLoan(null)}}
          footer={<>
            <button className="btn btn-outline" onClick={()=>{setShowAdd(false);setEditLoan(null)}}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={saveLoan}>
              {saving?<><span className="spinner"/> Saving…</>:(editLoan?'Update Loan':'Add Loan')}
            </button>
          </>}
        >
          <div className="form-grid">
            <div className="form-group"><label className="form-label">Loan ID</label>
              <input className="form-input" value={fLoanId} onChange={e=>setFLoanId(e.target.value)} disabled={!!editLoan}/></div>
            <div className="form-group"><label className="form-label">Loan Type</label>
              <select className="form-select" value={fType} onChange={e=>setFType(e.target.value)}>
                {LOAN_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Lender</label>
              <select className="form-select" value={fLender} onChange={e=>setFLender(e.target.value)}>
                {LENDERS.map(l=><option key={l}>{l}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Borrower / Centre</label>
              <select className="form-select" value={fBorrower} onChange={e=>setFBorrower(e.target.value)}>
                {BORROWERS.map(b=><option key={b}>{b}</option>)}</select></div>
            <div className="form-group span2"><label className="form-label">Purpose</label>
              <input className="form-input" placeholder="e.g. Working Capital" value={fPurpose} onChange={e=>setFPurpose(e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Disbursement Date</label>
              <input className="form-input" type="date" value={fDisbDate} onChange={e=>setFDisbDate(e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Maturity Date</label>
              <input className="form-input" type="date" value={fMatDate} onChange={e=>setFMatDate(e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Principal (N)</label>
              <input className="form-input" type="number" placeholder="0" value={fPrinc} onChange={e=>setFPrinc(e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Interest Rate (%)</label>
              <input className="form-input" type="number" step="0.1" placeholder="e.g. 10" value={fRate} onChange={e=>setFRate(e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-select" value={fStatus} onChange={e=>setFStatus(e.target.value)}>
                {LOAN_STATUS.map(s=><option key={s}>{s}</option>)}</select></div>
            <div className="form-group span2"><label className="form-label">Notes</label>
              <input className="form-input" placeholder="Optional" value={fNotes} onChange={e=>setFNotes(e.target.value)}/></div>
            {fPrinc && fRate && (
              <div className="form-group span2">
                <div style={{background:'var(--bg-thead)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'10px 14px',fontSize:12}}>
                  <strong>Preview:</strong> Principal {fmt(fPrinc)} + Interest {fmt(parseFloat(fPrinc)*parseFloat(fRate)/100)} = Total <strong>{fmt(parseFloat(fPrinc)*(1+parseFloat(fRate)/100))}</strong>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* REPAYMENT MODAL */}
      {showRepay && repayLoan && (
        <Modal title={`Record Repayment — ${repayLoan.loan_id}`}
          onClose={()=>{setShowRepay(false);setRepayLoan(null)}}
          footer={<>
            <button className="btn btn-outline" onClick={()=>{setShowRepay(false);setRepayLoan(null)}}>Cancel</button>
            <button className="btn btn-green" disabled={saving} onClick={saveRepayment}>
              {saving?<><span className="spinner"/> Saving…</>:'Record Repayment'}
            </button>
          </>}
        >
          <div style={{background:'var(--bg-thead)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'12px 16px',marginBottom:18}}>
            <div style={{fontSize:12,fontWeight:700,marginBottom:6}}>{repayLoan.lender} → {repayLoan.borrower}</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              <div><div style={{fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:3}}>Outstanding</div><div className="mono" style={{fontWeight:700,color:'var(--red)'}}>{fmt(totalOut(repayLoan))}</div></div>
              <div><div style={{fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:3}}>Already Repaid</div><div className="mono" style={{color:'var(--green)'}}>{fmt(repayLoan.repayments_made||0)}</div></div>
              <div><div style={{fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:3}}>Balance Due</div><div className="mono" style={{fontWeight:700,color:'var(--red)'}}>{fmt(balDue(repayLoan))}</div></div>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group"><label className="form-label">Repayment Amount (N)</label>
              <input className="form-input" type="number" placeholder="0" value={rAmount} onChange={e=>setRAmount(e.target.value)} autoFocus/></div>
            <div className="form-group"><label className="form-label">Payment Date</label>
              <input className="form-input" type="date" value={rDate} onChange={e=>setRDate(e.target.value)}/></div>
            <div className="form-group span2"><label className="form-label">Notes</label>
              <input className="form-input" placeholder="Reference or notes" value={rNotes} onChange={e=>setRNotes(e.target.value)}/></div>
          </div>
          {rAmount && parseFloat(rAmount) >= balDue(repayLoan) && (
            <div style={{background:'var(--green-pale)',border:'1px solid var(--green)',borderRadius:'var(--r-sm)',padding:'8px 13px',fontSize:12,color:'var(--green)',marginTop:12}}>
              ✅ This payment will fully settle the loan — status will change to Settled automatically.
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
