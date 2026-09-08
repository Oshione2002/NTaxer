/** Pure tax functions. Money is integer kobo; percentage arithmetic uses BigInt.
 * Rates: basis points (100 bp = 1%). Round half up at each calculated line.
 * Rule references are to the National Assembly January 2026 release of NTA 2025.
 */
import {STAMPS,MINERALS} from './schedules.js';
export const RULESET = 'NTA2025-NASS-2026.1';
export const REVIEWED = '2026-09-08';
export const MAX_NAIRA = 1_000_000_000_000;
export function money(value) {
  const raw = String(value ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw)) throw new Error('Enter a non-negative amount with at most two decimal places.');
  const [whole, fraction = ''] = raw.replaceAll(',', '').split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (result > BigInt(MAX_NAIRA) * 100n) throw new Error('Enter an amount of ₦1 trillion or less.');
  return Number(result);
}
export const naira = n => n * 100;
export const roundRatio = (n, a, b) => {if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(a) || a < 0 || !Number.isSafeInteger(b) || b <= 0) throw new Error('Invalid calculation input.');return Number((BigInt(n)*BigInt(a)+BigInt(b)/2n)/BigInt(b));};
export const percent = (amount, bp) => roundRatio(amount, bp, 10000);
export const positive = n => Math.max(0, n);
export const BANDS = [[800000,0],[2200000,1500],[9000000,1800],[13000000,2100],[25000000,2300],[Infinity,2500]];
export function progressive(base) {
  let remaining=positive(base), lower=0, tax=0;
  const bands=BANDS.map(([width,rate])=>{const used=Math.min(remaining,naira(width));const due=percent(used,rate);remaining-=used;tax+=due;const result={lower,upper:lower+naira(width),used,rate,tax:due};lower+=naira(width);return result;});
  return {tax,bands};
}
const M=(x,key)=>money(x[key]??0);
const check=(condition,message)=>{if(condition) throw new Error(message);};
const row=(label,value)=>[label,value];
const result=(amount,base,rows,extra={})=>({amount,base,rows,notes:[],...extra});

export function income(x,{business=false}={}) {
  const annual=x.period==='monthly'?12:1;
  const employment=M(x,'income')*annual, benefits=M(x,'benefits')*annual, other=M(x,'other');
  const costs=business?M(x,'costs'):0, losses=business?M(x,'losses'):0, allowances=business?M(x,'allowances'):0;
  check(business&&losses+allowances>positive(employment-costs),'Loss relief and capital allowances claimed cannot exceed the positive business profit in this calculation.');
  const businessProfit=positive(employment-costs-losses-allowances);
  const gross=(business?businessProfit:employment)+benefits+other;
  const contributions=['pension','nhf','health','insurance','mortgage'].reduce((sum,k)=>sum+M(x,k),0);
  const rentRelief=Math.min(percent(M(x,'rent'),2000),naira(500000));
  const minExempt=!business&&x.minimum===true;
  check(minExempt&&employment+benefits>naira(840000),'The minimum-wage selection requires annual employment income of ₦840,000 or less.');
  const exemptEmployment=minExempt?employment+benefits:0;
  const deductions=Math.min(contributions+rentRelief,positive(gross-exemptEmployment));
  const taxable=positive(gross-exemptEmployment-deductions), computed=progressive(taxable);
  const credits=M(x,'credits'), balance=positive(computed.tax-credits);
  const notes=['All relief inputs are annual, even when salary is monthly. Monthly PAYE is annual tax ÷ 12; irregular pay and joiners/leavers require a cumulative payroll calculation.','This is a resident-individual calculation. Foreign-source, exempt and final-withholding income must be classified before entry.'];
  if(contributions+rentRelief>gross-exemptEmployment) notes.push('Reliefs exceed eligible income. Chargeable income is floored at zero; this does not create a refundable tax loss.');
  if(minExempt) notes.push('Only qualifying minimum-wage employment income is excluded. Other taxable income remains in the annual computation.');
  if(business&&costs>employment) notes.push('This trade has a current-period operating loss. No tax is charged on a negative profit here; carry-forward and any permitted cross-source relief must be assessed separately.');
  const rows=[row(business?'Business receipts':'Annual cash employment income',employment),...(business?[row('Allowable business expenses',costs),row('Loss relief claimed',losses),row('Capital allowances claimed',allowances)]:[]),row('Taxable benefits in kind',benefits),row('Other taxable income',other),row('Exempt employment income',exemptEmployment),row('Eligible contributions & payments',contributions),row('Rent relief (20%, capped)',rentRelief),row('Chargeable income',taxable),row('Annual income tax',computed.tax),row('Tax credits already paid',credits),row('Remaining tax payable',balance)];
  return result(computed.tax,gross,rows,{title:'Estimated annual income tax',secondary:row('Monthly equivalent',roundRatio(computed.tax,1,12)),tertiary:row('Effective income tax rate',`${gross?(computed.tax/gross*100).toFixed(2):'0.00'}%`),bands:computed.bands,notes,balance,creditCarry:positive(credits-computed.tax),retained:positive((business?employment-costs:employment)+other-computed.tax-contributions)});
}

