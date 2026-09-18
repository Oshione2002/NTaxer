const MODEL='gemini-3.8-flash';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');

  if(req.method==='GET'){
    return res.status(200).json({
      ok:true,
      configured:Boolean(process.env.GEMINI_API_KEY),
      model:MODEL,
      note:'Send POST to test Gemini connectivity.'
    });
  }

  if(req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({ok:false,error:'Method not allowed'});
  }

  if(!process.env.GEMINI_API_KEY){
    return res.status(503).json({ok:false,error:'GEMINI_API_KEY is not configured.'});
  }

  try{
    const response=await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-goog-api-key':process.env.GEMINI_API_KEY
        },
        body:JSON.stringify({
          contents:[{
            role:'user',
            parts:[{text:'Reply with exactly NTAXER_GEMINI_OK'}]
          }],
          generationConfig:{temperature:0,maxOutputTokens:24}
        })
      }
    );

    const data=await response.json().catch(()=>({}));

    if(!response.ok){
      return res.status(response.status).json({
        ok:false,
        model:MODEL,
        geminiStatus:response.status,
        code:data?.error?.status||null,
        error:data?.error?.message||'Gemini API request failed.'
      });
    }

    const reply=data?.candidates?.[0]?.content?.parts
      ?.map(part=>part.text||'')
      .join('')
      .trim()||'';

    return res.status(200).json({
      ok:true,
      model:MODEL,
      reply,
      verified:reply.includes('NTAXER_GEMINI_OK')
    });
  }catch(error){
    return res.status(502).json({
      ok:false,
      model:MODEL,
      error:'Could not reach the Gemini API.'
    });
  }
}
