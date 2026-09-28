type Props = { total: number; page: number; pageSize: number; change: (page: number) => void; label: string };

export default function ListPagination({ total, page, pageSize, change, label }: Props) {
  if (!total) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className="contactPagination" aria-label={`เปลี่ยนหน้า ${label}`}>
    <span>แสดง {((page - 1) * pageSize + 1).toLocaleString()}–{Math.min(page * pageSize, total).toLocaleString()} จาก {total.toLocaleString()} รายการ</span>
    <div>
      <button className="softButton" disabled={page === 1} onClick={() => change(page - 1)}>ก่อนหน้า</button>
      <select aria-label={`หน้า ${label}`} value={page} onChange={e => change(Number(e.target.value))}>
        {Array.from({ length: pages }, (_, i) => <option key={i + 1} value={i + 1}>หน้า {i + 1} / {pages}</option>)}
      </select>
      <button className="softButton" disabled={page === pages} onClick={() => change(page + 1)}>ถัดไป</button>
    </div>
  </nav>;
}
