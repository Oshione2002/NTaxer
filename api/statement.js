const MODELS=['gemini-3.5-flash-lite','gemini-3.1-flash-lite'];
const RETRYABLE=new Set([429,500,502,503,504]);
const MAX_FILES=5;
const MAX_FILE_BYTES=5*1024*1024;

const STATEMENT_PROFILES={
  paye:{
    purpose:'Employment income / PAYE for an individual employee.',
    keep:'Explicit salary, wages, bonuses, taxable employment allowances or benefits, PAYE/tax credits already deducted, employee pension, NHF, qualifying health insurance, eligible life insurance or annuity premiums, qualifying owner-occupied mortgage interest, rent paid for individual rent relief, and clearly identified other taxable income.',
    review:'Unlabelled incoming transfers, interest income, reimbursements or credits that could be taxable but whose purpose is not established.',
    ignore:'Ordinary personal spending, airtime/data, electricity, food, betting, bank/USSD charges, savings movements, own-account transfers, gifts, loans and refunds unless the narration clearly establishes a PAYE-relevant field.'
  },
  business:{
    purpose:'Self-employed or sole-trader taxable business income.',
    keep:'Customer receipts, sales, professional fees, business rent income, and expenses plausibly incurred for the trade such as business rent, utilities, electricity, airtime/data/internet, bank charges, supplies, inventory, transport, wages, professional fees and other operating costs.',
    review:'Transfers with unclear business purpose, mixed personal/business expenses, cash withdrawals, reimbursements, loans and owner transfers.',
    ignore:'Clearly personal consumption, betting, personal gifts and internal savings or own-account movements that do not represent business income or expense.'
  },
  gains:{
    purpose:'Capital or asset disposal gain.',
    keep:'Clearly identified asset-sale or disposal proceeds, acquisition or purchase cost of the disposed asset, and directly attributable acquisition or disposal expenses.',
    review:'Large transfers that may represent an asset purchase or sale but do not identify the asset or purpose.',
    ignore:'Routine income, ordinary living or business expenses, internal transfers and unrelated fees.'
  },
  digital:{
    purpose:'Cryptocurrency or digital-asset disposal income tax.',
    keep:'Clearly identified crypto or token purchases, exchange deposits, disposals or sales, proceeds and transaction or exchange fees that relate to the disposed asset.',
    review:'Transfers to or from exchanges or wallets where the underlying buy or sell event is unclear and other taxable income that may affect the calculator.',
    ignore:'Ordinary bank spending, unrelated transfers and non-digital-asset activity.'
  },
  'presumptive-gains':{
    purpose:'Presumptive payment on a chargeable disposal.',
    keep:'Clearly identified consideration or proceeds for the relevant disposal.',
    review:'Large receipts that may be disposal consideration but whose purpose is unclear.',
    ignore:'Routine income, expenses, transfers and charges unrelated to the disposal.'
  },
  compensation:{
    purpose:'Loss-of-employment compensation.',
    keep:'Clearly identified severance, redundancy, termination, loss-of-employment or similar compensation payments and clearly identified earlier compensation of the same kind.',
    review:'Employer-origin credits that could be compensation but are not labelled clearly, plus other taxable income where relevant.',
    ignore:'Ordinary salary transactions, personal spending, savings and unrelated transfers.'
  },
  company:{
    purpose:'Company income tax from tax-adjusted company activity.',
    keep:'Business or customer receipts, sales or revenue, finance income, clearly business operating expenses, payroll, rent, utilities, airtime/data/internet, bank charges, supplies, professional fees, asset-disposal proceeds, and clearly identified income-tax credits or payments relevant to the company.',
    review:'Transfers whose business purpose is unclear, shareholder or director movements, loans, reimbursements and potentially capital rather than revenue expenditure.',
    ignore:'Clearly personal transactions and internal movements that do not represent company income, deductible cost, gain or tax credit.'
  },
  levy:{
    purpose:'Development levy based on assessable profit.',
    keep:'Only explicit assessable-profit or tax-adjusted-profit figures from financial statements or records.',
    review:'Accounting lines that may form part of assessable profit but cannot establish the statutory profit base by themselves.',
    ignore:'Ordinary bank transactions; a bank statement alone does not establish assessable profit.'
  },
  minimum:{
    purpose:'Minimum effective tax based on adjusted statutory net income and covered taxes.',
    keep:'Explicit adjusted statutory net income and clearly identified covered-tax payments or amounts from financial statements or tax records.',
    review:'Tax payments whose covered-tax status is unclear.',
    ignore:'Ordinary receipts and spending that do not directly establish the statutory net-income or covered-tax inputs.'
  },
  presumptive:{
    purpose:'Informal-business presumptive tax based primarily on turnover.',
    keep:'Customer receipts, sales and other clearly identified business turnover.',
    review:'Incoming transfers that may be business receipts but are not clearly described.',
    ignore:'Personal transfers, loans, gifts, savings movements and ordinary expenses unless needed to establish business activity.'
  },
  vat:{
    purpose:'VAT on taxable supplies with eligible input VAT.',
    keep:'Clearly identified sales or supply receipts, VAT-inclusive or VAT-exclusive invoice payments where the supply amount is identifiable, and explicit input VAT amounts or VAT credits.',
    review:'Customer receipts and supplier payments that may relate to taxable supplies but do not reveal VAT treatment or VAT amount.',
    ignore:'Personal transfers, savings movements, charges and transactions unrelated to a supply.'
  },
  withholding:{
    purpose:'Withholding tax on a qualifying payment.',
    keep:'Payments or receipts clearly labelled as professional fees, consultancy, commissions, rent, contract or service payments, interest, dividends, royalties or other transaction classes potentially subject to withholding, plus explicit withholding-tax deductions.',
    review:'Transfers that may be payment for services or contracts but lack a clear transaction purpose.',
    ignore:'Personal transfers, savings, ordinary purchases and charges with no withholding-tax relevance.'
  },
  stamp:{
    purpose:'Stamp duties on a dutiable instrument.',
    keep:'Clearly identified consideration, capital, premium, lease value or other amount tied to a dutiable instrument, plus explicit stamp-duty payments as supporting evidence.',
    review:'Transactions that may relate to an instrument but do not identify the legal instrument or chargeable base.',
    ignore:'Routine transfers and spending unrelated to an instrument.'
  },
  transfer:{
    purpose:'Electronic transfer duty.',
    keep:'Electronic transfers and explicit electronic-transfer levy or duty entries, including information needed to distinguish salary or own-account transfers where the narration establishes it.',
    review:'Transfers whose exemption status or relationship between accounts is unclear.',
    ignore:'Non-transfer purchases and unrelated account activity.'
  },
  capital:{
    purpose:'Capital allowances on qualifying capital expenditure.',
    keep:'Purchases or payments clearly for plant, machinery, equipment, vehicles, buildings or other capital assets and directly attributable qualifying capital expenditure.',
    review:'Large supplier payments that may be capital expenditure but do not identify the asset.',
    ignore:'Routine operating expenses, personal spending and unrelated transfers.'
  },
  incentive:{
    purpose:'Economic development incentive or credit.',
    keep:'Transactions or financial-statement lines explicitly tied to qualifying investment, qualifying expenditure or the incentive base required by the calculator.',
    review:'Capital or investment expenditure that may qualify but lacks enough project or incentive detail.',
    ignore:'Routine operating and personal transactions unrelated to the incentive.'
  },
  foreign:{
    purpose:'Foreign tax relief.',
    keep:'Clearly identified foreign-source income and foreign tax paid or withheld on that income.',
    review:'International receipts or foreign-currency transfers whose source or foreign-tax relationship is unclear.',
    ignore:'Domestic activity and unrelated transfers.'
  },
  hydrocarbon:{
    purpose:'Hydrocarbon tax.',
    keep:'Petroleum upstream revenue, crude or hydrocarbon sales, qualifying petroleum costs, royalties or taxes and financial-statement lines explicitly relevant to the hydrocarbon tax base.',
    review:'Sector transactions whose tax-base treatment is unclear.',
    ignore:'Unrelated corporate or personal transactions.'
  },
  petroleum:{
    purpose:'Petroleum profits tax.',
    keep:'Petroleum-operation revenue, qualifying costs, royalties, rents and tax-base items explicitly tied to petroleum operations.',
    review:'Sector transactions that may affect petroleum profits but lack sufficient classification.',
    ignore:'Unrelated activity.'
  },
  royalty:{
    purpose:'Petroleum royalty.',
    keep:'Petroleum production, sales, royalty payment lines and other values explicitly needed for royalty computation.',
    review:'Petroleum-sector receipts or payments whose royalty relevance is unclear.',
    ignore:'Non-petroleum activity.'
  },
  mineral:{
    purpose:'Solid mineral royalty.',
    keep:'Mineral sales or production receipts, royalty payments and transaction lines explicitly tied to a mineral or royalty base.',
    review:'Mining-sector receipts or payments whose mineral or royalty treatment is unclear.',
    ignore:'Non-mining activity.'
  },
  nonresident:{
    purpose:'Tax on a non-resident company or Nigerian-source activity.',
    keep:'Clearly identified Nigerian-source receipts, contract or service income, permanent-establishment or business receipts, related deductible costs where the calculator permits them, and Nigerian tax credits or withholding.',
    review:'Cross-border or Nigerian counterparty transfers whose source or tax character is unclear.',
    ignore:'Activity unrelated to the Nigerian-source tax base.'
  },
  surcharge:{
    purpose:'Fossil-fuel surcharge.',
    keep:'Explicit fossil-fuel revenue, production or value base, surcharge payments or financial-statement lines required by the calculator.',
    review:'Energy-sector transactions that may fall within the surcharge base but are not clearly classified.',
    ignore:'Unrelated activity.'
  },
  other:{
    purpose:'Other assessed taxes and levies.',
    keep:'Explicit tax, levy, assessment, penalty or statutory payment lines that correspond to a field in this calculator.',
    review:'Government or statutory payments whose tax or levy type is unclear.',
    ignore:'Ordinary commercial and personal transactions.'
  }
};

