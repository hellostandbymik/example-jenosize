import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { databaseErrorCode } from './db/config.js';

type Client = { query: (sql:string, values?:unknown[])=>Promise<{rows:any[];rowCount?:number|null}>; release:(error?:Error)=>void };
type Database = { connect:()=>Promise<Client> };
const optionalText = z.string().trim().max(12000).nullable().transform(value => value || null);
const companySchema = z.object({name:z.string().trim().min(2).max(300),website:z.string().trim().max(2000).nullable().refine(value=>!value || /^https?:\/\//i.test(value),'Website must start with http:// or https://').transform(value=>value || null),industry:optionalText,phone:optionalText,notes:optionalText}).partial().strict();
const contactSchema = z.object({firstName:z.string().trim().min(1).max(200),lastName:optionalText,email:z.union([z.string().trim().email(),z.literal(''),z.null()]).transform(value=>value || null),phone:optionalText,companyId:z.string().uuid().nullable(),title:optionalText}).partial().strict();
const leadSchema = z.object({title:z.string().trim().min(2).max(500),companyId:z.string().uuid().nullable(),contactId:z.string().uuid().nullable(),stage:z.enum(['New','Qualified','Proposal','Won','Lost']),source:z.string().trim().min(1).max(100),value:z.number().finite().nonnegative().max(999999999999.99).nullable(),probability:z.number().int().min(0).max(100),nextFollowUp:z.string().datetime({offset:true}).nullable(),lossReason:optionalText}).partial().strict();
const definitions = {
  companies:{schema:companySchema,columns:{name:'name',website:'website',industry:'industry',phone:'phone',notes:'notes'},singular:'company'},
  contacts:{schema:contactSchema,columns:{firstName:'first_name',lastName:'last_name',email:'email',phone:'phone',companyId:'company_id',title:'title'},singular:'contact'},
  leads:{schema:leadSchema,columns:{title:'title',companyId:'company_id',contactId:'contact_id',stage:'stage',source:'source',value:'value',probability:'probability',nextFollowUp:'next_follow_up',lossReason:'loss_reason'},singular:'lead'}
};
type Entity = keyof typeof definitions;
class RecordError extends Error { constructor(public status:number, message:string) { super(message); } }
const recordName = (entity:Entity, row:any):string => entity==='contacts' ? [row.first_name,row.last_name].filter(Boolean).join(' ') : entity==='leads' ? row.title : row.name;
async function impact(client:Client, entity:Entity, id:string, row:any) {
  const sql = entity==='companies'
    ? 'SELECT (SELECT count(*)::int FROM contacts WHERE company_id=$1) contacts,(SELECT count(*)::int FROM leads WHERE company_id=$1) leads'
    : entity==='contacts'
      ? 'SELECT (SELECT count(*)::int FROM leads WHERE contact_id=$1) leads,(SELECT count(*)::int FROM messages WHERE contact_id=$1) messages'
      : 'SELECT (SELECT count(*)::int FROM activities WHERE lead_id=$1) activities,(SELECT count(*)::int FROM ai_suggestions WHERE lead_id=$1) suggestions,(SELECT count(*)::int FROM messages WHERE lead_id=$1) messages';
  return {...(await client.query(sql,[id])).rows[0],lineLinked:entity==='contacts' && Boolean(row.line_user_id)};
}
export function createRecordRouter(database:Database) {
  const router=Router();
  const handle = (action:(req:Request,res:Response)=>Promise<unknown>) => (req:Request,res:Response,next:NextFunction) => { void action(req,res).catch(next); };
  for (const entity of Object.keys(definitions) as Entity[]) {
    const definition=definitions[entity];
    router.get(`/${entity}/:id/delete-impact`,handle(async(req,res)=>{
      if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({error:'Invalid record ID'});
      const client=await database.connect();
      try {
        const row=(await client.query(`SELECT * FROM ${entity} WHERE id=$1`,[req.params.id])).rows[0];
        if (!row) return res.status(404).json({error:'ไม่พบรายการนี้'});
        return res.json({name:recordName(entity,row),impact:await impact(client,entity,String(req.params.id),row)});
      } finally {client.release();}
    }));
    router.patch(`/${entity}/:id`,handle(async(req,res)=>{
      if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({error:'Invalid record ID'});
      const parsed=definition.schema.safeParse(req.body);
      if (!parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({error:'ข้อมูลที่แก้ไขไม่ถูกต้อง กรุณาตรวจช่องที่กรอก',details:parsed.success?undefined:parsed.error.flatten()});
      const values:Record<string,unknown>={...parsed.data};
      const client=await database.connect();let releaseError:Error|undefined;
      try {
        await client.query('BEGIN');
        const old=(await client.query(`SELECT * FROM ${entity} WHERE id=$1 FOR UPDATE`,[req.params.id])).rows[0];
        if (!old) throw new RecordError(404,'ไม่พบรายการนี้');
        if (values.companyId) {
          if (!(await client.query('SELECT id FROM companies WHERE id=$1',[values.companyId])).rows.length) throw new RecordError(400,'ไม่พบบริษัทที่เลือก กรุณาเลือกใหม่');
        }
        if (values.contactId) {
          if (!(await client.query('SELECT id FROM contacts WHERE id=$1',[values.contactId])).rows.length) throw new RecordError(400,'ไม่พบ Contact ที่เลือก กรุณาเลือกใหม่');
        }
        if (entity==='leads' && values.stage && values.stage!=='Lost') values.lossReason=null;
        const fields=Object.keys(values);
        const columns=definition.columns as Record<string,string>;
        const assignments=fields.map((key,index)=>`${columns[key]}=$${index+1}`).join(',');
        const saved=(await client.query(`UPDATE ${entity} SET ${assignments},updated_at=now() WHERE id=$${fields.length+1} RETURNING *`,[...fields.map(key=>values[key]),req.params.id])).rows[0];
        if (entity==='leads' && values.stage && values.stage!==old.stage) {
          await client.query("INSERT INTO activities(lead_id,actor_id,type,body) VALUES($1,$2,'stage_changed',$3)",[req.params.id,req.user!.id,`${old.stage} → ${values.stage}`]);
        }
        await client.query('INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)',[req.user!.id,`${definition.singular}.updated`,definition.singular,req.params.id,{fields}]);
        await client.query('COMMIT');
        return res.json({item:saved});
      } catch(error) {
        try {await client.query('ROLLBACK');} catch {releaseError=new Error('Record rollback failed');}
        throw error;
      } finally {client.release(releaseError);}
    }));
    router.delete(`/${entity}/:id`,handle(async(req,res)=>{
      if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({error:'Invalid record ID'});
      const confirmation=z.object({confirmName:z.string().min(1),expectedImpact:z.record(z.union([z.number().int().nonnegative(),z.boolean()]))}).strict().safeParse(req.body);
      if (!confirmation.success) return res.status(400).json({error:'กรุณายืนยันรายการก่อนลบ'});
      const client=await database.connect();let releaseError:Error|undefined;
      try {
        await client.query('BEGIN');
        const row=(await client.query(`SELECT * FROM ${entity} WHERE id=$1 FOR UPDATE`,[req.params.id])).rows[0];
        if (!row) throw new RecordError(404,'ไม่พบรายการนี้');
        if (confirmation.data.confirmName!==recordName(entity,row)) throw new RecordError(409,'รายการถูกแก้ไขแล้ว กรุณาเปิดหน้าต่างลบใหม่');
        const affected=await impact(client,entity,String(req.params.id),row);
        if (Object.keys(confirmation.data.expectedImpact).length!==Object.keys(affected).length || Object.keys(affected).some(key=>confirmation.data.expectedImpact[key]!==affected[key])) throw new RecordError(409,'ข้อมูลที่เกี่ยวข้องเปลี่ยนแล้ว กรุณาเปิดหน้าต่างลบใหม่');
        await client.query(`DELETE FROM ${entity} WHERE id=$1`,[req.params.id]);
        await client.query('INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)',[req.user!.id,`${definition.singular}.deleted`,definition.singular,req.params.id,{name:recordName(entity,row),impact:affected}]);
        await client.query('COMMIT');
        return res.json({deleted:{id:req.params.id,entity},impact:affected});
      } catch(error) {
        try {await client.query('ROLLBACK');} catch {releaseError=new Error('Record rollback failed');}
        throw error;
      } finally {client.release(releaseError);}
    }));
  }
  const onError:expressErrorHandler = (error,req,res,_next)=>{
    if (error instanceof RecordError) return res.status(error.status).json({error:error.message});
    const code=databaseErrorCode(error);
    if (code==='23505') return res.status(409).json({error:'ชื่อบริษัทหรืออีเมลนี้มีอยู่แล้ว กรุณาตรวจข้อมูลซ้ำ'});
    if (code==='23503') return res.status(409).json({error:'ข้อมูลที่เชื่อมโยงถูกเปลี่ยน กรุณารีเฟรชแล้วลองใหม่'});
    req.log?.error({event:'record_mutation_failed',code},'Record operation failed');
    return res.status(503).json({error:'ดำเนินการไม่สำเร็จ กรุณาลองใหม่'});
  };
  router.use(onError);
  return router;
}
type expressErrorHandler = import('express').ErrorRequestHandler;
