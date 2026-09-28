import './styles.css';
import './responsive.css';
import type { Metadata, Viewport } from 'next';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0c7757' };
export const metadata: Metadata = { title:'Jenosize AI CRM', description:'Internal commercial CRM with AI copilot and LINE integration' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="th"><body>{children}</body></html>; }