const NORMALIZATION_RULES=[
  'BANK / STATEMENT NORMALIZATION:',
  '- Statements differ across banks, fintechs, wallets, cards and accounting exports. Never rely on one provider wording or column names.',
  '- First normalize each monetary line semantically into date, original description, absolute amount, direction (credit/debit/neutral), normalizedCategory, and a concise privacy-safe interpretation.',
  '- Recognize equivalent wording across providers. For example transfer in, credit transfer, received from and inflow can all be incoming transfers; VTU, airtime purchase and top up can all be airtime; autosave, vault and savings transfer can be internal savings movements.',
  '- Use direction, narration, merchant or counterparty clues, nearby matching rows and repeated patterns together. Do not classify from a keyword alone.',
  '- Internal savings movements and likely own-account transfers are not income or expenses merely because money moved.',
  '- Do not expose names, account numbers, phone numbers, BVNs, TINs, addresses or full transaction references unless absolutely necessary. Generalize counterparties when possible.'
].join('\n');

function send(res,status,payload){
  res.status(status);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.json(payload);
}
function sameOrigin(req){
  const origin=String(req.headers.origin||'');
  if(!origin)return true;
  const proto=String(req.headers['x-forwarded-proto']||'https');
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'');
  return origin===`${proto}://${host}`;
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function candidateText(data){
  return data?.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('').trim()||'';
}

