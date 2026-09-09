import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPdfBytes,buildExcelBytes} from '../dist/export.js';

const report={
 title:'Personal income / PAYE - tax estimate',subtitle:'Example report',amountLabel:'Estimated annual income tax',amount:'NGN 123,456.78',generatedAt:'2026-09-09T12:00:00.000Z',generatedDisplay:'9 Sep 2026, 13:00',ruleset:'2026',reviewed:'9 September 2026',
 sections:[
  {title:'Overview',tables:[{title:'Result summary',headers:['Item','Value'],rows:[['Estimated amount','NGN 123,456.78']]}]},
  {title:'Inputs',tables:[{title:'Information entered',headers:['Input','Entered value','Guidance / scope'],rows:[['Gross salary','NGN 1,000,000.00','Annual figure']]}]},
  {title:'Calculation breakdown',tables:[{title:'Full calculation',headers:['Calculation item','Amount / treatment'],rows:[['Annual income tax','NGN 123,456.78']]}]},
  {title:'Assumptions & scope',tables:[{title:'Conditions',headers:['No.','Assumption / scope'],rows:[['1','Example assumption']]}]},
  {title:'Legal references',tables:[{title:'Legal basis',headers:['Reference','Details'],rows:[['Act sections','Section 58']]}]}
 ]
};

test('PDF export is a complete standalone PDF report',()=>{
 const bytes=buildPdfBytes(report),text=new TextDecoder().decode(bytes);
 assert.equal(text.slice(0,8),'%PDF-1.4');
 assert.match(text,/Calculation breakdown/);
 assert.match(text,/Assumptions & scope/);
 assert.match(text,/Legal references/);
 assert.match(text,/%%EOF$/);
});

test('Excel export is an OOXML workbook containing every report section',()=>{
 const bytes=buildExcelBytes(report),text=new TextDecoder().decode(bytes);
 assert.deepEqual([...bytes.slice(0,2)],[0x50,0x4b]);
 for(const section of report.sections)assert.ok(text.includes(section.title.replaceAll('&','&amp;')));
 assert.match(text,/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml/);
});
