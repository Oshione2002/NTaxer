import {CALCULATORS,DEFAULTS,SOURCE_LINKS} from './calculators.js';
import {CHAPTERS,SECTORS} from './coverage.js';
import {VAT_CATEGORIES} from './schedules.js';
import {RULESET,REVIEWED,money} from './engine.js';
import {buildInputRows,downloadPdf,downloadExcel} from './export.js';

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
 $('#main').innerHTML=`<div class="page-header sticky-page-heading"><p class="eyebrow">Welcome to NTaxer</p><h1>What would you like to calculate?</h1></div><div class="intro page-subtext"><p class="lead">Choose a tax calculator to estimate an amount, review the breakdown and check the rules that apply.</p></div>
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
function exportValue(value,currency){return typeof value==='number'?format(value,currency):String(value??'');}
function exportInputValue(field,value){
 if(field.type==='boolean')return value?'Yes':'No';
 if(field.type==='select')return field.options.find(([option])=>String(option)===String(value))?.[1]||String(value??'');
 if(field.type==='money')return format(money(value),'NGN');
 return String(value??'');
}
function buildExportReport(c,r){
 const generatedAt=new Date(),currency=r.currency||'NGN';
 const siteRoot=new URL('.',location.href).href;
 const lawUrl=target=>`${siteRoot}#law/${target}`;
 const metric1=r.secondary||['Calculation base',r.base],metric2=r.tertiary||['Ruleset year','2026'];
 const sources=[SOURCE_LINKS.nta,...(c.extraSource?[SOURCE_LINKS[c.extraSource]]:[]),...(c.id==='gains'?[SOURCE_LINKS.virtual]:[])];
 const uniqueSources=[...new Map(sources.map(source=>[source.url,source])).values()];
 const calculationTables=[{title:'Full calculation',headers:['Calculation item','Amount / treatment'],rows:r.rows.map(([label,value])=>[label,exportValue(value,currency)])}];
 if(r.bands)calculationTables.unshift({title:'Progressive tax bands',headers:['Annual band','Rate','Income in band','Tax'],rows:r.bands.map(band=>[band.upper===Infinity?`Above ${format(band.lower,currency)}`:`${format(band.lower,currency)} - ${format(band.upper,currency)}`,`${band.rate/100}%`,format(band.used,currency),format(band.tax,currency)])});
 if(c.id==='vat')calculationTables.push({title:'Supply classification reference',headers:['Supply','Treatment','Section'],rows:VAT_CATEGORIES.map(([,name,treatment,reference])=>[name,treatment,reference])});
 const legalRows=[['Act sections',{separator:', ',parts:c.refs.map(sectionNumber=>({text:`Section ${sectionNumber}`,url:lawUrl(sectionNumber)}))}]];
 if(c.schedules?.length)legalRows.push(['Schedules',{separator:', ',parts:c.schedules.map(scheduleNumber=>({text:`Schedule ${scheduleNumber}`,url:lawUrl(`schedule-${scheduleNumber}`)}))}]);
 legalRows.push(['Ruleset',RULESET],['Review date',REVIEWED],['Scope note','Dates identify this fixed review, not a live tax-law feed.']);
 return {
  title:`${c.name} - tax estimate`,subtitle:c.description,amountLabel:r.title||'Estimated amount',amount:format(r.amount,currency),
  generatedAt:generatedAt.toISOString(),generatedDisplay:new Intl.DateTimeFormat('en-NG',{dateStyle:'medium',timeStyle:'short'}).format(generatedAt),ruleset:RULESET,reviewed:REVIEWED,
  sections:[
   {title:'Overview',tables:[{title:'Result summary',headers:['Item','Value'],rows:[['Calculator',c.name],['Tax year','2026'],['Estimate status',statusLabel(c.status)],['Result',r.title||'Estimated amount'],['Estimated amount',format(r.amount,currency)],['Currency',currency],[metric1[0],exportValue(metric1[1],currency)],[metric2[0],exportValue(metric2[1],currency)],['Generated',new Intl.DateTimeFormat('en-NG',{dateStyle:'full',timeStyle:'long'}).format(generatedAt)],['Important','This is a planning estimate, not a tax assessment. Check the assumptions, scope and legal references before filing or making a financial decision.']]}]},
   {title:'Inputs',tables:[{title:'Information entered',headers:['Input','Entered value','Guidance / scope'],rows:buildInputRows(c.fields,state.inputs[c.id],exportInputValue)}]},
   {title:'Calculation breakdown',tables:calculationTables},
   {title:'Assumptions & scope',tables:[{title:'Conditions used for this estimate',headers:['No.','Assumption / scope'],rows:(r.notes?.length?r.notes:['No calculator-specific assumptions were returned.']).map((note,index)=>[String(index+1),note])}]},
   {title:'Legal references',tables:[{title:'Legal basis',headers:['Reference','Details'],rows:legalRows},{title:'Source documents',headers:['Source','URL and description'],rows:uniqueSources.map(source=>[{text:source.title,url:source.url},{text:`${source.url}\n${source.detail}`,url:source.url}])}]}
  ]
 };
}
function calculatorGroupIcon(group){
 const icons={
  'Individuals':'<svg class="calculator-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  'Businesses':'<svg class="calculator-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 10h2M13 10h2M9 14h2M13 14h2"/></svg>',
  'Transactions':'<svg class="calculator-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 7h10l3 5-3 5H7l-3-5Z"/><path d="M9 12h6"/></svg>',
  'Reliefs & allowances':'<svg class="calculator-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v18M5 8h14M7 16h10"/><path d="M8 5 5 8l3 3M16 13l3 3-3 3"/></svg>',
  'Specialist sectors':'<svg class="calculator-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19h16M6 16l4-5 3 3 5-7"/><path d="M16 7h2v2"/></svg>'
 };
 return icons[group]||'<svg class="calculator-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';
}
function nav(){
 const query=$('#calculator-search').value.toLowerCase().trim();
 const groups=new Map();
 for(const c of CALCULATORS){
  if(!`${c.name} ${c.group} ${c.description}`.toLowerCase().includes(query))continue;
  if(!groups.has(c.group))groups.set(c.group,[]);
  groups.get(c.group).push(c);
 }
 $('#calculator-nav').innerHTML=[...groups].map(([group,calculators])=>`<details class="calculator-nav-group" ${query||location.hash.startsWith('#calculator')&&calculators.some(c=>c.id===state.current)?'open':''}><summary class="nav-group"><span class="calculator-group-label">${calculatorGroupIcon(group)}<span>${escape(titleCase(group))}</span></span><svg class="nav-group-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="calculator-nav-links">${calculators.map(c=>`<a href="#calculator/${c.id}" class="calc-link ${state.current===c.id&&location.hash.startsWith('#calculator')?'active':''}" ${state.current===c.id&&location.hash.startsWith('#calculator')?'aria-current="page"':''}><span class="nav-symbol" aria-hidden="true">${c.symbol}</span>${escape(c.short)}</a>`).join('')}</div></details>`).join('')||'<p class="empty">No matching calculators.</p>';
}
const fieldHelpPopover=document.createElement('div');
fieldHelpPopover.id='field-help-popover';
fieldHelpPopover.className='field-help-popover';
fieldHelpPopover.setAttribute('role','tooltip');
fieldHelpPopover.setAttribute('aria-hidden','true');
document.body.appendChild(fieldHelpPopover);

let activeFieldHelpTrigger=null;
let pinnedFieldHelpTrigger=null;

