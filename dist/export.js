const encoder=new TextEncoder();

const xmlEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[char]));
const cellText=value=>value&&typeof value==='object'&&'text' in value?String(value.text??''):String(value??'');
const cellUrl=value=>value&&typeof value==='object'&&value.url?String(value.url):'';
const safePdfText=value=>String(value??'')
 .replace(/₦/g,'NGN ').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"')
 .replace(/≤/g,'<=').replace(/≥/g,'>=').replace(/×/g,'x').replace(/…/g,'...')
 .replace(/→|↗|↓/g,'-').replace(/·/g,'-').replace(/€/g,'EUR ').replace(/£/g,'GBP ')
 .normalize('NFKD').replace(/[^\x20-\x7E\n]/g,'');
const pdfEscape=value=>safePdfText(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const byteLength=value=>encoder.encode(value).length;
const concatBytes=parts=>{
 const total=parts.reduce((sum,part)=>sum+part.length,0),result=new Uint8Array(total);
 let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
};
const downloadBlob=(blob,filename)=>{
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};

export function buildInputRows(fields,values,formatValue){
 return fields.filter(field=>field.key).map(field=>[
  field.label,
  formatValue(field,values[field.key]),
  field.hint||''
 ]);
}

export function chunkExportText(value,maxLength=850){
 const words=String(value??'').split(/\s+/).filter(Boolean),chunks=[];
 let chunk='';
 for(const word of words){
  const candidate=chunk?`${chunk} ${word}`:word;
  if(chunk&&candidate.length>maxLength){chunks.push(chunk);chunk=word;}
  else chunk=candidate;
 }
 if(chunk)chunks.push(chunk);
 return chunks.length?chunks:[''];
}

function approximateWidth(text,size){
 let units=0;
 for(const char of safePdfText(text)){
  if(char===' ')units+=.28;
  else if(/[ilI1.,'!:;|]/.test(char))units+=.28;
  else if(/[MW@%&#]/.test(char))units+=.82;
  else if(/[A-Z]/.test(char))units+=.62;
  else units+=.52;
 }
 return units*size;
}
function wrapPdfText(value,maxWidth,size){
 const output=[];
 for(const paragraph of safePdfText(value).split('\n')){
  const words=paragraph.trim().split(/\s+/).filter(Boolean);
  if(!words.length){output.push('');continue;}
  let line='';
  for(const word of words){
   const candidate=line?`${line} ${word}`:word;
   if(line&&approximateWidth(candidate,size)>maxWidth){output.push(line);line=word;}
   else line=candidate;
  }
  if(line)output.push(line);
 }
 return output;
}

export function buildPdfBytes(report){
 const PAGE_WIDTH=595.28,PAGE_HEIGHT=841.89,MARGIN=46,FOOTER_TOP=808;
 const pages=[];let commands=[],links=[],cursor=0;
 const colour={green:'0.027 0.243 0.196',mint:'0.45 0.89 0.66',ink:'0.09 0.14 0.12',muted:'0.34 0.42 0.38',line:'0.82 0.87 0.84',pale:'0.94 0.97 0.95',white:'1 1 1'};
 const rect=(x,top,width,height,fill)=>commands.push(`q ${fill} rg ${x.toFixed(2)} ${(PAGE_HEIGHT-top-height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q`);
 const line=(x1,top1,x2,top2,stroke=colour.line,width=.6)=>commands.push(`q ${stroke} RG ${width} w ${x1.toFixed(2)} ${(PAGE_HEIGHT-top1).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_HEIGHT-top2).toFixed(2)} l S Q`);
 const text=(x,baseline,value,size=9,bold=false,fill=colour.ink)=>commands.push(`BT ${fill} rg /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(PAGE_HEIGHT-baseline).toFixed(2)} Tm (${pdfEscape(value)}) Tj ET`);
 const addLink=(x,top,width,height,url)=>links.push({x,top,width,height,url});
 const pageHeader=first=>{
  rect(0,0,PAGE_WIDTH,first?70:48,colour.green);
  text(MARGIN,first?31:27,'NTaxer',first?17:13,true,colour.white);
  text(MARGIN,first?51:40,first?'Nigeria tax calculation report':report.title,first?9:8,false,first?colour.mint:colour.white);
  cursor=first?94:70;
 };
 const newPage=first=>{if(commands.length)pages.push({commands,links});commands=[];links=[];pageHeader(first);};
 const ensure=height=>{if(cursor+height>FOOTER_TOP)newPage(false);};
 const paragraph=(value,{size=9,bold=false,fill=colour.ink,indent=0,after=8,maxWidth=PAGE_WIDTH-MARGIN*2}={})=>{
  const lineHeight=size*1.38,lines=wrapPdfText(value,maxWidth-indent,size);
  for(const row of lines){ensure(lineHeight+2);text(MARGIN+indent,cursor+size,row,size,bold,fill);cursor+=lineHeight;}
  cursor+=after;
 };
 const sectionHeading=title=>{
  ensure(34);cursor+=7;rect(MARGIN,cursor,4,22,colour.green);text(MARGIN+12,cursor+15,title,12,true,colour.green);cursor+=31;
 };
 const table=(tableData,sectionIndex)=>{
  const headers=tableData.headers||[],rows=tableData.rows||[];
  if(tableData.title){ensure(25);text(MARGIN,cursor+10,tableData.title,9.5,true,colour.ink);cursor+=18;}
  const available=PAGE_WIDTH-MARGIN*2,count=Math.max(headers.length,1);
  const ratios=count===2?[.39,.61]:count===3?[.28,.25,.47]:count===4?[.39,.08,.265,.265]:Array(count).fill(1/count);
  const widths=ratios.map(ratio=>available*ratio),fontSize=count>2?7.7:8.4,lineHeight=fontSize*1.35,padding=6;
  const drawHeader=()=>{
   const height=25;ensure(height+4);rect(MARGIN,cursor,available,height,colour.green);
   let x=MARGIN;headers.forEach((header,index)=>{text(x+padding,cursor+16,header,fontSize,true,colour.white);x+=widths[index];});
   cursor+=height;
  };
  if(headers.length)drawHeader();
  rows.forEach((row,rowIndex)=>{
   const cells=Array.from({length:count},(_,index)=>row[index]??'');
   const wrapped=cells.map((cell,index)=>wrapPdfText(cellText(cell),widths[index]-padding*2,fontSize));
   const height=Math.max(24,...wrapped.map(lines=>lines.length*lineHeight+padding*2));
   if(cursor+height>FOOTER_TOP){newPage(false);if(headers.length)drawHeader();}
   if((rowIndex+sectionIndex)%2===0)rect(MARGIN,cursor,available,height,colour.pale);
   let x=MARGIN;
   wrapped.forEach((cellLines,index)=>{
    const url=cellUrl(cells[index]);
    cellLines.forEach((cellLine,lineIndex)=>text(x+padding,cursor+padding+fontSize+lineIndex*lineHeight,cellLine,fontSize,index===0&&count===2,url?colour.green:colour.ink));
    if(url)addLink(x+2,cursor+2,widths[index]-4,height-4,url);
    if(index<count-1)line(x+widths[index],cursor,x+widths[index],cursor+height,colour.line,.4);
    x+=widths[index];
   });
   line(MARGIN,cursor+height,MARGIN+available,cursor+height,colour.line,.45);cursor+=height;
  });
  cursor+=10;
 };

 newPage(true);
 paragraph(report.title,{size:22,bold:true,after:4});
 paragraph(report.subtitle,{size:10,fill:colour.muted,after:14});
 ensure(76);rect(MARGIN,cursor,PAGE_WIDTH-MARGIN*2,70,colour.pale);
 text(MARGIN+16,cursor+20,report.amountLabel,9,true,colour.muted);
 text(MARGIN+16,cursor+48,report.amount,20,true,colour.green);
 text(PAGE_WIDTH-MARGIN-150,cursor+20,'Generated',8,true,colour.muted);
 text(PAGE_WIDTH-MARGIN-150,cursor+38,report.generatedDisplay,8,false,colour.ink);
 cursor+=86;
 report.sections.forEach((section,sectionIndex)=>{
  if(sectionIndex>0)newPage(false);
  sectionHeading(section.title);
  for(const tableData of section.tables)table(tableData,sectionIndex);
 });
 if(commands.length)pages.push({commands,links});

 pages.forEach((page,index)=>{
  const saved=commands;commands=page.commands;
  line(MARGIN,FOOTER_TOP+3,PAGE_WIDTH-MARGIN,FOOTER_TOP+3,colour.line,.5);
  text(MARGIN,FOOTER_TOP+19,`NTaxer - ${report.ruleset} - ${report.reviewed}`,7.5,false,colour.muted);
  text(PAGE_WIDTH-MARGIN-65,FOOTER_TOP+19,`Page ${index+1} of ${pages.length}`,7.5,false,colour.muted);
  commands=saved;
 });

 const objects=[];
 objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
 const pageIds=pages.map((_,index)=>5+index*2);
 const annotationIds=[];let nextObjectId=5+pages.length*2;
 pages.forEach(page=>annotationIds.push(page.links.map(()=>nextObjectId++)));
 objects[2]=`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] >>`;
 objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
 objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
 pages.forEach((page,index)=>{
  const pageId=5+index*2,contentId=pageId+1,stream=page.commands.join('\n');
  const annots=annotationIds[index].length?` /Annots [${annotationIds[index].map(id=>`${id} 0 R`).join(' ')}]`:'';
  objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R${annots} >>`;
  objects[contentId]=`<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  page.links.forEach((link,linkIndex)=>{
   const x1=link.x,y1=PAGE_HEIGHT-link.top-link.height,x2=link.x+link.width,y2=PAGE_HEIGHT-link.top;
   objects[annotationIds[index][linkIndex]]=`<< /Type /Annot /Subtype /Link /Rect [${x1.toFixed(2)} ${y1.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}] /Border [0 0 0] /A << /S /URI /URI (${pdfEscape(link.url)}) >> >>`;
  });
 });
 let pdf='%PDF-1.4\n%NTaxer\n',offset=byteLength(pdf);const offsets=[0];
 for(let id=1;id<objects.length;id++){
  offsets[id]=offset;const object=`${id} 0 obj\n${objects[id]}\nendobj\n`;pdf+=object;offset+=byteLength(object);
 }
 const xrefOffset=offset;
 pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
 for(let id=1;id<objects.length;id++)pdf+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`;
 pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
 return encoder.encode(pdf);
}

let crcTable;
function crc32(bytes){
 if(!crcTable)crcTable=Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
 let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&0xff]^(crc>>>8);return (crc^0xffffffff)>>>0;
}
const u16=value=>new Uint8Array([value&255,(value>>>8)&255]);
const u32=value=>new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]);
function zipStored(entries){
 const localParts=[],centralParts=[];let offset=0;
 const now=new Date(),dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1),dosDate=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
 for(const [name,value] of entries){
  const nameBytes=encoder.encode(name),data=encoder.encode(value),crc=crc32(data);
  const local=concatBytes([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(dosTime),u16(dosDate),u32(crc),u32(data.length),u32(data.length),u16(nameBytes.length),u16(0),nameBytes,data]);
  localParts.push(local);
  centralParts.push(concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(dosTime),u16(dosDate),u32(crc),u32(data.length),u32(data.length),u16(nameBytes.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nameBytes]));
  offset+=local.length;
 }
 const central=concatBytes(centralParts),end=concatBytes([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(central.length),u32(offset),u16(0)]);
 return concatBytes([...localParts,central,end]);
}

const excelColumnName=index=>{let name='';for(let value=index+1;value;value=Math.floor((value-1)/26))name=String.fromCharCode(65+(value-1)%26)+name;return name;};
function sheetXml(report,section){
 const maxColumns=Math.max(2,...section.tables.map(table=>table.headers.length));
 let rowNumber=1;const rows=[],merges=[],hyperlinks=[];
 const cell=(column,value,style=0)=>{
  const reference=`${excelColumnName(column)}${rowNumber}`,url=cellUrl(value);
  if(url)hyperlinks.push({reference,url});
  const cellStyle=url?(style===5?7:6):style;
  return `<c r="${reference}" t="inlineStr" s="${cellStyle}"><is><t xml:space="preserve">${xmlEscape(cellText(value))}</t></is></c>`;
 };
 const mergedRow=(value,style,height)=>{
  rows.push(`<row r="${rowNumber}" ht="${height}" customHeight="1">${cell(0,value,style)}</row>`);
  merges.push(`A${rowNumber}:${excelColumnName(maxColumns-1)}${rowNumber}`);rowNumber++;
 };
 mergedRow(report.title,1,28);mergedRow(section.title,3,23);rowNumber++;
 for(const table of section.tables){
  if(table.title)mergedRow(table.title,3,22);
  rows.push(`<row r="${rowNumber}" ht="22" customHeight="1">${table.headers.map((header,index)=>cell(index,header,2)).join('')}</row>`);rowNumber++;
  table.rows.forEach((row,index)=>{
   const longest=Math.max(...row.map(value=>cellText(value).length));
   const height=Math.min(90,Math.max(20,18+Math.floor(longest/55)*12));
   rows.push(`<row r="${rowNumber}" ht="${height}" customHeight="1">${row.map((value,column)=>cell(column,value,index%2?5:4)).join('')}</row>`);rowNumber++;
  });
  rowNumber++;
 }
 const widths=Array.from({length:maxColumns},(_,index)=>`<col min="${index+1}" max="${index+1}" width="${index===0?34:index===1?55:24}" customWidth="1"/>`).join('');
 const hyperlinkXml=hyperlinks.length?`<hyperlinks>${hyperlinks.map((link,index)=>`<hyperlink ref="${link.reference}" r:id="rId${index+1}"/>`).join('')}</hyperlinks>`:'';
 const relationships=hyperlinks.length?`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hyperlinks.map((link,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(link.url)}" TargetMode="External"/>`).join('')}</Relationships>`:'';
 const xml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${rows.join('')}</sheetData>${merges.length?`<mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`:''}${hyperlinkXml}<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.2" footer="0.2"/></worksheet>`;
 return {xml,relationships};
}
function safeSheetNames(sections){
 const used=new Set();return sections.map(section=>{
  const base=section.title.replace(/[\\/*?:\[\]]/g,' ').trim().slice(0,31)||'Report';let name=base,index=2;
  while(used.has(name))name=`${base.slice(0,27)} ${index++}`;used.add(name);return name;
 });
}

export function buildExcelBytes(report){
 const names=safeSheetNames(report.sections),sheetDocuments=report.sections.map(section=>sheetXml(report,section));
 const sheetEntries=sheetDocuments.flatMap((document,index)=>[[`xl/worksheets/sheet${index+1}.xml`,document.xml],...(document.relationships?[[`xl/worksheets/_rels/sheet${index+1}.xml.rels`,document.relationships]]:[])]);
 const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${report.sections.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
 const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
 const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((name,index)=>`<sheet name="${xmlEscape(name)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('')}</sheets></workbook>`;
 const workbookRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${report.sections.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')}<Relationship Id="rId${report.sections.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
 const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="16"/><name val="Calibri"/></font><font><b/><color rgb="FF073E32"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><u/><color rgb="FF0563C1"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF073E32"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF4ED"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD3E0D7"/></left><right style="thin"><color rgb="FFD3E0D7"/></right><top style="thin"><color rgb="FFD3E0D7"/></top><bottom style="thin"><color rgb="FFD3E0D7"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 const core=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(report.title)}</dc:title><dc:creator>NTaxer</dc:creator><cp:lastModifiedBy>NTaxer</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${xmlEscape(report.generatedAt)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${xmlEscape(report.generatedAt)}</dcterms:modified></cp:coreProperties>`;
 const app=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>NTaxer</Application><TitlesOfParts><vt:vector size="${names.length}" baseType="lpstr">${names.map(name=>`<vt:lpstr>${xmlEscape(name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`;
 return zipStored([['[Content_Types].xml',contentTypes],['_rels/.rels',rootRels],['docProps/core.xml',core],['docProps/app.xml',app],['xl/workbook.xml',workbook],['xl/_rels/workbook.xml.rels',workbookRels],['xl/styles.xml',styles],...sheetEntries]);
}

export function downloadPdf(report,filename){downloadBlob(new Blob([buildPdfBytes(report)],{type:'application/pdf'}),`${filename}.pdf`);}
export function downloadExcel(report,filename){downloadBlob(new Blob([buildExcelBytes(report)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${filename}.xlsx`);}