export function company(x) {
  const turnover=M(x,'turnover'),assets=M(x,'assets'),profit=M(x,'profit'),losses=M(x,'losses'),allowances=M(x,'allowances'),gains=M(x,'gains');
  check(losses+allowances>profit,'Loss relief plus capital allowances claimed cannot exceed the assessable operating profit entered.');
  const small=x.resident!==false&&turnover<=naira(100000000)&&assets<=naira(250000000);
  const taxable=positive(profit-losses-allowances)+gains;
  const tax=small?0:percent(taxable,3000),levy=small||x.resident===false?0:percent(profit,400);
  const credit=M(x,'credits'), payable=positive(tax-credit);
  return result(payable+levy,taxable,[row('Company classification',small?'Small company':'Standard company'),row('Assessable operating profit',profit),row('Loss relief claimed',losses),row('Capital allowances claimed',allowances),row('Taxable chargeable gains',gains),row('Total taxable profits',taxable),row('Companies income tax',tax),row('Income tax credits applied',Math.min(credit,tax)),row('Development levy',levy),row('Combined amount payable',payable+levy)],{title:'Income tax + development levy',secondary:row('Income tax rate',small?'0%':'30%'),tertiary:row('Development levy',levy),notes:['Assessable profit is a tax-adjusted figure before the loss relief and capital allowance amounts entered here. Capital gains are entered separately and are not included in this operating-profit levy base.','Small-company test uses section 201 of the National Assembly copy: turnover ≤ ₦100m AND fixed assets ≤ ₦250m. This definition does not automatically determine VAT or withholding obligations.','A future reduction to 25% requires a Presidential order. This ruleset uses the enacted commencement rate of 30%; no such order was verified in this review.','The minimum effective tax top-up, sector-specific profit adjustments, foreign tax credits and approved incentives require separate review. Do not add overlapping calculators together.'],creditCarry:positive(credit-tax)});
}

export function vat(x) {
  const amount=M(x,'amount'),status=x.treatment||'standard', eligible=M(x,'input'), share=Number(x.recovery??100);
  check(!Number.isFinite(share)||share<0||share>100,'Input recovery percentage must be between 0 and 100.');
  const rate=status==='standard'?750:0;
  const base=x.mode==='inclusive'&&rate?roundRatio(amount,10000,10750):amount;
  const output=x.mode==='inclusive'?amount-base:percent(base,rate);
  const input=status==='exempt'?0:percent(eligible,Math.round(share*100));
  const net=output-input;
  return result(positive(net),base,[row('Supply value excluding VAT',base),row('Output VAT',output),row('Invoice total',base+output),row('Recoverable input VAT',input),row(net<0?'Excess input VAT credit':'VAT to remit',Math.abs(net))],{title:net<0?'Excess input VAT credit':'Estimated VAT to remit',amount:Math.abs(net),secondary:row('Output VAT rate',`${rate/100}%`),tertiary:row('Invoice total',base+output),notes:['Zero-rated supplies remain taxable; exempt supplies do not generate input recovery in this single-category calculation. Use the recovery percentage only for eligible taxable-use input VAT.','Only qualifying, documented input VAT may be deducted; mixed use, time limits and refund conditions in section 155 still apply. Excess credit is not an automatic cash refund.',...(status==='suspended'?['Collection on Eleventh Schedule items depends on a Ministerial order. This is a non-collection scenario; confirm the applicable order before relying on it.']:[])]});
}