function fieldHelpDetails(f,calculator){
 const label=String(f.label||'This field');
 const lower=label.toLowerCase();
 const calcName=calculator?.name||'this calculator';
 const calcId=calculator?.id||'';
 const generic={
  meaning:'This is one of the inputs NTaxer uses to work out '+calcName+'.',
  enter:f.type==='money'?'Enter the amount that applies to you in naira. Use 0 when it genuinely does not apply.':f.type==='number'?'Enter the number or percentage that applies to your case.':f.type==='select'?'Choose the option that best describes your actual situation.':'Turn this on only when the statement is true for your situation.',
  why:'Changing this field can change the tax base, rate, relief, credit or eligibility used in the calculation.',
  watch:'Do not guess. If you are unsure whether an amount qualifies, check the assumptions and legal references before relying on the estimate.'
 };
 const d=(meaning,enter,why,watch)=>({meaning,enter,why,watch});

 if(/salary frequency/.test(lower))return d(
  'This tells NTaxer whether the salary figure you entered is monthly or annual.',
  'Choose the period that matches the salary amount in the next field. Do not annualise it yourself if you choose Monthly.',
  'NTaxer uses this choice to put your employment income on the correct annual basis before calculating PAYE.',
  'A monthly salary entered while Annual is selected can make the result much too low, while an annual salary entered as Monthly can make it much too high.'
 );
 if(/gross cash salary/.test(lower))return d(
  'This is your cash employment pay before tax and other deductions.',
  'Enter basic salary plus taxable cash allowances and bonuses that belong in employment income. Do not include non-cash benefits that have their own field.',
  'It is usually the main starting point for PAYE and determines how much income moves through the progressive tax bands.',
  'Use gross pay, not take-home pay. Take-home pay already has deductions removed and will understate the taxable amount.'
 );
 if(/benefits in kind/.test(lower))return d(
  'These are non-cash benefits your employer provides that the tax rules treat as part of your employment income.',
  'Enter the taxable value of benefits such as an employer-provided asset, accommodation or other non-cash benefit where a taxable value has been determined.',
  'Even though no cash was paid to you, a taxable benefit can increase employment income for PAYE.',
  'Do not enter the employer’s purchase cost automatically. Use the tax value that applies to the benefit.'
 );
 if(/other annual taxable income|other annual chargeable income/.test(lower))return d(
  'This captures taxable income that is not already included in the main salary, business or transaction fields.',
  'Enter only income that belongs in the same annual tax computation and has not already been counted elsewhere.',
  'It can move part of your income into higher tax bands or affect the marginal tax applied to another item.',
  'Avoid double-counting salary, business receipts or gains that are already entered in another field.'
 );
 if(/employee pension contributions/.test(lower))return d(
  'This is the employee portion of qualifying pension contributions that may reduce taxable employment income.',
  'Enter the amount actually contributed by you for the relevant year, not the employer’s contribution.',
  'A qualifying contribution can reduce the amount of income exposed to tax.',
  'Do not use the total pension paid by both employee and employer unless the law specifically allows both in your case.'
 );
 if(/annual rent paid/.test(lower))return d(
  'This is the rent you personally paid for your residence during the year where the statutory rent relief can apply.',
  'Enter the qualifying annual rent actually paid for the relevant period.',
  'NTaxer uses it to determine the rent relief available before arriving at chargeable income.',
  'Do not enter business rent here unless this is the field specifically intended for that business calculator.'
 );
 if(/national housing fund/.test(lower))return d(
  'This is your qualifying contribution to the National Housing Fund.',
  'Enter the amount actually contributed for the relevant year.',
  'A qualifying contribution can reduce the income used to calculate personal income tax.',
  'Use the contribution amount, not the value of a house, mortgage balance or employer housing allowance.'
 );
 if(/health insurance/.test(lower))return d(
  'This is the amount of qualifying health-insurance contribution that the tax rules allow in the personal income calculation.',
  'Enter only eligible health-insurance contributions for the relevant period.',
  'Qualifying contributions can reduce chargeable income before tax bands are applied.',
  'Ordinary medical bills are not automatically the same thing as a qualifying health-insurance contribution.'
 );
 if(/life insurance|annuity premiums/.test(lower))return d(
  'This covers eligible life-insurance or annuity premiums that can qualify for relief.',
  'Enter the eligible premium amount for the statutory period that applies to the claim.',
  'A valid amount can reduce the income on which personal tax is calculated.',
  'Not every insurance payment qualifies. General motor, property or health expenses should not be placed here unless the law permits it.'
 );
 if(/mortgage|owner-occupied housing loan/.test(lower))return d(
  'This is qualifying interest paid on a loan used for your owner-occupied home.',
  'Enter the interest portion only where the legal conditions are met.',
  'Qualifying mortgage interest can reduce chargeable personal income.',
  'Do not enter the full loan repayment. Principal repayment is different from interest.'
 );
 if(/paye credits|income-tax credits|income tax.*already paid/.test(lower))return d(
  'This is tax already deducted or paid that can be credited against the tax NTaxer calculates.',
  'Enter only amounts that legally count as a credit for the same tax and period.',
  'Credits reduce the amount still payable; they do not reduce the underlying income itself.',
  'Do not include unrelated levies, VAT, development levy or payments that cannot be credited against this tax.'
 );
 if(/minimum-wage employment/.test(lower))return d(
  'This confirms whether your employment meets the specific minimum-wage condition used by this calculator.',
  'Turn it on only when the employment income and other conditions actually satisfy the statutory test.',
  'The answer can change whether employment income receives the special minimum-wage treatment.',
  'Do not use it simply because your take-home pay feels low; it depends on the legal threshold and conditions.'
 );

 if(/annual business receipts/.test(lower))return d(
  'This is the total money earned by the sole trade or self-employed activity before deducting business costs.',
  'Enter sales, fees and other business receipts for the year that belong to this business.',
  'It is the starting revenue figure from which allowable expenses and reliefs are deducted.',
  'Do not include loans, owner capital, transfers between your own accounts or personal gifts as business revenue.'
 );
 if(/allowable business expenses/.test(lower))return d(
  'These are business costs that the tax rules allow you to deduct when working out taxable business income.',
  'Enter qualifying costs incurred to earn the business income, such as appropriate rent, utilities, communication, supplies or professional costs.',
  'Allowable expenses reduce taxable business profit.',
  'A payment being made from a business account does not automatically make it deductible. Personal or capital spending may need different treatment.'
 );
 if(/loss relief/.test(lower))return d(
  'This is an eligible tax loss from the business that you are allowed to use against income under the applicable rules.',
  'Enter only the amount that is legally available to claim in this period.',
  'Loss relief can reduce the taxable business income carried into the personal or company tax computation.',
  'Do not enter an accounting loss automatically; tax losses can differ after tax adjustments.'
 );
 if(/capital allowances claimed/.test(lower))return d(
  'Capital allowance is the tax relief given for qualifying capital assets instead of deducting accounting depreciation.',
  'Enter the amount of capital allowance you are actually claiming for this period.',
  'It can reduce taxable profit after the relevant tax adjustments.',
  'Do not enter the asset purchase price here unless the calculator specifically asks for qualifying capital expenditure.'
 );

 if(/taxpayer$/.test(lower))return d(
  'This identifies what kind of taxpayer is making the transaction or receiving the income.',
  'Choose the legal taxpayer category that actually applies, such as an individual or company.',
  'Different taxpayer types can have different rates, exemptions and calculation methods.',
  'Choose based on legal status, not the name on a bank account or the size of the transaction.'
 );
 if(/asset category/.test(lower))return d(
  'This tells NTaxer what type of asset was disposed of.',
  'Choose the category that matches the asset sold, such as shares or another chargeable asset.',
  'Different asset types can have different exemptions, thresholds and relief rules.',
  'Do not choose shares merely because the payment moved through an investment account; classify the actual asset disposed of.'
 );
 if(/disposal proceeds/.test(lower))return d(
  'This is what you received, or are treated as receiving, for disposing of the asset.',
  'Enter the full disposal consideration before deducting acquisition cost or disposal expenses.',
  'The gain calculation starts by comparing disposal proceeds with allowable cost and expenses.',
  'Use the value attributable to the actual disposal, not unrelated receipts in the same account.'
 );
 if(/acquisition cost/.test(lower))return d(
  'This is the qualifying cost of acquiring the asset that was later disposed of.',
  'Enter the cost attributable to the specific asset or portion disposed of.',
  'It is deducted from disposal proceeds when calculating the gain, subject to the applicable tax rules.',
  'Do not use today’s market value unless the law specifically requires a substituted value.'
 );
 if(/acquisition.*disposal expenses/.test(lower))return d(
  'These are qualifying costs directly connected with buying or selling the asset.',
  'Enter eligible transaction, legal, brokerage or professional costs that relate directly to the acquisition or disposal.',
  'Valid expenses reduce the gain on which tax may be charged.',
  'General overheads or unrelated bank charges should not automatically be included.'
 );
 if(/share proceeds.*12 months/.test(lower))return d(
  'This tracks other Nigerian-share disposal proceeds within the same 12-month period.',
  'Enter the gross proceeds from the other relevant share disposals in that period.',
  'NTaxer uses the aggregate to test thresholds and relief conditions that depend on total share disposals.',
  'Do not enter gains here; this field asks for proceeds before costs.'
 );
 if(/share gains.*12 months/.test(lower))return d(
  'This is the gain from other relevant share disposals in the same 12-month period.',
  'Enter the taxable gain amount from those other share disposals.',
  'It helps NTaxer apply share-disposal rules that depend on aggregate gains as well as proceeds.',
  'Do not substitute total sale proceeds for the gain.'
 );
 if(/reinvested in nigerian shares/.test(lower))return d(
  'This is disposal money that was reinvested in qualifying Nigerian shares where the reinvestment relief conditions are met.',
  'Enter the qualifying amount of proceeds actually reinvested in the required period.',
  'A qualifying reinvestment can reduce the portion of the gain that is immediately taxed.',
  'Only qualifying reinvestment counts; simply moving cash to an investment account is not enough.'
 );

 if(/cbn|nafem rate/.test(lower))return d(
  'This is the naira-per-US-dollar exchange rate used for the relevant acquisition or disposal date.',
  'Enter the applicable official rate for that specific date as naira for one US dollar.',
  'The calculator uses it to translate dollar-referenced values consistently when working out the digital-asset result.',
  'Do not use an average annual rate unless that is specifically the legally required rate.'
 );
 if(/token lot/.test(lower))return d(
  'This is the naira cost allocated to the specific crypto or token units you actually disposed of.',
  'Enter the acquisition cost attributable to the disposed lot, not your whole wallet balance.',
  'The calculator compares this allocated cost with disposal proceeds to determine the gain.',
  'Be careful when only part of a holding was sold; only the corresponding cost should be used.'
 );
 if(/naira disposal proceeds/.test(lower))return d(
  'This is the naira value received from disposing of the crypto or digital asset.',
  'Enter the proceeds for the units actually sold or exchanged.',
  'It forms the revenue side of the digital-asset gain calculation.',
  'Exclude unrelated wallet deposits and transfers that were not a disposal.'
 );

 if(/loss-of-employment compensation/.test(lower))return d(
  'This is compensation specifically paid because employment ended, such as qualifying severance or termination compensation.',
  'Enter the compensation amount that relates to loss of employment.',
  'The calculator applies the statutory exemption and taxes only the amount that remains taxable.',
  'Do not include normal salary, leave pay or bonuses unless they legally form part of the compensation treatment.'
 );
 if(/earlier compensation/.test(lower))return d(
  'This records earlier compensation that has already used part of the same statutory exemption.',
  'Enter the earlier amount that counts against the exemption being tested now.',
  'The exemption may be shared across related compensation payments, so previous use can reduce what remains available.',
  'Do not enter unrelated employment income.'
 );

 if(/annual gross turnover/.test(lower))return d(
  'This is the company’s gross annual revenue before deducting expenses.',
  'Enter total turnover for the relevant accounting period.',
  'Turnover can determine whether the company falls within size-based tax rules and whether certain exclusions or rates apply.',
  'Use gross turnover, not profit after expenses.'
 );
 if(/total fixed assets/.test(lower))return d(
  'This is the value of the company’s long-term fixed assets used in the applicable company-size test.',
  'Enter the fixed-asset amount required by the statutory test for the period.',
  'It can affect whether the company qualifies for special small-company treatment.',
  'Do not mix current assets such as cash, receivables or inventory into this figure unless the law requires them.'
 );
 if(/assessable operating profit/.test(lower))return d(
  'This is operating profit after the tax adjustments needed to arrive at assessable profit, before the separate losses and capital allowances entered below.',
  'Enter the tax-adjusted operating profit for the year, excluding gains that have their own field.',
  'It is the main profit base used to calculate company income tax.',
  'Accounting profit is not always the same as assessable profit because tax rules may add back or remove items.'
 );
 if(/taxable chargeable gains/.test(lower))return d(
  'This is the taxable gain from chargeable asset disposals that belongs in the company tax computation.',
  'Enter the gain after applying the relevant disposal rules and reliefs.',
  'It adds taxable gains to the company’s tax base without mixing them into ordinary operating profit.',
  'Do not enter the full sale proceeds; this field is for the taxable gain.'
 );
 if(/assessable profits for development levy/.test(lower))return d(
  'This is the profit base on which the development levy is calculated.',
  'Enter the assessable profit amount that the development-levy rules require.',
  'The levy is applied to this base, so an incorrect profit figure directly changes the levy.',
  'Do not assume it is identical to accounting profit or company-income-tax taxable profit without checking the statutory definition.'
 );

 if(/adjusted statutory net income/.test(lower))return d(
  'This is the statutory net-income amount used for the minimum-effective-tax test after the required adjustments.',
  'Enter the adjusted net-income figure prepared under the applicable rules.',
  'It is the denominator/base against which covered taxes are compared to test the effective tax floor.',
  'Do not substitute ordinary accounting profit unless it has been adjusted as required.'
 );
 if(/eligible covered taxes/.test(lower))return d(
  'These are taxes that the minimum-effective-tax rules specifically allow to count toward the effective tax rate.',
  'Enter only taxes that meet the statutory covered-tax definition.',
  'The amount already covered by eligible taxes determines whether an additional top-up tax is needed.',
  'Not every payment to government, levy or withholding qualifies as a covered tax.'
 );

 if(/turnover basis/.test(lower))return d(
  'This tells the presumptive-tax calculator whether turnover is being entered directly for the year or estimated from daily turnover.',
  'Choose Annual when you know annual turnover; choose Daily when the calculator should estimate annual turnover from daily sales and working days.',
  'The selection determines how NTaxer builds the turnover base.',
  'Do not fill both approaches as if they were separate sources of income.'
 );
 if(/estimated daily turnover/.test(lower))return d(
  'This is the approximate amount the business makes in sales on a typical working day.',
  'Enter the average daily turnover before deducting expenses.',
  'NTaxer multiplies it by working days when the Daily turnover basis is selected.',
  'Use turnover, not daily profit.'
 );
 if(/working days/.test(lower))return d(
  'This is the number of days the business is expected to trade during the year.',
  'Enter the realistic number of operating days for the annual estimate.',
  'It converts daily turnover into an estimated annual turnover.',
  'Do not automatically enter 365 if the business does not trade every day.'
 );

 if(/amount entered/.test(lower)&&calcId==='vat')return d(
  'This tells NTaxer whether the supply amount you entered already includes VAT.',
  'Choose Excluding VAT if VAT should be added on top; choose Including VAT if the entered price already contains VAT.',
  'NTaxer needs this to separate the taxable value from the VAT correctly.',
  'Choosing the wrong basis can overstate or understate both the supply value and VAT.'
 );
 if(/supply classification/.test(lower))return d(
  'This identifies how the supply is treated for VAT: standard-rated, zero-rated, exempt or another supported treatment.',
  'Choose the legal VAT treatment that applies to the actual good or service.',
  'The classification determines whether VAT is charged and whether input VAT recovery may be available.',
  'Zero-rated and exempt are not the same: both may show 0% output VAT, but their input-VAT consequences can differ.'
 );
 if(/supply amount/.test(lower))return d(
  'This is the price or value of the taxable supply being tested for VAT.',
  'Enter the transaction amount using the inclusive or exclusive basis selected above.',
  'NTaxer uses it to calculate output VAT and the amount payable by or charged to the customer.',
  'Do not enter the VAT amount itself here unless the field specifically asks for VAT.'
 );
 if(/potentially eligible input vat/.test(lower))return d(
  'This is VAT you paid on business purchases that could be recoverable against output VAT.',
  'Enter the VAT component of qualifying purchases, not the full purchase price.',
  'Recoverable input VAT can reduce the VAT that must be remitted.',
  'VAT on personal, exempt-only or otherwise ineligible purchases should not be included.'
 );
 if(/taxable-use recovery percentage/.test(lower))return d(
  'This is the share of potentially eligible input VAT that relates to taxable business use.',
  'Enter 100 only when all of that input VAT is attributable to taxable use; reduce it for mixed or non-taxable use.',
  'The percentage limits how much input VAT NTaxer deducts from output VAT.',
  'Do not use 100% merely because VAT appears on the supplier invoice.'
 );

 if(/transaction$/.test(lower)&&calcId==='withholding')return d(
  'This identifies the type of payment being tested for withholding tax.',
  'Choose the transaction category that best describes what the payment is actually for.',
  'The transaction type determines the applicable withholding rate and sometimes whether withholding applies at all.',
  'Classify by the substance of the payment, not just the counterparty’s business name.'
 );
 if(/recipient$/.test(lower))return d(
  'This identifies who is receiving the payment for withholding-tax purposes.',
  'Choose the recipient’s actual legal status and residence category.',
  'Withholding rates can differ between companies, individuals and non-residents.',
  'Do not infer recipient type from an account name alone if the legal status is uncertain.'
 );
 if(/payment basis/.test(lower))return d(
  'This tells NTaxer whether your figure is the gross amount before withholding or the net amount the recipient must receive after withholding.',
  'Choose Gross when you know the pre-withholding amount; choose Net when you need NTaxer to gross up from a desired net payment.',
  'The basis changes how the withholding amount is derived.',
  'Using a net figure as gross will understate the underlying transaction and withholding.'
 );
 if(/payment amount excluding vat/.test(lower))return d(
  'This is the transaction value on which withholding is tested, excluding VAT.',
  'Enter the amount payable for the goods, services or other transaction before VAT.',
  'Withholding is calculated from this payment base according to the selected transaction and recipient.',
  'Do not include VAT in this amount unless the applicable rule specifically requires it.'
 );

 if(/dutiable instrument/.test(lower))return d(
  'This identifies the legal instrument or document on which stamp duty is being tested.',
  'Choose the instrument that matches the actual document or transaction.',
  'Stamp-duty rates and thresholds vary by instrument, so this choice drives the duty rule used.',
  'Do not choose based only on the payment description; identify the underlying legal instrument.'
 );
 if(/chargeable consideration|capital.*premium/.test(lower))return d(
  'This is the amount used as the chargeable base for the selected stamp-duty instrument.',
  'Enter the consideration, capital, premium or other value that the selected instrument requires.',
  'NTaxer applies the relevant stamp-duty rule to this base.',
  'The correct base can differ from the cash that happened to move through the bank.'
 );
 if(/underlying property value/.test(lower))return d(
  'This is the value of the property connected to the instrument, used where a threshold or exemption depends on property value.',
  'Enter the relevant property value even if it differs from the loan or consideration amount.',
  'It helps NTaxer test property-based stamp-duty conditions.',
  'Do not automatically copy the transaction amount into this field.'
 );

 if(/amount per transfer/.test(lower))return d(
  'This is the value of each electronic transfer being tested for transfer duty.',
  'Enter the amount of one transfer. Use the separate count field when several identical transfers are being modelled.',
  'NTaxer checks the statutory threshold and fixed duty against each transfer.',
  'Do not add all transfers together here if they are separate transactions.'
 );
 if(/number of identical transfers/.test(lower))return d(
  'This is how many transfers of the same amount and treatment you want to calculate together.',
  'Enter the number of identical transfers represented by the amount-per-transfer field.',
  'NTaxer multiplies the per-transfer result by this count.',
  'Only group transfers when their amount and exemption status are genuinely the same.'
 );

 if(/qualifying asset class/.test(lower))return d(
  'This identifies the tax category of the capital asset for capital-allowance purposes.',
  'Choose the class that matches the asset actually acquired and used.',
  'The asset class determines the capital-allowance rate or treatment applied.',
  'Classify the asset by its tax category, not simply by how it appears in the accounting fixed-asset register.'
 );
 if(/qualifying capital expenditure/.test(lower))return d(
  'This is the cost of acquiring qualifying capital assets that can enter the capital-allowance computation.',
  'Enter eligible capital expenditure for the asset or asset class being calculated.',
  'It forms the base from which capital allowances are determined.',
  'Routine repairs, consumables and ordinary operating expenses are not normally capital expenditure.'
 );
 if(/allowances already claimed/.test(lower))return d(
  'This is capital allowance already used on the same new-regime asset in earlier periods.',
  'Enter the cumulative eligible allowance previously claimed against this asset.',
  'NTaxer uses it to avoid allowing more relief than remains available.',
  'Do not include depreciation from the financial statements.'
 );
 if(/length of basis period/.test(lower))return d(
  'This is the number of months covered by the accounting or tax basis period being calculated.',
  'Enter the actual length of the period.',
  'Some capital-allowance calculations are adjusted when the basis period is shorter or longer than a normal year.',
  'Do not assume 12 months when the business has a commencement, cessation or changed year-end period.'
 );

 if(/foreign-source income included above/.test(lower))return d(
  'This is the part of total taxable income that arose outside Nigeria and is already included in the total-income field.',
  'Enter only the foreign-source portion that is being considered for foreign tax relief.',
  'NTaxer uses it to cap relief so foreign tax does not shelter unrelated Nigerian-source income.',
  'Do not add foreign income twice: it should already be inside total taxable income.'
 );
 if(/qualifying foreign income tax paid/.test(lower))return d(
  'This is income tax actually paid to a foreign jurisdiction on the same foreign-source income.',
  'Enter the qualifying foreign tax amount supported by the relevant evidence.',
  'It is compared with the Nigerian tax attributable to that foreign income to determine the available relief.',
  'Foreign VAT, sales taxes, penalties or unrelated taxes are not the same as qualifying foreign income tax.'
 );

 if(/verified chargeable profits/.test(lower))return d(
  'This is the profit base already adjusted and verified for the selected petroleum or hydrocarbon tax regime.',
  'Enter the chargeable-profit figure prepared under the relevant regime.',
  'The applicable tax rate is applied to this base before credits or additional adjustments.',
  'Do not substitute gross revenue or ordinary accounting profit.'
 );
 if(/additional tax|additional chargeable tax/.test(lower))return d(
  'This is a separate additional tax amount produced by the relevant fiscal-price or regime adjustment.',
  'Enter the verified additional amount where the statutory calculation requires it.',
  'It is added to the main tax result before eligible credits are applied.',
  'Do not estimate it from revenue unless the underlying statutory adjustment has been calculated.'
 );
 if(/eligible credits|investment.*tax credits/.test(lower))return d(
  'These are verified tax credits that the selected petroleum or hydrocarbon regime allows against the calculated tax.',
  'Enter only credits that are legally available for this period and tax.',
  'They reduce the final tax payable after the main tax and additional charges are calculated.',
  'Do not include ordinary business expenses or unrelated withholding credits.'
 );
 if(/chargeable barrels/.test(lower))return d(
  'This is the average number of barrels per production day that fall within the royalty calculation.',
  'Enter chargeable production volume per day for the relevant field and period.',
  'Production volume is one of the inputs used to determine petroleum royalty.',
  'Use chargeable production, not storage capacity or total historical reserves.'
 );
 if(/production days/.test(lower))return d(
  'This is the number of days in the month on which chargeable production is being counted.',
  'Enter the production days that belong to the royalty period.',
  'NTaxer uses this with barrels per day to derive chargeable monthly production.',
  'Do not automatically use calendar days if production did not occur every day.'
 );
 if(/fiscal oil price/.test(lower))return d(
  'This is the US-dollar price per barrel used by the royalty calculation.',
  'Enter the applicable fiscal oil price for the relevant period.',
  'The price can affect price-based royalty components.',
  'Use the prescribed fiscal price, not necessarily the spot price received on one cargo.'
 );
 if(/official.*market value/.test(lower))return d(
  'This is the official or qualifying market value of the mineral quantity used for royalty.',
  'Enter the value required by the applicable mineral royalty rule.',
  'The mineral royalty rate is applied to this qualifying value.',
  'Do not automatically use invoice proceeds if the law requires an official or reference value.'
 );

 if(/qualifying nigerian gross revenue/.test(lower))return d(
  'This is Nigerian-source gross revenue that falls within the non-resident-company calculation.',
  'Enter only revenue attributable to the qualifying Nigerian activity.',
  'It helps establish the Nigerian tax base for the non-resident company.',
  'Do not include worldwide revenue that is unrelated to Nigeria.'
 );
 if(/global statutory profit margin/.test(lower))return d(
  'This is the statutory or verified profit margin used to estimate Nigerian taxable profit from revenue where that method applies.',
  'Enter the permitted percentage margin.',
  'NTaxer applies the percentage to the relevant revenue base to estimate taxable profit.',
  'Do not substitute the company’s accounting gross margin unless it is the required statutory margin.'
 );

 if(/verified taxable base/.test(lower))return d(
  'This is the amount to which the selected tax or levy rate will be applied.',
  'Enter a base that you have already verified against the legal source for that assessment.',
  'NTaxer multiplies this base by the percentage rate and then adds any fixed charge where applicable.',
  'Do not use a convenient accounting figure unless it is the legally correct base.'
 );
 if(/verified percentage rate/.test(lower))return d(
  'This is the legally verified percentage rate for the selected assessment.',
  'Enter the percentage exactly as supported by the applicable legal source.',
  'The rate is applied directly to the taxable base.',
  'Do not infer a rate from another tax or from a previous year.'
 );
 if(/verified fixed charge/.test(lower))return d(
  'This is a fixed naira amount that applies in addition to, or instead of, a percentage-based charge.',
  'Enter the verified fixed amount required by the assessment.',
  'It is added to the percentage-based amount where the calculator calls for both.',
  'Do not enter penalties or interest here unless they are part of the verified fixed charge.'
 );

 if(/number of/.test(lower))return d(
  'This field tells NTaxer how many identical items or transactions the calculation represents.',
  'Enter the count of items that share the same amount and tax treatment.',
  'The calculator uses the count to scale the per-item result.',
  'Do not group items together if their values or tax treatment differ.'
 );
 if(/percentage|rate/.test(lower)&&f.type==='number')return d(
  'This field is a percentage or rate used in the calculation.',
  'Enter the percentage as a normal number, for example 7.5 for 7.5%.',
  'The rate changes how much of the base is taxed, credited, recovered or otherwise adjusted.',
  'Make sure you are using the rate for the correct tax, period and taxpayer.'
 );
 if(f.type==='boolean')return d(
  'This is a yes/no condition that can change how '+calcName+' treats your case.',
  'Turn it on only when the condition is actually true and, where necessary, has been verified.',
  'A checked condition can activate an exemption, eligibility rule, special treatment or different calculation path.',
  'If you are uncertain, leave it off and review the calculator assumptions or legal references before relying on the result.'
 );
 if(f.type==='select')return d(
  'This choice tells NTaxer which rule or treatment applies to '+label+'.',
  'Select the option that best matches the real transaction, taxpayer or situation.',
  'The selected option can change the rate, exemption, calculation method or scope used by '+calcName+'.',
  'Choose based on the legal and factual situation, not simply the option that gives the lowest result.'
 );
 if(f.type==='money')return d(
  'This is the naira amount for '+label+' that '+calcName+' needs as an input.',
  'Enter the amount that belongs specifically in this field and period. Use 0 when it genuinely does not apply.',
  'NTaxer uses the figure to build the tax base, deduction, relief, credit or transaction value for the calculation.',
  'Avoid double-counting an amount that is already included in another field.'
 );
 if(f.type==='number')return d(
  'This is a numeric input that controls part of '+calcName+'.',
  'Enter the value that applies to your situation, within any minimum or maximum shown by the field.',
  'NTaxer uses it to scale, limit or classify the calculation.',
  'Check the unit carefully: a number of days, months, items or a percentage can produce very different results.'
 );
 return generic;
}

