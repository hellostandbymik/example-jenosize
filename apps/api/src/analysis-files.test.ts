import { describe,expect,it } from 'vitest';
import ExcelJS from 'exceljs';
import { deflateRawSync } from 'node:zlib';
import { extractAnalysisFiles,MAX_UPLOAD_BYTES,MAX_CONTEXT_BYTES } from './analysis-files.js';
const file=(originalname:string,text:string|Buffer)=>{const buffer=Buffer.isBuffer(text)?text:Buffer.from(text);return {originalname,buffer,size:buffer.length};};
describe('analysis attachments',()=>{
  it('extracts every worksheet with original row/cell references and cached formula values',async()=>{
    const book=new ExcelJS.Workbook();
    const budget=book.addWorksheet('Budget');budget.addRow(['งบประมาณ',350000]);budget.getCell('B4').value={formula:'B1*2',result:700000};
    const notes=book.addWorksheet('โน้ต');notes.state='hidden';notes.getCell('A3').value={richText:[{text:'ผู้อนุมัติ'},{text:'คือคุณสมชาย'}]};
    const data=await book.xlsx.writeBuffer();const [parsed]=await extractAnalysisFiles([file('discovery.xlsx',Buffer.from(data))]);
    expect(parsed.sheets).toEqual(['Budget','โน้ต']);expect(parsed.rowCount).toBe(3);
    expect(parsed.content).toContain('แถว 1: A1: งบประมาณ | B1: 350000');expect(parsed.content).toContain('B4: 700000');expect(parsed.content).toContain('A3: ผู้อนุมัติคือคุณสมชาย');
    expect(parsed.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('preserves quoted CSV multiline cells, UTF-8 BOM and semicolon separators',async()=>{
    const [parsed]=await extractAnalysisFiles([file('notes.csv','\uFEFFหัวข้อ;ข้อมูล\nงบ;"350000\nพร้อม VAT"\n')]);
    expect(parsed.rowCount).toBe(2);expect(parsed.content).toContain('350000\\nพร้อม VAT');
  });
  it('reads UTF-16 notes and does not truncate long text',async()=>{
    const buffer=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('โน้ตส่วนตัว\n'+'x'.repeat(13000),'utf16le')]);
    const [parsed]=await extractAnalysisFiles([file('personal.txt',buffer)]);expect(parsed.content).toContain('x'.repeat(13000));expect(parsed.content).toContain('โน้ตส่วนตัว');
  });
  it('decodes Thai multipart filenames without losing their source name',async()=>{
    const encoded=Buffer.from('โน้ตฝ่ายขาย.txt','utf8').toString('latin1');
    const [parsed]=await extractAnalysisFiles([file(encoded,'งบประมาณ 350000')]);expect(parsed.name).toBe('โน้ตฝ่ายขาย.txt');
  });
  it('rejects an oversized compressed workbook even when its directory lies about expanded size',async()=>{
    const data=deflateRawSync(Buffer.alloc(21*1024*1024,120));const name=Buffer.from('workbook.xml');
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt16LE(name.length,26);
    const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(8,10);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(100,24);entry.writeUInt16LE(name.length,28);
    const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,10);end.writeUInt32LE(entry.length+name.length,12);end.writeUInt32LE(local.length+name.length+data.length,16);
    await expect(extractAnalysisFiles([file('bomb.xlsx',Buffer.concat([local,name,data,entry,name,end]))])).rejects.toMatchObject({code:'unreadable_file'});
  });
  it.each([['bad.xlsx','not an Excel file','unreadable_file'],['empty.csv','\n','empty_file'],['notes.exe','a','unsupported_file'],['broken.csv','a,"unclosed','unreadable_file']])('rejects %s clearly',async(name,text,code)=>{
    await expect(extractAnalysisFiles([file(name,text)])).rejects.toMatchObject({code});
  });
  it('rejects file count, aggregate upload size and parsed content size rather than analyzing a subset',async()=>{
    await expect(extractAnalysisFiles(Array.from({length:4},()=>file('note.txt','x')))).rejects.toMatchObject({code:'upload_too_large'});
    await expect(extractAnalysisFiles([file('note.txt',Buffer.alloc(MAX_UPLOAD_BYTES+1))])).rejects.toMatchObject({code:'upload_too_large'});
    await expect(extractAnalysisFiles([file('note.txt','x'.repeat(MAX_CONTEXT_BYTES+1))])).rejects.toMatchObject({code:'context_too_large'});
  });
});
