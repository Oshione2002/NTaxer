import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {CALCULATORS,DEFAULTS} from '../dist/calculators.js';
import {STAMPS,MINERALS} from '../dist/schedules.js';
const N=E.naira;
const pit=x=>E.income({...DEFAULTS.paye,income:0,benefits:0,other:0,pension:0,rent:0,...x});
test('currency parsing preserves kobo and rejects malformed or unsafe amounts',()=>{
 assert.equal(E.money('1,234,567.89'),123456789);assert.equal(E.money('0.01'),1);assert.equal(E.money('1000000000000'),100000000000000);
 for(const value of ['', '-1','NaN','Infinity','1e8','1,00','1,234,56','1.001','1000000000000.01','<script>'])assert.throws(()=>E.money(value));
});
test('all six statutory cumulative PIT band boundaries',()=>{
 const expected=[[0,0],[800000,0],[3000000,330000],[12000000,1950000],[25000000,4680000],[50000000,10430000],[60000000,12930000]];
 for(const [base,tax] of expected)assert.equal(E.progressive(N(base)).tax,N(tax));
});
test('PIT is monotone and every band is marginal, including one-kobo increments',()=>{
 for(const boundary of [800000,3000000,12000000,25000000,50000000]){
  const centre=E.progressive(N(boundary)).tax,before=E.progressive(N(boundary)-1).tax,after=E.progressive(N(boundary)+1).tax;
  assert.ok(before<=centre&&centre<=after);assert.ok(after-before<=1);
 }
 for(let value=0;value<100000000;value+=100003)assert.ok(E.progressive(N(value+1)).tax>=E.progressive(N(value)).tax);
});
test('annual and monthly inputs produce the same annual tax; annual relief stays annual',()=>{
 const annual=pit({income:6000000,pension:288000,rent:1200000});const monthly=pit({period:'monthly',income:500000,pension:288000,rent:1200000});
 assert.equal(annual.amount,N(774960));assert.equal(monthly.amount,annual.amount);assert.equal(monthly.secondary[1],N(64580));
});
test('rent relief caps at 500,000, excess deductions do not create negative tax',()=>{
 assert.equal(pit({income:6000000,rent:2500000}).amount,pit({income:6000000,rent:12000000}).amount);
 assert.equal(pit({income:500000,pension:1000000}).amount,0);
});
test('minimum wage exemption affects qualifying employment, not all other income',()=>{
 assert.equal(pit({income:840000,minimum:true}).amount,0);
 assert.equal(pit({income:840000,minimum:true,other:3000000}).amount,N(330000));
 assert.throws(()=>pit({income:840000.01,minimum:true}));
});
test('tax credits do not reduce the computed annual liability or produce negative balance',()=>{
 const r=pit({income:3000000,credits:400000});assert.equal(r.amount,N(330000));assert.equal(r.balance,0);assert.equal(r.creditCarry,N(70000));
});
test('small-company test uses BOTH inclusive thresholds',()=>{
 const base={...DEFAULTS.company,turnover:100000000,assets:250000000,profit:10000000,allowances:0};
 assert.equal(E.company(base).amount,0);
 assert.equal(E.company({...base,turnover:100000000.01}).amount,N(3400000));
 assert.equal(E.company({...base,assets:250000000.01}).amount,N(3400000));
 assert.equal(E.company({...base,resident:false}).amount,N(3000000));
});
test('company loss and capital relief affects income tax; levy stays on assessable profit',()=>{
 const r=E.company({...DEFAULTS.company,profit:10000000,losses:1000000,allowances:2000000});
 assert.equal(r.amount,N(2500000));assert.throws(()=>E.company({...DEFAULTS.company,profit:10,allowances:11}));
});
test('VAT inclusive and exclusive calculations reconcile to the same invoice',()=>{
 const a=E.vat({amount:1000000,mode:'exclusive',treatment:'standard',input:0});
 const b=E.vat({amount:1075000,mode:'inclusive',treatment:'standard',input:0});
 assert.equal(a.amount,N(75000));assert.equal(a.amount,b.amount);assert.equal(a.base,b.base);
 for(const amount of ['0.01','0.07','1.01','1000000000.33']){const r=E.vat({amount,mode:'inclusive',treatment:'standard'});assert.equal(r.base+r.rows[1][1],E.money(amount));}
});
test('VAT zero-rating allows eligible input; exemption does not; overpayment is a credit',()=>{
 const base={amount:1000000,input:100000,recovery:50};assert.equal(E.vat({...base,treatment:'zero'}).amount,N(50000));assert.equal(E.vat({...base,treatment:'exempt'}).amount,0);
 const r=E.vat({...base,treatment:'standard',recovery:100});assert.equal(r.amount,N(25000));assert.match(r.title,/credit/);
});
test('Nigerian-share exemption has a strict proceeds threshold and inclusive gains threshold',()=>{
 const base={...DEFAULTS.gains,asset:'shares',person:'company',expenses:0,proceeds:149999999,cost:139999999};assert.equal(E.gains(base).amount,0);
 assert.equal(E.gains({...base,proceeds:150000000,cost:140000000}).amount,N(3000000));
 assert.equal(E.gains({...base,cost:139999998}).amount,N(3000000.3));
 assert.equal(E.gains({...base,priorProceeds:1}).amount,N(3000000));
});
test('share reinvestment relief is proportional to proceeds',()=>{
 const r=E.gains({...DEFAULTS.gains,asset:'shares',person:'company',proceeds:200000000,cost:100000000,expenses:0,reinvest:100000000});assert.equal(r.amount,N(15000000));
});
test('individual gain tax is incremental, not a second use of zero-rate bands',()=>{
 const r=E.gains({...DEFAULTS.gains,proceeds:2000000,cost:1000000,expenses:0,otherIncome:3000000});assert.equal(r.amount,N(180000));
});
test('WHT resident/nonresident and recipient-type rates',()=>{
 const base={...DEFAULTS.withholding,amount:1000000,type:'royalty'};assert.equal(E.withholding({...base,recipient:'0'}).amount,N(100000));assert.equal(E.withholding({...base,recipient:'2'}).amount,N(50000));
 assert.equal(E.withholding({...base,type:'professional',recipient:'1'}).amount,N(100000));
 assert.equal(E.withholding({...base,type:'goods',recipient:'1'}).amount,null);
});
test('no-TIN doubling excludes passive income, gross-up and treaty gates work',()=>{
 assert.equal(E.withholding({...DEFAULTS.withholding,noTin:true}).amount,N(100000));
 assert.equal(E.withholding({...DEFAULTS.withholding,type:'rent',noTin:true}).amount,N(100000));
 const r=E.withholding({...DEFAULTS.withholding,mode:'net',amount:950000});assert.equal(r.base,N(1000000));assert.equal(r.amount,N(50000));
 assert.throws(()=>E.withholding({...DEFAULTS.withholding,treaty:true,recipient:'0'}));
});
test('transfer duty boundary, salary/self-transfer exemption and batch count',()=>{
 assert.equal(E.transfer({amount:9999.99,count:1}).amount,0);assert.equal(E.transfer({amount:10000,count:3}).amount,N(150));assert.equal(E.transfer({amount:10000,count:1,exempt:true}).amount,0);
 assert.throws(()=>E.transfer({amount:10000,count:1.5}));
});
test('stamp rate decimal precision and property threshold boundaries',()=>{
 const base={...DEFAULTS.stamp,instrument:'1',amount:10000000,property:10000000};assert.equal(E.stamp(base).amount,N(37500));assert.equal(E.stamp({...base,property:9999999.99}).amount,0);
 assert.equal(E.stamp({...base,instrument:'15',property:10000000}).amount,0);assert.equal(E.stamp({...base,instrument:'15',property:10000000.01}).amount,N(150000));
 assert.equal(E.stamp({...base,instrument:'9'}).amount,N(12500));
});
test('lease conflicting exemption interval returns review, not fabricated zero or liability',()=>{
 const base={...DEFAULTS.stamp,instrument:'22'};assert.equal(E.stamp({...base,annual:999999}).amount,0);
 assert.equal(E.stamp({...base,annual:1000000}).amount,null);assert.equal(E.stamp({...base,annual:9999999.99}).amount,null);
 assert.equal(E.stamp({...base,annual:10000000,years:7,amount:20000000}).amount,N(156000));
 assert.equal(E.stamp({...base,annual:10000000,years:8,amount:20000000}).amount,N(600000));
});
test('fixed instrument threshold and quantity',()=>{assert.equal(E.stamp({...DEFAULTS.stamp,instrument:'35',amount:999999}).amount,0);assert.equal(E.stamp({...DEFAULTS.stamp,instrument:'35',amount:1000000,count:3}).amount,N(3000));});
test('development levy and minimum effective tax',()=>{
 assert.equal(E.levy({profit:1000000}).amount,N(40000));assert.equal(E.levy({profit:1000000,exempt:true}).amount,0);
 assert.equal(E.minimumTax({income:1000000,covered:100000,eligible:true}).amount,N(50000));assert.equal(E.minimumTax({income:1000000,covered:200000,eligible:true}).amount,0);
 assert.equal(E.minimumTax({income:1000000,covered:0}).amount,null);
});
test('capital allowance prorates and stops at unrelieved cost',()=>{
 assert.equal(E.capital({cost:10000000,claimed:0,rate:2000,months:6}).amount,N(1000000));assert.equal(E.capital({cost:10000000,claimed:9900000,rate:2500,months:12}).amount,N(100000));
});
test('economic development credit cannot exceed eligible tax',()=>{
 assert.equal(E.incentive({eligible:true,cost:20000000,tax:500000,prior:0}).amount,N(500000));assert.equal(E.incentive({eligible:false}).amount,null);
});
test('foreign tax credit capped at domestic attributable tax and foreign tax paid',()=>{
 assert.equal(E.foreignRelief({total:10000000,foreign:4000000,tax:1590000,paid:700000}).amount,N(636000));
 assert.equal(E.foreignRelief({total:10000000,foreign:4000000,tax:1590000,paid:500000}).amount,N(500000));assert.throws(()=>E.foreignRelief({total:10,foreign:11,tax:0,paid:0}));
});
test('petroleum selected rates, extra tax and credits',()=>{
 for(const rate of [1500,3000,5000,6575,8500])assert.equal(E.petroleum({profit:1000000,rate}).amount,N(rate*100));
 assert.equal(E.petroleum({profit:1000000,rate:3000,additional:100000,credit:50000}).amount,N(350000));
});
test('mineral and stamp schedules are complete and sequential',()=>{
 assert.deepEqual(STAMPS.map(s=>s.id),Array.from({length:48},(_,i)=>i+1));assert.deepEqual(MINERALS.map(s=>s.id),Array.from({length:73},(_,i)=>i+1));assert.equal(E.mineral({mineral:25,value:1000000}).amount,N(150000));
});
test('royalty low-price scenario isolates correct production tranches',()=>{
 assert.equal(E.royalty({volume:5000,days:1,price:40,terrain:'onshore',year:2026}).amount,N(10000));
 assert.equal(E.royalty({volume:10000,days:1,price:40,terrain:'onshore',year:2026}).amount,N(25000));
 assert.equal(E.royalty({volume:11000,days:1,price:40,terrain:'onshore',year:2026}).amount,N(31000));
 assert.equal(E.royalty({volume:60000,days:1,price:40,terrain:'deep',year:2026}).amount,N(130000));
});
test('surcharge requires explicit scenario; exemptions remain zero',()=>{
 assert.equal(E.surcharge({amount:1000000,product:'chargeable'}).amount,null);assert.equal(E.surcharge({amount:1000000,product:'chargeable',scenario:true}).amount,N(50000));assert.equal(E.surcharge({amount:1000000,product:'exempt'}).amount,0);
});
test('compensation threshold and prior exemption consumption',()=>{
 assert.equal(E.compensation({amount:50000000,prior:0,otherIncome:3000000}).amount,0);assert.equal(E.compensation({amount:51000000,prior:0,otherIncome:3000000}).amount,N(180000));assert.equal(E.compensation({amount:1000000,prior:50000000,otherIncome:3000000}).amount,N(180000));
});
test('nonresident profit comparison and gross floors',()=>{
 assert.equal(E.nonresident({revenue:100000000,profit:1000000,margin:5,subjectWht:false,withheld:0}).amount,N(4000000));assert.equal(E.nonresident({revenue:100000000,profit:1000000,shipping:true,withheld:0}).amount,N(2000000));
});
test('presumptive turnover threshold and gating',()=>{assert.equal(E.presumptive({eligible:true,turnover:12000000}).amount,0);assert.equal(E.presumptive({eligible:true,turnover:15000000}).amount,N(150000));assert.equal(E.presumptive({eligible:false}).amount,null);});
test('every calculator example runs, returns finite safe money or an explicit review state',()=>{
 for(const c of CALCULATORS){const r=c.calculate(DEFAULTS[c.id]);assert.ok(r.amount===null||(Number.isSafeInteger(r.amount)&&r.amount>=0),c.id);assert.ok(r.notes.length,c.id);assert.ok(c.refs.length,c.id);}
});
test('valid loss-making business yields no business tax without a fabricated negative bill',()=>{
 const r=E.income({...DEFAULTS.business,income:1000000,costs:2000000,losses:0,allowances:0,pension:0,rent:0},{business:true});assert.equal(r.amount,0);assert.match(r.notes.join(' '),/operating loss/);
});
test('presumptive adequate-records/company exclusions and daily estimation cap',()=>{
 assert.equal(E.presumptive({eligible:true,company:true,turnover:15000000}).amount,null);assert.equal(E.presumptive({eligible:true,records:true,turnover:15000000}).amount,null);
 assert.equal(E.presumptive({eligible:true,basis:'daily',daily:50000,days:300}).amount,N(150000));assert.throws(()=>E.presumptive({eligible:true,basis:'daily',daily:50000,days:301}));assert.equal(E.presumptive({eligible:true,turnover:15000000,exempt:true}).amount,0);
});
test('presumptive disposal payment uses consideration and explicit scope confirmation',()=>{
 assert.equal(E.presumptiveGains({confirmed:true,proceeds:20000000}).amount,N(400000));assert.equal(E.presumptiveGains({confirmed:true,proceeds:20000000,exempt:true}).amount,0);assert.equal(E.presumptiveGains({proceeds:20000000}).amount,null);
});
test('crypto calculation matches NRS Circular 2026/21 illustration 2',()=>{
 const r=E.digital({cost:1000000,proceeds:1970000,buyFx:1000,sellFx:1500,otherIncome:3000000,person:'individual'});assert.equal(r.base,N(470000));assert.equal(r.amount,N(84600));
});
test('crypto naira depreciation alone does not create a dollar-referenced gain',()=>{
 const r=E.digital({cost:1000000,proceeds:1500000,buyFx:1000,sellFx:1500,otherIncome:3000000});assert.equal(r.amount,0);assert.equal(r.base,0);assert.throws(()=>E.digital({cost:1000000,proceeds:1500000,buyFx:0,sellFx:1500}));
});
