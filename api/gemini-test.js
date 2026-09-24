const MODELS=[
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
];

async function testModel(model){
  const started=Date.now();
  try{
    const response=await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-goog-api-key':process.env.GEMINI_API_KEY
        },
        body:JSON.stringify({
          contents:[{
            role:'user',
            parts:[{text:'Reply with exactly NTAXER_AI_OK'}]
          }],
          generationConfig:{temperature:0,maxOutputTokens:24}
        })
      }
    );

    const data=await response.json().catch(()=>({}));
    const reply=data?.candidates?.[0]?.content?.parts
      ?.map(part=>part.text||'')
      .join('')
      .trim()||'';

    if(!response.ok){
      return {
        ok:false,
        model,
        status:response.status,
        code:data?.error?.status||null,
        error:data?.error?.message||'NTaxer AI request failed.',
        durationMs:Date.now()-started
      };
    }

    return {
      ok:true,
      model,
      status:response.status,
      verified:reply.includes('NTAXER_AI_OK'),
      reply,
      durationMs:Date.now()-started
    };
  }catch{
    return {
      ok:false,
      model,
      status:502,
      error:'Could not reach the NTaxer AI service.',
      durationMs:Date.now()-started
    };
  }
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');

  if(req.method!=='GET'&&req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({ok:false,error:'Method not allowed'});
  }

  if(!process.env.GEMINI_API_KEY){
    return res.status(503).json({ok:false,error:'GEMINI_API_KEY is not configured.'});
  }

  const requested=String(req.query?.model||'').trim();

  if(String(req.query?.all||'')==='1'){
    const results=[];
    for(const model of MODELS)results.push(await testModel(model));
    const working=results.filter(item=>item.ok&&item.verified).map(item=>item.model);
    return res.status(200).json({
      ok:working.length>0,
      configured:true,
      tested:MODELS.length,
      working,
      recommended:working[0]||null,
      results
    });
  }

  if(requested){
    if(!MODELS.includes(requested)){
      return res.status(400).json({
        ok:false,
        error:'Unsupported test model.',
        availableModels:MODELS
      });
    }
    const result=await testModel(requested);
    return res.status(result.ok?200:result.status||502).json(result);
  }

  if(String(req.query?.run||'')==='1'){
    const result=await testModel(MODELS[0]);
    return res.status(result.ok?200:result.status||502).json(result);
  }

  return res.status(200).json({
    ok:true,
    configured:true,
    availableModels:MODELS,
    note:'Use ?model=MODEL_NAME to test one model, or ?all=1 to test all listed models.'
  });
}
