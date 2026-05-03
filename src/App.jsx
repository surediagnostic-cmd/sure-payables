import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'
import { useData } from './lib/useData.js'
import { ToastProvider, useToast } from './lib/ToastContext.jsx'
import { VENDOR_TYPES, BRANCHES } from './lib/helpers.jsx'
import Modal from './components/Modal.jsx'
import Dashboard from './components/Dashboard.jsx'
import VendorSummary from './components/VendorSummary.jsx'
import VendorLedger from './components/VendorLedger.jsx'
import AgingReport from './components/AgingReport.jsx'
import RepaymentPlan from './components/RepaymentPlan.jsx'

const TABS = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'vendors',   label: '🏪 Vendors',  badge: true },
  { id: 'aging',     label: '⏳ Aging' },
  { id: 'plan',      label: '📅 Plan' },
]

function AppInner() {
  const toast = useToast()
  const { data, loading, error, reload } = useData()
  const [tab,            setTab]           = useState('dashboard')
  const [selectedVendor, setSelectedVendor]= useState(null)
  const [dark,           setDark]          = useState(() => localStorage.getItem('sp_dark')==='true')
  const [saving,         setSaving]        = useState(false)

  // Vendor modal state
  const [showVendorModal, setShowVendorModal] = useState(false)
  const [editingVendor,   setEditingVendor]   = useState(null)  // null = add, object = edit
  const [vName,   setVName]   = useState('')
  const [vType,   setVType]   = useState('Trade Payable')
  const [vBranch, setVBranch] = useState('')
  const [vNotes,  setVNotes]  = useState('')

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('sp_dark', dark)
  }, [dark])

  function openAddVendor() {
    setEditingVendor(null)
    setVName(''); setVType('Trade Payable'); setVBranch(''); setVNotes('')
    setShowVendorModal(true)
  }

  function openEditVendor(v) {
    setEditingVendor(v)
    setVName(v.name); setVType(v.vendor_type); setVBranch(v.branch||''); setVNotes(v.notes||'')
    setShowVendorModal(true)
  }

  function openDeleteVendor(v) {
    setDeleteTarget(v)
  }

  async function saveVendor() {
    if (!vName.trim()) { toast('Enter a vendor name','error'); return }
    setSaving(true)
    let err
    if (editingVendor) {
      // UPDATE
      const { error } = await supabase.from('vendors').update({
        name:        vName.trim(),
        vendor_type: vType,
        branch:      vBranch || null,
        notes:       vNotes  || null,
      }).eq('id', editingVendor.id)
      err = error
    } else {
      // INSERT — auto-generate vendor_id
      const maxId = data.vendors.reduce((m,v) => {
        const n = parseInt(v.vendor_id.replace('V','')) || 0
        return Math.max(m, n)
      }, 0)
      const { error } = await supabase.from('vendors').insert({
        vendor_id:   'V' + (maxId + 1),
        name:        vName.trim(),
        vendor_type: vType,
        branch:      vBranch || null,
        notes:       vNotes  || null,
      })
      err = error
    }
    setSaving(false)
    if (err) { toast('Error: '+err.message,'error'); return }
    setShowVendorModal(false); setEditingVendor(null)
    await reload()
    toast(editingVendor ? `${vName} updated` : `Vendor added`)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    // Block delete if vendor has transactions
    const { count } = await supabase
      .from('vendor_transactions')
      .select('*', { count:'exact', head:true })
      .eq('vendor_id', deleteTarget.id)
    if (count > 0) {
      toast(`Cannot delete — ${deleteTarget.name} has ${count} transaction${count!==1?'s':''}. Clear transactions first.`, 'error')
      setDeleteTarget(null); return
    }
    setDeleting(true)
    const { error } = await supabase.from('vendors').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) { toast('Error: '+error.message,'error'); return }
    setDeleteTarget(null)
    await reload()
    toast(`${deleteTarget.name} deleted`)
  }

  function handleBack() { setSelectedVendor(null); reload() }

  const today = new Date().toLocaleDateString('en-NG',{weekday:'short',day:'numeric',month:'short',year:'numeric'})
  const outstandingCount = data.vendors.filter(v=>Number(v.balance)>0).length

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
          {error && <span style={{fontSize:10,color:'#fca5a5',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>⚠ {error}</span>}
          <div className="date-badge">{today}</div>
          <button className="dark-btn" onClick={()=>setDark(d=>!d)}>{dark?'☀️':'🌙'}</button>
        </div>
      </header>

      {!selectedVendor && (
        <nav className="nav-tabs">
          {TABS.map(t => (
            <button key={t.id} className={`nav-tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>
              {t.label}
              {t.badge && outstandingCount > 0 && <span className="tab-badge">{outstandingCount}</span>}
            </button>
          ))}
        </nav>
      )}

      <main className="main">
        {selectedVendor ? (
          <VendorLedger vendor={selectedVendor} onBack={handleBack} onDataChange={reload} />
        ) : (
          <>
            {tab==='dashboard' && <Dashboard data={data} onSelectVendor={v=>setSelectedVendor(v)} />}
            {tab==='vendors'   && (
              <VendorSummary
                data={data}
                onSelectVendor={v=>setSelectedVendor(v)}
                onAddVendor={openAddVendor}
                onEditVendor={openEditVendor}
                onDeleteVendor={openDeleteVendor}
              />
            )}
            {tab==='aging'     && <AgingReport data={data} onSelectVendor={v=>setSelectedVendor(v)} />}
            {tab==='plan'      && <RepaymentPlan data={data} reload={reload} />}
          </>
        )}
      </main>

      {/* ADD / EDIT VENDOR MODAL */}
      {showVendorModal && (
        <Modal
          title={editingVendor ? `Edit — ${editingVendor.name}` : 'Add New Vendor'}
          onClose={()=>{setShowVendorModal(false);setEditingVendor(null)}}
          footer={<>
            <button className="btn btn-outline" onClick={()=>{setShowVendorModal(false);setEditingVendor(null)}}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={saveVendor}>
              {saving?<><span className="spinner"/> Saving…</>:(editingVendor?'Update Vendor':'Add Vendor')}
            </button>
          </>}
        >
          <div className="form-grid">
            <div className="form-group span2">
              <label className="form-label">Vendor Name</label>
              <input className="form-input" placeholder="e.g. ACME Medical Supplies" value={vName} onChange={e=>setVName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Vendor Type</label>
              <select className="form-select" value={vType} onChange={e=>setVType(e.target.value)}>
                {VENDOR_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Branch</label>
              <select className="form-select" value={vBranch} onChange={e=>setVBranch(e.target.value)}>
                <option value="">— Select branch —</option>
                {BRANCHES.map(b=><option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group span2">
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" placeholder="Any notes about this vendor…" value={vNotes} onChange={e=>setVNotes(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteTarget && (
        <Modal
          title="Delete Vendor"
          onClose={()=>setDeleteTarget(null)}
          footer={<>
            <button className="btn btn-outline" onClick={()=>setDeleteTarget(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={deleting} onClick={confirmDelete}>
              {deleting?<><span className="spinner"/> Deleting…</>:'Yes, Delete Vendor'}
            </button>
          </>}
        >
          <div style={{textAlign:'center',padding:'8px 0'}}>
            <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
            <div style={{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:8}}>
              Delete <strong>{deleteTarget.name}</strong>?
            </div>
            <div style={{fontSize:13,color:'var(--text-3)',lineHeight:1.6}}>
              This will permanently remove the vendor record.<br/>
              <strong style={{color:'var(--red)'}}>Vendors with existing transactions cannot be deleted.</strong>
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
