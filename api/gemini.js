const MODELS=['gemini-3.5-flash-lite','gemini-3.1-flash-lite'];
const RETRYABLE=new Set([429,500,502,503,504]);
const WINDOW_MS=10*60*1000;
const MAX_PER_WINDOW=24;
const buckets=new Map();

const schemas={
  route:{
    type:'object',
    properties:{
      answer:{type:'string'},
      calculators:{
        type:'array',
        maxItems:4,
        items:{
          type:'object',
          properties:{
            id:{type:'string'},
            reason:{type:'string'}
          },
          required:['id','reason']
        }
      },
      sources:{type:'array',maxItems:0,items:{type:'object'}},
      cautions:{type:'array',maxItems:3,items:{type:'string'}}
    },
    required:['answer','calculators','sources','cautions']
  },
  explain:{
    type:'object',
    properties:{
      answer:{type:'string'},
      calculators:{type:'array',maxItems:0,items:{type:'object'}},
      sources:{
        type:'array',
        maxItems:6,
        items:{
          type:'object',
          properties:{
            id:{type:'string'},
            label:{type:'string'}
          },
          required:['id','label']
        }
      },
      cautions:{type:'array',maxItems:3,items:{type:'string'}}
    },
    required:['answer','calculators','sources','cautions']
  },
  law:{
    type:'object',
    properties:{
      answer:{type:'string'},
      calculators:{type:'array',maxItems:0,items:{type:'object'}},
      sources:{
        type:'array',
        maxItems:6,
        items:{
          type:'object',
          properties:{
            id:{type:'string'},
            label:{type:'string'}
          },
          required:['id','label']
        }
      },
      cautions:{type:'array',maxItems:3,items:{type:'string'}}
    },
    required:['answer','calculators','sources','cautions']
  }
};

function send(res,status,payload){
  res.status(status);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.json(payload);
}

function clientIp(req){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  return forwarded||String(req.headers['x-real-ip']||'unknown');
}

function rateLimited(req){
  const now=Date.now();
  const ip=clientIp(req);
  const current=buckets.get(ip);
  if(!current||now-current.start>WINDOW_MS){
    buckets.set(ip,{start:now,count:1});
    return false;
  }
  current.count+=1;
  if(buckets.size>500){
    for(const [key,value] of buckets)if(now-value.start>WINDOW_MS)buckets.delete(key);
  }
  return current.count>MAX_PER_WINDOW;
}

function sameOrigin(req){
  const origin=String(req.headers.origin||'');
  if(!origin)return true;
  const proto=String(req.headers['x-forwarded-proto']||'https');
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'');
  return origin===`${proto}://${host}`;
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function systemInstruction(mode){
  const shared=`You are NTaxer AI, an assistant inside NTaxer, a Nigerian tax planning application.
Be concise, practical and careful. NTaxer's deterministic calculator is authoritative for every numeric tax result.
Never independently recalculate, replace or contradict a supplied NTaxer result.
Do not invent legislation, section numbers, calculator IDs, exemptions, filing outcomes or professional conclusions.
Do not request or repeat names, tax IDs, bank details, addresses or other unnecessary identifiers.
If the supplied material is insufficient, say what cannot be established.
This is planning information, not an official assessment or professional tax advice.\nFor every substantive answer, keep legal references clearly separated into Nigeria Tax Act sections and Schedules.\nNever merge a Schedule into the Act-section list or describe a section as a Schedule.\nUse only legal reference IDs supplied by NTaxer. If no supplied Schedule supports the answer, do not invent one.\nDo not repeat a long reference list inside the answer prose; the interface will display Act sections and Schedules separately.`;

  if(mode==='route')return shared+`
Your task is to understand the user's situation and recommend only calculator IDs included in the supplied calculator registry.
Explain why each selected calculator may be relevant. Do not calculate a liability. Recommend at most four calculators.`;

  if(mode==='explain')return shared+`
Your task is to explain the supplied NTaxer calculation in plain language.
Use only the supplied calculator result, breakdown, inputs and listed legal references.
Do not produce a different tax amount. If the current result says Review needed, explain the unresolved condition rather than estimating a number.`;

  return shared+`
Your task is to answer a question about Nigerian tax law using only the supplied NTaxer law excerpts.
Treat the excerpts as the sole legal evidence for the answer. Cite only source IDs that were supplied.
If the excerpts do not establish the answer, clearly say that the available NTaxer excerpts are insufficient.`;
}

