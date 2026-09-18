const MODELS=['gemini-3.5-flash-lite','gemini-3.1-flash-lite'];
const RETRYABLE=new Set([429,500,502,503,504]);
const MAX_FILES=5;
const MAX_FILE_BYTES=5*1024*1024;

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
          suggestedCalculatorId:{type:'string'},
          suggestedFieldKey:{type:'string'},
          confidence:{type:'string',enum:['high','medium','low']},
          reason:{type:'string'}
        },
        required:['date','description','amount','direction','suggestedCalculatorId','suggestedFieldKey','confidence','reason']
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
