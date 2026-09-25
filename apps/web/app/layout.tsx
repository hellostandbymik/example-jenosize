import './styles.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title:'Jenosize AI CRM', description:'Internal commercial CRM with AI copilot and LINE integration' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="th"><body>{children}</body></html>; }