const schema={
  type:'object',
  properties:{
    documentType:{type:'string'},
    period:{type:'string'},
    truncated:{type:'boolean'},
    warnings:{type:'array',maxItems:6,items:{type:'string'}},
    rows:{
      type:'array',
      maxItems:200,
      items:{
        type:'object',
        properties:{
          date:{type:'string'},
          description:{type:'string'},
          amount:{type:'number'},
          direction:{type:'string',enum:['credit','debit','neutral']},
          normalizedCategory:{type:'string'},
          relevance:{type:'string',enum:['auto_map','review','ignore']},
          suggestedCalculatorId:{type:'string'},
          suggestedFieldKey:{type:'string'},
          confidence:{type:'string',enum:['high','medium','low']},
          reason:{type:'string'}
        },
        required:['date','description','amount','direction','normalizedCategory','relevance','suggestedCalculatorId','suggestedFieldKey','confidence','reason']
      }
    }
  },
  required:['documentType','period','truncated','warnings','rows']
};

function cleanRegistry(value){
  if(!Array.isArray(value))return [];
  return value.slice(0,40).map(calc=>({
    id:String(calc.id||'').slice(0,80),
    name:String(calc.name||'').slice(0,160),
    group:String(calc.group||'').slice(0,100),
    fields:(Array.isArray(calc.fields)?calc.fields:[]).slice(0,30).map(field=>({
      key:String(field.key||'').slice(0,80),
      label:String(field.label||'').slice(0,180)
    })).filter(field=>field.key&&field.label)
  })).filter(calc=>calc.id&&calc.name);
}

