import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPdfBytes,buildExcelBytes,buildInputRows,chunkExportText} from '../dist/export.js';

const report={
 title:'Personal income / PAYE - tax estimate',subtitle:'Example report',amountLabel:'Estimated annual income tax',amount:'NGN 123,456.78',generatedAt:'2026-09-09T12:00:00.000Z',generatedDisplay:'9 Sep 2026, 13:00',ruleset:'2026',reviewed:'9 September 2026',
 sections:[
  {title:'Overview',tables:[{title:'Result summary',headers:['Item','Value'],rows:[['Estimated amount','NGN 123,456.78']]}]},
  {title:'Inputs',tables:[{title:'Information entered',headers:['Input','Entered value','Guidance / scope'],rows:[['Gross salary','NGN 1,000,000.00','Annual figure']]}]},
  {title:'Calculation breakdown',tables:[{title:'Full calculation',headers:['Calculation item','Amount / treatment'],rows:[['Annual income tax','NGN 123,456.78']]}]},
  {title:'Assumptions & scope',tables:[{title:'Conditions',headers:['No.','Assumption / scope'],rows:[['1','Example assumption']]}]},
  {title:'Legal references',tables:[{title:'Legal basis',headers:['Reference','Details'],rows:[[{text:'Section 58',url:'https://n-taxer.vercel.app/#law/58'},{text:'Deduction of tax at source',url:'https://n-taxer.vercel.app/#law/58'}],[{text:'Schedule 4',url:'https://n-taxer.vercel.app/#law/schedule-4'},{text:'Fourth Schedule',url:'https://n-taxer.vercel.app/#law/schedule-4'}]]},{title:'Source documents',headers:['Source','URL and description'],rows:[[{text:'Nigeria Tax Act 2025',url:'https://nass.gov.ng/documents/download/11249'},{text:'https://nass.gov.ng/documents/download/11249\nPrimary calculation reference.',url:'https://nass.gov.ng/documents/download/11249'}]]}]}
 ]
};

test('input export formats each field value rather than the complete input record',()=>{
 const fields=[{key:'income',label:'Annual income',hint:'Before tax'},{key:'resident',label:'Resident',hint:''},{type:'divider',label:'Scope'}];
 const values={income:'2500000',resident:true};
 const seen=[];
 const rows=buildInputRows(fields,values,(field,value)=>{seen.push([field.key,value]);return String(value);});
 assert.deepEqual(seen,[['income','2500000'],['resident',true]]);
 assert.deepEqual(rows,[['Annual income','2500000','Before tax'],['Resident','true','']]);
});

test('long legal wording is split without losing words',()=>{
 const wording=Array.from({length:300},(_,index)=>`word${index}`).join(' '),chunks=chunkExportText(wording,120);
 assert.ok(chunks.length>1);
 assert.ok(chunks.every(chunk=>chunk.length<=120));
 assert.equal(chunks.join(' '),wording);
});

test('PDF export is a complete standalone PDF report',()=>{
 const bytes=buildPdfBytes(report),text=new TextDecoder().decode(bytes);
 assert.equal(text.slice(0,8),'%PDF-1.4');
 assert.match(text,/Calculation breakdown/);
 assert.match(text,/Assumptions & scope/);
 assert.match(text,/Legal references/);
 assert.match(text,/\/Type \/Pages \/Count 5 /);
 assert.equal((text.match(/\/Subtype \/Link/g)||[]).length,6);
 assert.match(text,/https:\/\/n-taxer\.vercel\.app\/#law\/58/);
 assert.match(text,/https:\/\/n-taxer\.vercel\.app\/#law\/schedule-4/);
 assert.match(text,/https:\/\/nass\.gov\.ng\/documents\/download\/11249/);
 assert.match(text,/%%EOF$/);
});

test('Excel export is an OOXML workbook containing every report section',()=>{
 const bytes=buildExcelBytes(report),text=new TextDecoder().decode(bytes);
 assert.deepEqual([...bytes.slice(0,2)],[0x50,0x4b]);
 for(const section of report.sections)assert.ok(text.includes(section.title.replaceAll('&','&amp;')));
 assert.match(text,/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml/);
 assert.equal((text.match(/relationships\/hyperlink/g)||[]).length,6);
 assert.match(text,/Target="https:\/\/n-taxer\.vercel\.app\/#law\/58"/);
 assert.match(text,/Target="https:\/\/n-taxer\.vercel\.app\/#law\/schedule-4"/);
});