function fieldHelpButton(f,calculator,id){
 const help=fieldHelpDetails(f,calculator);
 return '<span class="field-help-wrap"><button class="field-help-trigger" type="button" data-help-title="'+escape(f.label)+'" data-help-meaning="'+escape(help.meaning)+'" data-help-enter="'+escape(help.enter)+'" data-help-why="'+escape(help.why)+'" data-help-watch="'+escape(help.watch)+'" aria-label="More information about '+escape(f.label)+'" aria-expanded="false" aria-controls="field-help-popover"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 10.8v5.4"></path><circle cx="12" cy="7.4" r=".9" fill="currentColor" stroke="none"></circle></svg></button></span>';
}

function positionFieldHelp(trigger){
 const rect=trigger.getBoundingClientRect();
 const popRect=fieldHelpPopover.getBoundingClientRect();
 const gap=8;
 let left=rect.left+(rect.width/2)-(popRect.width/2);
 left=Math.max(12,Math.min(left,window.innerWidth-popRect.width-12));
 let top=rect.bottom+gap;
 if(top+popRect.height>window.innerHeight-12&&rect.top-popRect.height-gap>12)top=rect.top-popRect.height-gap;
 fieldHelpPopover.style.left=Math.round(left)+'px';
 fieldHelpPopover.style.top=Math.round(top)+'px';
}