export function gains(x) {
  const proceeds=M(x,'proceeds'),cost=M(x,'cost'),expenses=M(x,'expenses'),prior=M(x,'otherIncome'),otherProceeds=M(x,'priorProceeds'),otherGains=M(x,'priorGains');
  let gain=positive(proceeds-cost-expenses),taxable=gain;
  const notes=['This estimates incremental income tax on a disposal. It is not a separate flat 10% capital gains tax under the 2026 rules. Other annual chargeable income must be entered for individuals.'];
  if(x.asset==='shares') {
    const reinvest=M(x,'reinvest');check(reinvest>proceeds,'Reinvestment cannot exceed the disposal proceeds.');
    if(proceeds+otherProceeds<naira(150000000)&&gain+otherGains<=naira(10000000)){taxable=0;notes.push('Nigerian-share exemption met using aggregate proceeds below ₦150m and gains not exceeding ₦10m over 12 consecutive months.');}
    else {taxable=proceeds?roundRatio(gain,proceeds-reinvest,proceeds):0;notes.push('Share reinvestment relief is proportional to proceeds reinvested in Nigerian-company shares within the same assessment year.');}
  }
  if(x.exempt){taxable=0;notes.push('Exemption is applied on your confirmation that all conditions of the selected legal relief are met.');}
  if(x.asset==='digital') notes.push('Digital-asset losses are ring-fenced under section 28(3). The disposal estimate excludes possible VAT on service fees, token-transfer stamp duty and withholding obligations; see NRS Circular 2026/21.');
  const tax=x.person==='company'?percent(taxable,3000):x.person==='small'?0:progressive(prior+taxable).tax-progressive(prior).tax;
  return result(tax,gain,[row('Disposal proceeds',proceeds),row('Acquisition cost',cost),row('Allowable disposal expenses',expenses),row('Gain before exemptions',gain),row('Taxable gain after relief',taxable),row('Incremental income tax',tax)],{title:'Estimated tax on this gain',secondary:row('Taxable gain',taxable),tertiary:row('Gain after estimated tax',positive(gain-tax)),notes});
}

export const WHT_TYPES=[
  {id:'dividend',name:'Dividends / interest',rates:[1000,1000,1000,1000],passive:true},
  {id:'royalty',name:'Royalties',rates:[1000,1000,500,500],passive:true},
  {id:'rent',name:'Rent / hire / lease',rates:[1000,1000,1000,1000],passive:true},
  {id:'professional',name:'Professional / consultancy / technical fees',rates:[500,1000,500,1000]},
  {id:'goods',name:'Goods supplied by a non-manufacturer',rates:[200,null,200,null]},
  {id:'telecom',name:'Co-location / telecom tower services',rates:[200,500,200,500]},
  {id:'services',name:'Other services',rates:[200,500,200,500]},
  {id:'construction',name:'Road / bridge / building / power-plant construction',rates:[200,500,200,500]},
  {id:'otherConstruction',name:'Other construction and related activities',rates:[500,1000,500,1000]},
  {id:'director',name:'Directors’ fees',rates:[null,null,1500,2000]},
  {id:'entertainer',name:'Non-resident entertainers / sports persons',rates:[null,1500,null,1500]},
  {id:'winnings',name:'Lottery / gaming / reality-show winnings',rates:[null,null,500,1500]}
];
export function withholding(x) {
  const type=WHT_TYPES.find(t=>t.id===x.type);check(!type,'Select a valid transaction.');
  const recipient=Number(x.recipient??0);check(![0,1,2,3].includes(recipient),'Select a valid recipient.');
  const defaultRate=type.rates[recipient];
  if(defaultRate===null&&!x.exempt) return result(null,0,[],{title:'Review recipient classification',notes:['The 2024 schedule does not prescribe a rate for this recipient/transaction combination. N/A is not an automatic exemption. Review the legal basis.']});
  let rate=defaultRate??0;
  if(x.treaty){const treaty=Number(x.treatyRate);check(!Number.isFinite(treaty)||treaty<0||treaty>rate/100,'Treaty rate must be between zero and the domestic rate.');check(recipient%2===0,'Treaty reduction requires a non-resident recipient.');rate=Math.round(treaty*100);}
  if(x.noTin&&!type.passive)rate*=2;
  if(x.exempt)rate=0;
  const amount=M(x,'amount'), gross=x.mode==='net'?roundRatio(amount,10000,10000-rate):amount,tax=percent(gross,rate);
  return result(tax,gross,[row('Gross payment excluding VAT',gross),row('Applicable withholding rate',`${rate/100}%`),row('Withholding deduction',tax),row('Net payment to recipient',gross-tax)],{title:'Estimated withholding deduction',secondary:row('Recipient receives',gross-tax),tertiary:row('Applied rate',`${rate/100}%`),notes:['Source: gazetted Deduction of Tax at Source (Withholding) Regulations 2024, regulations 3–6, 10 and First Schedule. Saved legislation must be read with NTA section 198 and current tax administration rules.','Withholding is an advance or final collection mechanism, not an extra tax to add again to income tax. Do not include VAT in the payment base.','No-TIN doubling applies here only to non-passive transactions. Treaty eligibility and any exemption must be evidenced. Small-payer exemption is not inferred from the company calculator.']});
}