function promptFor(file,registry,sourceCalculator){
  return `You are extracting data for NTaxer, a Nigerian tax planning application.

DOCUMENT NAME:
${file.name}

STARTING CALCULATOR:
${sourceCalculator||'None. Suggest from the registry.'}

AVAILABLE NTAXER CALCULATORS AND FIELDS:
${registry.map(calc=>`- ${calc.id}: ${calc.name} [${calc.group}]\n${calc.fields.map(field=>`  - ${field.key}: ${field.label}`).join('\n')}`).join('\n')}

TASK:
1. Extract the statement or financial-document rows faithfully.
2. Keep real transaction/line-item information even when the narration is vague, such as "Received from Ali", electricity, airtime, utilities, transfers, rent, pension, bank charges, refunds and similar entries.
3. Ignore only layout noise such as repeated page headers, page numbers and duplicated column headings.
4. For each monetary row, return date if available, original description, absolute amount, and direction (credit/debit/neutral).
5. Suggest one NTaxer calculator field only when it is reasonably plausible. Use only calculator IDs and field keys from the supplied registry. If uncertain, return empty strings for both and confidence low.
6. A suggestion is not a tax decision. Do not assume every credit is taxable income or every debit is deductible.
7. Do not expose account numbers, BVNs, TINs, addresses or other unnecessary identifiers in descriptions; mask them if present.
8. Return rows in document order.
9. If more rows exist than the response can safely contain, return as many as possible and set truncated=true with a warning.

Return structured JSON only.`;
}

function interactionText(data){
  const steps=Array.isArray(data?.steps)?data.steps:[];
  for(let i=steps.length-1;i>=0;i--){
    const step=steps[i];
    if(step?.type!=='model_output')continue;
    const content=Array.isArray(step.content)?step.content:[];
    const text=content.filter(item=>item?.type==='text').map(item=>item.text||'').join('').trim();
    if(text)return text;
  }
  return '';
}

function stripJsonFence(text){
  const value=String(text||'').trim();
  if(value.startsWith('~~~')||value.startsWith('```')){
    return value.replace(/^(?:~~~|```)(?:json)?\s*/i,'').replace(/(?:~~~|```)\s*$/,'').trim();
  }
  return value;
}

function generateContentText(data){
  return data?.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('').trim()||'';
}

async function callInteractions(model,input){
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-goog-api-key':process.env.GEMINI_API_KEY
    },
    body:JSON.stringify({model,input,store:false})
  });
  const data=await response.json().catch(()=>({}));
  if(response.ok){
    const text=interactionText(data);
    if(text)return {text,model,transport:'interactions'};
    throw {status:502,data:{error:{message:'NTaxer AI returned an empty statement response.'}}};
  }
  throw {status:response.status,data};
}

async function callGenerateContent(model,file,prompt){
  const ext=String(file.name||'').split('.').pop()?.toLowerCase();
  const mime=String(file.mimeType||'');
  let parts;
  if(ext==='pdf'||mime==='application/pdf'){
    parts=[
      {inline_data:{mime_type:'application/pdf',data:String(file.data||'')}},
      {text:prompt}
    ];
  }else{
    let text='';
    try{text=Buffer.from(String(file.data||''),'base64').toString('utf8');}catch{}
    parts=[{text:`${prompt}\n\nCSV CONTENT:\n${text.slice(0,900000)}`}];
  }

  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-goog-api-key':process.env.GEMINI_API_KEY
    },
    body:JSON.stringify({
      contents:[{role:'user',parts}],
      generationConfig:{temperature:0.05,maxOutputTokens:8192},
      store:false
    })
  });
  const data=await response.json().catch(()=>({}));
  if(response.ok){
    const text=generateContentText(data);
    if(text)return {text,model,transport:'generateContent'};
    throw {status:502,data:{error:{message:'NTaxer AI returned an empty statement response.'}}};
  }
  throw {status:response.status,data};
}

async function callModel(file,registry,sourceCalculator){
  const prompt=promptFor(file,registry,sourceCalculator)+`
10. Return ONLY valid JSON matching this exact top-level shape:
{"documentType":"string","period":"string","truncated":false,"warnings":["string"],"rows":[{"date":"string","description":"string","amount":0,"direction":"credit|debit|neutral","suggestedCalculatorId":"string","suggestedFieldKey":"string","confidence":"high|medium|low","reason":"string"}]}`;
  const ext=String(file.name||'').split('.').pop()?.toLowerCase();
  const mime=String(file.mimeType||'');

  if(!['pdf','csv'].includes(ext)&&mime!=='application/pdf'&&mime!=='text/csv'){
    return {unsupported:true,error:'Excel analysis is not connected yet. Please use PDF or CSV for this analysis step.'};
  }

  let interactionInput;
  if(ext==='pdf'||mime==='application/pdf'){
    interactionInput=[
      {type:'document',data:String(file.data||''),mime_type:'application/pdf'},
      {type:'text',text:prompt}
    ];
  }else{
    let text='';
    try{text=Buffer.from(String(file.data||''),'base64').toString('utf8');}catch{}
    interactionInput=[{type:'text',text:`${prompt}\n\nCSV CONTENT:\n${text.slice(0,900000)}`}];
  }

  let lastError;
  for(const model of MODELS){
    for(let attempt=0;attempt<2;attempt++){
      if(attempt)await sleep(400);
      try{
        const result=await callInteractions(model,interactionInput);
        return {...result,text:stripJsonFence(result.text)};
      }catch(error){
        lastError=error;
        if(!RETRYABLE.has(Number(error?.status))&&Number(error?.status)!==400)break;
      }
    }

    // Compatibility fallback: use the legacy generateContent endpoint with the
    // documented REST inline_data / mime_type field names for PDF input.
    try{
      const result=await callGenerateContent(model,file,prompt);
      return {...result,text:stripJsonFence(result.text)};
    }catch(error){
      lastError=error;
      if(!RETRYABLE.has(Number(error?.status))&&Number(error?.status)!==400)continue;
    }
  }
  throw lastError||{status:502,data:{}};
}