function showFieldHelp(trigger,{pin=false}={}){
 if(!trigger)return;
 if(activeFieldHelpTrigger&&activeFieldHelpTrigger!==trigger)activeFieldHelpTrigger.setAttribute('aria-expanded','false');
 activeFieldHelpTrigger=trigger;
 if(pin)pinnedFieldHelpTrigger=trigger;
 const title=trigger.dataset.helpTitle||'Field help';
 const meaning=trigger.dataset.helpMeaning||'';
 const enter=trigger.dataset.helpEnter||'';
 const why=trigger.dataset.helpWhy||'';
 const watch=trigger.dataset.helpWatch||'';
 fieldHelpPopover.innerHTML='<div class="field-help-title">'+escape(title)+'</div>'
  +'<div class="field-help-section"><strong>What it means</strong><span>'+escape(meaning)+'</span></div>'
  +'<div class="field-help-section"><strong>What to enter</strong><span>'+escape(enter)+'</span></div>'
  +'<div class="field-help-section"><strong>Why it matters</strong><span>'+escape(why)+'</span></div>'
  +'<div class="field-help-section field-help-watch"><strong>Watch out</strong><span>'+escape(watch)+'</span></div>';
 fieldHelpPopover.classList.add('is-visible');
 fieldHelpPopover.setAttribute('aria-hidden','false');
 trigger.setAttribute('aria-expanded','true');
 requestAnimationFrame(()=>positionFieldHelp(trigger));
}

function hideFieldHelp({force=false}={}){
 if(pinnedFieldHelpTrigger&&!force)return;
 if(activeFieldHelpTrigger)activeFieldHelpTrigger.setAttribute('aria-expanded','false');
 activeFieldHelpTrigger=null;
 if(force)pinnedFieldHelpTrigger=null;
 fieldHelpPopover.classList.remove('is-visible');
 fieldHelpPopover.setAttribute('aria-hidden','true');
}

document.addEventListener('click',event=>{
 const trigger=event.target.closest('.field-help-trigger');
 if(trigger){
  event.preventDefault();
  event.stopPropagation();
  if(pinnedFieldHelpTrigger===trigger){
   hideFieldHelp({force:true});
  }else{
   if(pinnedFieldHelpTrigger&&pinnedFieldHelpTrigger!==trigger)hideFieldHelp({force:true});
   showFieldHelp(trigger,{pin:true});
  }
  return;
 }
 if(pinnedFieldHelpTrigger)hideFieldHelp({force:true});
});

document.addEventListener('mouseover',event=>{
 if(!window.matchMedia('(hover:hover) and (pointer:fine)').matches)return;
 const trigger=event.target.closest('.field-help-trigger');
 if(!trigger||pinnedFieldHelpTrigger)return;
 showFieldHelp(trigger);
});

document.addEventListener('mouseout',event=>{
 if(!window.matchMedia('(hover:hover) and (pointer:fine)').matches)return;
 const trigger=event.target.closest('.field-help-trigger');
 if(!trigger||pinnedFieldHelpTrigger)return;
 if(trigger.contains(event.relatedTarget))return;
 hideFieldHelp();
});

document.addEventListener('focusin',event=>{
 const trigger=event.target.closest('.field-help-trigger');
 if(trigger&&!pinnedFieldHelpTrigger)showFieldHelp(trigger);
});

document.addEventListener('focusout',event=>{
 const trigger=event.target.closest('.field-help-trigger');
 if(trigger&&!pinnedFieldHelpTrigger)hideFieldHelp();
});

document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&(activeFieldHelpTrigger||pinnedFieldHelpTrigger)){
  hideFieldHelp({force:true});
  activeFieldHelpTrigger?.focus?.();
 }
});

window.addEventListener('resize',()=>{if(activeFieldHelpTrigger&&fieldHelpPopover.classList.contains('is-visible'))positionFieldHelp(activeFieldHelpTrigger);});
window.addEventListener('scroll',()=>{if(activeFieldHelpTrigger&&fieldHelpPopover.classList.contains('is-visible'))positionFieldHelp(activeFieldHelpTrigger);},{passive:true});

function inputHtml(f,values,calculator){
 if(f.type==='divider')return `<div class="field-divider">${escape(f.label)}</div>`;
 const id='field-'+f.key,value=values[f.key],help=fieldHelpButton(f,calculator,id);
 if(f.type==='boolean')return `<div class="checkfield"><input id="${id}" name="${f.key}" type="checkbox" ${value===true?'checked':''}><div class="checkfield-copy"><div class="field-label-row"><label for="${id}">${escape(f.label)}</label>${help}</div>${f.hint?`<small>${escape(f.hint)}</small>`:''}</div></div>`;
 const common=`id="${id}" name="${f.key}" aria-describedby="${id}-hint ${id}-error"`;
 return `<div class="field"><div class="field-label-row"><label for="${id}">${escape(f.label)}</label>${help}</div>${f.type==='select'?`<select ${common}>${f.options.map(([v,label])=>`<option value="${escape(v)}" ${String(value)===String(v)?'selected':''}>${escape(label)}</option>`).join('')}</select>`:`<span class="input-wrap">${f.type==='money'?'<span class="prefix" aria-hidden="true">₦</span>':''}<input ${common} type="text" inputmode="decimal" autocomplete="off" value="${escape(value)}" ${f.type==='number'?`data-min="${f.min}" data-max="${f.max}"`:''}></span>`}<span class="hint" id="${id}-hint">${escape(f.hint)}</span><span class="error" id="${id}-error"></span></div>`;
}