export function transfer(x) {
  const amount=M(x,'amount'),count=Number(x.count??1);check(!Number.isInteger(count)||count<1||count>1000000,'Transfer count must be a whole number from 1 to 1,000,000.');
  const exempt=x.exempt===true||amount<naira(10000),per=exempt?0:naira(50);
  return result(per*count,amount*count,[row('Amount per transfer',amount),row('Number of identical transfers',String(count)),row('Duty per transfer',per),row('Total transfer duty',per*count)],{title:'Electronic transfer stamp duty',secondary:row('Per transfer',per),tertiary:row('Liable person','Transferor'),notes:['Ninth Schedule item 48 and section 184(i). Transfers below ₦10,000, salary payments and intra-bank self-transfers are exempt. This batch assumes every transfer has the same amount and exemption status.']});
}

export function levy(x){const base=M(x,'profit'),exempt=x.exempt===true,tax=exempt?0:percent(base,400);return result(tax,base,[row('Assessable profits for levy',base),row('Development levy rate',exempt?'Exempt':'4%'),row('Development levy',tax)],{title:'Estimated development levy',notes:['Section 59 excludes small companies and non-resident companies. The levy does not apply to the assessable profits computed for hydrocarbon tax. Use the appropriate income-tax assessable profit and avoid counting a company-calculator levy twice.']});}
export function minimumTax(x){const base=M(x,'income'),covered=M(x,'covered');if(!x.eligible)return result(null,base,[],{title:'Confirm scope first',notes:['Confirm that section 57 applies, including the multinational-group or domestic turnover threshold and any free-zone exception. The National Assembly text prints “£750 million”; other publications use €750 million. No currency conversion or automatic group classification is performed.']});const due=positive(percent(base,1500)-covered);return result(due,base,[row('Adjusted net income',base),row('Minimum covered taxes at 15%',percent(base,1500)),row('Eligible covered taxes',covered),row('Additional tax',due)],{title:'Minimum effective tax top-up',notes:['This is a supplied-base computation under section 57. Net income and covered taxes must be determined using the statutory adjustments. Do not offset economic development tax credit against the additional tax.']});}
export function petroleum(x){const base=M(x,'profit'),rate=Number(x.rate),additional=M(x,'additional'),credit=M(x,'credit');check(![1500,3000,5000,6575,8500].includes(rate),'Select a recognised petroleum tax regime.');const tax=percent(base,rate),due=positive(tax+additional-credit);return result(due,base,[row('Verified chargeable profits',base),row('Tax at selected regime rate',tax),row('Additional chargeable tax',additional),row('Eligible tax credits',Math.min(credit,tax+additional)),row('Tax payable',due)],{title:'Petroleum tax estimate',secondary:row('Selected rate',`${rate/100}%`),tertiary:row('Tax before credits',tax+additional),notes:['Use a separately prepared chargeable-profit schedule. Cost-price limits, production allowances, ring-fencing, fiscal-price adjustments and licence terms are not inferred from revenue.','Hydrocarbon tax (section 72) may coexist with company income tax. Legacy PPT (section 98) and PSC (section 103) regimes must not be stacked on the same profit. Royalties and other sector liabilities are separate.']});}
export function capital(x){const cost=M(x,'cost'),claimed=M(x,'claimed'),rate=Number(x.rate),months=Number(x.months);check(claimed>cost,'Previous allowances cannot exceed qualifying expenditure.');check(![1000,2000,2500].includes(rate),'Select a valid asset class.');check(!Number.isInteger(months)||months<1||months>12,'Basis period must be 1 to 12 whole months.');const amount=Math.min(cost-claimed,roundRatio(percent(cost,rate),months,12));return result(amount,cost,[row('Qualifying capital expenditure',cost),row('Prior allowances',claimed),row('Annual rate',`${rate/100}%`),row('Allowance for this period',amount),row('Unrelieved cost remaining',cost-claimed-amount)],{title:'Capital allowance for the period',notes:['First Schedule Part I paragraph 6 and Table I. This asset-level schedule covers qualifying non-petroleum expenditure under the new rates. Confirm asset ownership, use and VAT/import-duty compliance.','Legacy assets require the specific transition rules in paragraph 23. This new-asset calculator does not model balancing charges or disposals. Available allowance is not necessarily the amount deductible from this year’s profits.']});}
export function incentive(x){if(!x.eligible)return result(null,0,[],{title:'Certificate eligibility required',notes:['Priority-sector status and a valid economic development incentive certificate are required. A capital purchase alone does not qualify.']});const cost=M(x,'cost'),tax=M(x,'tax'),prior=M(x,'prior');const earned=percent(cost,500),used=Math.min(tax,earned+prior);return result(used,cost,[row('Eligible QCE in this credit year',cost),row('Current-year credit at 5%',earned),row('Valid unexpired credit brought forward',prior),row('Credit utilised',used),row('Credit carried forward, subject to expiry',earned+prior-used)],{title:'Economic development credit used',notes:['Sections 165–183 and Tenth Schedule. The 5% annual credit applies for five years to eligible QCE. The user must validate acquisition dates, production date, credit age and certificate scope.','Unutilised credits are subject to the statutory carry-forward/expiry window. Top-up tax under section 57 is excluded from the tax available for offset.']});}
export function foreignRelief(x){const total=M(x,'total'),foreign=M(x,'foreign'),tax=M(x,'tax'),paid=M(x,'paid');check(foreign>total,'Foreign income cannot exceed total income.');check(total===0&&(tax>0||paid>0),'Enter total taxable income before calculating relief.');const attributable=total?roundRatio(tax,foreign,total):0,credit=Math.min(paid,attributable);return result(credit,total,[row('Nigerian tax before relief',tax),row('Tax attributable to foreign income',attributable),row('Qualifying foreign tax paid',paid),row('Allowable foreign tax credit',credit),row('Nigerian tax after credit',positive(tax-credit))],{title:'Unilateral double-tax relief',notes:['Section 119: credit is limited to the lower of qualifying foreign tax paid and Nigerian tax proportionately attributable to that foreign income. Excludes Chapter Three petroleum taxes.','This is a single-source unilateral-relief calculation. Treaty relief under sections 120–122 and multiple-country allocations require separate analysis. Do not credit exempt income.']});}
export function surcharge(x){const base=M(x,'amount');if(x.product==='exempt')return result(0,base,[row('Exempt product retail value',base),row('Surcharge',0)],{title:'Product exempt from surcharge',notes:['Section 161: clean/renewable energy products, household kerosene, cooking gas and CNG. VAT treatment is separate.']});if(!x.scenario)return result(null,base,[],{title:'Commencement order required',notes:['Section 160 requires a Ministerial gazette order for commencement of administration. I cannot confirm this order from the sources reviewed. Enable the scenario option to model the statutory 5% without treating it as presently due.']});return result(percent(base,500),base,[row('Chargeable retail value',base),row('Statutory scenario rate','5%'),row('Illustrative surcharge',percent(base,500))],{title:'Illustrative surcharge — scenario',notes:['Planning scenario only. Sections 158–161; commencement has not been verified. This amount is not presented as a currently due tax.']});}
export function compensation(x){const amount=M(x,'amount'),prior=M(x,'prior'),other=M(x,'otherIncome');const remaining=positive(naira(50000000)-prior),taxable=positive(amount-remaining);const tax=progressive(other+taxable).tax-progressive(other).tax;return result(tax,amount,[row('Compensation payment',amount),row('Exemption available',Math.min(amount,remaining)),row('Taxable excess',taxable),row('Incremental annual income tax',tax)],{title:'Tax on loss-of-employment compensation',notes:['Section 50 applies the ₦50m exemption and taxes the excess. Prior compensation entered here consumes the same exemption; confirm aggregation and payment circumstances.','This estimates final annual income tax using other chargeable income. It is not the separate tax-at-source deduction calculation. Death/personal-injury and other exemptions need legal classification.']});}
export function prescribed(x){if(!x.confirmed)return result(null,0,[],{title:'A verified assessment basis is needed',notes:['Enter the rate and taxable base from the applicable regulation, tariff, treaty or revenue-authority assessment, then confirm that source. No nationwide rate has been assumed.']});const base=M(x,'base'),rate=Number(x.rate);check(!Number.isFinite(rate)||rate<0||rate>100,'Rate must be between 0 and 100%.');const tax=percent(base,Math.round(rate*100))+M(x,'fixed');return result(tax,base,[row('User-verified taxable base',base),row('User-supplied rate',`${rate}%`),row('Fixed assessment component',M(x,'fixed')),row('Illustrative assessed amount',tax)],{title:'User-supplied assessment scenario',notes:['Arithmetic only: taxable base × supplied rate + supplied fixed component. This tool does not establish legal liability or validate a local levy. Attach the assessment reference to your exported record.']});}

