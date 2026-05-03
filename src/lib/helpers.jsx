export const VENDOR_TYPES  = ['Trade Payable', 'Other Payables']
export const BANKS         = ['Zenith Bank','Moniepoint','Kuda','Access Bank','GTBank','First Bank','Other']
export const MONTHS_SHORT  = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
export const PLAN_MONTHS   = MONTHS_SHORT.flatMap(m => [`${m} 2026`, `${m} 2027`])
export const BRANCHES      = ['Ilasa','Palm Avenue','Ikeja','Ilesha','OAUTH']

export function fmt(n) {
  if (n === null || n === undefined) return '—'
  return '₦' + Number(n).toLocaleString('en-NG')
}
export function fmtShort(n) {
  const v = Number(n) || 0
  if (v >= 1000000) return '₦' + (v/1000000).toFixed(1) + 'M'
  if (v >= 1000)    return '₦' + (v/1000).toFixed(0) + 'k'
  return '₦' + v.toLocaleString('en-NG')
}
export function curMonthLabel() {
  const now = new Date()
  return MONTHS_SHORT[now.getMonth()] + ' ' + now.getFullYear()
}
export function toCSV(rows) {
  return rows.map(r => r.map(c => {
    const v = String(c ?? '').replace(/"/g, '""')
    return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v}"` : v
  }).join(',')).join('\n')
}
export function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}
export function balanceStatus(balance) {
  if (balance <= 0 && balance < 0) return 'credit'   // we overpaid — credit in our favour
  if (balance <= 0) return 'clear'                    // settled
  return 'owed'                                       // we owe them
}
export function StatusBadge({ status, planStatus }) {
  const s = planStatus || status
  const map = { Paid:'badge-green', Partial:'badge-amber', Outstanding:'badge-red', Pending:'badge-slate', Settled:'badge-green', Overdue:'badge-red' }
  return <span className={`badge ${map[s]||'badge-slate'}`}>{s}</span>
}
