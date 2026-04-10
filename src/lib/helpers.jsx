export const BRANCHES   = ['Ilasa','Palm Avenue','Ikeja','Ilesha','OAUTH']
export const CATEGORIES = ['Equipment','Supplier Invoice','MD Loan','MD Allowance','Renovation','OAUTH Share','Reagents','Solar/Power','Other']
export const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
export const PLAN_MONTHS  = MONTHS_SHORT.flatMap(m => [`${m} 2026`,`${m} 2027`])

export function fmt(n) {
  if (n === null || n === undefined || n === '') return '—'
  return '₦' + Number(n).toLocaleString('en-NG')
}
export function fmtShort(n) {
  if (!n && n !== 0) return '₦0'
  const v = Number(n)
  if (v >= 1000000) return '₦' + (v/1000000).toFixed(1) + 'M'
  if (v >= 1000)    return '₦' + (v/1000).toFixed(0) + 'k'
  return '₦' + v
}
export function getDaysOverdue(due) {
  if (!due) return null
  const now = new Date(); now.setHours(0,0,0,0)
  return Math.floor((now - new Date(due)) / 86400000)
}
export function ageBand(days) {
  if (!days || days <= 0) return { label:'Not Due',    cls:'badge-navy' }
  if (days <= 30)          return { label:'1–30 days', cls:'badge-amber' }
  if (days <= 60)          return { label:'31–60 days',cls:'badge-orange' }
  if (days <= 90)          return { label:'61–90 days',cls:'badge-red' }
  return                          { label:'90+ days',  cls:'badge-red' }
}
export function StatusBadge({ status }) {
  const map = { Paid:'badge-green', Partial:'badge-amber', Outstanding:'badge-red', Pending:'badge-slate' }
  return <span className={`badge ${map[status]||'badge-slate'}`}>{status}</span>
}
export function ProgressBar({ pct }) {
  const cls = pct >= 100 ? '' : pct >= 50 ? 'amber' : 'red'
  return (
    <div>
      <div className="progress-wrap">
        <div className={`progress-fill ${cls}`} style={{ width:`${Math.min(100,pct)}%` }} />
      </div>
      <div className="progress-label">{Math.round(pct)}%</div>
    </div>
  )
}
export function curMonthLabel() {
  const now = new Date()
  return MONTHS_SHORT[now.getMonth()] + ' ' + now.getFullYear()
}
export function toCSV(rows) {
  return rows.map(r => r.map(c => {
    const v = String(c ?? '').replace(/"/g,'""')
    return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v}"` : v
  }).join(',')).join('\n')
}
export function triggerDownload(content, filename) {
  const blob = new Blob([content], { type:'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}
