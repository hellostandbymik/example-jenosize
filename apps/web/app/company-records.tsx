'use client';
import { useRef, useState, type KeyboardEvent } from 'react';

type Contact = { id: string; first_name: string; last_name?: string | null; email?: string | null; title?: string | null; line_user_id?: string | null };
type Lead = { id: string; title: string; stage: string; contact_name?: string | null; value?: string | number | null };
type Props = { companyId: string; contacts: Contact[]; leads: Lead[]; openContact: (id: string) => void; openLead: (id: string) => void };
const tabs = ['contacts', 'leads'] as const;

export default function CompanyRecords({ companyId, contacts, leads, openContact, openLead }: Props) {
  const [activeTab, setActiveTab] = useState<typeof tabs[number]>('contacts');
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const records = useRef<HTMLDivElement>(null);
  const prefix = `company-${companyId}`;

  function selectTab(tab: typeof tabs[number]) {
    setActiveTab(tab);
    // A sticky tab remains reachable after scrolling a long contact list.
    // Bring the new list's beginning into view when switching from further down.
    const section = records.current;
    const drawer = section?.closest('.drawer');
    if (section && drawer && section.getBoundingClientRect().top < drawer.getBoundingClientRect().top) {
      section.scrollIntoView({ block: 'start' });
    }
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault(); selectTab(tabs[next]); tabButtons.current[next]?.focus({ preventScroll: true });
  }

  return <div ref={records} className="companyRecords">
    <div className="companyRecordsTabs" role="tablist" aria-label="ข้อมูลที่เกี่ยวข้องกับบริษัท">
      {tabs.map((tab, index) => <button key={tab} ref={element => { tabButtons.current[index] = element; }}
        type="button" role="tab" id={`${prefix}-tab-${tab}`} aria-controls={`${prefix}-panel-${tab}`}
        aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1}
        onClick={() => selectTab(tab)} onKeyDown={event => navigate(event, index)}>
        {tab === 'contacts' ? 'Contacts' : 'Leads'} <span>{tab === 'contacts' ? contacts.length : leads.length}</span>
      </button>)}
    </div>
    <section className="companyRecordsPanel" role="tabpanel" tabIndex={0} hidden={activeTab !== 'contacts'}
      id={`${prefix}-panel-contacts`} aria-labelledby={`${prefix}-tab-contacts`}>
      {activeTab === 'contacts' && (contacts.length ? <div className="tableWrap"><table className="recordTable"><thead><tr><th>CONTACT</th><th>EMAIL</th><th>TITLE</th><th>LINE</th></tr></thead><tbody>
        {contacts.map(contact => <tr key={contact.id} role="button" tabIndex={0} aria-label={`ดูรายละเอียด ${contact.first_name} ${contact.last_name || ''}`}
          onClick={() => openContact(contact.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openContact(contact.id); } }}>
          <td data-label="ผู้ติดต่อ"><strong>{contact.first_name} {contact.last_name}</strong></td><td data-label="อีเมล">{contact.email || '—'}</td>
          <td data-label="ตำแหน่ง">{contact.title || '—'}</td><td data-label="LINE">{contact.line_user_id ? 'Linked' : '—'}</td>
        </tr>)}
      </tbody></table></div> : <p className="muted">ยังไม่มี Contact ของบริษัทนี้</p>)}
    </section><section className="companyRecordsPanel" role="tabpanel" tabIndex={0} hidden={activeTab !== 'leads'}
      id={`${prefix}-panel-leads`} aria-labelledby={`${prefix}-tab-leads`}>
      {activeTab === 'leads' && (leads.length ? <div className="tableWrap"><table className="recordTable"><thead><tr><th>LEAD</th><th>STAGE</th><th>CONTACT</th><th>VALUE</th></tr></thead><tbody>
        {leads.map(lead => <tr key={lead.id} role="button" tabIndex={0} aria-label={`ดูรายละเอียด Lead ${lead.title}`}
          onClick={() => openLead(lead.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openLead(lead.id); } }}>
          <td data-label="โอกาสขาย"><strong>{lead.title}</strong></td><td data-label="สถานะ">{lead.stage}</td>
          <td data-label="ผู้ติดต่อ">{lead.contact_name || '—'}</td><td data-label="มูลค่า">{lead.value ? `฿${Number(lead.value).toLocaleString()}` : '—'}</td>
        </tr>)}
      </tbody></table></div> : <p className="muted">ยังไม่มี Lead ของบริษัทนี้</p>)}
    </section>
  </div>;
}