function calcView(id){
 const c=CALCULATORS.find(c=>c.id===id)||CALCULATORS[0];state.current=c.id;state.tab='calculation';
 $('#main').innerHTML=`<div class="page-header sticky-page-heading"><p class="eyebrow">${escape(c.group)} / 2026 tax year</p><div class="heading-row"><h1>${escape(c.name)}</h1><a class="calculator-import-button" href="#import/${c.id}" aria-label="Upload statement for ${escape(c.name)}" title="Upload statement"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg><span>Upload statement</span></a></div></div><div class="intro page-subtext"><p class="lead">${escape(c.description)}</p></div>
 <aside id="sticky-estimate" class="sticky-estimate" aria-live="polite" aria-atomic="true"></aside>
 <div class="workspace"><section class="panel"><div class="panel-head"><h2>Your details</h2></div><form id="tax-form" novalidate><div class="fields">${c.fields.map(f=>inputHtml(f,state.inputs[c.id],c)).join('')}</div><div class="form-actions"><span>Results update as you type</span><button type="button" id="reset" class="text-button">Clear values ↺</button></div></form></section><div class="result-column" tabindex="0" role="region" aria-label="Tax estimate and breakdown"><section id="result" aria-live="polite" aria-atomic="true"></section><div id="breakdown" class="panel breakdown"></div><p class="info-note">Calculated from your inputs. Check assumptions and legal scope before using an estimate.</p></div></div>
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
 $('#result').innerHTML=`<div class="result-card"><div class="result-heading">${escape(r.title||'Estimated amount')}</div><div class="${available?'result-total':'status-placeholder'}">${available?format(r.amount,currency):'Review needed'}</div><div class="result-sub">${available?(r.currency==='USD'?'All results below are in US dollars':'Nigerian naira · rounded to the nearest kobo'):'Read the conditions below to continue.'}</div>${available?`<div class="result-metrics"><div><small>${escape(metric1[0])}</small><strong>${format(metric1[1],currency)}</strong></div><div><small>${escape(metric2[0])}</small><strong>${format(metric2[1],currency)}</strong></div></div>`:''}${r.bands&&available?`<div class="result-bar" role="img" aria-label="Income tax ${r.base?(r.amount/r.base*100).toFixed(2):0}% of total income"><progress class="tax-progress" value="${Math.min(1,r.base?r.amount/r.base:0)}" max="1"></progress></div><div class="bar-labels"><span>Income tax</span><span>Income before other deductions</span></div>`:''}<div class="result-actions"><button class="button primary export-button" id="download-pdf" ${!available?'disabled':''}><span>Download PDF</span></button><button class="button export-button" id="download-excel" ${!available?'disabled':''}><span>Download Excel</span></button></div></div>`;
 const runExport=(button,download)=>{
  const originalLabel=button.textContent;
  button.addEventListener('click',()=>{
   try{
    button.disabled=true;button.textContent='Preparing…';
    download(buildExportReport(c,r),`NTaxer-${c.id}-${new Date().toISOString().slice(0,10)}`);
    button.textContent='Downloaded';
   }catch(error){
    console.error('Export failed',error);
    button.textContent='Try again';
    button.setAttribute('aria-label',`${originalLabel} failed. Try again.`);
   }finally{
    setTimeout(()=>{button.disabled=false;button.textContent=originalLabel;button.removeAttribute('aria-label');},1400);
   }
  });
 };
 runExport($('#download-pdf'),downloadPdf);
 runExport($('#download-excel'),downloadExcel);
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
 <section class="detail-card detail-area"><h2>Your information and records</h2><p>Calculations run in your browser. Entered figures stay in page memory and reset when you reload. No account or financial-data upload is required.</p><p>Use <strong>Download PDF</strong> for a structured, paginated report or <strong>Download Excel</strong> for the same report in a formatted workbook. Both include your inputs, result, calculation breakdown, assumptions, scope and legal references.</p><p>${link('https://github.com/Oshione2002/NTaxer','View the calculation code')}</p></section>`;
}
function importView(sourceCalculator=''){
 const source=CALCULATORS.find(c=>c.id===sourceCalculator);
 $('#main').innerHTML=`<div class="page-header sticky-page-heading"><p class="eyebrow">Statement import</p><h1>Import Statement</h1></div>
 <div class="intro page-subtext"><p class="lead">Bring a bank statement, financial statement, Excel file or CSV into NTaxer, review the extracted rows and decide exactly which calculator fields they should populate.</p></div>

 <section class="statement-upload-card" aria-labelledby="statement-upload-title">
  <div class="statement-upload-heading">
   <div><p class="eyebrow">Start here</p><h2 id="statement-upload-title">Upload your statements</h2></div>
   ${source?`<span class="statement-source-calculator">For: ${escape(source.name)}</span>`:''}
  </div>
  <p class="statement-upload-copy">Choose one or more supported files. Nothing is added to a calculator until you review and confirm the extracted information.</p>
  <div id="statement-dropzone" class="statement-dropzone">
   <input id="statement-file" class="statement-file-input" type="file" multiple accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
   <svg class="statement-upload-icon" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>
   <strong>Drop your statements here</strong>
   <span>or</span>
   <button id="statement-browse" class="button primary" type="button">Choose statements</button>
   <small>PDF, Excel (.xlsx / .xls) or CSV</small>
  </div>
  <div id="statement-file-status" class="statement-file-status" aria-live="polite" hidden></div>
 </section>

 <section id="statement-next-step" class="statement-next-step" hidden aria-labelledby="statement-next-title">
  <div class="statement-next-heading">
   <div><p class="eyebrow">Next step</p><h2 id="statement-next-title">Ready to analyse</h2></div>
   <button id="statement-back-to-files" class="text-button" type="button">← Back to files</button>
  </div>
  <p>Your selected statements are ready for the extraction and mapping stage.</p>
  <div id="statement-next-summary" class="statement-next-summary"></div>
  <p class="notice neutral">NTaxer will use this next stage to extract the rows, suggest relevant calculators and let you review every mapping before anything reaches a calculator.</p>
  <div class="statement-analysis-actions">
   <button id="statement-analyse" class="button primary" type="button">Analyse statements</button>
  </div>
  <div id="statement-analysis-progress" class="statement-analysis-progress" aria-live="polite" hidden></div>
 </section>

 <section id="statement-review" class="statement-review" hidden aria-labelledby="statement-review-title">
  <div class="statement-review-heading">
   <div><p class="eyebrow">Review extraction</p><h2 id="statement-review-title">Review and map statement rows</h2></div>
   <button id="statement-review-back" class="text-button" type="button">← Back</button>
  </div>
  <p class="statement-review-copy">NTaxer AI suggestions are only starting points. Change any mapping, or use × to exclude a row from calculation. Excluded rows stay visible and can be restored with +.${source?` Because this import started from ${escape(source.name)}, the mapping dropdown is limited to that calculator’s amount fields.`:'' }</p>
  <div id="statement-document-summary" class="statement-document-summary"></div>
  <div class="statement-review-table-wrap">
   <table class="statement-review-table">
    <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Type</th><th>Map to NTaxer field</th><th>Use</th></tr></thead>
    <tbody id="statement-review-body"></tbody>
   </table>
  </div>
  <div class="statement-review-actions">
   <button id="statement-review-continue" class="button primary" type="button">Continue</button>
  </div>
 </section>

 <section id="statement-calculator-step" class="statement-review" hidden aria-labelledby="statement-calculator-title">
  <div class="statement-review-heading">
   <div><p class="eyebrow">Calculator selection</p><h2 id="statement-calculator-title">Choose calculators</h2></div>
   <button id="statement-calculator-back" class="text-button" type="button">← Back</button>
  </div>
  <p class="statement-review-copy">Start with calculators suggested by the reviewed mappings, or choose from all NTaxer calculators.</p>
  <div id="statement-suggested-calculators"></div>
  <details class="statement-all-calculators">
   <summary>All calculators</summary>
   <div id="statement-all-calculator-list"></div>
  </details>
  <div class="statement-review-actions">
   <button id="statement-calculator-continue" class="button primary" type="button">Continue to mapped totals</button>
  </div>
 </section>

 <section id="statement-totals-step" class="statement-review" hidden aria-labelledby="statement-totals-title">
  <div class="statement-review-heading">
   <div><p class="eyebrow">Final review</p><h2 id="statement-totals-title">Mapped totals</h2></div>
   <button id="statement-totals-back" class="text-button" type="button">← Back</button>
  </div>
  <p class="statement-review-copy">Check exactly what NTaxer will put into each selected calculator field.</p>
  <div id="statement-mapped-totals" class="statement-mapped-totals"></div>
  <div class="statement-review-actions">
   <button id="statement-apply" class="button primary" type="button">Apply to calculators</button>
  </div>
 </section>

 <section class="detail-card detail-area">
  <h2>How statement import will work</h2>
  <ol>
   <li><strong>Upload a supported statement.</strong> NTaxer will read PDF, Excel and CSV files.</li>
   <li><strong>Review every extracted row.</strong> Nothing is silently discarded; rows can be excluded and restored.</li>
   <li><strong>Choose calculators and fields.</strong> Use NTaxer AI suggestions or browse every calculator and field yourself.</li>
   <li><strong>Confirm mapped totals.</strong> See exactly what will be added to each calculator before applying anything.</li>
   <li><strong>Calculate with NTaxer.</strong> Confirmed values feed the existing deterministic calculator engine.</li>
  </ol>
 </section>
 <section class="detail-card detail-area">
  <h2>Supported statement types</h2>
  <p>Bank statements, financial statements, transaction exports and similar records in PDF, Excel or CSV format will use this workspace.</p>
  <p class="notice neutral">The import workflow will keep extracted information reviewable before any amount is applied to a tax calculation.</p>
 </section>`;

 const fileInput=$('#statement-file');
 const browseButton=$('#statement-browse');
 const dropzone=$('#statement-dropzone');
 const status=$('#statement-file-status');
 const supportedExtensions=['pdf','csv','xls','xlsx'];
 let selectedFiles=[];
 const preparation=new Map();
 let unsupportedCount=0;

 const formatBytes=bytes=>{
  if(bytes<1024)return bytes+' B';
  if(bytes<1024*1024)return (bytes/1024).toFixed(1)+' KB';
  return (bytes/(1024*1024)).toFixed(1)+' MB';
 };
 const fileKey=file=>[file.name,file.size,file.lastModified].join('::');
 const fileExtension=file=>(file.name.split('.').pop()||'').toLowerCase();

 const overallPreparation=()=>{
  if(!selectedFiles.length)return {percent:0,ready:false,error:false};
  let loaded=0,total=0,error=false;
  for(const file of selectedFiles){
   const state=preparation.get(fileKey(file))||{loaded:0,total:file.size||1,status:'pending'};
   const size=file.size||1;
   total+=size;
   loaded+=Math.min(state.loaded||0,size);
   if(state.status==='error')error=true;
  }
  const percent=total?Math.round((loaded/total)*100):100;
  return {percent:Math.min(100,percent),ready:percent>=100&&!error,error};
 };

 const renderSelectedFiles=()=>{
  dropzone.classList.toggle('has-file',selectedFiles.length>0);
  if(!selectedFiles.length){
   status.hidden=true;
   status.className='statement-file-status';
   status.innerHTML='';
   return;
  }
  const totalSize=selectedFiles.reduce((sum,file)=>sum+file.size,0);
  const progress=overallPreparation();
  status.hidden=false;
  status.className='statement-file-status selected multiple';
  status.innerHTML=`
   ${unsupportedCount?'<div class="statement-file-warning">'+unsupportedCount+' unsupported '+(unsupportedCount===1?'file was':'files were')+' skipped. Use PDF, Excel or CSV.</div>':''}
   <div class="statement-file-summary">
    <div><strong>${selectedFiles.length} ${selectedFiles.length===1?'statement':'statements'} selected</strong><small>${formatBytes(totalSize)} total</small></div>
    <button id="statement-clear-all" class="text-button" type="button">Clear all</button>
   </div>
   <div class="statement-upload-progress" aria-live="polite">
    <div class="statement-progress-copy">
     <span>${progress.error?'A file could not be prepared':progress.ready?'Files ready':'Preparing files'}</span>
     <strong>${progress.percent}%</strong>
    </div>
    <div class="statement-progress-track" role="progressbar" aria-label="Statement preparation progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}">
     <span style="width:${progress.percent}%"></span>
    </div>
   </div>
   <div class="statement-file-list">
    ${selectedFiles.map((file,index)=>{
      const extension=fileExtension(file);
      const state=preparation.get(fileKey(file))||{loaded:0,total:file.size||1,status:'pending'};
      const filePercent=Math.min(100,Math.round(((state.loaded||0)/(file.size||1))*100));
      const stateLabel=state.status==='error'?'Error':state.status==='ready'?'Ready':filePercent+'%';
      return `<div class="statement-file-row">
       <div class="statement-file-info">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
        <span><strong>${escape(file.name)}</strong><small>${escape(extension.toUpperCase())} · ${formatBytes(file.size)} · ${stateLabel}</small></span>
       </div>
       <button class="statement-remove-file" type="button" data-file-index="${index}" aria-label="Remove ${escape(file.name)}" title="Remove file">×</button>
      </div>`;
    }).join('')}
   </div>
   <div class="statement-file-actions">
    <button id="statement-continue" class="button primary statement-continue" type="button" ${progress.ready?'':'disabled'}>${progress.ready?'Continue':'Preparing…'}</button>
   </div>`;
 };

 const prepareFile=file=>{
  const key=fileKey(file);
  preparation.set(key,{loaded:0,total:file.size||1,status:'preparing'});
  const reader=new FileReader();
  reader.onprogress=event=>{
   const state=preparation.get(key);
   if(!state)return;
   state.loaded=event.lengthComputable?event.loaded:Math.min(file.size||1,(state.loaded||0)+Math.max(1,Math.round((file.size||1)*0.08)));
   state.total=event.lengthComputable?event.total:(file.size||1);
   renderSelectedFiles();
  };
  reader.onload=()=>{
   preparation.set(key,{loaded:file.size||1,total:file.size||1,status:'ready'});
   renderSelectedFiles();
  };
  reader.onerror=()=>{
   preparation.set(key,{loaded:0,total:file.size||1,status:'error'});
   renderSelectedFiles();
  };
  reader.onabort=()=>{
   preparation.set(key,{loaded:0,total:file.size||1,status:'error'});
   renderSelectedFiles();
  };
  reader.readAsArrayBuffer(file);
 };

 const addFiles=files=>{
  const incoming=[...files];
  if(!incoming.length)return;
  const invalid=incoming.filter(file=>!supportedExtensions.includes(fileExtension(file)));
  const valid=incoming.filter(file=>supportedExtensions.includes(fileExtension(file)));
  unsupportedCount=invalid.length;
  const existingKeys=new Set(selectedFiles.map(fileKey));
  const added=[];
  for(const file of valid){
   const key=fileKey(file);
   if(!existingKeys.has(key)){
    selectedFiles.push(file);
    existingKeys.add(key);
    added.push(file);
   }
  }
  renderSelectedFiles();
  for(const file of added)prepareFile(file);
 };

 status.addEventListener('click',event=>{
  const remove=event.target.closest('.statement-remove-file');
  if(remove){
   const index=Number(remove.dataset.fileIndex);
   const file=selectedFiles[index];
   if(file)preparation.delete(fileKey(file));
   selectedFiles.splice(index,1);
   renderSelectedFiles();
   return;
  }
  if(event.target.closest('#statement-clear-all')){
   selectedFiles=[];
   preparation.clear();
   unsupportedCount=0;
   renderSelectedFiles();
   return;
  }
  if(event.target.closest('#statement-continue')){
   const progress=overallPreparation();
   if(!progress.ready)return;
   const uploadCard=document.querySelector('.statement-upload-card');
   const nextStep=$('#statement-next-step');
   const summary=$('#statement-next-summary');
   summary.innerHTML=`<strong>${selectedFiles.length} ${selectedFiles.length===1?'statement':'statements'} ready</strong><span>${selectedFiles.map(file=>escape(file.name)).join(' · ')}</span>${source?`<small>Starting calculator: ${escape(source.name)}</small>`:''}`;
   uploadCard.hidden=true;
   nextStep.hidden=false;
   nextStep.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
 });

 $('#statement-back-to-files').addEventListener('click',()=>{
  const uploadCard=document.querySelector('.statement-upload-card');
  const nextStep=$('#statement-next-step');
  nextStep.hidden=true;
  uploadCard.hidden=false;
  uploadCard.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 });

 const analysisButton=$('#statement-analyse');
 const analysisProgress=$('#statement-analysis-progress');
 const reviewSection=$('#statement-review');
 const reviewBody=$('#statement-review-body');
 const reviewSummary=$('#statement-document-summary');
 let analysedRows=[];
 const statementCalculators=source?[source]:CALCULATORS;
 const registryForStatement=statementCalculators.map(calc=>({
  id:calc.id,
  name:calc.name,
  group:calc.group,
  fields:calc.fields.filter(field=>field.key&&field.type==='money').map(field=>({key:field.key,label:field.label}))
 }));

 const fileToBase64=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>{
   const value=String(reader.result||'');
   resolve(value.includes(',')?value.split(',')[1]:value);
  };
  reader.onerror=()=>reject(reader.error||new Error('Could not read file'));
  reader.readAsDataURL(file);
 });

 const mappingOptions=(calculatorId='',fieldKey='')=>{
  const allowedCalculators=source?[source]:CALCULATORS;
  const availableValues=new Set();
  for(const calc of allowedCalculators){
   for(const field of calc.fields.filter(field=>field.key&&field.type==='money')){
    availableValues.add(calc.id+'::'+field.key);
   }
  }
  const requestedValue=calculatorId&&fieldKey?calculatorId+'::'+fieldKey:'';
  const selectedValue=availableValues.has(requestedValue)?requestedValue:'';
  let html='<option value=""'+(!selectedValue?' selected':'')+'>Unmapped / review</option><option value="__exclude__">Ignore / Exclude</option>';
  for(const calc of allowedCalculators){
   const fields=calc.fields.filter(field=>field.key&&field.type==='money');
   if(!fields.length)continue;
   html+='<optgroup label="'+escape(calc.name)+'">';
   for(const field of fields){
    const value=calc.id+'::'+field.key;
    html+='<option value="'+escape(value)+'"'+(value===selectedValue?' selected':'')+'>'+escape(field.label)+'</option>';
   }
   html+='</optgroup>';
  }
  return html;
 };

 const formatStatementAmount=(amount,direction)=>{
  const number=Math.abs(Number(amount)||0);
  const sign=direction==='credit'?'+':direction==='debit'?'−':'';
  return sign+'₦'+new Intl.NumberFormat('en-NG',{maximumFractionDigits:2}).format(number);
 };

 const renderStatementReview=data=>{
  const documents=Array.isArray(data.documents)?data.documents:[];
  const allRows=[];
  reviewSummary.innerHTML=documents.map(doc=>{
   const rowCount=Array.isArray(doc.rows)?doc.rows.length:0;
   const warning=(Array.isArray(doc.warnings)&&doc.warnings.length)?'<small>'+doc.warnings.map(item=>escape(item)).join(' · ')+'</small>':'';
   return '<div class="statement-document-card '+(doc.ok?'':'error')+'"><strong>'+escape(doc.name||'Statement')+'</strong><span>'+(doc.ok?(rowCount+' extracted rows'+(doc.documentType?' · '+escape(doc.documentType):'')):'Could not analyse')+'</span>'+warning+'</div>';
  }).join('');
  for(const doc of documents){
   for(const row of (Array.isArray(doc.rows)?doc.rows:[]))allRows.push({...row,source:doc.name||'Statement'});
  }
  analysedRows=allRows;
  reviewBody.innerHTML=allRows.map((row,index)=>`
   <tr data-statement-row data-row-index="${index}" data-excluded="false">
    <td>${escape(row.date||'—')}</td>
    <td><strong>${escape(row.description||'Untitled row')}</strong><small>${escape(row.source||'')}</small>${row.normalizedCategory?'<small class="statement-row-classification">'+escape(row.relevance==='auto_map'?'Relevant · '+row.normalizedCategory:'Needs review · '+row.normalizedCategory)+'</small>':''}${row.reason?'<em>'+escape(row.reason)+'</em>':''}</td>
    <td class="statement-amount">${formatStatementAmount(row.amount,row.direction)}</td>
    <td><span class="statement-type-badge">${escape(row.direction||'neutral')}</span></td>
    <td><select class="statement-map-select" aria-label="Map ${escape(row.description||'statement row')} to NTaxer field">${mappingOptions(row.suggestedCalculatorId,row.suggestedFieldKey)}</select><small class="statement-confidence">${escape(row.relevance==='auto_map'?'Relevant · '+(row.confidence||'low')+' confidence':'Needs review · '+(row.confidence||'low')+' confidence')}</small></td>
    <td><button class="statement-row-toggle" type="button" aria-label="Exclude ${escape(row.description||'row')}" title="Exclude from calculation">×</button></td>
   </tr>`).join('');
  if(!allRows.length){
   reviewBody.innerHTML='<tr><td colspan="6" class="statement-empty-review">No statement rows were extracted. Check the document summary above.</td></tr>';
  }
  $('#statement-next-step').hidden=true;
  reviewSection.hidden=false;
  reviewSection.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 };

 reviewBody.addEventListener('click',event=>{
  const button=event.target.closest('.statement-row-toggle');
  if(!button)return;
  const row=button.closest('[data-statement-row]');
  const excluded=row.dataset.excluded==='true';
  row.dataset.excluded=String(!excluded);
  row.classList.toggle('excluded',!excluded);
  button.textContent=!excluded?'+':'×';
  button.title=!excluded?'Add back to calculation':'Exclude from calculation';
  button.setAttribute('aria-label',!excluded?'Add row back to calculation':'Exclude row from calculation');
  const select=row.querySelector('.statement-map-select');
  if(select)select.disabled=!excluded;
 });

 reviewBody.addEventListener('change',event=>{
  const select=event.target.closest('.statement-map-select');
  if(!select)return;
  const row=select.closest('[data-statement-row]');
  if(select.value==='__exclude__'){
   row.dataset.excluded='true';
   row.classList.add('excluded');
   row.querySelector('.statement-row-toggle').textContent='+';
   select.disabled=true;
  }
 });

 $('#statement-review-back').addEventListener('click',()=>{
  reviewSection.hidden=true;
  $('#statement-next-step').hidden=false;
  $('#statement-next-step').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 });

 const calculatorStep=$('#statement-calculator-step');
 const totalsStep=$('#statement-totals-step');
 const suggestedCalculatorBox=$('#statement-suggested-calculators');
 const allCalculatorBox=$('#statement-all-calculator-list');
 const totalsBox=$('#statement-mapped-totals');

 const activeStatementMappings=()=>{
  const mappings=[];
  reviewBody.querySelectorAll('[data-statement-row]').forEach(rowEl=>{
   if(rowEl.dataset.excluded==='true')return;
   const select=rowEl.querySelector('.statement-map-select');
   const value=select?.value||'';
   if(!value||value==='__exclude__'||!value.includes('::'))return;
   const [calculatorId,fieldKey]=value.split('::');
   const sourceRow=analysedRows[Number(rowEl.dataset.rowIndex)];
   if(!sourceRow)return;
   mappings.push({calculatorId,fieldKey,row:sourceRow});
  });
  return mappings;
 };

 const selectedCalculatorIds=()=>new Set(
  [...calculatorStep.querySelectorAll('input[data-statement-calculator]:checked')].map(input=>input.value)
 );

 const calculatorChoice=(calc,checked=false,suggested=false)=>`
  <label class="statement-calculator-choice">
   <input type="checkbox" data-statement-calculator value="${escape(calc.id)}" ${checked?'checked':''}>
   <span><strong>${escape(calc.name)}</strong><small>${escape(calc.group)}${suggested?' · Suggested':''}</small></span>
  </label>`;

 const renderCalculatorStep=()=>{
  const mappedIds=new Set(activeStatementMappings().map(item=>item.calculatorId));
  if(source?.id)mappedIds.add(source.id);
  const suggested=CALCULATORS.filter(calc=>mappedIds.has(calc.id));
  suggestedCalculatorBox.innerHTML=`<h3>Suggested for this statement</h3><div class="statement-calculator-grid">${suggested.length?suggested.map(calc=>calculatorChoice(calc,true,true)).join(''):'<p class="statement-empty-choice">No calculator could be suggested confidently. Choose from all calculators below.</p>'}</div>`;

  const groups=new Map();
  for(const calc of CALCULATORS){
   if(!groups.has(calc.group))groups.set(calc.group,[]);
   groups.get(calc.group).push(calc);
  }
  allCalculatorBox.innerHTML=[...groups].map(([group,calcs])=>`<div class="statement-calculator-group"><h4>${escape(group)}</h4><div class="statement-calculator-grid">${calcs.map(calc=>calculatorChoice(calc,mappedIds.has(calc.id),false)).join('')}</div></div>`).join('');

  calculatorStep.querySelectorAll('input[data-statement-calculator]').forEach(input=>{
   input.addEventListener('change',()=>{
    calculatorStep.querySelectorAll('input[data-statement-calculator]').forEach(other=>{
     if(other!==input&&other.value===input.value)other.checked=input.checked;
    });
   });
  });

  reviewSection.hidden=true;
  calculatorStep.hidden=false;
  calculatorStep.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 };

 const buildMappedTotals=()=>{
  const selected=selectedCalculatorIds();
  const totals=new Map();
  let unmapped=0,excluded=0;
  reviewBody.querySelectorAll('[data-statement-row]').forEach(rowEl=>{
   if(rowEl.dataset.excluded==='true'){excluded+=1;return;}
   const select=rowEl.querySelector('.statement-map-select');
   const value=select?.value||'';
   if(!value||value==='__exclude__'||!value.includes('::')){unmapped+=1;return;}
   const [calculatorId,fieldKey]=value.split('::');
   if(!selected.has(calculatorId))return;
   const sourceRow=analysedRows[Number(rowEl.dataset.rowIndex)];
   if(!sourceRow)return;
   const key=calculatorId+'::'+fieldKey;
   const current=totals.get(key)||{calculatorId,fieldKey,total:0,count:0};
   current.total+=Math.abs(Number(sourceRow.amount)||0);
   current.count+=1;
   totals.set(key,current);
  });
  return {totals:[...totals.values()],unmapped,excluded,selected};
 };

 const renderTotalsStep=()=>{
  const result=buildMappedTotals();
  if(!result.selected.size){
   totalsBox.innerHTML='<p class="notice">Choose at least one calculator before continuing.</p>';
   return false;
  }
  const groups=new Map();
  for(const item of result.totals){
   if(!groups.has(item.calculatorId))groups.set(item.calculatorId,[]);
   groups.get(item.calculatorId).push(item);
  }
  const cards=[...groups].map(([calculatorId,items])=>{
   const calc=CALCULATORS.find(item=>item.id===calculatorId);
   return `<section class="statement-total-card"><h3>${escape(calc?.name||calculatorId)}</h3><div class="statement-total-rows">${items.map(item=>{
    const field=calc?.fields.find(field=>field.key===item.fieldKey);
    const compatible=field&&['money','number'].includes(field.type);
    return `<div class="statement-total-row"><span><strong>${escape(field?.label||item.fieldKey)}</strong><small>${item.count} mapped ${item.count===1?'row':'rows'}${compatible?'':' · manual review required'}</small></span><b>₦${new Intl.NumberFormat('en-NG',{maximumFractionDigits:2}).format(item.total)}</b></div>`;
   }).join('')}</div></section>`;
  }).join('');
  totalsBox.innerHTML=(cards||'<p class="notice">No active statement rows are mapped to the selected calculators yet.</p>')+`<div class="statement-total-meta"><span>${result.unmapped} unmapped</span><span>${result.excluded} excluded</span></div>`;
  calculatorStep.hidden=true;
  totalsStep.hidden=false;
  totalsStep.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  $('#statement-apply').disabled=false;
  return true;
 };

 $('#statement-review-continue').addEventListener('click',renderCalculatorStep);

 $('#statement-calculator-back').addEventListener('click',()=>{
  calculatorStep.hidden=true;
  reviewSection.hidden=false;
  reviewSection.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 });

 $('#statement-calculator-continue').addEventListener('click',()=>{
  if(!selectedCalculatorIds().size){
   calculatorStep.querySelector('.statement-empty-choice')?.remove();
   suggestedCalculatorBox.insertAdjacentHTML('beforeend','<p class="notice">Select at least one calculator to continue.</p>');
   return;
  }
  renderTotalsStep();
 });

 $('#statement-totals-back').addEventListener('click',()=>{
  totalsStep.hidden=true;
  calculatorStep.hidden=false;
  calculatorStep.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 });

 $('#statement-apply').addEventListener('click',()=>{
  const result=buildMappedTotals();
  const selectedCalculators=[...result.selected]
   .map(id=>CALCULATORS.find(calc=>calc.id===id))
   .filter(Boolean);

  if(!selectedCalculators.length){
   totalsBox.insertAdjacentHTML('afterbegin','<p class="notice">Select at least one calculator before applying the statement.</p>');
   return;
  }

  // A statement import should never leave example/default monetary values behind.
  // Start each selected calculator from zero, then layer confirmed mapped totals on top.
  for(const calc of selectedCalculators){
   state.inputs[calc.id]=structuredClone(DEFAULTS[calc.id]);
   for(const field of calc.fields){
    if(!field.key)continue;
    if(field.type==='money'){
     state.inputs[calc.id][field.key]='0';
    }else if(field.type==='number'&&Number(field.min??0)<=0){
     state.inputs[calc.id][field.key]='0';
    }else if(field.type==='boolean'){
     state.inputs[calc.id][field.key]=false;
    }
   }
  }

  for(const item of result.totals){
   const calc=CALCULATORS.find(calc=>calc.id===item.calculatorId);
   const field=calc?.fields.find(field=>field.key===item.fieldKey);
   if(!calc||!field||!['money','number'].includes(field.type))continue;
   state.inputs[calc.id][field.key]=String(item.total);
  }

  location.hash='#calculator/'+selectedCalculators[0].id;
 });

 analysisButton.addEventListener('click',async()=>{
  if(!selectedFiles.length)return;
  analysisButton.disabled=true;
  analysisButton.textContent='Analysing…';
  analysisProgress.hidden=false;
  analysisProgress.innerHTML='<div class="statement-analysis-spinner" aria-hidden="true"></div><div><strong>Analysing statements</strong><span>NTaxer AI is extracting rows and preparing suggested calculator-field mappings.</span></div>';
  try{
   const files=[];
   for(let index=0;index<selectedFiles.length;index++){
    const file=selectedFiles[index];
    analysisProgress.querySelector('span').textContent='Preparing '+(index+1)+' of '+selectedFiles.length+': '+file.name;
    files.push({name:file.name,mimeType:file.type||'',data:await fileToBase64(file)});
   }
   analysisProgress.querySelector('span').textContent='Sending prepared statements to NTaxer AI…';
   const response=await fetch('/api/statement',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
     files,
     sourceCalculator:source?.id||'',
     calculators:registryForStatement
    })
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)throw new Error(data.error||'Statement analysis failed.');
   renderStatementReview(data);
   analysisProgress.hidden=true;
  }catch(error){
   analysisProgress.hidden=false;
   analysisProgress.classList.add('error');
   analysisProgress.innerHTML='<div><strong>Could not analyse the statements</strong><span>'+escape(error?.message||'Please try again.')+'</span></div>';
  }finally{
   analysisButton.disabled=false;
   analysisButton.textContent='Analyse statements';
  }
 });

 browseButton.addEventListener('click',()=>fileInput.click());
 fileInput.addEventListener('change',()=>{
  addFiles(fileInput.files||[]);
  fileInput.value='';
 });
 dropzone.addEventListener('dragover',event=>{event.preventDefault();dropzone.classList.add('dragging');});
 dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('dragging'));
 dropzone.addEventListener('drop',event=>{
  event.preventDefault();
  dropzone.classList.remove('dragging');
  addFiles(event.dataTransfer?.files||[]);
 });
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
 if(page==='import')importView(target);
 else if(page==='coverage')coverageView();
 else if(page==='law')lawView(target);
 else if(page==='sources')sourcesView();
 else if(page==='calculator')calcView(target||'paye');
 else homeView();
 if(page!=='calculator')setSidebarView('main',{focus:false});
 else if(sidebarToggle?.getAttribute('aria-expanded')==='true')setSidebarView('calculators',{focus:false});
 nav();
 if(page!=='law')window.scrollTo({top:0,behavior:'instant'});
}
const sidebarToggle=$('#sidebar-toggle');
const sidebarMainView=$('#sidebar-main-view');
const sidebarCalculatorView=$('#sidebar-calculator-view');
const openCalculatorsButton=$('#open-calculators');
const calculatorSidebarBack=$('#calculator-sidebar-back');
const smallSidebar=window.matchMedia('(max-width:940px)');
const sidebarStorageKey='ntaxer-sidebar-expanded';

