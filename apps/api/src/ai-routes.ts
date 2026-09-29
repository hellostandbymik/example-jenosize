import { Router } from 'express';
import { z } from 'zod';
import { AIError, aiConfiguration, analyzeLead } from './ai.js';
import { leadScope, messageScopeSql } from './access.js';
import multer from 'multer';
import { AnalysisFileError, extractAnalysisFiles, MAX_CONTEXT_BYTES, MAX_UPLOAD_BYTES } from './analysis-files.js';

const upload=multer({storage:multer.memoryStorage(),limits:{files:3,fileSize:MAX_UPLOAD_BYTES,fields:1,fieldSize:65536,parts:4}}).array('files',3);

type Database = {query:(sql:string,params?:any[])=>Promise<{rows:any[];rowCount?:number|null}>};
export function createAIRouter(db:Database) {
  const router=Router();
  router.get('/ai/config',(_req,res)=>res.json(aiConfiguration()));
  router.post('/ai/leads/:id/analyze',async(req,res)=>{
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({error:'Invalid lead ID'});
    try {
      const lead=await db.query(`SELECT l.title,l.stage,l.source,l.value,l.probability,l.next_follow_up,l.loss_reason,l.created_at,l.updated_at,u.name owner,ct.id contact_id,c.name company,c.industry,c.notes company_notes,concat_ws(' ',ct.first_name,ct.last_name) contact,ct.email,ct.phone,ct.title contact_title FROM leads l LEFT JOIN companies c ON c.id=l.company_id LEFT JOIN contacts ct ON ct.id=l.contact_id JOIN users u ON u.id=l.owner_id WHERE l.id=$1 AND ($2::boolean OR l.owner_id=$3)`,[req.params.id,...leadScope(req)]);
      if (!lead.rows.length) return res.status(404).json({error:'Lead not found'});
      if (['Won','Lost'].includes(lead.rows[0].stage)) return res.status(409).json({error:'Lead นี้ปิดเป็น Won/Lost แล้ว จึงไม่สามารถวิเคราะห์โอกาสขายได้',code:'lead_closed'});
      if(req.is('multipart/form-data')) {
        if(Number(req.headers['content-length']||0)>MAX_UPLOAD_BYTES+80000)throw new AnalysisFileError('upload_too_large','ไฟล์รวมต้องไม่เกิน 3 MB',413);
        await new Promise<void>((resolve,reject)=>upload(req,res,error=>error?reject(error):resolve()));
      }
      const note=z.string().trim().max(20000).safeParse(req.body?.note??'');
      if(!note.success)return res.status(400).json({error:'โน้ตเพิ่มเติมต้องไม่เกิน 20,000 ตัวอักษร'});
      const files=await extractAnalysisFiles(Array.isArray(req.files)?req.files:[]);
      const [messages,activities]=await Promise.all([
        db.query(`SELECT content,id,lead_id,direction,status,created_at,sent_at FROM messages WHERE (lead_id=$1 OR contact_id=$2) AND ($3::boolean OR ${messageScopeSql}) ORDER BY created_at ASC,id ASC`,[req.params.id,lead.rows[0].contact_id,...leadScope(req)]),
        db.query('SELECT body,id,type,created_at,(SELECT name FROM users WHERE id=actor_id) actor FROM activities WHERE lead_id=$1 ORDER BY created_at ASC,id ASC',[req.params.id])
      ]);
      const {contact_id:_,...facts}=lead.rows[0];
      const context={...facts,value:facts.value==null?null:Number(facts.value),messages:messages.rows,activities:activities.rows,files,additionalNote:note.data};
      if(Buffer.byteLength(JSON.stringify(context))>MAX_CONTEXT_BYTES)throw new AnalysisFileError('context_too_large','ข้อมูล Lead ประวัติทั้งหมด และไฟล์รวมกันมีขนาดมากเกินไป กรุณาลดไฟล์หรือโน้ตที่แนบ ระบบยังไม่ได้ตัดหรือส่งข้อมูลไปวิเคราะห์',413);
      const inputSources={messages:messages.rows.length,activities:activities.rows.length,files:files.map(({content:_,...metadata})=>metadata),additionalNote:Boolean(note.data)};
      const out=await analyzeLead(context);
      const result={...out.result,inputSources};
      const saved=await db.query("INSERT INTO ai_suggestions(lead_id,kind,result,provider,created_by) VALUES($1,'lead_analysis',$2,$3,$4) RETURNING *",[req.params.id,result,out.provider,req.user!.id]);
      await db.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'ai.suggestion_created','lead',$2,$3)",[req.user!.id,req.params.id,{provider:out.provider,inputSources}]);
      return res.json({suggestion:saved.rows[0]});
    } catch(error) {
      if (error instanceof AIError) return res.status(error.status).json({error:error.message,code:error.code});
      if (error instanceof AnalysisFileError) return res.status(error.status).json({error:error.message,code:error.code});
      if (error instanceof multer.MulterError) return res.status(413).json({error:'แนบได้ไม่เกิน 3 ไฟล์ รวมไม่เกิน 3 MB และโน้ตไม่เกิน 20,000 ตัวอักษร',code:'upload_limit'});
      req.log?.error({event:'ai_analysis_failed'},'Could not save AI analysis');
      return res.status(503).json({error:'บันทึกผลวิเคราะห์ไม่สำเร็จ กรุณาลองใหม่'});
    }
  });
  return router;
}
