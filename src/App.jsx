import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'
import { useData } from './lib/useData.js'
import { ToastProvider, useToast } from './lib/ToastContext.jsx'
import { BRANCHES, CATEGORIES, MONTHS_SHORT, PLAN_MONTHS } from './lib/helpers.jsx'
import Modal from './components/Modal.jsx'
import Dashboard from './components/Dashboard.jsx'
import PayablesRegister from './components/PayablesRegister.jsx'
import MdLoanLedger from './components/MdLoanLedger.jsx'
import PaymentLog from './components/PaymentLog.jsx'
import AgingReport from './components/AgingReport.jsx'
import RepaymentPlan from './components/RepaymentPlan.jsx'

const TABS = [
  { id:'dashboard', label:'📊 Dashboard' },
  { id:'payables',  label:'📋 Register',  badge:true },
  { id:'mdloan',    label:'💼 Loan History' },
  { id:'payments',  label:'✅ Payments' },
  { id:'aging',     label:'⏳ Aging' },
  { id:'plan',      label:'📅 Plan' },
]

function AppInner() {
  const toast = useToast()
  const { data, loading, error, reload } = useData()
  const [tab,    setTab]    = useState('dashboard')
  const [saving, setSaving] = useState(false)
  const [dark,   setDark]   = useState(() => localStorage.getItem('sp_dark') === 'true')

  // Modal visibility
  const [showPayable,  setShowPayable]  = useState(false)
  const [showPayment,  setShowPayment]  = useState(false)
  const [showLoan,     setShowLoan]     = useState(false)
  const [showPlan,     setShowPlan]     = useState(false)
  const [editPayable,  setEditPayable]  = useState(null)
  const [quickPayId,   setQuickPayId]   = useState(null)

  // Payable form
  const [pDesc,     setPDesc]     = useState('')
  const [pBranch,   setPBranch]   = useState('Ilasa')
  const [pCat,      setPCat]      = useState('Equipment')
  const [pSupplier, setPSupplier] = useState('')
  const [pTotal,    setPTotal]    = useState('')
  const [pPaid,     setPPaid]     = useState('')
  const [pDue,      setPDue]      = useState('')
  const [pNotes,    setPNotes]    = useState('')

  // Payment form
  const [pmPayableId, setPmPayableId] = useState('')
  const [pmDate,      setPmDate]      = useState('')
  const [pmAmount,    setPmAmount]    = useState('')
  const [pmMethod,    setPmMethod]    = useState('Bank Transfer')
  const [pmBank,      setPmBank]      = useState('Zenith Bank')
  const [pmRef,       setPmRef]       = useState('')
  const [pmBy,        setPmBy]        = useState('Accountant')

  // Loan form
  const [lYear,   setLYear]   = useState(String(new Date().getFullYear()))
  const [lMonth,  setLMonth]  = useState('')
  const [lAmount, setLAmount] = useState('')
  const [lType,   setLType]   = useState('Drawdown')
  const [lSource, setLSource] = useState('DR ADENIRAN')
  const [lLoc,    setLLoc]    = useState('Lagos')
  const [lNotes,  setLNotes]  = useState('')

  // Plan form
  const [plPayableId, setPlPayableId] = useState('')
  const [plMonth,     setPlMonth]     = useState('JAN 2026')
  const [plAmount,    setPlAmount]    = useState('')
  const [plNotes,     setPlNotes]     = useState('')

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('sp_dark', dark)
  }, [dark])

  useEffect(() => { reload() }, [reload])

  // Pre-fill edit form
  useEffect(() => {
    if (!editPayable) return
    setPDesc(editPayable.description||''); setPBranch(editPayable.branch||'Ilasa')
    setPCat(editPayable.category||'Equipment'); setPSupplier(editPayable.supplier||'')
    setPTotal(editPayable.total_amount||''); setPPaid(editPayable.opening_paid||'')
    setPDue(editPayable.due_date||''); setPNotes(editPayable.notes||'')
    setShowPayable(true)
  }, [editPayable])

  useEffect(() => {
    if (!quickPayId) return
    setPmPayableId(quickPayId)
    setPmDate(new Date().toISOString().split('T')[0])
    setShowPayment(true)
  }, [quickPayId])

  function openAddPayable() {
    setEditPayable(null)
    setPDesc(''); setPBranch('Ilasa'); setPCat('Equipment')
    setPSupplier(''); setPTotal(''); setPPaid(''); setPDue(''); setPNotes('')
    setShowPayable(true)
  }

  function openAddPayment() {
    setQuickPayId(null); setPmPayableId('')
    setPmDate(new Date().toISOString().split('T')[0])
    setPmAmount(''); setPmRef('')
    setShowPayment(true)
  }

  function openRepaymentModal() {
    const mdPayable = data.payables.find(p=>p.category==='MD Loan'&&p.outstanding>0)
    setQuickPayId(null)
    setPmPayableId(mdPayable?.id||'')
    setPmDate(new Date().toISOString().split('T')[0])
    setPmAmount(''); setPmRef('')
    setShowPayment(true)
  }

  function openAddLoan() {
    setLYear(String(new Date().getFullYear())); setLMonth('')
    setLAmount(''); setLType('Drawdown'); setLSource('DR ADENIRAN')
    setLLoc('Lagos'); setLNotes('')
    setShowLoan(true)
  }

  function openAddPlan() {
    const first = data.payables.find(p=>p.outstanding>0)
    setPlPayableId(first?.id||'')
    setPlMonth('JAN 2026'); setPlAmount(''); setPlNotes('')
    setShowPlan(true)
  }

  // ---- SAVES ----
  async function savePayable() {
    if (!pDesc.trim()) { toast('Enter a description','error'); return }
    setSaving(true)
    const payload = {
      description: pDesc.trim(), branch: pBranch, category: pCat,
      supplier: pSupplier||null, total_amount: parseFloat(pTotal)||0,
      opening_paid: parseFloat(pPaid)||0, due_date: pDue||null, notes: pNotes||null,
    }
    const { error } = editPayable
      ? await supabase.from('payables').update(payload).eq('id',editPayable.id)
      : await supabase.from('payables').insert(payload)
    setSaving(false)
    if (error) { toast('Error: '+error.message,'error'); return }
    setShowPayable(false); setEditPayable(null)
    await reload()
    toast(editPayable ? 'Payable updated' : 'Payable added')
  }

  async function savePayment() {
    const amount = parseFloat(pmAmount)
    if (!amount||!pmPayableId) { toast('Select payable and enter amount','error'); return }
    setSaving(true)
    const { error } = await supabase.from('payments').insert({
      payable_id: pmPayableId, payment_date: pmDate, amount,
      method: pmMethod, bank: pmBank, reference: pmRef||null, recorded_by: pmBy,
    })
    setSaving(false)
    if (error) { toast('Error: '+error.message,'error'); return }
    setShowPayment(false); setQuickPayId(null)
    setPmAmount(''); setPmRef('')
    await reload()
    toast(`Payment of ₦${Number(amount).toLocaleString('en-NG')} recorded`)
  }

  async function saveLoan() {
    const amount = parseFloat(lAmount)
    if (!amount) { toast('Enter an amount','error'); return }
    setSaving(true)
    const { error } = await supabase.from('loan_entries').insert({
      entry_year: lYear, entry_month: lMonth||null, amount, entry_type: lType,
      source: lSource||'DR ADENIRAN', location: lLoc, notes: lNotes||null,
    })
    setSaving(false)
    if (error) { toast('Error: '+error.message,'error'); return }
    setShowLoan(false); setLAmount(''); setLNotes('')
    await reload(); toast('Loan entry saved')
  }

  async function savePlan() {
    const amount = parseFloat(plAmount)
    if (!amount||!plPayableId) { toast('Select payable and enter amount','error'); return }
    setSaving(true)
    const { error } = await supabase.from('repayment_plan').insert({
      payable_id: plPayableId, scheduled_month: plMonth,
      planned_amount: amount, notes: plNotes||null,
    })
    setSaving(false)
    if (error) {
      toast('Error: '+(error.message.includes('unique')?'Plan entry already exists for this payable + month':error.message),'error')
      return
    }
    setShowPlan(false); setPlAmount(''); setPlNotes('')
    await reload(); toast('Plan entry added')
  }

  const openPayables = data.payables.filter(p=>p.outstanding>0)
  const today = new Date().toLocaleDateString('en-NG',{weekday:'short',day:'numeric',month:'short',year:'numeric'})

  return (
    <>
      <div className="loading-bar" style={{width:loading?'70%':'0',opacity:loading?1:0}} />

      <header className="app-header">
        <div className="logo">
          <div className="logo-mark">S</div>
          <div>
            <div className="logo-text">Sure Payables</div>
            <div className="logo-sub">Sure Medical Diagnostics</div>
          </div>
        </div>
        <div className="header-right">
          {error && <span style={{fontSize:11,color:'#fca5a5',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>⚠ {error}</span>}
          <div className="today-badge">{today}</div>
          <button className="dark-toggle" onClick={()=>setDark(d=>!d)} title="Toggle dark mode">
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <nav className="nav-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`nav-tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>
            {t.label}
            {t.badge && <span className="tab-badge">{data.payables.filter(p=>p.outstanding>0).length}</span>}
          </button>
        ))}
      </nav>

      <main className="main">
        {tab==='dashboard' && <Dashboard data={data} onQuickPay={id=>setQuickPayId(id)} onAddPayable={openAddPayable} />}
        {tab==='payables'  && <PayablesRegister data={data} onQuickPay={id=>setQuickPayId(id)} onEdit={p=>setEditPayable(p)} onAddPayable={openAddPayable} />}
        {tab==='mdloan'    && <MdLoanLedger data={data} onAddLoan={openAddLoan} onRepayment={openRepaymentModal} />}
        {tab==='payments'  && <PaymentLog data={data} onAddPayment={openAddPayment} />}
        {tab==='aging'     && <AgingReport data={data} />}
        {tab==='plan'      && <RepaymentPlan data={data} onAddPlan={openAddPlan} reload={reload} />}
      </main>

      {/* ===== MODAL: ADD/EDIT PAYABLE ===== */}
      {showPayable && (
        <Modal title={editPayable?'Edit Payable':'Add New Payable'} onClose={()=>{setShowPayable(false);setEditPayable(null)}}
          footer={<>
            <button className="btn btn-outline" onClick={()=>{setShowPayable(false);setEditPayable(null)}}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={savePayable}>
              {saving?<><span className="spinner"/> Saving…</>:(editPayable?'Update':'Save Payable')}
            </button>
          </>}>
          <div className="form-grid">
            <div className="form-group span2">
              <label className="form-label">Description</label>
              <input className="form-input" placeholder="e.g. Lab Equipment - URIT" value={pDesc} onChange={e=>setPDesc(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Branch</label>
              <select className="form-select" value={pBranch} onChange={e=>setPBranch(e.target.value)}>
                {BRANCHES.map(b=><option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-select" value={pCat} onChange={e=>setPCat(e.target.value)}>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Vendor / Party</label>
              <input className="form-input" placeholder="e.g. URIT Medical" value={pSupplier} onChange={e=>setPSupplier(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Total Amount (₦)</label>
              <input className="form-input" type="number" placeholder="0" value={pTotal} onChange={e=>setPTotal(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Already Paid (₦)</label>
              <input className="form-input" type="number" placeholder="0" value={pPaid} onChange={e=>setPPaid(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input className="form-input" type="date" value={pDue} onChange={e=>setPDue(e.target.value)} />
            </div>
            <div className="form-group span2">
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" value={pNotes} onChange={e=>setPNotes(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: RECORD PAYMENT ===== */}
      {showPayment && (
        <Modal title="Record Payment" onClose={()=>{setShowPayment(false);setQuickPayId(null)}}
          footer={<>
            <button className="btn btn-outline" onClick={()=>{setShowPayment(false);setQuickPayId(null)}}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={savePayment}>
              {saving?<><span className="spinner"/> Saving…</>:'Save Payment'}
            </button>
          </>}>
          <div className="form-grid">
            <div className="form-group span2">
              <label className="form-label">Payable Item</label>
              <select className="form-select" value={pmPayableId} onChange={e=>setPmPayableId(e.target.value)}>
                <option value="">— Select payable —</option>
                {openPayables.map(p=>(
                  <option key={p.id} value={p.id}>{p.description} ({p.branch}) — ₦{Number(p.outstanding).toLocaleString('en-NG')} outstanding</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Payment Date</label>
              <input className="form-input" type="date" value={pmDate} onChange={e=>setPmDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Amount Paid (₦)</label>
              <input className="form-input" type="number" placeholder="0" value={pmAmount} onChange={e=>setPmAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Method</label>
              <select className="form-select" value={pmMethod} onChange={e=>setPmMethod(e.target.value)}>
                <option>Bank Transfer</option><option>Cash</option><option>Cheque</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Bank</label>
              <select className="form-select" value={pmBank} onChange={e=>setPmBank(e.target.value)}>
                <option>Zenith Bank</option><option>Moniepoint</option><option>Kuda</option><option>Other</option>
              </select>
            </div>
            <div className="form-group span2">
              <label className="form-label">Reference / Notes</label>
              <input className="form-input" placeholder="Transaction ref" value={pmRef} onChange={e=>setPmRef(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Recorded By</label>
              <select className="form-select" value={pmBy} onChange={e=>setPmBy(e.target.value)}>
                <option>Accountant</option><option>Admin</option><option>MD</option><option>Manager</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: LOAN ENTRY ===== */}
      {showLoan && (
        <Modal title="Log Loan Entry" onClose={()=>setShowLoan(false)}
          footer={<>
            <button className="btn btn-outline" onClick={()=>setShowLoan(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={saveLoan}>
              {saving?<><span className="spinner"/> Saving…</>:'Save Entry'}
            </button>
          </>}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Year</label>
              <input className="form-input" placeholder="2026" value={lYear} onChange={e=>setLYear(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Month</label>
              <select className="form-select" value={lMonth} onChange={e=>setLMonth(e.target.value)}>
                <option value="">— Optional —</option>
                {MONTHS_SHORT.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Amount (₦)</label>
              <input className="form-input" type="number" placeholder="0" value={lAmount} onChange={e=>setLAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={lType} onChange={e=>setLType(e.target.value)}>
                <option>Drawdown</option><option>Repayment</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Source / Lender</label>
              <input className="form-input" value={lSource} onChange={e=>setLSource(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <select className="form-select" value={lLoc} onChange={e=>setLLoc(e.target.value)}>
                <option>Lagos</option><option>Ilasa</option><option>Ilesha</option><option>Ikeja</option><option>Personal</option>
              </select>
            </div>
            <div className="form-group span2">
              <label className="form-label">Notes / Purpose</label>
              <textarea className="form-textarea" placeholder="What was this for?" value={lNotes} onChange={e=>setLNotes(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: ADD PLAN ENTRY ===== */}
      {showPlan && (
        <Modal title="Add Repayment Plan Entry" onClose={()=>setShowPlan(false)}
          footer={<>
            <button className="btn btn-outline" onClick={()=>setShowPlan(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={savePlan}>
              {saving?<><span className="spinner"/> Saving…</>:'Save Plan'}
            </button>
          </>}>
          <div className="form-grid">
            <div className="form-group span2">
              <label className="form-label">Payable Item</label>
              <select className="form-select" value={plPayableId} onChange={e=>setPlPayableId(e.target.value)}>
                <option value="">— Select payable —</option>
                {openPayables.map(p=>(
                  <option key={p.id} value={p.id}>{p.description} ({p.branch}) — ₦{Number(p.outstanding).toLocaleString('en-NG')} outstanding</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Scheduled Month</label>
              <select className="form-select" value={plMonth} onChange={e=>setPlMonth(e.target.value)}>
                {PLAN_MONTHS.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Planned Amount (₦)</label>
              <input className="form-input" type="number" placeholder="0" value={plAmount} onChange={e=>setPlAmount(e.target.value)} />
            </div>
            <div className="form-group span2">
              <label className="form-label">Notes</label>
              <input className="form-input" placeholder="e.g. Instalment 2 of 4" value={plNotes} onChange={e=>setPlNotes(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export default function App() {
  return <ToastProvider><AppInner /></ToastProvider>
}
