type LeadDetails = {
  id:string; title:string; company_id:string|null; contact_id:string|null; owner_id:string;
  stage:string; source:string; value:string|number|null; probability:number;
  next_follow_up:string|null; loss_reason:string|null; created_at:string; updated_at:string;
  company:string|null; website:string|null; first_name:string|null; last_name:string|null;
  email:string|null; phone:string|null; line_user_id:string|null; owner:string;
};

const empty='ไม่ระบุ';
function formatDate(value:string|null) {
  if(!value)return empty;
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}):empty;
}

export default function LeadDetails({lead,lineName}:{lead:LeadDetails;lineName:string}) {
  const contact=[lead.first_name,lead.last_name].filter(Boolean).join(' ');
  const value=lead.value==null?empty:new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(lead.value));
  return <>
    <section className="drawerBlock leadFacts" aria-labelledby="lead-facts-title">
      <h3 id="lead-facts-title">ข้อมูล Lead</h3>
      <dl className="leadFactsGrid">
        <div><dt>ที่มาของ Lead</dt><dd>{lead.source||empty}</dd></div>
        <div><dt>ผู้รับผิดชอบ</dt><dd>{lead.owner||empty}</dd></div>
        <div><dt>มูลค่าโอกาสขาย</dt><dd>{value}</dd></div>
        <div><dt>โอกาสปิดการขาย</dt><dd>{lead.probability==null?empty:`${lead.probability}%`}</dd></div>
        {!['Won','Lost'].includes(lead.stage)&&<div className="leadFactWide"><dt>ติดตามครั้งถัดไป</dt><dd>{formatDate(lead.next_follow_up)}</dd></div>}
        {lead.stage==='Lost'&&<div className="leadFactWide"><dt>เหตุผลที่ขายไม่สำเร็จ</dt><dd>{lead.loss_reason||empty}</dd></div>}
        <div><dt>วันที่สร้าง</dt><dd>{formatDate(lead.created_at)}</dd></div>
        <div><dt>แก้ไขล่าสุด</dt><dd>{formatDate(lead.updated_at)}</dd></div>
        <div className="leadFactWide"><dt>รหัส Lead</dt><dd className="leadReference">{lead.id}</dd></div>
      </dl>
      <p className="leadFactsNote">วันและเวลาแสดงตามเวลาไทย</p>
    </section>
    <section className="drawerBlock leadFacts" aria-labelledby="lead-contact-title">
      <h3 id="lead-contact-title">บริษัทและผู้ติดต่อ</h3>
      <dl className="leadFactsGrid">
        <div><dt>บริษัท</dt><dd>{lead.company||empty}</dd></div>
        <div><dt>ผู้ติดต่อ</dt><dd>{contact||empty}</dd></div>
        <div className="leadFactWide"><dt>เว็บไซต์บริษัท</dt><dd>{lead.website||empty}</dd></div>
        <div><dt>อีเมลผู้ติดต่อ</dt><dd>{lead.email||empty}</dd></div>
        <div><dt>โทรศัพท์ผู้ติดต่อ</dt><dd>{lead.phone||empty}</dd></div>
        <div className="leadFactWide"><dt>ชื่อ LINE</dt><dd title={lead.line_user_id||undefined}>{lineName}</dd></div>
      </dl>
    </section>
  </>;
}