export function stamp(x) {
  const instrument=STAMPS.find(t=>t.id===Number(x.instrument));check(!instrument,'Choose a dutiable instrument.');
  const base=M(x,'amount'),property=M(x,'property'),annual=M(x,'annual'),years=Number(x.years??1),count=Number(x.count??1);
  check(!Number.isInteger(count)||count<1||count>1000000,'Instrument count must be a whole number from 1 to 1,000,000.');
  let exempt=x.exempt===true,rate=instrument.rate;
  const notes=['Ninth Schedule lists 48 instrument types. Section 184 exemptions override a listed rate where the legal conditions are met. Enter the legal consideration / premium / nominal capital, not an unrelated face value.','Each instrument in a batch must have identical value and exemption treatment. Multi-instrument transactions, counterparts, contingent consideration and connected-party reliefs need separate classification.'];
  if(instrument.rule==='conveyance'&&property<=naira(10000000))exempt=true;
  if(instrument.rule==='security'&&property<naira(10000000))exempt=true;
  if(instrument.rule==='agreement'&&base<naira(1000000))exempt=true;
  if(['receipt','transfer'].includes(instrument.rule)&&base<naira(10000))exempt=true;
  if(instrument.rule==='lease') {
    check(!Number.isFinite(years)||years<=0||years>999,'Lease term must be greater than zero and no more than 999 years.');
    rate=years<=7?78:300;
    if(annual<naira(1000000))exempt=true;
    else if(annual<naira(10000000)&&!exempt)return result(null,base,[],{title:'Lease exemption needs review',notes:['Internal source conflict: section 134 exempts annual lease values below ₦10m or 10 times annual minimum wage, whichever is higher. Ninth Schedule item 22 instead states below ₦1m. NTaxer does not resolve the conflict for annual values between those thresholds. Obtain an authority interpretation.']});
    notes.push('Section 134 and Ninth Schedule item 22 differ on the exemption threshold. Outside the disputed range the selected schedule rate is applied to the consideration you supply. No automatic assumption about total rent or lease premium is made.');
  }
  if(instrument.rule==='loan')notes.push('Loan-capital exclusions include bank overdrafts, loans not exceeding 12 months and on-lending arrangements. Confirm an exemption if applicable.');
  if(instrument.rule==='exchange')notes.push('Section 133 charges excess consideration above ₦1m or annual minimum wage, whichever is higher. Supply only the chargeable excess as the base.');
  const duty=exempt?0:instrument.fixed?naira(rate):roundRatio(base,Math.round(rate*100),1000000);
  return result(duty*count,base*count,[row('Instrument',instrument.name),row('Legal base per instrument',base),row('Duty basis',exempt?'Exemption applied':instrument.fixed?'Fixed duty':`${rate/100}%`),row('Duty per instrument',duty),row('Liable person',instrument.payer),row('Total stamp duty',duty*count)],{title:'Estimated stamp duty',secondary:row('Per instrument',duty),tertiary:row('Liable person',instrument.payer),notes});
}
export function mineral(x){const mineral=MINERALS.find(m=>m.id===Number(x.mineral));check(!mineral,'Select a mineral.');const base=M(x,'value'),tax=percent(base,mineral.rate*100);return result(tax,base,[row('Mineral',mineral.name),row('Official / qualifying market value',base),row('Royalty rate',`${mineral.rate}%`),row('Mineral royalty',tax)],{title:'Solid mineral royalty',secondary:row('Royalty rate',`${mineral.rate}%`),tertiary:row('Royalty base',base),notes:['Section 64(3), Eighth Schedule. Value must use the Ministry’s official selling price or the specified international trading-market basis. This royalty is separate from mining-company income tax, development levy and transfer duties.']});}
export function royalty(x){
  const volume=Number(x.volume),days=Number(x.days),price=Number(x.price),terrain=x.terrain,year=Number(x.year);
  check(!Number.isFinite(volume)||volume<0||volume>1000000,'Daily production must be between zero and 1,000,000 barrels.');check(!Number.isInteger(days)||days<1||days>31,'Production days must be from 1 to 31.');check(!Number.isFinite(price)||price<0||price>10000,'Fiscal price must be between zero and US$10,000.');check(year!==2026,'This ruleset supports the 2026 royalty year only.');
  const value=Math.round(volume*days*price*100);
  let weighted=0;
  if(terrain==='frontier')weighted=volume*.075;
  else if(terrain==='deep')weighted=Math.min(volume,50000)*.05+positive(volume-50000)*.075;
  else {check(!['onshore','shallow'].includes(terrain),'Choose a supported terrain.');weighted=Math.min(volume,5000)*.05+Math.min(positive(volume-5000),5000)*.075+positive(volume-10000)*(terrain==='onshore'?.15:.125);}
  const production=Math.round(weighted*days*price*100),factor=1.02**(year-2020),lower=50*factor,upper=150*factor;
  const priceRate=terrain==='frontier'?0:Math.min(.10,Math.max(0,(price-lower)/(upper-lower)*.10));
  const priceTax=Math.round(value*priceRate),tax=production+priceTax;
  return result(tax,value,[row('Chargeable field value (USD)',value),row('Production-based royalty',production),row('Price-based royalty',priceTax),row('Total modelled royalty (USD)',tax)],{currency:'USD',title:'PIA-regime oil royalty estimate',secondary:row('Production-weighted rate',`${volume?(weighted/volume*100).toFixed(3):'0'}%`),tertiary:row('Price-based rate',`${(priceRate*100).toFixed(3)}%`),notes:['Seventh Schedule Part III paragraph 6 only: crude oil / condensate for the PIA regime. One field, one terrain, constant daily chargeable production and fiscal price. Not legacy PPT / PSC or a mixed-terrain field.','Price thresholds are indexed from 2020 by 2% annually; for 2026, the US$50 baseline becomes US$'+lower.toFixed(4)+'. Frontier acreage has no price-based royalty. Confirm field volumes, fiscal prices and applicable regulatory treatment.']});
}
export function nonresident(x){const revenue=M(x,'revenue'),profit=M(x,'profit'),withheld=M(x,'withheld'),margin=Number(x.margin??0);check(!Number.isFinite(margin)||margin<0||margin>100,'Global profit margin must be between 0 and 100%.');const base=x.shipping?profit:Math.max(profit,percent(revenue,Math.round(margin*100)));const computed=percent(base,3000),floor=x.shipping?percent(revenue,200):x.subjectWht?withheld:percent(revenue,400);const tax=Math.max(computed,floor),balance=positive(tax-withheld);return result(balance,revenue,[row('Nigerian-source gross revenue',revenue),row('Profit base used',base),row('Tax at 30%',computed),row('Applicable gross-revenue / WHT floor',floor),row('Tax before withholding credit',tax),row('Withholding tax already paid',withheld),row('Remaining income tax payable',balance)],{title:x.shipping?'Non-resident carriage income tax':'Non-resident company income tax',notes:[x.shipping?'Section 18: supplied verified Nigerian taxable profits; tax is at least 2% of qualifying outbound carriage revenue. Pure trans-shipment and non-freight income are outside this calculation.':'Section 17: supplied PE / SEP profit is compared with the statutory global-margin base. Tax is at least withheld tax, or 4% of revenue where income is not subject to source deduction.','Treaty protection, establishment/nexus and attribution must be established separately. This module assumes a taxable non-resident company at the standard company rate; no development levy is added.']});}
export function presumptive(x){
 if(!x.eligible||x.company||x.records)return result(null,0,[],{title:'Outside scope or eligibility unconfirmed',notes:['Nigeria Presumptive Tax Regulations 2026, regulations 1–4 and 12: persons with adequate records are not eligible, and the definition excludes a company. Confirm that the taxpayer and activity fall in scope.']});
 const days=Number(x.days??300);check(!Number.isInteger(days)||days<1||days>300,'Estimated working days must be between 1 and 300.');
 const base=x.basis==='daily'?M(x,'daily')*days:M(x,'turnover');const exempt=x.exempt===true||base<=naira(12000000),tax=exempt?0:percent(base,100);
 return result(tax,base,[row('Annual actual / estimated turnover',base),row('Applicable treatment',exempt?'Exempt':'1% of turnover'),row('Presumptive income tax',tax)],{title:'Presumptive income tax estimate',notes:['Gazetted Nigeria Presumptive Tax Regulations 2026, S.I. 24, regulations 4, 6, 10 and 12. Annual turnover ≤ ₦12m is exempt. Listed First Schedule trades and section 162-exempt persons also qualify for exclusion.','Daily-turnover annualisation uses estimated working days capped at 300. Eligible taxpayers may elect into ordinary self-assessment; do not add the two regimes on the same income.','A First Schedule exclusion must be verified for the actual activity: examples include the specified informal food vendors, mobile/roadside barbers, manual kiosk tailors and hawkers.']});
}
export function presumptiveGains(x){const base=M(x,'proceeds');if(!x.confirmed)return result(null,base,[],{title:'Confirm regulation 7 applies',notes:['Regulation 7 of the 2026 Presumptive Tax Regulations prescribes 2% of consideration for an individual’s transaction giving rise to a chargeable gain. Confirm the applicable regime and statutory exemptions. This module does not decide its interaction with final annual tax.']});const tax=x.exempt?0:percent(base,200);return result(tax,base,[row('Transaction consideration',base),row('Presumptive rate',x.exempt?'Exempt':'2%'),row('Presumptive disposal payment',tax)],{title:'Presumptive payment on a disposal',notes:['Regulation 7: the base is consideration, not the gain. The provision refers to payment within 30 days of conclusion or receipt of consideration, whichever is earlier. Exempt disposals are excluded.','This is a separate payment-mechanism estimate. Do not automatically add it to final annual income tax on the gain; confirm reconciliation and any applicable credit with the tax authority.']});}
export function digital(x){
 const cost=M(x,'cost'),proceeds=M(x,'proceeds'),buy=Number(x.buyFx),sell=Number(x.sellFx),other=M(x,'otherIncome');
 check(!Number.isFinite(buy)||!Number.isFinite(sell)||buy<=0||sell<=0||buy>100000||sell>100000,'Enter positive acquisition and disposal FX rates, at most ₦100,000 per US dollar.');
 const adjustedCost=roundRatio(cost,Math.round(sell*10000),Math.round(buy*10000));const gain=positive(proceeds-adjustedCost);const tax=x.person==='company'?percent(gain,3000):x.person==='small'?0:progressive(other+gain).tax-progressive(other).tax;
 return result(tax,gain,[row('Naira proceeds for the disposed lot',proceeds),row('Historical naira cost allocated to that lot',cost),row('Cost translated at disposal-date FX',adjustedCost),row('Dollar-referenced gain, expressed in naira',gain),row('Ring-fenced disposal loss, if any',positive(adjustedCost-proceeds)),row('Incremental income tax before WHT credit',tax)],{title:'Income tax on Category 1 crypto gain',notes:['NRS Information Circular 2026/21, paragraph 9.1: gain is dollar-referenced. Algebraically, naira gain = naira proceeds − naira cost × disposal FX ÷ acquisition FX. FX means the specified CBN/NAFEM rate on each transaction date.','Single Category 1 cryptocurrency lot acquired and disposed for fiat only. Allocate acquisition cost to the actual net tokens disposed; a full token ledger, FIFO/lot selection, swaps and annual loss-netting are not automated.','This is income tax before credits only. The July 2026 circular separately addresses WHT on gross token proceeds, token-transfer stamp duty and VAT on related services. Those amounts are not included. Stablecoins, security/utility tokens and NFTs need their own classification.']});
}
