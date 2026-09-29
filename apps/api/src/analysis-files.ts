import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

export const MAX_UPLOAD_BYTES=3*1024*1024;
export const MAX_CONTEXT_BYTES=100000;
export class AnalysisFileError extends Error {
  constructor(public code:string,message:string,public status=422){super(message);}
}
export type AnalysisFile={name:string;kind:string;size:number;sha256:string;rowCount:number;sheets:string[];content:string};
type Upload={originalname:string;buffer:Buffer;size:number};

// Validate actual expanded ZIP bytes before ExcelJS loads the workbook.
function checkArchive(buffer:Buffer) {
  let end=-1;
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50&&i+22+buffer.readUInt16LE(i+20)===buffer.length){end=i;break;}
  if(end<0)throw Error('Invalid archive');
  if(buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6))throw Error('Split archive');
  const count=buffer.readUInt16LE(end+10);let offset=buffer.readUInt32LE(end+16);let total=0;
  if(count>2000||offset+buffer.readUInt32LE(end+12)!==end)throw Error('Invalid archive directory');
  for(let i=0;i<count;i++) {
    if(offset+46>end||buffer.readUInt32LE(offset)!==0x02014b50)throw Error('Invalid entry');
    const flags=buffer.readUInt16LE(offset+8),method=buffer.readUInt16LE(offset+10);
    const compressed=buffer.readUInt32LE(offset+20),expanded=buffer.readUInt32LE(offset+24),local=buffer.readUInt32LE(offset+42);
    if(flags&1||![0,8].includes(method)||expanded>20*1024*1024-total||local+30>=buffer.length||buffer.readUInt32LE(local)!==0x04034b50)throw Error('Unsupported entry');
    const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
    if(start+compressed>buffer.length)throw Error('Invalid entry length');
    const data=buffer.subarray(start,start+compressed);
    const actual=method===8?inflateRawSync(data,{maxOutputLength:Math.max(1,20*1024*1024-total)}):data;
    if(actual.length!==expanded)throw Error('Invalid expanded length');
    total+=actual.length;
    offset+=46+buffer.readUInt16LE(offset+28)+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32);
  }
  if(offset!==end)throw Error('Invalid directory size');
}
function decode(buffer:Buffer) {
  if(buffer[0]===0xff&&buffer[1]===0xfe)return new TextDecoder('utf-16le').decode(buffer);
  if(buffer[0]===0xfe&&buffer[1]===0xff)return new TextDecoder('utf-16be').decode(buffer);
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer);}
  catch{return new TextDecoder('windows-874').decode(buffer);}
}
function cellText(value:ExcelJS.CellValue):string {
  if(value==null)return '';
  if(value instanceof Date)return value.toISOString();
  if(typeof value!=='object')return String(value);
  if('richText' in value)return value.richText.map(part=>part.text).join('');
  if('formula' in value||'sharedFormula' in value)return value.result==null?`[สูตรไม่มีค่าที่คำนวณไว้: ${'formula' in value?value.formula:value.sharedFormula}]`:cellText(value.result);
  if('text' in value)return value.text;
  if('error' in value)return value.error;
  return '';
}
export async function extractAnalysisFiles(uploads:Upload[]):Promise<AnalysisFile[]> {
  if(uploads.length>3||uploads.reduce((sum,file)=>sum+file.size,0)>MAX_UPLOAD_BYTES)throw new AnalysisFileError('upload_too_large','แนบได้ไม่เกิน 3 ไฟล์ รวมขนาดไม่เกิน 3 MB',413);
  const files:AnalysisFile[]=[];
  let totalBytes=0;
  for(const upload of uploads) {
    let originalName=upload.originalname;
    // Browser multipart filenames arrive through Busboy's Latin-1 parameter decoding.
    if([...originalName].every(character=>character.charCodeAt(0)<=255)) {
      try{originalName=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(originalName,'latin1'));}catch{/* Keep correctly decoded legacy filenames. */}
    }
    const name=originalName.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g,'')||'file';
    const kind=name.split('.').pop()?.toLowerCase()||'';
    if(!['xlsx','csv','txt','md'].includes(kind))throw new AnalysisFileError('unsupported_file','รองรับ Excel .xlsx, CSV และโน้ต .txt/.md เท่านั้น',415);
    let content='';let rowCount=0;const sheets:string[]=[];
    const add=(line:string)=>{
      totalBytes+=Buffer.byteLength(line+'\n');
      if(totalBytes>MAX_CONTEXT_BYTES)throw new AnalysisFileError('context_too_large','เนื้อหาไฟล์มากเกินขนาดที่วิเคราะห์ได้ กรุณาแยกไฟล์ให้เล็กลง ระบบยังไม่ได้ตัดหรือส่งข้อมูลไปวิเคราะห์',413);
      content+=line+'\n';
    };
    try {
      if(kind==='xlsx') {
        checkArchive(upload.buffer);
        const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(upload.buffer as unknown as ExcelJS.Buffer);
        workbook.eachSheet(sheet=>{
          sheets.push(sheet.name);add(`[ชีต: ${sheet.name}]`);
          sheet.eachRow((row,rowNumber)=>{
            const cells:string[]=[];
            row.eachCell((cell)=>{const text=cellText(cell.value);if(text.trim())cells.push(`${cell.address}: ${text}`);});
            if(cells.length){rowCount++;add(`แถว ${rowNumber}: ${cells.join(' | ')}`);}
          });
        });
      } else {
        const text=decode(upload.buffer).replace(/^\uFEFF/,'');
        if(Buffer.byteLength(text)>MAX_CONTEXT_BYTES)throw new AnalysisFileError('context_too_large',`ไฟล์ ${name} มีเนื้อหามากเกินไป กรุณาแบ่งไฟล์ให้เล็กลง`,413);
        if(kind==='csv') {
          const header=text.split(/\r?\n/,1)[0];
          const delimiter=['\t',';',','].reduce((best,item)=>header.split(item).length>header.split(best).length?item:best,',');
          const rows:string[][]=parse(text,{bom:true,delimiter,skip_empty_lines:true,relax_column_count:true,max_record_size:MAX_CONTEXT_BYTES});
          rows.forEach((row,index)=>{if(row.some(cell=>cell.trim())){rowCount++;add(`แถว ${index+1}: ${JSON.stringify(row)}`);}});
        } else {add(text);rowCount=text.split(/\r?\n/).filter(line=>line.trim()).length;}
      }
      if(!rowCount)throw new AnalysisFileError('empty_file',`ไฟล์ ${name} ไม่มีข้อความหรือข้อมูลสำหรับวิเคราะห์`);
    } catch(error) {
      if(error instanceof AnalysisFileError)throw error;
      throw new AnalysisFileError('unreadable_file',`อ่านไฟล์ ${name} ไม่สำเร็จ กรุณาตรวจว่าไฟล์ถูกต้อง ไม่เข้ารหัส และบันทึกเป็นรูปแบบที่รองรับ`);
    }
    files.push({name,kind,size:upload.size,sha256:createHash('sha256').update(upload.buffer).digest('hex'),rowCount,sheets,content});
  }
  return files;
}