function buildPrompt(body){
  const question=String(body.question||'').trim();
  const history=Array.isArray(body.history)?body.history.slice(-4):[];
  const page=body.pageContext&&typeof body.pageContext==='object'?body.pageContext:{};
  const pageContext=[
    page.page?`Page type: ${String(page.page).slice(0,80)}`:'',
    page.heading?`Page heading: ${String(page.heading).slice(0,300)}`:'',
    page.eyebrow?`Page category: ${String(page.eyebrow).slice(0,200)}`:'',
    page.summary?`Page summary: ${String(page.summary).slice(0,1200)}`:'',
    page.activeTab?`Active tab: ${String(page.activeTab).slice(0,120)}`:'',
    page.calculator?`Current calculator: ${String(page.calculator).slice(0,200)}`:'',
    page.lawTarget?`Current law reference: ${String(page.lawTarget).slice(0,80)}`:'',
    page.lawTitle?`Current law title: ${String(page.lawTitle).slice(0,300)}`:''
  ].filter(Boolean).join('\n')||'No specific page context.';

  if(body.mode==='route'){
    const registry=Array.isArray(body.calculators)?body.calculators.slice(0,40):[];
    return `USER QUESTION:
${question}

CURRENT PAGE CONTEXT:
${pageContext}

RECENT CONVERSATION:
${history.map(item=>`${item.role}: ${String(item.text||'').slice(0,900)}`).join('\n')||'None'}

AVAILABLE NTAXER CALCULATORS:
${registry.map(item=>`- ${item.id}: ${item.name} [${item.group}] — ${item.description} | Act sections: ${Array.isArray(item.refs)&&item.refs.length?item.refs.join(', '):'none'} | Schedules: ${Array.isArray(item.schedules)&&item.schedules.length?item.schedules.join(', '):'none'}`).join('\n')}

Return a short answer plus only relevant calculator IDs from this registry.`;
  }

  if(body.mode==='explain'){
    const context=body.context&&typeof body.context==='object'?body.context:{};
    return `USER QUESTION:
${question||'Explain this result.'}

CURRENT PAGE CONTEXT:
${pageContext}

CURRENT NTAXER CALCULATOR:
${String(context.calculator||'').slice(0,300)}

USER-PROVIDED CALCULATION INPUTS:
${String(context.inputs||'').slice(0,5000)}

DETERMINISTIC NTAXER RESULT:
${String(context.result||'').slice(0,3500)}

CALCULATION BREAKDOWN:
${String(context.breakdown||'').slice(0,6000)}

CURRENT DETAILS / ACTIVE TAB:
${String(context.details||'').slice(0,4000)||'No additional detail tab content supplied.'}

LEGAL REFERENCES ALREADY ATTACHED TO THIS CALCULATOR:
${Array.isArray(context.sources)?context.sources.join(', '):'None supplied'}

Explain how to read this existing result using the current filled calculator entries above.
Call out the main entered figures that materially drove the result, such as income, deductions, reliefs, transaction values, rates or classifications when they are present.
Do not mention fields that were not supplied, do not invent missing values, and do not recalculate a different result.`;
  }

  const sources=Array.isArray(body.sources)?body.sources.slice(0,6):[];
  return `USER QUESTION:
${question}

CURRENT PAGE CONTEXT:
${pageContext}

RECENT CONVERSATION:
${history.map(item=>`${item.role}: ${String(item.text||'').slice(0,900)}`).join('\n')||'None'}

RETRIEVED NTAXER LAW EXCERPTS:
${sources.map(source=>`[${source.id}] ${source.label}\n${String(source.text||'').slice(0,4500)}`).join('\n\n')||'No excerpts were retrieved.'}

Answer only from these excerpts and cite the source IDs that support the answer.`;
}

async function callGemini(mode,prompt){
  let lastError;

  for(const model of MODELS){
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    for(let attempt=0;attempt<2;attempt++){
      if(attempt)await sleep(400);

      const response=await fetch(url,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-goog-api-key':process.env.GEMINI_API_KEY
        },
        body:JSON.stringify({
          systemInstruction:{parts:[{text:systemInstruction(mode)}]},
          contents:[{role:'user',parts:[{text:prompt}]}],
          generationConfig:{
            temperature:0.15,
            maxOutputTokens:700,
            responseMimeType:'application/json',
            responseSchema:schemas[mode]
          },
          store:false
        })
      });

      const data=await response.json().catch(()=>({}));

      if(response.ok){
        const text=candidateText(data);
        if(text)return {data,model};
        lastError={status:502,data:{error:{message:`NTaxer AI received an empty response from ${model}.`}}};
        break;
      }

      lastError={status:response.status,data};
      if(!RETRYABLE.has(response.status))break;
    }
  }

  throw lastError||{status:502,data:{}};
}