export default async function handler(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return send(res,405,{ok:false,error:'Method not allowed'});
  }
  if(!sameOrigin(req))return send(res,403,{ok:false,error:'Cross-origin requests are not allowed.'});
  if(!process.env.GEMINI_API_KEY)return send(res,503,{ok:false,error:'NTaxer AI is not configured.'});

  const body=req.body&&typeof req.body==='object'?req.body:{};
  const files=Array.isArray(body.files)?body.files.slice(0,MAX_FILES):[];
  const registry=cleanRegistry(body.calculators);
  const sourceCalculator=String(body.sourceCalculator||'').slice(0,80);
  if(!files.length)return send(res,400,{ok:false,error:'Choose at least one statement.'});
  if(!registry.length)return send(res,400,{ok:false,error:'Calculator registry is missing.'});

  for(const file of files){
    const bytes=Math.floor(String(file.data||'').length*0.75);
    if(bytes>MAX_FILE_BYTES)return send(res,413,{ok:false,error:`${String(file.name||'A file')} is too large for this import step. Keep each file at 5 MB or less.`});
  }

  try{
    const documents=[];
    for(const file of files){
      const result=await callModel(file,registry,sourceCalculator);
      if(result.unsupported){
        documents.push({name:String(file.name||'Statement'),ok:false,error:result.error,rows:[],warnings:[result.error]});
        continue;
      }
      let parsed;
      try{parsed=JSON.parse(result.text);}catch{
        documents.push({name:String(file.name||'Statement'),ok:false,error:'NTaxer AI returned an invalid extraction response.',rows:[],warnings:[]});
        continue;
      }
      const allowed=new Map(registry.map(calc=>[calc.id,new Set(calc.fields.map(field=>field.key))]));
      const rows=(Array.isArray(parsed.rows)?parsed.rows:[]).slice(0,200).map((row,index)=>{
        let calculatorId=String(row.suggestedCalculatorId||'');
        let fieldKey=String(row.suggestedFieldKey||'');
        if(!allowed.has(calculatorId)||!allowed.get(calculatorId).has(fieldKey)){calculatorId='';fieldKey='';}
        return {
          id:`${String(file.name||'doc').slice(0,40)}-${index+1}`,
          date:String(row.date||'').slice(0,80),
          description:String(row.description||'').slice(0,500),
          amount:Number(row.amount)||0,
          direction:['credit','debit','neutral'].includes(row.direction)?row.direction:'neutral',
          suggestedCalculatorId:calculatorId,
          suggestedFieldKey:fieldKey,
          confidence:['high','medium','low'].includes(row.confidence)?row.confidence:'low',
          reason:String(row.reason||'').slice(0,500)
        };
      });
      documents.push({
        name:String(file.name||'Statement').slice(0,240),
        ok:true,
        model:result.model,
        documentType:String(parsed.documentType||'').slice(0,120),
        period:String(parsed.period||'').slice(0,160),
        truncated:Boolean(parsed.truncated),
        warnings:(Array.isArray(parsed.warnings)?parsed.warnings:[]).slice(0,6).map(String),
        rows
      });
    }
    return send(res,200,{ok:true,documents});
  }catch(error){
    const status=Number(error?.status)||502;
    const apiMessage=error?.data?.error?.message;
    const friendly=RETRYABLE.has(status)
      ?'NTaxer AI is temporarily busy. Please try analysing the statements again shortly.'
      :apiMessage||'NTaxer AI could not analyse the statements.';
    return send(res,status,{ok:false,error:friendly});
  }
}
