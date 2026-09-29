export interface DemoMember { n: number; name: string; email: string; role: string }
export interface DemoCompany { n: number; name: string; industry: string; website: string; projects: string[]; budget: number }
export interface DemoContact { n: number; company: number; first: string; last: string; email: string; title: string }
export interface DemoLead { n: number; company: number; contact: number; owner: number; title: string; value: number; stage: string; source: string }
export const members: DemoMember[];
export const companies: DemoCompany[];
export const contacts: DemoContact[];
export const leads: DemoLead[];
export function demoSql(passwordHash: string): string;