function savedDesktopSidebarState(){
 try{return localStorage.getItem(sidebarStorageKey);}catch{return null;}
}
function setSidebarView(view,{focus=false}={}){
 const showCalculators=view==='calculators';
 sidebarMainView.hidden=showCalculators;
 sidebarMainView.inert=showCalculators;
 sidebarMainView.setAttribute('aria-hidden',String(showCalculators));
 sidebarCalculatorView.hidden=!showCalculators;
 sidebarCalculatorView.inert=!showCalculators;
 sidebarCalculatorView.setAttribute('aria-hidden',String(!showCalculators));
 openCalculatorsButton.setAttribute('aria-expanded',String(showCalculators));
 $('#tax-sidebar').classList.toggle('calculator-view-active',showCalculators);
 if(showCalculators){
  nav();
  if(focus)requestAnimationFrame(()=>$('#calculator-search').focus({preventScroll:true}));
 }else if(focus){
  requestAnimationFrame(()=>openCalculatorsButton.focus({preventScroll:true}));
 }
}
function sidebarViewForCurrentRoute(){
 const page=(location.hash||'#home').slice(1).split('/')[0];
 return page==='calculator'?'calculators':'main';
}
function setSidebarExpanded(expanded,{persist=true}={}){
 const sidebar=$('#tax-sidebar');
 // Collapsing must not forget the calculator context. When the sidebar is
 // opened again, derive the appropriate view from the active route.
 if(expanded)setSidebarView(sidebarViewForCurrentRoute(),{focus:false});
 sidebar.hidden=!expanded;
 sidebar.inert=!expanded;
 sidebar.setAttribute('aria-hidden',String(!expanded));
 $('.shell').classList.toggle('sidebar-collapsed',!expanded);
 sidebarToggle.setAttribute('aria-expanded',String(expanded));
 const label=expanded?'Collapse sidebar':'Open sidebar';
 sidebarToggle.setAttribute('aria-label',label);
 sidebarToggle.title=label;
 if(persist&&!smallSidebar.matches){
  try{localStorage.setItem(sidebarStorageKey,String(expanded));}catch{}
 }
}
openCalculatorsButton.addEventListener('click',()=>setSidebarView('calculators',{focus:true}));
calculatorSidebarBack.addEventListener('click',()=>setSidebarView('main',{focus:true}));
sidebarToggle.addEventListener('click',()=>setSidebarExpanded(sidebarToggle.getAttribute('aria-expanded')!=='true'));

