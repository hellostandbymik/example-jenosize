import { Router } from 'express';
import { z } from 'zod';
import { AIError, aiConfiguration, analyzeLead } from './ai.js';
import { leadScope, messageScopeSql } from './access.js';

type Database = {query:(sql:string,params?:any[])=>Promise<{rows:any[];rowCount?:number|null}>};
export function createAIRouter(db:Database) {
  const router=Router();
  router.get('/ai/config',(_req,res)=>res.json(aiConfiguration()));
  router.post('/ai/leads/:id/analyze',async(req,res)=>{
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({error:'Invalid lead ID'});
    try {
      const lead=await db.query(`SELECT l.title,l.stage,l.source,l.value,ct.id contact_id,c.name company,concat_ws(' ',ct.first_name,ct.last_name) contact FROM leads l LEFT JOIN companies c ON c.id=l.company_id LEFT JOIN contacts ct ON ct.id=l.contact_id WHERE l.id=$1 AND ($2::boolean OR l.owner_id=$3)`,[req.params.id,...leadScope(req)]);
      if (!lead.rows.length) return res.status(404).json({error:'Lead not found'});
      const [messages,activities]=await Promise.all([
        db.query(`SELECT content,direction,created_at FROM messages WHERE (lead_id=$1 OR contact_id=$2) AND ($3::boolean OR ${messageScopeSql}) AND status IN ('received','sent') ORDER BY created_at DESC,id DESC LIMIT 20`,[req.params.id,lead.rows[0].contact_id,...leadScope(req)]),
        db.query('SELECT body FROM activities WHERE lead_id=$1 ORDER BY created_at DESC,id DESC LIMIT 10',[req.params.id])
      ]);
      const {contact_id:_,...facts}=lead.rows[0];
      const out=await analyzeLead({...facts,value:facts.value==null?null:Number(facts.value),
        messages:messages.rows.reverse().map(m=>({content:m.content.slice(0,12000),direction:m.direction,created_at:m.created_at})),
        activities:activities.rows.reverse().map(a=>a.body.slice(0,6000))});
      const saved=await db.query("INSERT INTO ai_suggestions(lead_id,kind,result,provider,created_by) VALUES($1,'lead_analysis',$2,$3,$4) RETURNING *",[req.params.id,out.result,out.provider,req.user!.id]);
      await db.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'ai.suggestion_created','lead',$2,$3)",[req.user!.id,req.params.id,{provider:out.provider}]);
      return res.json({suggestion:saved.rows[0]});
    } catch(error) {
      if (error instanceof AIError) return res.status(error.status).json({error:error.message,code:error.code});
      req.log?.error({event:'ai_analysis_failed'},'Could not save AI analysis');
      return res.status(503).json({error:'บันทึกผลวิเคราะห์ไม่สำเร็จ กรุณาลองใหม่'});
    }
  });
  return router;
}