function candidateText(data){
  return data?.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('').trim()||'';
}
function legalLabel(id,label=''){
  const text=String(label||'').trim();
  if(text)return text;
  const value=String(id||'');
  if(value.startsWith('section-'))return 'Section '+value.slice(8);
  if(value.startsWith('schedule-'))return 'Schedule '+value.slice(9);
  return value;
}

function splitLegalSources(items){
  const sections=[];
  const schedules=[];
  const seen=new Set();
  for(const item of items){
    const id=String(item?.id||'');
    if(!id||seen.has(id))continue;
    seen.add(id);
    const normal={id,label:legalLabel(id,item?.label)};
    if(id.startsWith('section-'))sections.push(normal);
    else if(id.startsWith('schedule-'))schedules.push(normal);
  }
  return {sections:sections.slice(0,12),schedules:schedules.slice(0,6)};
}

export default async function handler(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return send(res,405,{ok:false,error:'Method not allowed'});
  }

  if(!sameOrigin(req))return send(res,403,{ok:false,error:'Cross-origin requests are not allowed.'});
  if(rateLimited(req))return send(res,429,{ok:false,error:'NTaxer AI has received too many requests from this connection. Please try again shortly.'});
  if(!process.env.GEMINI_API_KEY)return send(res,503,{ok:false,error:'NTaxer AI is not configured.'});

  const body=req.body&&typeof req.body==='object'?req.body:{};
  const mode=['route','explain','law'].includes(body.mode)?body.mode:null;
  const question=String(body.question||'').trim();

  if(!mode)return send(res,400,{ok:false,error:'Choose a valid NTaxer AI mode.'});
  if(mode!=='explain'&&!question)return send(res,400,{ok:false,error:'Enter a question first.'});
  if(question.length>2500)return send(res,400,{ok:false,error:'Please shorten the question.'});

  try{
    const {data,model}=await callGemini(mode,buildPrompt({...body,mode,question}));
    const text=candidateText(data);
    if(!text)throw {status:502,data:{error:{message:'NTaxer AI returned no usable response.'}}};

    let parsed;
    try{parsed=JSON.parse(text);}catch{throw {status:502,data:{error:{message:'NTaxer AI returned an invalid structured response.'}}};}

    const allowedCalculators=new Set((Array.isArray(body.calculators)?body.calculators:[]).map(item=>String(item.id)));
    const allowedSources=new Set(
      mode==='law'
        ?(Array.isArray(body.sources)?body.sources:[]).map(item=>String(item.id))
        :(Array.isArray(body.context?.sourceIds)?body.context.sourceIds:[]).map(String)
    );

    const calculators=(Array.isArray(parsed.calculators)?parsed.calculators:[])
      .filter(item=>allowedCalculators.has(String(item.id)))
      .slice(0,4)
      .map(item=>({id:String(item.id),reason:String(item.reason||'')}));

    const sources=(Array.isArray(parsed.sources)?parsed.sources:[])
      .filter(item=>allowedSources.has(String(item.id)))
      .slice(0,6)
      .map(item=>({id:String(item.id),label:String(item.label||item.id)}));

    return send(res,200,{
      ok:true,
      model,
      answer:String(parsed.answer||'').trim(),
      calculators,
      sources,
      cautions:(Array.isArray(parsed.cautions)?parsed.cautions:[]).slice(0,3).map(String)
    });
  }catch(error){
    const status=Number(error?.status)||502;
    const apiMessage=error?.data?.error?.message;
    const friendly=RETRYABLE.has(status)
      ?'NTaxer AI is temporarily busy. Please try again shortly; the calculators and tax-law reference still work normally.'
      :status===401||status===403
        ?'NTaxer AI could not authenticate with its AI service.'
        :apiMessage||'NTaxer AI could not complete this request.';

    return send(res,status,{ok:false,error:friendly,geminiStatus:status});
  }
}
