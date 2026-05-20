import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { loadVendorLedger } from '../lib/useData.js'
import { fmt, fmtShort, BANKS, BRANCHES, toCSV, triggerDownload } from '../lib/helpers.jsx'
import { useToast } from '../lib/ToastContext.jsx'
import Modal from './Modal.jsx'
import DownloadMenu from './DownloadMenu.jsx'

const RECORDED_BY = ['Accountant', 'Admin', 'MD', 'Manager']

export default function VendorLedger({ vendor, onBack, onDataChange }) {
  const toast = useToast()
  const [txns,      setTxns]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showAdd,   setShowAdd]   = useState(false)
  const [editTxn,   setEditTxn]   = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(null)
  const [branchFilter, setBranchFilter] = useState('')   // branch toggle

  // Form state
  const [fType,       setFType]       = useState('Credit')
  const [fMonth,      setFMonth]      = useState('')
  const [fDate,       setFDate]       = useState('')
  const [fRef,        setFRef]        = useState('')
  const [fDetails,    setFDetails]    = useState('')
  const [fAmount,     setFAmount]     = useState('')
  const [fBank,       setFBank]       = useState('Zenith Bank')
  const [fBranch,     setFBranch]     = useState('')
  const [fRecordedBy, setFRecordedBy] = useState('Accountant')

  async function load() {
    setLoading(true)
    try { setTxns(await loadVendorLedger(vendor.id)) }
    catch(e) { toast('Error loading ledger: ' + e.message, 'error') }
    setLoading(false)
  }

  useEffect(() => { load() }, [vendor.id])

  // Apply branch filter to transactions
  const filteredTxns = useMemo(() =>
    branchFilter
      ? txns.filter(t => t.branch === branchFilter)
      : txns
  , [txns, branchFilter])

  // Totals — always from filtered view
  const credits = filteredTxns.reduce((s,t) => s + (t.txn_type==='Credit' ? Number(t.amount) : 0), 0)
  const debits  = filteredTxns.reduce((s,t) => s + (t.txn_type==='Debit'  ? Number(t.amount) : 0), 0)
  const balance = credits - debits

  // Branches that have transactions for this vendor
  const txnBranches = useMemo(() =>
    [...new Set(txns.map(t => t.branch).filter(Boolean))].sort()
  , [txns])

  function openAdd(defaultType = 'Credit') {
    setEditTxn(null)
    setFType(defaultType)
    setFMonth('')
    setFDate(new Date().toISOString().split('T')[0])
    setFRef(''); setFDetails(''); setFAmount('')
    setFBank('Zenith Bank')
    setFBranch(branchFilter || (vendor.branch && vendor.branch !== 'All Locations' ? vendor.branch : ''))
    setFRecordedBy('Accountant')
    setShowAdd(true)
  }

  function openEdit(t) {
    setEditTxn(t)
    setFType(t.txn_type)
    setFMonth(t.txn_month || '')
    setFDate(t.txn_date || '')
    setFRef(t.doc_ref || '')
    setFDetails(t.details)
    setFAmount(t.amount)
    setFBank(t.payment_bank || 'Zenith Bank')
    setFBranch(t.branch || '')
    setFRecordedBy(t.recorded_by || 'Accountant')
    setShowAdd(true)
  }

  async function save() {
    const amount = parseFloat(fAmount)
    if (!fDetails.trim() || !amount) { toast('Enter details and amount', 'error'); return }
    setSaving(true)
    const payload = {
      vendor_id:    vendor.id,
      txn_type:     fType,
      txn_month:    fMonth || null,
      txn_date:     fDate  || null,
      doc_ref:      fRef   || null,
      details:      fDetails.trim(),
      amount,
      payment_bank: fType === 'Debit' ? fBank : null,
      branch:       fBranch || null,
      recorded_by:  fRecordedBy || null,
    }
    const { error } = editTxn
      ? await supabase.from('vendor_transactions').update(payload).eq('id', editTxn.id)
      : await supabase.from('vendor_transactions').insert(payload)
    setSaving(false)
    if (error) { toast('Error: ' + error.message, 'error'); return }
    setShowAdd(false); setEditTxn(null)
    await load(); onDataChange()
    toast(editTxn ? 'Transaction updated' : (fType === 'Credit' ? 'Invoice/bill recorded' : 'Payment recorded'))
  }

  async function deleteTxn(id) {
    if (!confirm('Delete this transaction? This cannot be undone.')) return
    setDeleting(id)
    const { error } = await supabase.from('vendor_transactions').delete().eq('id', id)
    setDeleting(null)
    if (error) { toast('Error: ' + error.message, 'error'); return }
    await load(); onDataChange()
    toast('Transaction deleted')
  }

  const today = new Date().toISOString().split('T')[0]
  function dl() {
    const rows=[['Month','Date','Branch','Doc Ref','Details','Type','Debit (₦)','Credit (₦)','Bank','Recorded By','Running Balance (₦)']]
    filteredTxns.forEach(t=>rows.push([
      t.txn_month||'', t.txn_date||'', t.branch||'', t.doc_ref||'',
      t.details, t.txn_type,
      t.txn_type==='Debit'?t.amount:'',
      t.txn_type==='Credit'?t.amount:'',
      t.payment_bank||'', t.recorded_by||'', t.running_balance
    ]))
    triggerDownload(toCSV(rows), `${vendor.name.replace(/\s+/g,'_')}${branchFilter?'_'+branchFilter:''}_ledger_${today}.csv`)
  }

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← All Vendors</button>

      <div className="section-header">
        <div>
          <div style={{fontSize:11,color:'var(--text-4)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:3}}>
            {vendor.vendor_id} · {vendor.vendor_type}
          </div>
          <h1 className="section-title">{vendor.name}</h1>
          {vendor.branch && <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>📍 {vendor.branch}</div>}
        </div>
        <div className="section-actions">
          <DownloadMenu items={[{label:'📄 CSV — Ledger', fn:dl}]} />
          <button className="btn btn-blue"    onClick={() => openAdd('Debit')}>+ Record Payment</button>
          <button className="btn btn-primary" onClick={() => openAdd('Credit')}>+ Add Invoice/Bill</button>
        </div>
      </div>

      {/* Branch toggle — only show if transactions exist with branch tags */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        <span style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.5px'}}>
          View by branch:
        </span>
        {/* All button */}
        <button
          onClick={() => setBranchFilter('')}
          className="btn btn-sm"
          style={{
            background: !branchFilter ? 'var(--navy-bg)' : 'var(--bg-card)',
            color: !branchFilter ? 'white' : 'var(--text-3)',
            border: '1px solid var(--border-2)',
          }}
        >
          All {txns.length > 0 && <span style={{opacity:.7,fontSize:10,marginLeft:3}}>({txns.length})</span>}
        </button>
        {/* Per-branch buttons from actual transaction data */}
        {txnBranches.map(b => {
          const bTxns = txns.filter(t => t.branch === b)
          const bCr   = bTxns.reduce((s,t)=>s+(t.txn_type==='Credit'?Number(t.amount):0),0)
          const bDb   = bTxns.reduce((s,t)=>s+(t.txn_type==='Debit' ?Number(t.amount):0),0)
          const bBal  = bCr - bDb
          return (
            <button
              key={b}
              onClick={() => setBranchFilter(branchFilter === b ? '' : b)}
              className="btn btn-sm"
              style={{
                background: branchFilter===b ? 'var(--navy-bg)' : 'var(--bg-card)',
                color: branchFilter===b ? 'white' : 'var(--text-3)',
                border: '1px solid var(--border-2)',
              }}
            >
              {b}
              <span style={{
                marginLeft:5, fontSize:10, opacity:.8,
                color: branchFilter===b ? 'rgba(255,255,255,.8)' : bBal>0?'var(--red)':bBal<0?'var(--blue)':'var(--green)'
              }}>
                {bBal<0?`(${fmtShort(Math.abs(bBal))})CR`:fmtShort(bBal)}
              </span>
            </button>
          )
        })}
        {/* Untagged transactions */}
        {txns.some(t => !t.branch) && (
          <button
            onClick={() => setBranchFilter(branchFilter === '__none__' ? '' : '__none__')}
            className="btn btn-sm"
            style={{
              background: branchFilter==='__none__' ? 'var(--amber)' : 'var(--bg-card)',
              color: branchFilter==='__none__' ? 'white' : 'var(--amber)',
              border: '1px solid var(--amber)',
            }}
          >
            ⚠ Untagged ({txns.filter(t=>!t.branch).length})
          </button>
        )}
      </div>

      {/* Ledger summary bar */}
      <div className="ledger-header">
        <div>
          <div className="lh-label">{branchFilter && branchFilter!=='__none__' ? `${branchFilter} — ` : ''}Total Invoiced</div>
          <div className="lh-value orange">{fmtShort(credits)}</div>
        </div>
        <div>
          <div className="lh-label">{branchFilter && branchFilter!=='__none__' ? `${branchFilter} — ` : ''}Total Paid</div>
          <div className="lh-value green">{fmtShort(debits)}</div>
        </div>
        <div>
          <div className="lh-label">Balance{branchFilter && branchFilter!=='__none__' ? ` (${branchFilter})` : ''}</div>
          <div className={`lh-value ${balance>0?'red':balance<0?'orange':'green'}`}>
            {balance<0?`(${fmtShort(Math.abs(balance))}) CR`:fmtShort(balance)}
          </div>
        </div>
        <div>
          <div className="lh-label">Transactions</div>
          <div className="lh-value">
            {filteredTxns.length}
            {branchFilter && <span style={{fontSize:13,opacity:.6}}> of {txns.length}</span>}
          </div>
        </div>
      </div>

      {balance < 0 && (
        <div className="info-banner">
          ℹ️ Credit balance of {fmt(Math.abs(balance))} — vendor has been overpaid or a credit note applies.
        </div>
      )}

      <div className="table-card">
        <div className="table-header">
          <span className="table-title">
            Ledger — {vendor.name}
            {branchFilter && branchFilter!=='__none__' && <span style={{color:'var(--brand)',marginLeft:6}}>· {branchFilter}</span>}
            {branchFilter==='__none__' && <span style={{color:'var(--amber)',marginLeft:6}}>· Untagged only</span>}
          </span>
          <span style={{fontSize:11,color:'var(--text-3)'}}>Credit = invoice raised · Debit = payment made</span>
        </div>
        <div className="table-wrap">
          {loading
            ? <div className="empty"><div className="empty-icon">⏳</div><div className="empty-text">Loading…</div></div>
            : <table>
                <thead><tr>
                  <th>Month</th><th>Date</th><th>Branch</th><th>Doc Ref</th><th>Details</th>
                  <th style={{textAlign:'right'}}>Debit (₦)</th>
                  <th style={{textAlign:'right'}}>Credit (₦)</th>
                  <th>Bank</th><th>By</th>
                  <th style={{textAlign:'right'}}>Balance (₦)</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {filteredTxns.length===0
                    ? <tr><td colSpan={11}><div className="empty">
                        <div className="empty-icon">📒</div>
                        <div className="empty-text">
                          {branchFilter
                            ? `No transactions tagged to ${branchFilter==='__none__'?'(untagged)':branchFilter}`
                            : 'No transactions yet. Add an invoice or payment above.'}
                        </div>
                      </div></td></tr>
                    : filteredTxns.map(t => (
                        <tr key={t.id} className={t.txn_type==='Credit'?'ledger-credit':'ledger-debit'}>
                          <td style={{fontSize:11,color:'var(--text-3)'}}>{t.txn_month||'—'}</td>
                          <td className="mono">{t.txn_date||'—'}</td>
                          <td>
                            {t.branch
                              ? <span className="badge badge-navy" style={{fontSize:9}}>{t.branch}</span>
                              : <span style={{color:'var(--amber)',fontSize:10}}>⚠ untagged</span>
                            }
                          </td>
                          <td style={{fontSize:11,color:'var(--text-3)'}}>{t.doc_ref||'—'}</td>
                          <td style={{maxWidth:220}}>
                            <div style={{fontSize:12}}>{t.details}</div>
                            <span className={`badge ${t.txn_type==='Credit'?'badge-green':'badge-blue'}`} style={{marginTop:2,fontSize:9}}>
                              {t.txn_type==='Credit'?'Invoice/Bill':'Payment'}
                            </span>
                          </td>
                          <td className="mono" style={{textAlign:'right',color:'var(--blue)',fontWeight:t.txn_type==='Debit'?700:400}}>
                            {t.txn_type==='Debit'?fmt(t.amount):''}
                          </td>
                          <td className="mono" style={{textAlign:'right',color:'var(--green)',fontWeight:t.txn_type==='Credit'?700:400}}>
                            {t.txn_type==='Credit'?fmt(t.amount):''}
                          </td>
                          <td style={{fontSize:11,color:'var(--text-3)'}}>{t.payment_bank||'—'}</td>
                          <td style={{fontSize:11,color:'var(--text-3)'}}>{t.recorded_by||'—'}</td>
                          <td className="mono" style={{textAlign:'right',fontWeight:700,
                            color:Number(t.running_balance)>0?'var(--red)':Number(t.running_balance)<0?'var(--blue)':'var(--green)'}}>
                            {!branchFilter
                              ? (Number(t.running_balance)<0
                                  ?`(${fmt(Math.abs(t.running_balance))}) CR`
                                  :fmt(t.running_balance))
                              : '—'  // running balance only meaningful when viewing all
                            }
                          </td>
                          <td>
                            <div style={{display:'flex',gap:3}}>
                              <button className="btn btn-ghost btn-xs" onClick={()=>openEdit(t)}>✏️</button>
                              <button className="btn btn-ghost btn-xs" disabled={deleting===t.id}
                                onClick={()=>deleteTxn(t.id)}>
                                {deleting===t.id?<span className="spinner"/>:'🗑️'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
          }
        </div>
      </div>

      {/* Add / Edit modal */}
      {showAdd && (
        <Modal
          title={editTxn?'Edit Transaction':fType==='Credit'?'Add Invoice / Bill':'Record Payment'}
          onClose={()=>{setShowAdd(false);setEditTxn(null)}}
          footer={<>
            <button className="btn btn-outline" onClick={()=>{setShowAdd(false);setEditTxn(null)}}>Cancel</button>
            <button className={`btn ${fType==='Credit'?'btn-primary':'btn-blue'}`} disabled={saving} onClick={save}>
              {saving?<><span className="spinner"/> Saving…</>
                :(editTxn?'Update':(fType==='Credit'?'Save Invoice':'Save Payment'))}
            </button>
          </>}
        >
          {!editTxn && (
            <div style={{marginBottom:18}}>
              <div className="form-label" style={{marginBottom:6}}>Transaction Type</div>
              <div className="txn-toggle">
                <button className={`txn-toggle-btn ${fType==='Credit'?'active-credit':''}`} onClick={()=>setFType('Credit')}>
                  📥 Invoice / Bill (Credit)
                </button>
                <button className={`txn-toggle-btn ${fType==='Debit'?'active-debit':''}`} onClick={()=>setFType('Debit')}>
                  💳 Payment (Debit)
                </button>
              </div>
              <div style={{fontSize:11,color:'var(--text-3)',marginTop:5}}>
                {fType==='Credit'?'Invoice or bill raised — amount owed increases.':'Payment made — amount owed decreases.'}
              </div>
            </div>
          )}

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Month</label>
              <input className="form-input" placeholder="e.g. JANUARY" value={fMonth} onChange={e=>setFMonth(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={fDate} onChange={e=>setFDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Branch</label>
              <select className="form-select" value={fBranch} onChange={e=>setFBranch(e.target.value)}>
                <option value="">— Select branch —</option>
                {BRANCHES.map(b=><option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Doc / Invoice Ref</label>
              <input className="form-input" placeholder="Invoice or receipt no." value={fRef} onChange={e=>setFRef(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Amount (₦)</label>
              <input className="form-input" type="number" placeholder="0" value={fAmount} onChange={e=>setFAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Recorded By</label>
              <select className="form-select" value={fRecordedBy} onChange={e=>setFRecordedBy(e.target.value)}>
                {RECORDED_BY.map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group span2">
              <label className="form-label">Details / Description</label>
              <textarea className="form-textarea" placeholder="Brief description of this transaction…"
                value={fDetails} onChange={e=>setFDetails(e.target.value)} />
            </div>
            {fType==='Debit' && (
              <div className="form-group span2">
                <label className="form-label">Payment Bank</label>
                <select className="form-select" value={fBank} onChange={e=>setFBank(e.target.value)}>
                  {BANKS.map(b=><option key={b}>{b}</option>)}
                </select>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

