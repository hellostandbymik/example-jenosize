type LeadContext = { title:string; stage:string; source:string; value:number|null; company:string|null; contact:string|null; messages:string[]; activities:string[] };
export type Analysis = { summary:string; score:number; scoreReasons:string[]; missingInformation:string[]; nextBestAction:string; lineReplyDraft:string };
const fallback = (c: LeadContext): Analysis => ({
  summary: `${c.title} อยู่ในขั้น ${c.stage}${c.company ? ` กับ ${c.company}` : ''}. ${c.messages.length ? `มีบทสนทนาล่าสุด ${c.messages.length} รายการ` : 'ยังไม่มีบทสนทนาที่บันทึกไว้'}`,
  score: c.stage === 'Qualified' || c.stage === 'Proposal' ? 65 : 40,
  scoreReasons: ['ประเมินจาก Stage ปัจจุบันเท่านั้น', c.messages.length ? 'มีประวัติการสนทนาใน CRM' : 'ยังไม่มีข้อความสนทนาให้ประเมิน'],
  missingInformation: ['งบประมาณ', 'ผู้มีอำนาจตัดสินใจ', 'กรอบเวลาตัดสินใจ'],
  nextBestAction: 'ติดต่อเพื่อยืนยันความต้องการ งบประมาณ และกำหนดเวลาตัดสินใจ',
  lineReplyDraft: `สวัสดี${c.contact ? `คุณ${c.contact}` : 'ครับ'} ขออนุญาตติดตามเรื่อง ${c.title} สะดวกคุยเพิ่มเติมเพื่อยืนยันความต้องการและกรอบเวลาไหมครับ`
});
export async function analyzeLead(context: LeadContext): Promise<{ result: Analysis; provider:string }> {
  if (process.env.AI_PROVIDER !== 'openai' || !process.env.OPENAI_API_KEY) return { result:fallback(context), provider:'safe-fallback' };
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', signal:AbortSignal.timeout(12000), headers:{'content-type':'application/json',authorization:`Bearer ${process.env.OPENAI_API_KEY}`}, body:JSON.stringify({model:process.env.AI_MODEL || 'gpt-4o-mini',temperature:0.2,response_format:{type:'json_object'},messages:[{role:'system',content:'You are a cautious CRM copilot. Use only supplied CRM facts. Never invent facts. Return JSON keys: summary, score (0-100 integer), scoreReasons (string[]), missingInformation (string[]), nextBestAction, lineReplyDraft. Reply in Thai. Suggestions only; do not execute actions.'},{role:'user',content:JSON.stringify(context)}]}) });
    if (!response.ok) throw new Error(`AI provider status ${response.status}`);
    const json:any = await response.json(); const parsed = JSON.parse(json.choices?.[0]?.message?.content || '{}');
    if (typeof parsed.summary !== 'string' || !Number.isInteger(parsed.score) || parsed.score < 0 || parsed.score > 100 || !Array.isArray(parsed.scoreReasons) || !Array.isArray(parsed.missingInformation) || typeof parsed.nextBestAction !== 'string' || typeof parsed.lineReplyDraft !== 'string') throw new Error('AI response failed schema validation');
    return {result:parsed as Analysis,provider:process.env.AI_MODEL || 'gpt-4o-mini'};
  } catch { return {result:fallback(context),provider:'safe-fallback'}; }
}
