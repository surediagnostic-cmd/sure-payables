import { fmt, fmtShort, toCSV, triggerDownload } from '../lib/helpers.jsx'
import DownloadMenu from './DownloadMenu.jsx'

export default function MdLoanLedger({ data, onAddLoan, onRepayment }) {
  const entries     = data.loanEntries
  const totalDrawn  = entries.reduce((s,l) => s+(l.entry_type==='Drawdown'  ? Number(l.amount):0), 0)
  const totalRepaid = entries.reduce((s,l) => s+(l.entry_type==='Repayment' ? Number(l.amount):0), 0)

  function dl() {
    const rows=[['#','Year','Month','Amount (N)','Type','Notes','Source','Location','Running Balance']]
    entries.forEach((l,i)=>rows.push([i+1,l.entry_year,l.entry_month||'',l.amount,l.entry_type,l.notes||'',l.source,l.location||'',l.running_balance]))
    triggerDownload(toCSV(rows),`sure_md_loan_${new Date().toISOString().split('T')[0]}.csv`)
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">MD Loan History</h1>
        <div className="section-actions">
          <DownloadMenu items={[{label:'📄 CSV — Loan History',fn:dl}]} />
          <button className="btn btn-outline" onClick={onAddLoan}>+ Log Entry</button>
          <button className="btn btn-primary" onClick={onRepayment}>Record Repayment</button>
        </div>
      </div>

      <div className="loan-hero">
        <div><div className="loan-hero-label">Total Drawn</div><div className="loan-hero-value orange">{fmtShort(totalDrawn)}</div></div>
        <div><div className="loan-hero-label">Total Repaid</div><div className="loan-hero-value green">{fmtShort(totalRepaid)}</div></div>
        <div><div className="loan-hero-label">Net Balance</div><div className="loan-hero-value">{fmtShort(totalDrawn - totalRepaid)}</div></div>
        <div><div className="loan-hero-label">Entries</div><div className="loan-hero-value">{entries.length}</div></div>
        <div><div className="loan-hero-label">Lenders</div><div className="loan-hero-value" style={{fontSize:14,lineHeight:1.4}}>DR ADENIRAN<br/>MR LANCELOT</div></div>
      </div>

      <div style={{background:'var(--brand-orange-pale)',border:'1px solid var(--brand-orange)',borderRadius:'var(--radius)',padding:'10px 16px',marginBottom:16,fontSize:12,color:'var(--brand-orange)'}}>
        💡 Loan entries are also visible in the <strong>Payables Register</strong> grouped under each lender, with repayments reducing oldest drawdowns first.
      </div>

      <div className="table-card">
        <div className="table-header">
          <span className="table-title">Full Loan Ledger — Drawdowns &amp; Repayments</span>
          <span style={{fontSize:11,color:'var(--text-muted)'}}>Read-only · manage entries above</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>#</th><th>Year</th><th>Month</th><th>Amount (₦)</th>
              <th>Notes / Purpose</th><th>Source</th><th>Location</th><th>Type</th><th>Running Balance</th>
            </tr></thead>
            <tbody>
              {entries.map((l,i) => (
                <tr key={l.id}>
                  <td className="mono" style={{color:'var(--text-faint)'}}>{i+1}</td>
                  <td>{l.entry_year}</td>
                  <td>{l.entry_month||'—'}</td>
                  <td className="mono" style={{fontWeight:700,color:l.entry_type==='Repayment'?'var(--green)':'var(--text)'}}>
                    {l.entry_type==='Repayment' ? `(${fmt(l.amount)})` : fmt(l.amount)}
                  </td>
                  <td style={{color:'var(--text-muted)',maxWidth:220,fontSize:11}}>{l.notes||'—'}</td>
                  <td><span className="badge badge-navy">{l.source}</span></td>
                  <td style={{fontSize:11}}>{l.location||'—'}</td>
                  <td><span className={`badge ${l.entry_type==='Repayment'?'badge-green':'badge-orange'}`}>{l.entry_type}</span></td>
                  <td className="mono" style={{fontWeight:700}}>{fmt(l.running_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