setSidebarView('main',{focus:false});
const savedSidebarState=savedDesktopSidebarState();
setSidebarExpanded(smallSidebar.matches?false:savedSidebarState===null||savedSidebarState==='true',{persist:false});
requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.add('sidebar-motion-ready')));

smallSidebar.addEventListener('change',event=>{
 const saved=savedDesktopSidebarState();
 setSidebarExpanded(event.matches?false:saved===null||saved==='true',{persist:false});
});
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
 const sidebar=$('#tax-sidebar');
 if(event.key!=='Escape'||sidebar.hidden)return;
 if(!sidebarCalculatorView.hidden){
  setSidebarView('main',{focus:true});
 }else if(smallSidebar.matches){
  setSidebarExpanded(false);
  sidebarToggle.focus({preventScroll:true});
 }
});

// Keep wheel scrolling inside whichever sidebar view is active.
$('#tax-sidebar').addEventListener('wheel',event=>{
 if(event.ctrlKey||!event.deltaY)return;
 const scroller=sidebarCalculatorView.hidden?$('.sidebar-primary'):$('#calculator-nav');
 if(!scroller)return;
 const unit=event.deltaMode===1?16:event.deltaMode===2?scroller.clientHeight:1;
 scroller.scrollTop+=event.deltaY*unit;
 event.preventDefault();
},{passive:false});

