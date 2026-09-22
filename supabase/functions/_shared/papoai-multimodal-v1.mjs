const clean=(v,max=4000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

export function mediaUrlAllowed(rawUrl,allowedHosts=[]){
  try{
    const u=new URL(String(rawUrl||''));
    if(u.protocol!=='https:') return false;
    const host=u.hostname.toLowerCase();
    const allowed=(Array.isArray(allowedHosts)?allowedHosts:[])
      .map(x=>String(x||'').trim().toLowerCase())
      .filter(Boolean);
    if(!allowed.length) return false;
    return allowed.some(rule=>host===rule||host.endsWith('.'+rule));
  }catch{return false;}
}

function filenameForMime(mime='audio/ogg'){
  const m=String(mime||'').toLowerCase();
  if(m.includes('mpeg')||m.includes('mp3')) return 'audio.mp3';
  if(m.includes('mp4')||m.includes('m4a')) return 'audio.m4a';
  if(m.includes('wav')) return 'audio.wav';
  if(m.includes('webm')) return 'audio.webm';
  if(m.includes('aac')) return 'audio.aac';
  return 'audio.ogg';
}

export async function transcribeAudioUrl({
  url,mimeType,allowedHosts,maxBytes=16777216,apiKey,model='gpt-4o-mini-transcribe'
}){
  const started=Date.now();
  if(!mediaUrlAllowed(url,allowedHosts)) return {ok:false,error:'media_host_not_allowed',latency_ms:0};
  if(!apiKey) return {ok:false,error:'missing_api_key',latency_ms:0};
  try{
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!response.ok) return {ok:false,error:'media_fetch_failed',status:response.status,latency_ms:Date.now()-started};
    const contentLength=Number(response.headers.get('content-length')||0);
    if(contentLength>maxBytes) return {ok:false,error:'media_too_large',input_bytes:contentLength,latency_ms:Date.now()-started};
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.byteLength>maxBytes) return {ok:false,error:'media_too_large',input_bytes:bytes.byteLength,latency_ms:Date.now()-started};

    const contentType=clean(mimeType||response.headers.get('content-type')||'audio/ogg',120);
    const form=new FormData();
    form.append('model',model);
    form.append('file',new File([bytes],filenameForMime(contentType),{type:contentType}));

    const tr=await fetch('https://api.openai.com/v1/audio/transcriptions',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`},
      body:form,
      signal:AbortSignal.timeout(20000)
    });
    const data=await tr.json().catch(()=>({}));
    if(!tr.ok) return {ok:false,error:'transcription_failed',status:tr.status,input_bytes:bytes.byteLength,latency_ms:Date.now()-started};
    return {
      ok:true,
      text:clean(data?.text,12000),
      model,
      input_bytes:bytes.byteLength,
      usage:data?.usage||null,
      latency_ms:Date.now()-started
    };
  }catch(error){
    return {ok:false,error:String(error?.name||'audio_processing_error'),latency_ms:Date.now()-started};
  }
}

function responseText(data){
  if(typeof data?.output_text==='string') return data.output_text.trim();
  return (Array.isArray(data?.output)?data.output:[])
    .flatMap(x=>Array.isArray(x?.content)?x.content:[])
    .filter(x=>x?.type==='output_text')
    .map(x=>String(x.text||''))
    .join('')
    .trim();
}

export async function analyzeImageUrl({
  url,allowedHosts,apiKey,model='gpt-5.6-luna',detail='low',caption=''
}){
  const started=Date.now();
  if(!mediaUrlAllowed(url,allowedHosts)) return {ok:false,error:'media_host_not_allowed',latency_ms:0};
  if(!apiKey) return {ok:false,error:'missing_api_key',latency_ms:0};
  const schema={
    type:'object',additionalProperties:false,
    properties:{
      relevant_to_shopping:{type:'boolean'},
      likely_product:{type:'string'},
      brand:{type:'string'},
      visible_text:{type:'string'},
      search_query:{type:'string'},
      confidence:{type:'number',minimum:0,maximum:1},
      answer_note:{type:'string'}
    },
    required:['relevant_to_shopping','likely_product','brand','visible_text','search_query','confidence','answer_note']
  };
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,store:false,max_output_tokens:300,
        reasoning:{effort:'none'},
        instructions:'Analise a imagem somente para ajudar atendimento de mercado. Identifique produto/marca/texto visível com cautela. Não invente detalhes ilegíveis. Gere search_query curto para buscar no catálogo quando relevante.',
        input:[{role:'user',content:[
          {type:'input_text',text:caption?clean(caption,800):'O cliente enviou esta imagem durante um atendimento de compras.'},
          {type:'input_image',image_url:url,detail}
        ]}],
        text:{verbosity:'low',format:{type:'json_schema',name:'shopping_image_analysis',strict:true,schema}}
      }),
      signal:AbortSignal.timeout(18000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) return {ok:false,error:'vision_failed',status:response.status,latency_ms:Date.now()-started};
    let parsed=null;
    try{parsed=JSON.parse(responseText(data)||'{}')}catch{
      return {ok:false,error:'vision_parse_failed',latency_ms:Date.now()-started,usage:data?.usage||null};
    }
    return {ok:true,analysis:parsed,model,detail,usage:data?.usage||null,latency_ms:Date.now()-started};
  }catch(error){
    return {ok:false,error:String(error?.name||'vision_processing_error'),latency_ms:Date.now()-started};
  }
}

export async function synthesizeVoiceToStorage({
  text,apiKey,model='gpt-4o-mini-tts',voice='marin',instructions='',
  supabase,bucket='shopping-room-media',correlationId
}){
  const started=Date.now();
  if(!apiKey) return {ok:false,error:'missing_api_key',latency_ms:0};
  if(!supabase) return {ok:false,error:'storage_unavailable',latency_ms:0};
  const input=clean(text,4096);
  if(!input) return {ok:false,error:'empty_tts_text',latency_ms:0};
  try{
    const response=await fetch('https://api.openai.com/v1/audio/speech',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,voice,input,instructions:clean(instructions,1000),response_format:'opus'
      }),
      signal:AbortSignal.timeout(22000)
    });
    if(!response.ok) return {ok:false,error:'tts_failed',status:response.status,latency_ms:Date.now()-started};
    const bytes=new Uint8Array(await response.arrayBuffer());
    const now=new Date();
    const path=`papoai-tts/${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,'0')}/${correlationId||crypto.randomUUID()}.opus`;
    const upload=await supabase.storage.from(bucket).upload(path,bytes,{
      contentType:'audio/ogg',upsert:false,cacheControl:'300'
    });
    if(upload.error) return {ok:false,error:'tts_storage_upload_failed',latency_ms:Date.now()-started};
    const signed=await supabase.storage.from(bucket).createSignedUrl(path,900);
    if(signed.error||!signed.data?.signedUrl) return {ok:false,error:'tts_signed_url_failed',latency_ms:Date.now()-started};
    return {
      ok:true,media_url:signed.data.signedUrl,storage_path:path,input_bytes:bytes.byteLength,
      model,voice,latency_ms:Date.now()-started
    };
  }catch(error){
    return {ok:false,error:String(error?.name||'tts_processing_error'),latency_ms:Date.now()-started};
  }
}
