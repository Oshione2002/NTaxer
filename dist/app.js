import {CALCULATORS,DEFAULTS,SOURCE_LINKS} from './calculators.js';
import {CHAPTERS,SECTORS} from './coverage.js';
import {VAT_CATEGORIES} from './schedules.js';
import {RULESET,REVIEWED,money} from './engine.js';

const $=s=>document.querySelector(s);
// Track the actual header height when navigation wraps or text size changes.
const header=$('.topbar');
if(header){
 const syncHeaderHeight=()=>document.documentElement.style.setProperty('--header-height',header.getBoundingClientRect().height+'px');
 syncHeaderHeight();
 new ResizeObserver(syncHeaderHeight).observe(header);
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titleCase=s=>String(s).replace(/\b[a-z]/g,c=>c.toUpperCase());
const format=(n,currency='NGN')=>typeof n==='number'?new Intl.NumberFormat('en-NG',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100):escape(n);
const statusLabel=s=>({calculated:'Formula calculator',assisted:'Assisted estimate',scenario:'Planning scenario'}[s]);
const link=(href,label)=>`<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
const state={inputs:structuredClone(DEFAULTS),current:'paye',tab:'calculation',result:null,error:null,law:null,coverage:'All',coverageQuery:'',lawQuery:'',lawChapter:'All'};
const lawPromise=fetch('law.json').then(r=>{if(!r.ok)throw new Error('Law reference unavailable');return r.json();}).then(data=>state.law=data).catch(()=>null);

function homeView(){
 const groups=new Map();
 for(const c of CALCULATORS){
  if(!groups.has(c.group))groups.set(c.group,[]);
  groups.get(c.group).push(c);
 }
 const homeCards=[...groups].map(([group,calculators],index)=>`<details class="home-group" style="--home-order:${index}"><summary><h2>${escape(group)}</h2><svg class="home-category-chevron" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="home-group-links">${calculators.map(c=>`<a class="home-calculator" href="#calculator/${c.id}"><span><strong>${escape(c.name)}</strong><small>${escape(c.description)}</small></span><span class="home-link-arrow" aria-hidden="true">→</span></a>`).join('')}</div></details>`);
 $('#main').innerHTML=`<div class="intro page-header"><p class="eyebrow">Welcome to NTaxer</p><h1>What would you like to calculate?</h1><p class="lead">Choose a tax calculator to estimate an amount, review the breakdown and check the rules that apply.</p></div>
 <div class="home-calculators"><div class="home-calculator-column">${homeCards.filter((_,index)=>index%2===0).join('')}</div><div class="home-calculator-column">${homeCards.filter((_,index)=>index%2===1).join('')}</div></div>
 <div class="home-reference-links"><a href="#coverage"><strong>Explore tax coverage</strong><span>See the taxes and taxpayer categories covered by NTaxer.</span></a><a href="#law"><strong>Read the tax law</strong><span>Search the Act by section, subject or phrase.</span></a></div>
 <section class="home-how" aria-labelledby="home-how-title">
  <div class="home-section-heading"><p class="eyebrow">How it works</p><h2 id="home-how-title">A clearer estimate in three steps</h2></div>
  <ol class="home-steps">
   <li><span class="home-step-number">1</span><div><strong>Choose the right calculator</strong><p>Select the tax, transaction or taxpayer category that matches what you want to estimate.</p></div></li>
   <li><span class="home-step-number">2</span><div><strong>Enter the relevant figures</strong><p>Complete the fields and adjust the available assumptions to reflect your situation.</p></div></li>
   <li><span class="home-step-number">3</span><div><strong>Review the complete result</strong><p>Check the breakdown, assumptions, scope and legal references shown with the estimate.</p></div></li>
  </ol>
 </section>
 <section class="home-planning-note" aria-labelledby="home-planning-title">
  <div><p class="eyebrow">Important to know</p><h2 id="home-planning-title">Use each result as a planning estimate</h2></div>
  <p>Tax treatment can depend on facts that a calculator cannot capture. Review the stated assumptions, scope and legal references before making a filing or financial decision.</p>
 </section>`;
}
function refsHtml(refs){return refs.map(n=>`<a href="#law/${n}">s. ${n}</a>`).join(' · ');}
function sourceHtml(config){
 const page=state.law?.sections.find(s=>s.number===config.refs[0])?.page;
 const sources=[SOURCE_LINKS.nta,...(config.extraSource?[SOURCE_LINKS[config.extraSource]]:[]),...(config.id==='gains'?[SOURCE_LINKS.virtual]:[])];
 return `<h3>Legal basis</h3><p>Nigeria Tax Act 2025, National Assembly release. ${refsHtml(config.refs)}</p>${config.schedules?`<p>Schedules: ${config.schedules.map(n=>`<a href="#law/schedule-${n}">${n}</a>`).join(', ')}</p>`:''}${sources.map(s=>`<div class="source-entry"><strong>${link(s.url,s.title)}</strong><p>${escape(s.detail)}</p></div>`).join('')}<p>${link(`assets/nigeria-tax-act-2025-nass.pdf${page?'#page='+page:''}`,'Open the source PDF')} · <a href="#sources">Sources & methodology</a></p><p class="mini-label">Ruleset ${RULESET} · Reviewed ${REVIEWED}. Dates identify this fixed review, not a live tax-law feed.</p>`;
}
function nav(){
 const query=$('#calculator-search').value.toLowerCase().trim();
 const groups=new Map();
 for(const c of CALCULATORS){
  if(!`${c.name} ${c.group} ${c.description}`.toLowerCase().includes(query))continue;
  if(!groups.has(c.group))groups.set(c.group,[]);
  groups.get(c.group).push(c);
 }
 $('#calculator-nav').innerHTML=[...groups].map(([group,calculators])=>`<section class="calculator-nav-group" aria-label="${escape(titleCase(group))}"><div class="nav-group">${escape(titleCase(group))}</div>${calculators.map(c=>`<a href="#calculator/${c.id}" class="calc-link ${state.current===c.id&&location.hash.startsWith('#calculator')?'active':''}" ${state.current===c.id&&location.hash.startsWith('#calculator')?'aria-current="page"':''}><span class="nav-symbol" aria-hidden="true">${c.symbol}</span>${escape(c.short)}</a>`).join('')}</section>`).join('')||'<p class="empty">No matching calculators.</p>';
}
function inputHtml(f,values){
 if(f.type==='divider')return `<div class="field-divider">${escape(f.label)}</div>`;
 const id='field-'+f.key,value=values[f.key];
 if(f.type==='boolean')return `<label class="checkfield" for="${id}"><input id="${id}" name="${f.key}" type="checkbox" ${value===true?'checked':''}><span>${escape(f.label)}${f.hint?`<small>${escape(f.hint)}</small>`:''}</span></label>`;
 const common=`id="${id}" name="${f.key}" aria-describedby="${id}-hint ${id}-error"`;
 return `<label class="field" for="${id}"><span>${escape(f.label)}</span>${f.type==='select'?`<select ${common}>${f.options.map(([v,label])=>`<option value="${escape(v)}" ${String(value)===String(v)?'selected':''}>${escape(label)}</option>`).join('')}</select>`:`<span class="input-wrap">${f.type==='money'?'<span class="prefix" aria-hidden="true">₦</span>':''}<input ${common} type="text" inputmode="decimal" autocomplete="off" value="${escape(value)}" ${f.type==='number'?`data-min="${f.min}" data-max="${f.max}"`:''}></span>`}<span class="hint" id="${id}-hint">${escape(f.hint)}</span><span class="error" id="${id}-error"></span></label>`;
}
function calcView(id){
 const c=CALCULATORS.find(c=>c.id===id)||CALCULATORS[0];state.current=c.id;state.tab='calculation';
 $('#main').innerHTML=`<div class="page-header sticky-page-heading"><p class="eyebrow">${escape(c.group)} / 2026 tax year</p><div class="heading-row"><h1>${escape(c.name)}</h1><span class="badge ${c.status}">${statusLabel(c.status)}</span></div></div><div class="intro page-subtext"><p class="lead">${escape(c.description)}</p></div>
 <aside id="sticky-estimate" class="sticky-estimate" aria-live="polite" aria-atomic="true"></aside>
 <div class="workspace"><section class="panel"><div class="panel-head"><h2>Your details</h2><span class="step">Editable example</span></div><form id="tax-form" novalidate><div class="fields">${c.fields.map(f=>inputHtml(f,state.inputs[c.id])).join('')}</div><div class="form-actions"><span>Results update as you type</span><button type="button" id="reset" class="text-button">Reset example ↺</button></div></form></section><div class="result-column" tabindex="0" role="region" aria-label="Tax estimate and breakdown"><section id="result" aria-live="polite" aria-atomic="true"></section><div id="breakdown" class="panel breakdown"></div><p class="info-note">Calculated from your inputs. Check assumptions and legal scope before using an estimate.</p></div></div>
 <section class="detail-area" aria-label="Calculation details"><div class="tabbar" role="tablist" aria-label="Result information"><button id="tab-calculation" class="active" role="tab" aria-selected="true" aria-controls="detail-content" data-tab="calculation">Calculation breakdown</button><button id="tab-assumptions" role="tab" aria-selected="false" tabindex="-1" aria-controls="detail-content" data-tab="assumptions">Assumptions & scope</button><button id="tab-sources" role="tab" aria-selected="false" tabindex="-1" aria-controls="detail-content" data-tab="sources">Legal references</button></div><div id="detail-content" class="detail-card" role="tabpanel" aria-labelledby="tab-calculation"></div></section><div class="print-only"><p>NTaxer estimate · Ruleset ${RULESET} · Review ${REVIEWED} · ${escape(c.name)}</p><p>Source: https://nass.gov.ng/documents/download/11249</p></div>`;
 $('#tax-form').addEventListener('submit',event=>event.preventDefault());
 $('#tax-form').addEventListener('input',event=>{const el=event.target;if(!el.name)return;state.inputs[c.id][el.name]=el.type==='checkbox'?el.checked:el.value;updateResult(c);});
 $('#tax-form').addEventListener('change',event=>{const el=event.target;if(!el.name)return;state.inputs[c.id][el.name]=el.type==='checkbox'?el.checked:el.value;updateResult(c);});
 $('#reset').addEventListener('click',()=>{state.inputs[c.id]=structuredClone(DEFAULTS[c.id]);calcView(c.id);});
 document.querySelectorAll('[data-tab]').forEach(button=>{button.addEventListener('click',()=>setTab(button.dataset.tab,c));button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=['calculation','assumptions','sources'];let i=tabs.indexOf(state.tab);i=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;setTab(tabs[i],c);$(`[data-tab="${tabs[i]}"]`).focus();});});
 updateResult(c);nav();
}
function setTab(tab,c){state.tab=tab;document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});$('#detail-content').setAttribute('aria-labelledby','tab-'+tab);renderDetail(c);}
function validate(c){let invalid=false;for(const f of c.fields){if(!f.key||['divider','boolean'].includes(f.type))continue;let error='';const value=state.inputs[c.id][f.key];try{if(f.type==='money')money(value);else if(f.type==='number'){if(!new RegExp('^\\d+(\\.\\d{1,'+(f.precision||2)+'})?$').test(String(value))||Number(value)<f.min||Number(value)>f.max)throw new Error(`Enter a number from ${f.min.toLocaleString()} to ${f.max.toLocaleString()}.`);}else if(!f.options.some(([v])=>String(v)===String(value)))throw new Error('Choose an available option.');}catch(e){error=e.message;}const el=$('#field-'+f.key);el.setAttribute('aria-invalid',String(Boolean(error)));el.closest('.input-wrap')?.classList.toggle('invalid',Boolean(error));$('#field-'+f.key+'-error').textContent=error;invalid||=Boolean(error);}return !invalid;}
function updateResult(c){
 state.error=null;state.result=null;
 if(validate(c)){try{state.result=c.calculate(state.inputs[c.id]);}catch(e){state.error=e.message;}}else state.error='Check the highlighted fields to calculate a new estimate.';
 const r=state.result;
 if(state.error){$('#sticky-estimate').innerHTML='<span>Your estimate</span><strong>Check your inputs</strong>';$('#result').innerHTML=`<div class="result-card"><div class="result-heading">Your estimate</div><div class="status-placeholder">Check your inputs</div><p>${escape(state.error)}</p></div>`;$('#breakdown').innerHTML='';renderDetail(c);return;}
 const currency=r.currency||'NGN',available=r.amount!==null;
 $('#sticky-estimate').innerHTML=`<span>${escape(r.title||'Estimated amount')}</span><strong>${available?format(r.amount,currency):'Review needed'}</strong>`;
 const metric1=r.secondary||['Calculation base',r.base],metric2=r.tertiary||['Ruleset year','2026'];
 $('#result').innerHTML=`<div class="result-card"><div class="result-heading">${escape(r.title||'Estimated amount')}</div><div class="${available?'result-total':'status-placeholder'}">${available?format(r.amount,currency):'Review needed'}</div><div class="result-sub">${available?(r.currency==='USD'?'All results below are in US dollars':'Nigerian naira · rounded to the nearest kobo'):'Read the conditions below to continue.'}</div>${available?`<div class="result-metrics"><div><small>${escape(metric1[0])}</small><strong>${format(metric1[1],currency)}</strong></div><div><small>${escape(metric2[0])}</small><strong>${format(metric2[1],currency)}</strong></div></div>`:''}${r.bands&&available?`<div class="result-bar" role="img" aria-label="Income tax ${r.base?(r.amount/r.base*100).toFixed(2):0}% of total income"><progress class="tax-progress" value="${Math.min(1,r.base?r.amount/r.base:0)}" max="1"></progress></div><div class="bar-labels"><span>Income tax</span><span>Income before other deductions</span></div>`:''}<div class="result-actions"><button class="button primary" id="print-result" ${!available?'disabled':''}>Print / save PDF</button><button class="button" id="export-result" ${!available?'disabled':''}>Export record ↓</button></div></div>`;
 $('#print-result').addEventListener('click',()=>{setTab('assumptions',c);window.print();});
 $('#export-result').addEventListener('click',()=>download(c,r));
 $('#breakdown').innerHTML=available?`<div class="panel-head"><h2>At a glance</h2><span class="mini-label">${r.currency||'NGN'}</span></div><div class="rows">${r.rows.slice(-6).map(([name,val])=>`<div class="result-row"><span>${escape(name)}</span><strong>${format(val,currency)}</strong></div>`).join('')}</div>`:`<div class="rows">${r.notes.map(n=>`<p class="notice">${escape(n)}</p>`).join('')}</div>`;
 renderDetail(c);
}
function renderDetail(c){
 const container=$('#detail-content');if(!container)return;
 const r=state.result,currency=r?.currency||'NGN';
 if(state.tab==='sources'){container.innerHTML=sourceHtml(c);return;}
 if(state.tab==='assumptions'){container.innerHTML=`<h3>What this estimate assumes</h3><ul>${(r?.notes||['Correct the highlighted inputs to see the assumptions for your result.']).map(n=>`<li>${escape(n)}</li>`).join('')}</ul><p><a href="#coverage">Check coverage for your sector</a> · <a href="#sources">Sources & methodology</a></p>`;return;}
 if(!r){container.innerHTML='<p>Enter valid details to view your calculation.</p>';return;}
 if(r.bands){container.innerHTML=`<h3>Your progressive tax bands</h3><p>Each rate applies only to income inside that band. These are annual chargeable-income bands, after eligible reliefs.</p><div class="table-wrap"><table><thead><tr><th scope="col">Annual band</th><th scope="col">Rate</th><th scope="col">Your income in band</th><th scope="col">Tax</th></tr></thead><tbody>${r.bands.map(b=>`<tr><td>${b.upper===Infinity?'Above '+format(b.lower):format(b.lower)+' – '+format(b.upper)}</td><td>${b.rate/100}%</td><td>${format(b.used)}</td><td>${format(b.tax)}</td></tr>`).join('')}<tr class="table-total"><td colspan="3">Annual income tax</td><td>${format(r.amount)}</td></tr></tbody></table></div><a class="inline-ref" href="#law/58">Nigeria Tax Act 2025 · section 58 & Fourth Schedule ↗</a><h3 class="full-breakdown-title">Full calculation</h3>${rowsTable(r,currency)}`;}
 else container.innerHTML=`<h3>${r.amount===null?'Scope needs confirmation':'How the amount is calculated'}</h3>${r.rows.length?rowsTable(r,currency):`<ul>${r.notes.map(n=>`<li>${escape(n)}</li>`).join('')}</ul>`}<p class="mini-label">${refsHtml(c.refs)}</p>`;
 if(c.id==='vat')container.innerHTML+=`<h3 class="full-breakdown-title">Supply classification reference</h3><p>Check the statutory definition and conditions for each item. This list does not decide a business’s registration obligations. Humanitarian donor-funded projects have a pay-then-refund procedure under section 185(1)(c).</p><div class="table-wrap"><table><thead><tr><th>Supply</th><th>Treatment</th><th>Section</th></tr></thead><tbody>${VAT_CATEGORIES.map(([,name,treatment,ref])=>`<tr><td>${escape(name)}</td><td>${escape(treatment)}</td><td>${escape(ref)}</td></tr>`).join('')}</tbody></table></div>`;
}
function rowsTable(r,currency){return `<div class="table-wrap"><table><thead><tr><th scope="col">Calculation item</th><th scope="col">Amount / treatment</th></tr></thead><tbody>${r.rows.map(([name,val])=>`<tr><td>${escape(name)}</td><td>${format(val,currency)}</td></tr>`).join('')}</tbody></table></div>`;}
function download(c,r){const data={application:'NTaxer',calculator:c.name,ruleset:RULESET,reviewed:REVIEWED,generatedAt:new Date().toISOString(),currency:r.currency||'NGN',moneyUnit:'minor units (100 kobo/cents = 1 currency unit)',status:statusLabel(c.status),inputs:state.inputs[c.id],result:r,legalSections:c.refs,source:SOURCE_LINKS.nta.url,additionalSource:c.extraSource?SOURCE_LINKS[c.extraSource].url:null};const blob=new Blob([JSON.stringify(data,(_,v)=>v===Infinity?'unbounded':v,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`NTaxer-${c.id}-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function coverageView(){
 $('#main').innerHTML=`<div class="coverage-heading-row"><div><p class="eyebrow">Scope, before calculation</p><h1>Every chapter. Clear boundaries.</h1></div><div class="coverage-toolbar"><label class="search wide-search"><span aria-hidden="true">⌕</span><input id="coverage-search" type="search" aria-label="Search tax coverage" placeholder="Search calculators or sector guides…" value="${escape(state.coverageQuery)}"></label><label class="coverage-filter-control"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h18l-7 8v7l-4 2v-9Z"/></svg><select id="coverage-filter" aria-label="Filter tax coverage"><option value="All" ${state.coverage==='All'?'selected':''}>All coverage</option><option value="calculator" ${state.coverage==='calculator'?'selected':''}>Calculators</option><option value="sector" ${state.coverage==='sector'?'selected':''}>Sector guides</option></select></label></div></div><div class="intro coverage-intro"><p class="lead">Explore the taxes and taxpayer segments in the Act. A formula, an assisted assessment and a legal exemption are different kinds of coverage.</p></div><div class="notice neutral">${CALCULATORS.length} calculator workspaces · ${SECTORS.length} sector and subject guides · 202 sections · 14 schedules. This does not mean every tax liability is automatically determined.</div><p class="law-count" id="coverage-count" aria-live="polite"></p><div class="grid-cards" id="coverage-cards"></div>`;
 const matches=(item,query)=>!query||`${item.name||''} ${item.group||''} ${item.description||''} ${item.text||''} ${item.status||''}`.toLowerCase().includes(query);
 const render=()=>{
  const query=state.coverageQuery.toLowerCase().trim();
  const calculators=state.coverage==='sector'?[]:CALCULATORS.filter(item=>matches(item,query));
  const sectors=state.coverage==='calculator'?[]:SECTORS.filter(item=>matches(item,query));
  const cards=calculators.map(c=>`<article class="coverage-card"><span class="badge ${c.status}">${statusLabel(c.status)}</span><h2>${escape(c.name)}</h2><p>${escape(c.description)}</p><p class="mini-label">${refsHtml(c.refs)}</p><a href="#calculator/${c.id}">Open calculator →</a></article>`).join('')+sectors.map(s=>`<article class="coverage-card"><span class="badge assisted">${escape(s.status)}</span><h2>${escape(s.name)}</h2><p>${escape(s.text)}</p><p class="mini-label">${refsHtml(s.refs)}</p>${s.source?`<p>${link(SOURCE_LINKS[s.source].url,'Additional source')}</p>`:''}<a href="#calculator/${s.calc}">Related calculator →</a></article>`).join('');
  const count=calculators.length+sectors.length;
  $('#coverage-count').textContent=`${count} ${count===1?'result':'results'}`;
  $('#coverage-cards').innerHTML=cards||'<p class="empty coverage-empty">No matching coverage found.</p>';
 };
 const search=$('#coverage-search');
 const filter=$('#coverage-filter');
 search.addEventListener('input',()=>{state.coverageQuery=search.value;render();});
 filter.addEventListener('change',()=>{state.coverage=filter.value;render();});
 render();
}
let lawToolbarObserver;
async function lawView(target){
 $('#main').innerHTML='<p class="eyebrow">Legal reference</p><h1>The Nigeria Tax Act, 2025</h1><p class="lead">Loading the indexed law…</p>';
 const data=await lawPromise;if(!location.hash.startsWith('#law'))return;
 if(!data){$('#main').innerHTML=`<h1>The tax law</h1><p>The searchable reference could not load. ${link('assets/nigeria-tax-act-2025-nass.pdf','Read the PDF')} or reload the page.</p>`;return;}
 $('#main').innerHTML=`<div class="law-toolbar"><div><p class="eyebrow">National Assembly release · January 2026</p><h1>The Nigeria Tax Act, 2025</h1></div><div class="law-search-controls"><label class="search wide-search"><span aria-hidden="true">⌕</span><input id="law-search" type="search" aria-label="Search the tax law" placeholder="Search a section, tax, sector or phrase…" value="${escape(state.lawQuery)}"></label><label class="law-filter-control"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h18l-7 8v7l-4 2v-9Z"/></svg><select id="law-filter" aria-label="Filter the law by chapter"><option value="All">All chapters</option>${CHAPTERS.map((c,i)=>`<option value="${i}">${escape(c.name)}</option>`).join('')}<option value="schedules">Schedules</option></select></label></div></div><div class="intro"><p class="lead">Search all 202 sections and the 14 schedules. Extracted text is a reading aid; use the linked PDF to verify wording and layout.</p></div><p>${link('assets/nigeria-tax-act-2025-nass.pdf','Open the complete Act')} · <a href="#sources">Sources & methodology</a></p><p class="law-count" id="law-count" aria-live="polite"></p><div id="law-results"></div>`;
 const toolbar=$('.law-toolbar');
 const syncLawToolbar=()=>$('#main').style.setProperty('--law-toolbar-height',toolbar.getBoundingClientRect().height+'px');
 syncLawToolbar();
 lawToolbarObserver=new ResizeObserver(syncLawToolbar);
 lawToolbarObserver.observe(toolbar);
 $('#law-search').addEventListener('input',()=>{state.lawQuery=$('#law-search').value;renderLaw();$('#law-count').scrollIntoView({block:'start',behavior:'instant'});});$('#law-filter').addEventListener('change',()=>{state.lawChapter=$('#law-filter').value;renderLaw();$('#law-count').scrollIntoView({block:'start',behavior:'instant'});});
 if(target){state.lawQuery='';$('#law-search').value='';state.lawChapter=target.startsWith('schedule-')?'schedules':'All';}renderLaw();
 if(target){const el=document.getElementById('law-'+target);if(el){el.open=true;el.scrollIntoView({block:'start',behavior:'instant'});}}
}
function lawTextHtml(value){
 // Rejoin PDF line wraps, keeping clause markers and structural headings separate.
 const paragraphs=[];
 let current='';
 for(const rawLine of String(value??'').replace(/\r\n?/g,'\n').split('\n')){
  const line=rawLine.trim();
  const startsParagraph=/^(?:\([a-z0-9]+\)|\d+\.\s|CHAPTER\b|PART\s+[IVX\d]+\b)/i.test(line);
  if(!line||startsParagraph){
   if(current)paragraphs.push(current);
   current=line;
  }else current+=(current?' ':'')+line;
 }
 if(current)paragraphs.push(current);
 return paragraphs.map(p=>`<p>${escape(p)}</p>`).join('');
}
function renderLaw(){const q=state.lawQuery.toLowerCase().trim(),data=state.law;$('#law-filter').value=state.lawChapter;let list=[];
 if(state.lawChapter==='schedules'){list=data.schedules.map((s,i)=>{const last=data.schedules[i+1]?.page||214;return {id:'schedule-'+s.number,title:s.title,number:'S'+s.number,page:s.page,text:data.pages.filter(p=>p.page>=s.page&&p.page<last).map(p=>p.text).join('\n\n')};});}
 else{list=data.sections.filter(s=>{if(state.lawChapter==='All')return true;const c=CHAPTERS[Number(state.lawChapter)];return c&&s.number>=c.from&&s.number<=c.to;}).map(s=>({...s,id:String(s.number)}));}
 list=list.filter(s=>!q||String(s.number)===q||s.title.toLowerCase().includes(q)||s.text.toLowerCase().includes(q));$('#law-count').textContent=`${list.length} ${state.lawChapter==='schedules'?'schedules':'sections'} found`;
 $('#law-results').innerHTML=list.map(s=>`<details class="law-item" id="law-${s.id}"><summary><span class="section-no">${s.number}</span><span class="law-section-title">${escape(s.title)}</span><span class="law-chevron" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></span></summary><p>${link(`assets/nigeria-tax-act-2025-nass.pdf#page=${s.page}`,`Verify in the PDF · page ${s.page}`)}</p>${state.lawChapter==='schedules'?`<pre>${escape(s.text)}</pre>`:`<div class="law-body">${lawTextHtml(s.text)}</div>`}</details>`).join('')||'<div class="empty">No match. Try a shorter phrase or another chapter.</div>';
}
function sourcesView(){
 $('#main').innerHTML=`<div class="page-header sticky-page-heading"><p class="eyebrow">Understanding your estimate</p><h1>Sources & methodology</h1></div><div class="intro page-subtext"><p class="lead">See which sources inform NTaxer, how your estimate is calculated and what to check before using it.</p></div>
 <section class="detail-card"><h2>How your estimate is calculated</h2><ol><li><strong>Choose the relevant calculator.</strong> Each calculator covers a particular tax, transaction or taxpayer category.</li><li><strong>Replace the example figures.</strong> Enter your own amounts and check the period, eligibility conditions and deductions shown beside each field.</li><li><strong>Review the result.</strong> The estimate updates as you type. Open the calculation breakdown to see the amounts used, and read Assumptions & scope for the conditions that apply.</li><li><strong>Check the legal references.</strong> Each calculator links to the relevant sections and, where applicable, supporting regulations or guidance.</li></ol><p>For personal income tax, eligible deductions are applied before the annual tax bands. The monthly PAYE estimate is the annual amount divided by 12. Monetary results are rounded to the nearest kobo; US-dollar royalty components are rounded to the nearest cent.</p></section>
 <section class="detail-card detail-area"><h2>What the result labels mean</h2><ul><li><strong>Formula calculator:</strong> applies the supported calculation to the information you enter.</li><li><strong>Assisted estimate:</strong> requires you to confirm eligibility or supply figures that may need professional assessment.</li><li><strong>Planning scenario:</strong> models an outcome under the stated assumptions. It does not confirm that the charge applies to you.</li></ul><p>If a result says <strong>Review needed</strong>, a condition remains unresolved. This does not mean your tax is zero. Incorrect or incomplete inputs must be corrected before a new estimate can be shown.</p></section>
 <section class="detail-card detail-area"><h2>Sources used</h2><p>NTaxer uses the Nigeria Tax Act, 2025, together with the regulations, guidance and supporting information listed below. Use the links to read the documents behind the calculations.</p>${Object.values(SOURCE_LINKS).map(s=>`<article class="source-entry"><h3>${link(s.url,s.title)}</h3><p>${escape(s.detail)}</p></article>`).join('')}<p class="mini-label">Calculation rules reviewed: ${REVIEWED}. NTaxer uses a fixed set of rules for the displayed 2026 tax year; legal updates are not applied automatically.</p></section>
 <section class="detail-card detail-area"><h2>Using your estimate</h2><p>Calculators work independently. Some results overlap, and withholding tax may be a credit against another liability. Do not add every calculator result together as your total tax bill.</p><p>Eligibility, exemptions, reliefs and sector-specific treatment depend on your circumstances. Where confirmation is required, follow the instructions in that calculator. Complex payroll, insurance, trusts, free zones, petroleum operations, treaties, customs and state or local charges may need further assessment.</p><p>NTaxer provides planning estimates. It does not submit returns, make tax payments or issue an official assessment.</p></section>
 <section class="detail-card detail-area"><h2>Your information and records</h2><p>Calculations run in your browser. Entered figures stay in page memory and reset when you reload. No account or financial-data upload is required.</p><p>Use <strong>Print / save PDF</strong> to keep a readable estimate, or <strong>Export record</strong> to download the inputs, result and calculation references. Check your figures and assumptions before sharing a record.</p><p>${link('https://github.com/Oshione2002/NTaxer','View the calculation code')}</p></section>`;
}
function route(){
 lawToolbarObserver?.disconnect();
 const hash=location.hash||'#home';
 const [page,target]=hash.slice(1).split('/');
 document.querySelectorAll('[data-nav]').forEach(a=>{
  const active=a.dataset.nav===page;
  a.classList.toggle('active',active);
  if(a.tagName==='A'){if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
 });
 if(page==='coverage')coverageView();
 else if(page==='law')lawView(target);
 else if(page==='sources')sourcesView();
 else if(page==='calculator')calcView(target||'paye');
 else homeView();
 nav();
 if(page!=='law')window.scrollTo({top:0,behavior:'instant'});
}
const sidebarToggle=$('#sidebar-toggle');
const smallSidebar=window.matchMedia('(max-width:940px)');
function setSidebarExpanded(expanded){
 const sidebar=$('#tax-sidebar');
 sidebar.hidden=!expanded;
 sidebar.inert=!expanded;
 sidebar.setAttribute('aria-hidden',String(!expanded));
 $('.shell').classList.toggle('sidebar-collapsed',!expanded);
 sidebarToggle.setAttribute('aria-expanded',String(expanded));
 const label=expanded?'Collapse sidebar':'Open sidebar';
 sidebarToggle.setAttribute('aria-label',label);
 sidebarToggle.title=label;
}
sidebarToggle.addEventListener('click',()=>setSidebarExpanded(sidebarToggle.getAttribute('aria-expanded')!=='true'));
setSidebarExpanded(false);
smallSidebar.addEventListener('change',()=>setSidebarExpanded(false));
$('#tax-sidebar').addEventListener('click',event=>{
 if(smallSidebar.matches&&event.target.closest('a[href]')){
  setSidebarExpanded(false);
  $('#main').focus({preventScroll:true});
 }
});
document.addEventListener('pointerdown',event=>{
 const sidebar=$('#tax-sidebar');
 if(smallSidebar.matches&&!sidebar.hidden&&!sidebar.contains(event.target)&&!sidebarToggle.contains(event.target)){
  const focusWasInside=sidebar.contains(document.activeElement);
  setSidebarExpanded(false);
  if(focusWasInside)sidebarToggle.focus({preventScroll:true});
 }
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&smallSidebar.matches&&!$('#tax-sidebar').hidden){
  setSidebarExpanded(false);
  sidebarToggle.focus({preventScroll:true});
 }
});
$('#calculator-search').addEventListener('input',nav);window.addEventListener('hashchange',route);if(!location.hash)history.replaceState(null,'','#home');route();

const scrollTopButton=$('#scroll-to-top');
const updateScrollTopButton=()=>{scrollTopButton.hidden=window.scrollY<300;};
window.addEventListener('scroll',updateScrollTopButton,{passive:true});
scrollTopButton.addEventListener('click',()=>{
 $('#main').focus({preventScroll:true});
 window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
});
updateScrollTopButton();

// Keep the pinned category headings below the actual menu and search heights.
const calculatorMenu=$('.calculator-menu');
const calculatorSummary=calculatorMenu.querySelector('.calculator-menu-toggle');
const calculatorSearchBar=$('.calculator-search-bar');
const syncCalculatorStickyHeights=()=>{
 for(const [element,property] of [[calculatorSummary,'--calculator-heading-height'],[calculatorSearchBar,'--calculator-search-height']]){
  const height=element.getBoundingClientRect().height;
  if(height>0)calculatorMenu.style.setProperty(property,height+'px');
 }
};
const calculatorStickyObserver=new ResizeObserver(syncCalculatorStickyHeights);
calculatorStickyObserver.observe(calculatorSummary);
calculatorStickyObserver.observe(calculatorSearchBar);
calculatorSummary.addEventListener('click',()=>{
 const expanded=calculatorSummary.getAttribute('aria-expanded')!=='true';
 calculatorSummary.setAttribute('aria-expanded',String(expanded));
 calculatorMenu.classList.toggle('is-open',expanded);
 $('.sidebar-primary').classList.toggle('calculators-expanded',expanded);
 $('#calculator-menu-options').hidden=!expanded;
 syncCalculatorStickyHeights();
});
syncCalculatorStickyHeights();

// Recalculate result offsets whenever the active page heading changes or wraps.
let currentPageHeader;
const pageHeaderObserver=new ResizeObserver(()=>{
 if(currentPageHeader)$('#main').style.setProperty('--page-header-height',currentPageHeader.getBoundingClientRect().height+'px');
});
function observePageHeader(){
 pageHeaderObserver.disconnect();
 currentPageHeader=$('#main > .page-header');
 $('#main').style.setProperty('--page-header-height',currentPageHeader?currentPageHeader.getBoundingClientRect().height+'px':'0px');
 if(currentPageHeader)pageHeaderObserver.observe(currentPageHeader);
}
const pageContentObserver=new MutationObserver(observePageHeader);
pageContentObserver.observe($('#main'),{childList:true});
observePageHeader();