$('#calculator-search').addEventListener('input',nav);
window.addEventListener('hashchange',route);
if(!location.hash)history.replaceState(null,'','#home');
route();

const scrollTopButton=$('#scroll-to-top');
const updateScrollTopButton=()=>{
 const visible=window.scrollY>=300;
 scrollTopButton.hidden=!visible;
 document.body.classList.toggle('scroll-top-visible',visible);
};
window.addEventListener('scroll',updateScrollTopButton,{passive:true});
scrollTopButton.addEventListener('click',()=>{
 $('#main').focus({preventScroll:true});
 window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
});
updateScrollTopButton();

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

// Install NTaxer as an app and keep the complete calculator available offline.
const installButton=$('#install-app');
const installLabel=installButton?.querySelector('strong');
const installDetail=installButton?.querySelector('small');
const installStatus=$('#install-app-status');
let deferredInstallPrompt=null;
let offlineReady=false;
const updateButton=$('#update-app');
const updateLabel=updateButton?.querySelector('strong');
const updateDetail=updateButton?.querySelector('small');
const updateStatus=$('#update-app-status');
let swRegistration=null;
let updateCheckBusy=false;
let updateReloadPending=false;
const installedMode=()=>{
 const modes=['standalone','fullscreen','minimal-ui','window-controls-overlay'];
 return modes.some(mode=>window.matchMedia('(display-mode: '+mode+')').matches)
  ||navigator.standalone===true
  ||document.referrer.startsWith('android-app://');
};
function syncAppManagementVisibility(){
 const installed=installedMode();
 document.documentElement.classList.toggle('ntaxer-installed-app',installed);
 if(installButton)installButton.hidden=installed;
 if(installStatus&&installed)installStatus.hidden=true;
 if(updateButton)updateButton.hidden=!installed;
 if(updateStatus&&!installed)updateStatus.hidden=true;
 return installed;
}
function setInstallCopy(label,detail,{disabled=false,status=''}={}){
 if(!installButton)return;
 if(label==='NTaxer installed'){
  installButton.hidden=true;
  if(installStatus)installStatus.hidden=true;
  if(updateButton)updateButton.hidden=false;
  refreshUpdateButton();
  return;
 }
 installButton.hidden=false;
 installLabel.textContent=label;
 installDetail.textContent=detail;
 installButton.disabled=disabled;
 if(status){installStatus.textContent=status;installStatus.hidden=false;}
 else{installStatus.textContent='';installStatus.hidden=true;}
}
function updateInstallButton(){
 if(syncAppManagementVisibility())return;
 setInstallCopy('Install NTaxer',offlineReady?'Available offline after installation':'Preparing offline access…');
}
function setUpdateCopy(label,detail,{disabled=false,status=''}={}){
 if(!updateButton)return;
 updateLabel.textContent=label;
 updateDetail.textContent=detail;
 updateButton.disabled=disabled;
 if(status){updateStatus.textContent=status;updateStatus.hidden=false;}
 else{updateStatus.textContent='';updateStatus.hidden=true;}
}
function refreshUpdateButton(){
 if(!syncAppManagementVisibility())return;
 if(!('serviceWorker' in navigator)){
  setUpdateCopy('Updates unavailable','This browser does not support app updates',{disabled:true});
  return;
 }
 if(!navigator.onLine){
  setUpdateCopy('Check for updates','Connect to the internet to update');
  return;
 }
 setUpdateCopy('Check for updates',swRegistration?'You are ready to check for a newer version':'Preparing update service…',{disabled:!swRegistration});
}
function watchInstallingWorker(worker){
 if(!worker)return;
 setUpdateCopy('Updating NTaxer','Downloading the latest version…',{disabled:true});
 worker.addEventListener('statechange',()=>{
  if(worker.state==='installed'&&navigator.serviceWorker.controller){
   updateReloadPending=true;
   setUpdateCopy('Update ready','Applying the latest version…',{disabled:true});
   if(swRegistration?.waiting)swRegistration.waiting.postMessage({type:'SKIP_WAITING'});
  }else if(worker.state==='redundant'){
   setUpdateCopy('Check for updates','Update could not be installed',{status:'Please try again while connected to the internet.'});
  }
 });
}
async function checkForAppUpdate({manual=false}={}){
 if(!installedMode())return;
 if(!('serviceWorker' in navigator))return;
 if(!navigator.onLine){
  setUpdateCopy('Check for updates','Connect to the internet to update',{status:manual?'NTaxer cannot download an update while you are offline.':''});
  return;
 }
 if(updateCheckBusy)return;
 try{
  updateCheckBusy=true;
  if(!swRegistration)swRegistration=await navigator.serviceWorker.ready;
  let updateFound=false;
  const onUpdateFound=()=>{
   updateFound=true;
   watchInstallingWorker(swRegistration.installing);
  };
  swRegistration.addEventListener('updatefound',onUpdateFound,{once:true});
  setUpdateCopy('Checking for updates','Looking for a newer version…',{disabled:true});
  await swRegistration.update();
  if(swRegistration.waiting){
   updateFound=true;
   updateReloadPending=true;
   setUpdateCopy('Update ready','Applying the latest version…',{disabled:true});
   swRegistration.waiting.postMessage({type:'SKIP_WAITING'});
  }
  await new Promise(resolve=>setTimeout(resolve,700));
  if(!updateFound&&!swRegistration.installing&&!swRegistration.waiting){
   swRegistration.removeEventListener('updatefound',onUpdateFound);
   setUpdateCopy('Check for updates','NTaxer is up to date',{status:manual?'You already have the latest available version.':''});
  }
 }catch(error){
  console.error('NTaxer update check failed',error);
  setUpdateCopy('Check for updates','Could not check for updates',{status:'Check your internet connection and try again.'});
 }finally{
  updateCheckBusy=false;
  if(updateButton&&updateButton.disabled&&!updateReloadPending)updateButton.disabled=false;
 }
}
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();
 deferredInstallPrompt=event;
 updateInstallButton();
});
window.addEventListener('appinstalled',()=>{
 deferredInstallPrompt=null;
 syncAppManagementVisibility();
 setInstallCopy('NTaxer installed','Ready to use offline',{disabled:true,status:'Installation complete. Launch NTaxer from your device to manage updates.'});
});
const installGuide=document.createElement('div');
installGuide.id='install-guide';
installGuide.className='install-guide';
installGuide.hidden=true;
installGuide.innerHTML='<div class="install-guide-backdrop" data-install-guide-close></div><section class="install-guide-card" role="dialog" aria-modal="true" aria-labelledby="install-guide-title"><button class="install-guide-close" type="button" aria-label="Close install instructions" data-install-guide-close>×</button><div class="install-guide-icon" aria-hidden="true">↓</div><h2 id="install-guide-title">Install NTaxer</h2><p id="install-guide-copy"></p><ol id="install-guide-steps"></ol><button id="install-guide-done" class="button primary" type="button" data-install-guide-close>Got it</button></section>';
document.body.append(installGuide);
const installGuideCopy=installGuide.querySelector('#install-guide-copy');
const installGuideSteps=installGuide.querySelector('#install-guide-steps');

function installInstructions(){
 const ua=navigator.userAgent;
 const isiOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const isAndroid=/Android/i.test(ua);
 const isMac=/Macintosh|Mac OS X/i.test(ua);
 if(isiOS)return {
  copy:'Your browser does not allow a website to open the iPhone or iPad install sheet directly. Use the browser share menu to install NTaxer.',
  steps:['Tap the Share button in your browser.','Choose Add to Home Screen.','Tap Add to install NTaxer.']
 };
 if(isAndroid)return {
  copy:'Your browser has not exposed its native install prompt yet. You can still install NTaxer from the browser menu.',
  steps:['Open the browser menu (usually ⋮).','Choose Install app or Add to Home screen.','Confirm the installation.']
 };
 if(isMac)return {
  copy:'Your browser has not exposed a native install prompt. Use its app-install option if available.',
  steps:['Open the browser menu or File menu.','Choose Install NTaxer, Install app, or Add to Dock.','Confirm the installation.']
 };
 return {
  copy:'Your browser has not exposed a native install prompt. Use its browser menu to install NTaxer if PWA installation is supported.',
  steps:['Open the browser menu.','Choose Install app, Install page as app, or Add to Home screen.','Confirm the installation.']
 };
}

function showInstallGuide(){
 const info=installInstructions();
 installGuideCopy.textContent=info.copy;
 installGuideSteps.innerHTML='';
 for(const step of info.steps){
  const li=document.createElement('li');
  li.textContent=step;
  installGuideSteps.append(li);
 }
 installGuide.hidden=false;
 document.body.classList.add('install-guide-open');
 installGuide.querySelector('.install-guide-close')?.focus();
}
function hideInstallGuide(){
 installGuide.hidden=true;
 document.body.classList.remove('install-guide-open');
 installButton?.focus({preventScroll:true});
}
installGuide.addEventListener('click',event=>{
 if(event.target.closest('[data-install-guide-close]'))hideInstallGuide();
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!installGuide.hidden)hideInstallGuide();
});

installButton?.addEventListener('click',async()=>{
 if(deferredInstallPrompt){
  const prompt=deferredInstallPrompt;
  deferredInstallPrompt=null;
  await prompt.prompt();
  const choice=await prompt.userChoice;
  if(choice.outcome==='dismissed')setInstallCopy('Install NTaxer',offlineReady?'Available offline after installation':'Preparing offline access…',{status:'Installation was cancelled. You can try again.'});
  return;
 }
 showInstallGuide();
});
updateInstallButton();
syncAppManagementVisibility();

updateButton?.addEventListener('click',()=>checkForAppUpdate({manual:true}));
window.addEventListener('online',()=>{
 refreshUpdateButton();
 if(swRegistration&&installedMode())setTimeout(()=>checkForAppUpdate(),500);
});
window.addEventListener('offline',refreshUpdateButton);
window.addEventListener('pageshow',()=>{
 syncAppManagementVisibility();
 refreshUpdateButton();
});
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'){
  syncAppManagementVisibility();
  refreshUpdateButton();
 }
});
for(const mode of ['standalone','fullscreen','minimal-ui','window-controls-overlay']){
 const query=window.matchMedia('(display-mode: '+mode+')');
 query.addEventListener?.('change',()=>{
  syncAppManagementVisibility();
  refreshUpdateButton();
 });
}

if('serviceWorker' in navigator){
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(!updateReloadPending)return;
  updateReloadPending=false;
  setUpdateCopy('Updated','Reloading NTaxer…',{disabled:true});
  setTimeout(()=>location.reload(),350);
 });
 window.addEventListener('load',async()=>{
  try{
   swRegistration=await navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'});
   swRegistration.addEventListener('updatefound',()=>watchInstallingWorker(swRegistration.installing));
   await navigator.serviceWorker.ready;
   offlineReady=true;
   updateInstallButton();
   refreshUpdateButton();
   if(navigator.onLine&&installedMode())setTimeout(()=>checkForAppUpdate(),1200);
  }catch(error){
   console.error('Offline setup failed',error);
   setInstallCopy('Install NTaxer','Offline setup needs an online reload',{status:'Reconnect to the internet and reload once to finish offline setup.'});
   setUpdateCopy('Check for updates','Update service needs an online reload',{status:'Reconnect to the internet and reload once to enable app updates.'});
  }
 },{once:true});
}else{
 setInstallCopy('Install NTaxer','Use your browser installation menu',{status:'This browser does not provide offline web-app installation.'});
 refreshUpdateButton();
}
