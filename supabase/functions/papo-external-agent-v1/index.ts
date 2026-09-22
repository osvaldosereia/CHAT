import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";
import {
  normalizeExternalAgentPayload,
  redactMediaRefsForStorage,
  stableProviderEventKey,
  isReservedLabHandoff,
  buildLabTextResponse,
  buildLabHandoffResponse,
  buildLabSilentResponse,
} from "../_shared/papoai-agent-external-contract-v1.mjs";
import {transcribeAudioUrl,analyzeImageUrl,synthesizeVoiceToStorage} from "../_shared/papoai-multimodal-v1.mjs";
import {buildPapoAiExternalDelivery,fallbackTextForDelivery} from "../_shared/papoai-channel-adapter-v1.mjs";
import {classifyCommerceIntent} from "../_shared/papoai-commerce-intent-v1.mjs";
import {buildGovernorTopicKey,decideConversationAction,detectCustomerDelegation} from "../_shared/papoai-conversation-governor-v1.mjs";
import {
  parseCheckoutProfile,
  missingCheckoutProfileFields,
  checkoutProfileMissingPrompt,
  extractCheckoutPaymentMethod,
  detectCheckoutYesNo
} from "../_shared/papoai-checkout-profile-v1.mjs";
import {planPapoAiTurn} from "../_shared/papoai-ai-planner-v1.mjs";
import {evaluatePlannerScenario} from "../_shared/papoai-eval-v1.mjs";

const PROVIDER_KEY='papoai';
const CHANNEL='whatsapp';
const RESERVED_HANDOFF_COMMAND='TESTE_HANDOFF_DONA_ANTONIA';
const LAB_GUARD={external_side_effect:false};

function jsonResponse(body:unknown,status=200,responseBearer=''){
  const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  if(responseBearer) headers['Authorization']=`Bearer ${responseBearer}`;
  return new Response(JSON.stringify(body),{status,headers});
}

function safeEqual(a:string,b:string){
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  if(x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
function channelCapabilityVerified(matrix:any,key:string){
  return matrix?.capabilities?.[key]?.verified===true;
}
function mediaHost(rawUrl:any){
  try{return new URL(String(rawUrl||'')).hostname.toLowerCase()}catch{return null}
}

let magickModulePromise:Promise<any>|null=null;
async function getMagickModule(){
  if(!magickModulePromise){
    magickModulePromise=(async()=>{
      const mod=await import("npm:@imagemagick/magick-wasm@0.0.30");
      const wasmBytes=await Deno.readFile(
        new URL("magick.wasm",import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30"))
      );
      await mod.initializeImageMagick(wasmBytes);
      return mod;
    })();
  }
  return await magickModulePromise;
}

async function sha256HexText(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function ensurePapoCompatibleImage(sb:any,productId:string,sourceUrl:string){
  try{
    const source=new URL(String(sourceUrl||""));
    const projectUrl=new URL(String(Deno.env.get("SUPABASE_URL")||""));
    if(source.protocol!=="https:"||source.hostname!==projectUrl.hostname){
      return {ok:false,error:"source_host_not_allowed"};
    }
    if(!source.pathname.startsWith("/storage/v1/object/public/product-images/")){
      return {ok:false,error:"source_path_not_allowed"};
    }

    const lower=source.pathname.toLowerCase();
    if(/\.(jpe?g|png)$/.test(lower)){
      return {
        ok:true,
        media_url:source.toString(),
        converted:false,
        cached:true,
        content_type:lower.endsWith(".png")?"image/png":"image/jpeg"
      };
    }
    if(!lower.endsWith(".webp")){
      return {ok:false,error:"source_format_not_supported",source_path:source.pathname.slice(-120)};
    }

    const hash=(await sha256HexText(source.toString())).slice(0,20);
    const cacheDir=`papo-compatible/${productId}`;
    const cacheName=`${hash}.jpg`;
    const cachePath=`${cacheDir}/${cacheName}`;
    const bucket=sb.storage.from("product-images");

    const listed=await bucket.list(cacheDir,{limit:10,search:cacheName});
    if(!listed.error&&Array.isArray(listed.data)&&listed.data.some((x:any)=>x?.name===cacheName)){
      const pub=bucket.getPublicUrl(cachePath);
      return {
        ok:true,
        media_url:pub.data.publicUrl,
        converted:true,
        cached:true,
        content_type:"image/jpeg",
        cache_path:cachePath
      };
    }

    const fetched=await fetch(source.toString(),{
      redirect:"follow",
      headers:{"user-agent":"DonaAntonia-PapoMediaCompat/1.0"}
    });
    if(!fetched.ok)return {ok:false,error:"source_fetch_failed",status:fetched.status};

    const input=new Uint8Array(await fetched.arrayBuffer());
    if(!input.length||input.length>5*1024*1024){
      return {ok:false,error:"source_size_invalid",source_bytes:input.length};
    }

    const magick=await getMagickModule();
    let jpeg:Uint8Array|null=null;
    magick.ImageMagick.read(input,(image:any)=>{
      image.quality=88;
      if(Number(image.width||0)>1600)image.resize(1600,0);
      image.write(magick.MagickFormat.Jpeg,(data:Uint8Array)=>{
        jpeg=Uint8Array.from(data);
      });
    });

    if(!jpeg||!jpeg.length)return {ok:false,error:"conversion_empty"};

    const uploaded=await bucket.upload(cachePath,jpeg,{
      contentType:"image/jpeg",
      cacheControl:"31536000",
      upsert:true
    });
    if(uploaded.error){
      return {ok:false,error:"cache_upload_failed",detail:String(uploaded.error.message||"").slice(0,300)};
    }

    const pub=bucket.getPublicUrl(cachePath);
    return {
      ok:true,
      media_url:pub.data.publicUrl,
      converted:true,
      cached:false,
      content_type:"image/jpeg",
      source_bytes:input.length,
      output_bytes:jpeg.length,
      cache_path:cachePath
    };
  }catch(error){
    return {ok:false,error:"media_compat_exception",detail:String(error?.message||error).slice(0,300)};
  }
}


async function ensureR7PublicVoiceProbe(sb:any){
  const publicBucket='papoai-homologation-media';
  const publicPath='r7/dona-antonia-audio-teste.ogg';
  try{
    const pub=sb.storage.from(publicBucket).getPublicUrl(publicPath);
    const mediaUrl=String(pub?.data?.publicUrl||'');
    if(!mediaUrl) return {ok:false,error:'public_audio_url_unavailable'};
    return {
      ok:true,
      media_url:mediaUrl,
      cached:true,
      content_type:'audio/ogg',
      path:publicPath,
      bytes:66837,
      direct_public_url:true
    };
  }catch(error){
    return {
      ok:false,
      error:'public_audio_url_exception',
      detail:String(error?.message||error).slice(0,300)
    };
  }
}

function moneyBR(value:any){
  const n=Number(value||0);
  return 'R$ '+n.toFixed(2).replace('.',',');
}
function commerceTextResponse({text,mediaUrl,sessionKey,correlationId,handoff=false,reason=null}:any){
  const message:any={text:String(text||'').trim()};
  if(mediaUrl)message.media_url=String(mediaUrl);
  return {message,handoff:Boolean(handoff),reason,session_id:sessionKey,correlation_id:correlationId};
}
async function resolveOpenAiKey(sb:any){
  let key=Deno.env.get('OPENAI_API_KEY')||'';
  if(!key){try{const q=await sb.rpc('get_conversation_worker_provider_secret_v1');if(typeof q.data==='string')key=q.data}catch{}}
  return key;
}

function latestProviderMessageDiagnostic(body:any){
  try{
    let raw=body?.messages;
    if(typeof raw==='string'){
      try{raw=JSON.parse(raw);}catch{
        return {messages_type:'string',latest_type:'string',preview:String(raw).slice(-500)};
      }
    }
    if(!Array.isArray(raw)||!raw.length){
      return {messages_type:Array.isArray(raw)?'array':'missing',history_count:Array.isArray(raw)?raw.length:0};
    }
    const latest=raw[raw.length-1];
    if(typeof latest==='string'){
      return {
        messages_type:'array',
        history_count:raw.length,
        latest_type:'string',
        preview:String(latest).slice(0,500)
      };
    }
    if(!latest||typeof latest!=='object'){
      return {messages_type:'array',history_count:raw.length,latest_type:typeof latest};
    }
    const keys=Object.keys(latest).slice(0,30);
    const content=latest.content;
    const out:any={
      messages_type:'array',
      history_count:raw.length,
      latest_type:'object',
      latest_keys:keys,
      role:latest.role??latest.from??latest.sender??null,
      type:latest.type??latest.message_type??null,
      content_type:Array.isArray(content)?'array':typeof content
    };
    if(typeof content==='string') out.content_preview=content.slice(0,700);
    if(Array.isArray(content)){
      out.content_parts=content.slice(0,8).map((part:any)=>{
        if(!part||typeof part!=='object') return {type:typeof part,preview:String(part).slice(0,120)};
        return {
          keys:Object.keys(part).slice(0,20),
          type:part.type??part.kind??null,
          has_url:Boolean(part.url||part.media_url||part.image_url||part.audio_url||part.download_url),
          text_preview:typeof part.text==='string'?part.text.slice(0,160):null
        };
      });
    }
    for(const k of ['message','body','text','media','image','audio','attachment','attachments','image_url','audio_url','media_url','url']){
      const v=latest[k];
      if(v===undefined||v===null) continue;
      if(typeof v==='string') out[k+'_preview']=v.slice(0,300);
      else if(Array.isArray(v)) out[k+'_array_len']=v.length;
      else if(typeof v==='object') out[k+'_keys']=Object.keys(v).slice(0,20);
    }
    return out;
  }catch(err){
    return {diagnostic_error:String(err?.message||err).slice(0,200)};
  }
}

async function recordR7Case(sb:any,runId:any,caseKey:string,status:string,evidence:any={},source='r7_edge'){
  if(!runId)return;
  try{
    await sb.rpc('record_papoai_r7_case_v1',{
      p_run_id:String(runId),
      p_case_key:caseKey,
      p_status:status,
      p_evidence:evidence||{},
      p_source:source
    });
  }catch{}
}

async function runR6PlannerEval(sb:any,body:any){
  const scenarioKeys=Array.isArray(body?.scenario_keys)
    ? body.scenario_keys.map((x:any)=>String(x)).filter(Boolean).slice(0,6)
    : [];
  const persist=body?.persist!==false;

  let scenarioQuery=sb.from('papoai_eval_scenarios')
    .select('scenario_key,suite_version,layer,category,persona,title,input_text,context_pack,expectation,critical')
    .eq('suite_version','r6-v1')
    .eq('layer','planner')
    .eq('active',true)
    .order('scenario_key');
  if(scenarioKeys.length)scenarioQuery=scenarioQuery.in('scenario_key',scenarioKeys);

  const [{data:scenarios,error:scenarioError},{data:cfg,error:cfgError},{data:tools,error:toolsError},apiKey]=await Promise.all([
    scenarioQuery,
    sb.from('papoai_ai_runtime_config').select('*').eq('id',1).single(),
    sb.rpc('get_papoai_ai_planner_tools_v1'),
    resolveOpenAiKey(sb)
  ]);

  if(scenarioError)return {status:500,body:{error:'scenario_load_failed',detail:scenarioError.message}};
  if(cfgError||!cfg)return {status:500,body:{error:'runtime_config_missing'}};
  if(toolsError)return {status:500,body:{error:'planner_tools_missing'}};
  if(!apiKey)return {status:503,body:{error:'openai_key_missing'}};
  if(!Array.isArray(scenarios)||!scenarios.length)return {status:400,body:{error:'no_scenarios'}};
  if(scenarios.length>6)return {status:400,body:{error:'max_6_scenarios_per_call'}};

  let runId=body?.run_id?String(body.run_id):'';
  if(persist&&!runId){
    const ins=await sb.from('papoai_eval_runs').insert({
      suite_version:'r6-v1',
      mode:'planner_live',
      status:'running',
      model:cfg.primary_model||'gpt-5.6-terra',
      metadata:{source:'papo-external-agent-v1:r6-eval',external_side_effect:false}
    }).select('id').single();
    if(ins.error)return {status:500,body:{error:'run_create_failed',detail:ins.error.message}};
    runId=ins.data.id;
  }

  const results:any[]=[];
  for(const scenario of scenarios){
    const planned=await planPapoAiTurn({
      message:scenario.input_text,
      contextPack:{schema_version:'r6-eval-context-v1',...(scenario.context_pack||{})},
      tools:Array.isArray(tools)?tools:[],
      apiKey,
      model:cfg.primary_model||'gpt-5.6-terra',
      reasoningEffort:cfg.primary_reasoning_effort||'low',
      maxOutputTokens:Math.min(500,Number(cfg.max_output_tokens||500))
    });
    const evaluated=evaluatePlannerScenario({scenario,plannerResult:planned});
    const usage=planned?.usage||{};
    const row:any={
      scenario_key:scenario.scenario_key,
      critical:Boolean(scenario.critical),
      passed:evaluated.passed,
      failures:evaluated.failures,
      decision:evaluated.decision,
      tool_keys:evaluated.tool_keys,
      latency_ms:Number(planned?.latency_ms||0)||null,
      input_tokens:Number(usage?.input_tokens||0)||null,
      cached_input_tokens:Number(usage?.input_tokens_details?.cached_tokens||0)||null,
      output_tokens:Number(usage?.output_tokens||0)||null,
      actual:{
        planner_ok:Boolean(planned?.ok),
        plan:planned?.plan||null,
        policy_adjusted:Boolean(planned?.policy_adjusted),
        policy_violations:planned?.policy_violations||[],
        error:planned?.error||null
      },
      metadata:evaluated.metadata
    };
    results.push(row);

    if(persist&&runId){
      const saved=await sb.from('papoai_eval_results').upsert({
        run_id:runId,...row
      },{onConflict:'run_id,scenario_key'});
      if(saved.error)return {status:500,body:{error:'result_persist_failed',scenario_key:scenario.scenario_key,detail:saved.error.message}};
    }
  }

  let summary=null;
  if(persist&&runId){
    const refreshed=await sb.rpc('refresh_papoai_eval_run_v1',{p_run_id:runId});
    if(!refreshed.error)summary=refreshed.data;
  }

  const latencies=results.map(x=>Number(x.latency_ms||0)).filter(x=>x>0).sort((a,b)=>a-b);
  const p95=latencies.length?latencies[Math.min(latencies.length-1,Math.ceil(latencies.length*.95)-1)]:0;

  return {
    status:200,
    body:{
      ok:true,
      eval_mode:'r6_planner',
      external_side_effect:false,
      suite_version:'r6-v1',
      run_id:runId||null,
      model:cfg.primary_model||'gpt-5.6-terra',
      scenario_count:results.length,
      passed_count:results.filter(x=>x.passed).length,
      failed_count:results.filter(x=>!x.passed).length,
      critical_failed_count:results.filter(x=>!x.passed&&x.critical).length,
      batch_metrics:{
        ask_count:results.filter(x=>x.decision==='ASK').length,
        avg_latency_ms:latencies.length?Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length):0,
        p95_latency_ms:p95,
        input_tokens:results.reduce((s,x)=>s+Number(x.input_tokens||0),0),
        cached_input_tokens:results.reduce((s,x)=>s+Number(x.cached_input_tokens||0),0),
        output_tokens:results.reduce((s,x)=>s+Number(x.output_tokens||0),0)
      },
      summary,
      results
    }
  };
}
function basketsText(items:any[]){
  const lines=(Array.isArray(items)?items:[]).map((b:any)=>`🧺 ${b.display_name||b.name} — ${moneyBR(b.commercial_price)}`);
  return lines.length?`🧺 Cestas disponíveis\n\n${lines.join('\n\n')}\n\nQuer ver o que vem em alguma delas? Me diga o nome da cesta.`:'Não encontrei cestas disponíveis agora.';
}
function productsText(items:any[],maxItems=20){
  const max=Math.max(1,Math.min(20,Number(maxItems)||20));
  const list=(Array.isArray(items)?items:[]).slice(0,max);
  if(!list.length)return 'Não encontrei um produto disponível que combine com esse pedido agora.';
  return list.map((p:any)=>`${p.is_offer?'🔥':'🛒'} ${p.name} — ${moneyBR(p.commercial_price??p.offer_price??p.regular_price)}${p.is_offer?' (oferta)':''}`).join('\n\n');
}
function numberedProductsText(items:any[],maxItems=20){
  const max=Math.max(1,Math.min(20,Number(maxItems)||20));
  const list=(Array.isArray(items)?items:[]).slice(0,max);
  if(!list.length)return '';
  return list.map((p:any,index:number)=>`${index+1}. ${p.is_offer?'🔥 ':''}${p.name} — ${moneyBR(p.commercial_price??p.offer_price??p.regular_price)}${p.is_offer?' (oferta)':''}`).join('\n\n');
}
function foldProductText(value:any){
  return String(value??'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9.,]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function isCatalogListRequest(message:any){
  const m=foldProductText(message);
  if(!m)return false;
  if(/\b(recomenda|recomendacao|melhor|ideal|qual escolher|me indica|indica pra|bom pra|serve pra|mais indicado)\b/.test(m))return false;
  return /\b(quais|lista|listar|todos|todas|tem|vende|vendem|quanto|valor|preco|precos|me mostra|mostra|mostrar)\b/.test(m);
}
function isExplicitPhotoRequest(message:any){
  const m=foldProductText(message);
  return /\b(foto|imagem|ver a foto|ver foto|manda foto|manda a foto|mostrar foto|mostra foto)\b/.test(m);
}
function isBasicStapleProduct(item:any){
  const n=foldProductText(item?.name||'');
  return /\b(arroz|feijao|acucar|sal|oleo|cafe)\b/.test(n);
}
function parseMentionedPrice(message:any){
  const raw=String(message??'').replace(/\./g,'').replace(',', '.');
  const m=raw.match(/(?:r\$\s*)?(\d{1,4}(?:\.\d{1,2})?)\s*(?:reais?|real)?/i);
  if(!m)return null;
  const n=Number(m[1]);
  return Number.isFinite(n)?n:null;
}
function resolvePendingProductChoiceText(message:any,pending:any){
  const items=Array.isArray(pending?.payload?.candidates)?pending.payload.candidates:[];
  if(!items.length)return {status:'none'};
  const m=foldProductText(message);
  if(!m)return {status:'none'};

  const numberMatch=m.match(/^(?:opcao\s*|numero\s*|n\s*)?(\d{1,2})$/i)
    || m.match(/\b(?:opcao|numero|n)\s*(\d{1,2})\b/i);
  if(numberMatch){
    const idx=Number(numberMatch[1]);
    if(idx>=1&&idx<=items.length)return {status:'resolved',index:idx,item:items[idx-1],method:'number'};
    return {status:'out_of_range',candidate_count:items.length};
  }

  const price=parseMentionedPrice(message);
  const stop=new Set(['quero','esse','essa','este','esta','o','a','de','do','da','por','pra','para','um','uma','reais','real','produto','item','opcao','numero']);
  const tokens=m.split(' ')
    .map(x=>x.trim())
    .filter(x=>x.length>=2&&!stop.has(x)&&!/^\d+(?:[.,]\d+)?$/.test(x));

  const scored=items.map((item:any,index:number)=>{
    const name=foldProductText(item?.name||'');
    const brand=foldProductText(item?.brand||'');
    const searchable=(name+' '+brand).trim();
    let tokenHits=0;
    for(const t of tokens)if(searchable.includes(t))tokenHits++;
    const p=Number(item?.commercial_price??item?.offer_price??item?.regular_price??0);
    const priceDiff=price===null?null:Math.abs(p-price);
    const priceMatch=price!==null&&priceDiff!==null&&priceDiff<=0.55;
    const strongName=tokens.length>0&&tokenHits===tokens.length;
    const score=tokenHits*10+(strongName?25:0)+(priceMatch?30:0)-(priceDiff===null?0:Math.min(priceDiff,9));
    return {item,index:index+1,score,tokenHits,strongName,priceMatch,priceDiff};
  }).filter((x:any)=>x.tokenHits>0||x.priceMatch);

  scored.sort((a:any,b:any)=>b.score-a.score||Number(a.priceDiff??99)-Number(b.priceDiff??99));
  if(!scored.length)return {status:'none'};

  if(price!==null){
    const close=scored.filter((x:any)=>x.priceMatch&&x.tokenHits>0);
    if(close.length===1){
      return {status:'resolved',index:close[0].index,item:close[0].item,method:'name_price_close'};
    }
    if(close.length>1){
      return {status:'ambiguous',matches:close.slice(0,4).map((x:any)=>({index:x.index,item:x.item}))};
    }

    const named=scored.filter((x:any)=>x.tokenHits>0);
    if(named.length===1){
      return {status:'confirm_candidate',index:named[0].index,item:named[0].item,mentioned_price:price};
    }
    if(named.length>1){
      const closest=[...named].sort((a:any,b:any)=>Number(a.priceDiff??99)-Number(b.priceDiff??99));
      if(Number(closest[0]?.priceDiff??99)<=3 && Number(closest[1]?.priceDiff??99)-Number(closest[0]?.priceDiff??99)>=1){
        return {status:'confirm_candidate',index:closest[0].index,item:closest[0].item,mentioned_price:price};
      }
      return {status:'ambiguous',matches:closest.slice(0,4).map((x:any)=>({index:x.index,item:x.item}))};
    }
  }

  if(scored.length===1||scored[0].score>=scored[1].score+12){
    return {status:'resolved',index:scored[0].index,item:scored[0].item,method:'name_match'};
  }
  const top=scored.filter((x:any)=>x.score>=scored[0].score-5).slice(0,4);
  return {status:'ambiguous',matches:top.map((x:any)=>({index:x.index,item:x.item}))};
}

function valueReplacementOptionsText(options:any[]){
  const list=(Array.isArray(options)?options:[]).slice(0,3);
  return list.map((option:any,index:number)=>{
    const items=(Array.isArray(option?.items)?option.items:[]).map((item:any)=>{
      const qty=Number(item?.quantity_increment||1);
      return `${qty>1?qty+'× ':''}${item?.name||'Produto'}`;
    }).join(' + ');
    const diff=Number(option?.difference||0);
    const diffText=Math.abs(diff)<0.01?'valor praticamente igual':(diff>0?`${moneyBR(Math.abs(diff))} a mais`:`${moneyBR(Math.abs(diff))} a menos`);
    return `${index+1}. ${items} — ${moneyBR(option?.total_value)} (${diffText})`;
  }).join('\n');
}

function replacementOptionText(option:any){
  const items=Array.isArray(option?.items)?option.items:[];
  const text=items.map((item:any)=>{
    const qty=Math.max(1,Number(item?.quantity_increment||1));
    return `${qty>1?qty+'× ':''}${String(item?.name||'Produto').trim()||'Produto'}`;
  }).join(' + ');
  return text||'uma opção equivalente';
}

async function maybeProactiveOffer(sb:any,conversationId:string){
  const q=await sb.rpc('propose_papoai_commerce_proactive_offer_choice_v1',{
    p_conversation_id:conversationId
  });
  if(q.error||!q.data?.eligible||!q.data?.offer)return null;
  const offer=q.data.offer;
  const reason=String(q.data?.reason||'');
  const lead=reason==='customer_bought_before'
    ? 'Aproveitando: você já comprou este produto antes'
    : 'Aproveitando: encontrei uma oferta que pode valer a pena';
  return {
    text:`${lead}: **${offer.name}** por **${moneyBR(offer.commercial_price??offer.offer_price??offer.regular_price)}**. Quer adicionar?`,
    offer,
    reason,
    pending_action_id:q.data?.pending_action_id||null
  };
}

async function requestHash(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

Deno.serve(async(req:Request)=>{
  const started=Date.now();
  const correlationId=crypto.randomUUID();
  if(req.method!=='POST')return jsonResponse({error:'method_not_allowed',correlation_id:correlationId},405);

  let body:any;
  try{body=await req.json();}
  catch{return jsonResponse({error:'invalid_json',correlation_id:correlationId},400);}

  const supabaseUrl=Deno.env.get('SUPABASE_URL');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!supabaseUrl||!serviceKey)return jsonResponse({error:'server_config',correlation_id:correlationId},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:keySet,error:keyError}=await sb.rpc('get_papoai_agent_external_lab_keys_v2');
  const keyEntries=Array.isArray(keySet)?keySet:[];
  if(keyError||!keyEntries.length)return jsonResponse({error:'webhook_not_configured',correlation_id:correlationId},503);

  const suppliedValues=(req.headers.get('x-api-key')||'')
    .split(',')
    .map((value)=>value.trim())
    .filter(Boolean);
  let matchedKeyVersion:string|null=null;
  for(const candidate of suppliedValues){
    const matched=keyEntries.find((entry:any)=>safeEqual(candidate,String(entry?.key||'')));
    if(matched){matchedKeyVersion=String(matched?.version||'unknown');break;}
  }
  if(!matchedKeyVersion)return jsonResponse({error:'unauthorized',correlation_id:correlationId},401);

  if((req.headers.get('x-papo-r6-eval')||'').trim()==='1'){
    const evaluated=await runR6PlannerEval(sb,body);
    return jsonResponse({...evaluated.body,correlation_id:correlationId},evaluated.status);
  }

  const suppliedResponseToken=(req.headers.get('x-papo-response-token')||'')
    .trim()
    .replace(/^Bearer\s+/i,'')
    .slice(0,1000);
  const {data:storedResponseBearer}=suppliedResponseToken
    ? {data:null}
    : await sb.rpc('get_papoai_agent_external_response_bearer_v1');
  const responseBearer=suppliedResponseToken||String(storedResponseBearer||'');
  if(!responseBearer)return jsonResponse({error:'response_bearer_not_configured',correlation_id:correlationId},503);

  let normalized:any;
  try{normalized=normalizeExternalAgentPayload(body);}
  catch(error){
    const code=String((error as Error)?.message||'invalid_payload');
    return jsonResponse({error:code,correlation_id:correlationId},400);
  }

  if(normalized.triggerRole!=='user'){
    return jsonResponse(buildLabSilentResponse({
      sessionKey:normalized.sessionKey,
      correlationId,
      reason:'non_user_trigger',
      handoff:false
    }),200,responseBearer);
  }

  const {data:adapter,error:adapterError}=await sb.from('channel_provider_adapters')
    .select('id,channel_account_id,status,inbound_mode,outbound_mode')
    .eq('provider_key',PROVIDER_KEY).eq('channel',CHANNEL)
    .in('status',['temporary_active','active'])
    .order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(adapterError||!adapter?.id)return jsonResponse({error:'adapter_unavailable',correlation_id:correlationId},503);

  const {data:lab,error:labError}=await sb.rpc('get_papoai_agent_external_lab_config_v1',{p_adapter_id:adapter.id});
  if(labError||!lab)return jsonResponse({error:'lab_not_configured',correlation_id:correlationId},503);

  const r7RunId=lab?.metadata?.r7_run_id?String(lab.metadata.r7_run_id):null;
  const r7Mode=String(lab?.metadata?.mode||'');
  let r7HomologationActive=lab?.enabled===true&&r7Mode==='r7_homologation'&&Boolean(r7RunId);
  if(r7HomologationActive){
    const expiresAt=lab?.metadata?.expires_at?new Date(String(lab.metadata.expires_at)):null;
    if(expiresAt&&expiresAt.getTime()<=Date.now()){
      r7HomologationActive=false;
      try{
        await sb.from('papoai_r7_homologation_runs')
          .update({status:'expired',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()})
          .eq('id',r7RunId);
        await sb.rpc('set_papoai_agent_external_lab_enabled_v1',{p_enabled:false});
      }catch{}
      return jsonResponse(buildLabSilentResponse({
        sessionKey:normalized.sessionKey,
        correlationId,
        reason:'r7_homologation_expired',
        handoff:false
      }),200,responseBearer);
    }

    const phoneHash=await requestHash(normalized.phoneE164);
    const allowedHashes=Array.isArray(lab?.metadata?.allowed_test_phone_hashes)
      ? lab.metadata.allowed_test_phone_hashes.map((x:any)=>String(x))
      : [];

    const providerConfigTest=
      /^sessao[_-]?teste/i.test(String(normalized.sessionKey||''))
      || String(normalized.providerContext?.session_id||'').toLowerCase().includes('teste');

    if(providerConfigTest){
      if(matchedKeyVersion&&r7RunId){
        try{
          await sb.rpc('mark_papoai_r7_key_observed_v1',{
            p_run_id:r7RunId,
            p_key_version:matchedKeyVersion
          });
        }catch{}
      }
      await recordR7Case(sb,r7RunId,'text','verified',{
        correlation_id:correlationId,
        provider_configuration_test:true,
        matched_key_version:matchedKeyVersion
      },'r7_provider_configuration_test');
      return jsonResponse(buildLabTextResponse({
        text:'Integração Dona Antônia OK',
        sessionKey:normalized.sessionKey,
        correlationId
      }),200,responseBearer);
    }

    if(allowedHashes.length&&!allowedHashes.includes(phoneHash)){
      return jsonResponse(buildLabSilentResponse({
        sessionKey:normalized.sessionKey,
        correlationId,
        reason:'r7_phone_not_authorized',
        handoff:false
      }),200,responseBearer);
    }

    if(matchedKeyVersion){
      try{
        await sb.rpc('mark_papoai_r7_key_observed_v1',{
          p_run_id:r7RunId,
          p_key_version:matchedKeyVersion
        });
      }catch{}
    }

    const earlyLabCommand=String(normalized.messageText||'').trim().toUpperCase();
    if(earlyLabCommand==='TESTE_R7_AUDIO_SAIDA_DONA_ANTONIA'){
      const publicBucket='papoai-homologation-media';
      const publicPath='r7/dona-antonia-audio-teste.ogg';
      const pub=sb.storage.from(publicBucket).getPublicUrl(publicPath);
      const mediaUrl=String(pub?.data?.publicUrl||'');
      if(mediaUrl){
        const fastResponse={
          message:{
            text:'R7 ÁUDIO',
            media_url:mediaUrl,
            media_type:'audio',
            mime_type:'audio/ogg',
            voice:true
          },
          handoff:false,
          reason:'r7_voice_fast_path',
          session_id:normalized.sessionKey,
          correlation_id:correlationId
        };
        try{
          await sb.from('papoai_r7_homologation_cases')
            .update({
              status:'attempted',
              evidence:jsonb_build_object ? undefined : undefined
            });
        }catch{}
        return jsonResponse(fastResponse,200,responseBearer);
      }
      return jsonResponse(buildLabTextResponse({
        text:'R7: áudio de teste indisponível.',
        sessionKey:normalized.sessionKey,
        correlationId
      }),200,responseBearer);
    }
  }

  const internalPhones=new Set(
    Array.isArray(lab?.metadata?.blocked_internal_phones)
      ? lab.metadata.blocked_internal_phones.map((value:string)=>String(value))
      : []
  );
  if(internalPhones.has(normalized.phoneE164)){
    return jsonResponse(buildLabSilentResponse({
      sessionKey:normalized.sessionKey,
      correlationId,
      reason:'internal_company_number',
      handoff:false
    }),200,responseBearer);
  }

  const {data:commerceCfg}=await sb.rpc('get_papoai_commerce_brain_config_v1');
  const commerceEnabled=commerceCfg?.enabled===true;
  if(commerceEnabled&&commerceCfg?.metadata?.pilot_mode===true){
    const allowedHashes=Array.isArray(commerceCfg?.metadata?.pilot_allowed_phone_hashes)
      ? commerceCfg.metadata.pilot_allowed_phone_hashes.map((x:any)=>String(x))
      : [];
    const phoneHash=await requestHash(normalized.phoneE164);
    if(!allowedHashes.includes(phoneHash)){
      return jsonResponse(buildLabSilentResponse({
        sessionKey:normalized.sessionKey,
        correlationId,
        reason:'commerce_pilot_phone_not_authorized',
        handoff:false
      }),200,responseBearer);
    }
  }
  if(lab.enabled!==true&&!commerceEnabled){
    return jsonResponse(buildLabSilentResponse({sessionKey:normalized.sessionKey,correlationId,reason:'all_brains_disabled',handoff:false}),200,responseBearer);
  }

  const occurredBucket=new Date(Math.floor(Date.now()/60000)*60000).toISOString();
  const providerEventKey=await stableProviderEventKey({...normalized,occurredBucket});
  const {data:prior}=await sb.from('channel_provider_agent_lab_calls')
    .select('response_body').eq('adapter_id',adapter.id).eq('provider_event_key',providerEventKey).maybeSingle();
  if(prior?.response_body)return jsonResponse(prior.response_body,200,responseBearer);

  const {data:waAccount,error:waError}=await sb.from('whatsapp_accounts')
    .select('id').eq('is_active',true).order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(waError||!waAccount?.id)return jsonResponse({error:'whatsapp_account_unavailable',correlation_id:correlationId},503);

  const {data:ingested,error:ingestError}=await sb.rpc('ingest_channel_adapter_event_v1',{
    p_provider_key:PROVIDER_KEY,
    p_channel:CHANNEL,
    p_channel_account_id:adapter.channel_account_id,
    p_whatsapp_account_id:waAccount.id,
    p_external_user_id:normalized.phoneE164,
    p_external_contact_id:null,
    p_phone:normalized.phoneE164,
    p_display_name:normalized.displayName,
    p_external_message_id:normalized.externalMessageId,
    p_external_event_id:normalized.externalEventId,
    p_direction:'inbound',
    p_message_type:normalized.messageType||'text',
    p_body_text:normalized.messageText,
    p_media_refs:redactMediaRefsForStorage(normalized.mediaRefs||[]),
    p_tags:[],
    p_provider_context:{...normalized.providerContext,agent_external:true,session_key:normalized.sessionKey},
    p_referral:{provider_adapter:PROVIDER_KEY,agent_external_lab:true},
    p_occurred_at:new Date().toISOString()
  });
  if(ingestError)return jsonResponse({error:'adapter_ingest_failed',correlation_id:correlationId},500);

  const storedMediaRefs=redactMediaRefsForStorage(normalized.mediaRefs||[]);
  const conversationId=ingested?.conversation_id||null;
  let aiRuntimeCfg:any=null;
  let aiContextPack:any=null;
  let channelRuntimeCfg:any=null;
  let channelCapabilities:any=null;
  let mediaProcessing:any=null;
  let mediaFallbackText:string|null=null;

  if(conversationId){
    const [channelCfgQ,capQ]=await Promise.all([
      sb.from('papoai_channel_runtime_config').select('*').eq('id',1).maybeSingle(),
      sb.rpc('get_papoai_channel_capability_matrix_v1')
    ]);
    if(!channelCfgQ.error)channelRuntimeCfg=channelCfgQ.data;
    if(!capQ.error)channelCapabilities=capQ.data?.capabilities||{};
  }

  const primaryMedia=Array.isArray(normalized.mediaRefs)
    ? normalized.mediaRefs.find((m:any)=>['audio','image'].includes(String(m?.kind||'')))
    : null;

  if(r7HomologationActive&&conversationId&&primaryMedia){
    const kind=String(primaryMedia.kind||'');
    const mediaUrl=String(primaryMedia.url||'');
    const host=mediaUrl?mediaHost(mediaUrl):null;
    const caseKey=kind==='audio'?'inbound_audio':'inbound_image';
    await recordR7Case(sb,r7RunId,caseKey,'observed',{
      correlation_id:correlationId,
      message_type:normalized.messageType,
      has_url:Boolean(mediaUrl),
      has_media_id:Boolean(primaryMedia.media_id),
      mime_type:primaryMedia.mime_type||null,
      url_host:host
    },'r7_agent_external_payload');

    if(!mediaUrl&&primaryMedia?.provider_attachment&&primaryMedia?.provider_description){
      const operation=kind==='audio'?'provider_transcription':'provider_image_description';
      try{
        await sb.rpc('set_channel_provider_capability_state_v1',{
          p_adapter_id:adapter.id,
          p_capability_key:kind==='audio'?'agent_external.inbound_audio':'agent_external.inbound_image',
          p_state:'verified_lab',
          p_evidence_source:'r7_provider_attachment_description',
          p_evidence:{
            r7_run_id:r7RunId,
            correlation_id:correlationId,
            provider_attachment:true,
            operation
          }
        });
      }catch{}
      await recordR7Case(sb,r7RunId,caseKey,'verified',{
        correlation_id:correlationId,
        provider_attachment:true,
        processing_ok:true,
        operation,
        raw_media_available:false
      },'r7_provider_attachment_description');
    }

    if(mediaUrl&&host){
      const apiKey=await resolveOpenAiKey(sb);
      const allowedHosts=[host];
      if(kind==='audio'){
        mediaProcessing=await transcribeAudioUrl({
          url:mediaUrl,
          mimeType:primaryMedia.mime_type||'audio/ogg',
          allowedHosts,
          maxBytes:Number(channelRuntimeCfg?.max_audio_bytes||16777216),
          apiKey,
          model:channelRuntimeCfg?.transcription_model||'gpt-4o-mini-transcribe'
        });
        if(mediaProcessing?.ok&&mediaProcessing?.text){
          normalized.messageText=String(mediaProcessing.text);
          normalized.providerContext.transcribed_audio=true;
        }
      }else if(kind==='image'){
        mediaProcessing=await analyzeImageUrl({
          url:mediaUrl,
          allowedHosts,
          apiKey,
          model:channelRuntimeCfg?.vision_model||'gpt-5.6-luna',
          detail:channelRuntimeCfg?.vision_detail||'low',
          caption:primaryMedia.caption||''
        });
      }

      if(mediaProcessing?.ok){
        const existingHosts=Array.isArray(channelRuntimeCfg?.allowed_media_hosts)
          ? channelRuntimeCfg.allowed_media_hosts.map((x:any)=>String(x))
          : [];
        if(!existingHosts.includes(host)){
          try{
            await sb.from('papoai_channel_runtime_config')
              .update({allowed_media_hosts:[...new Set([...existingHosts,host])],updated_at:new Date().toISOString()})
              .eq('id',1);
          }catch{}
        }
        try{
          await sb.rpc('set_channel_provider_capability_state_v1',{
            p_adapter_id:adapter.id,
            p_capability_key:kind==='audio'?'agent_external.inbound_audio':'agent_external.inbound_image',
            p_state:'verified_lab',
            p_evidence_source:'r7_media_fetch_and_processing',
            p_evidence:{
              r7_run_id:r7RunId,
              correlation_id:correlationId,
              url_host:host,
              processing_ok:true,
              operation:kind==='audio'?'transcribe':'vision'
            }
          });
        }catch{}
        await recordR7Case(sb,r7RunId,caseKey,'verified',{
          correlation_id:correlationId,
          url_host:host,
          processing_ok:true,
          operation:kind==='audio'?'transcribe':'vision',
          model:mediaProcessing?.model||null
        },'r7_media_fetch_and_processing');
      }
    }
  }

  if(primaryMedia&&['audio','image'].includes(String(primaryMedia.kind||''))){
    try{
      await sb.rpc('set_channel_provider_capability_state_v1',{
        p_adapter_id:adapter.id,
        p_capability_key:primaryMedia.kind==='audio'
          ? 'agent_external.inbound_audio'
          : 'agent_external.inbound_image',
        p_state:'observed_payload',
        p_evidence_source:'agent_external_payload',
        p_evidence:{
          correlation_id:correlationId,
          message_type:normalized.messageType,
          has_url:Boolean(primaryMedia.url),
          has_media_id:Boolean(primaryMedia.media_id),
          mime_type:primaryMedia.mime_type||null,
          url_host:primaryMedia.url?mediaHost(primaryMedia.url):null
        }
      });
    }catch{}
  }

  if(conversationId&&primaryMedia&&!r7HomologationActive){
    const kind=String(primaryMedia.kind||'');
    const mediaUrl=String(primaryMedia.url||'');
    const apiKey=channelRuntimeCfg?.enabled===true?await resolveOpenAiKey(sb):'';
    const common={
      url:mediaUrl,
      allowedHosts:Array.isArray(channelRuntimeCfg?.allowed_media_hosts)?channelRuntimeCfg.allowed_media_hosts:[],
      apiKey
    };

    const providerAudioText=kind==='audio'
      ? (
          String(primaryMedia?.provider_description||'').trim()
          || String(normalized.messageText||'').replace(/^Áudio recebido\.\s*Transcrição\/descrição do PapoAI:\s*/i,'').trim()
        )
      : '';

    if(kind==='audio'&&providerAudioText){
      normalized.messageText=providerAudioText;
      normalized.providerContext.transcribed_audio=true;
      normalized.providerContext.transcription_source='papoai_provider';
      mediaProcessing={
        ok:true,
        text:providerAudioText,
        model:'papoai-provider-transcription',
        input_bytes:0,
        latency_ms:0,
        usage:{}
      };
    }else if(
      kind==='audio'
      && channelRuntimeCfg?.enabled===true
      && channelRuntimeCfg?.inbound_audio_enabled===true
      && channelCapabilityVerified({capabilities:channelCapabilities},'inbound_audio')
      && mediaUrl
    ){
      mediaProcessing=await transcribeAudioUrl({
        ...common,
        mimeType:primaryMedia.mime_type||'audio/ogg',
        maxBytes:Number(channelRuntimeCfg?.max_audio_bytes||16777216),
        model:channelRuntimeCfg?.transcription_model||'gpt-4o-mini-transcribe'
      });
      if(mediaProcessing?.ok&&mediaProcessing?.text){
        normalized.messageText=String(mediaProcessing.text);
        normalized.providerContext.transcribed_audio=true;
      }else{
        mediaFallbackText='Recebi seu áudio, mas não consegui transcrevê-lo com segurança agora. Se puder, me mande em texto o que você precisa.';
      }
    }else if(
      kind==='image'
      && channelRuntimeCfg?.enabled===true
      && channelRuntimeCfg?.inbound_image_enabled===true
      && channelCapabilityVerified({capabilities:channelCapabilities},'inbound_image')
      && mediaUrl
    ){
      mediaProcessing=await analyzeImageUrl({
        ...common,
        model:channelRuntimeCfg?.vision_model||'gpt-5.6-luna',
        detail:channelRuntimeCfg?.vision_detail||'low',
        caption:primaryMedia.caption||''
      });
      if(mediaProcessing?.ok&&mediaProcessing?.analysis){
        const a=mediaProcessing.analysis;
        const parts=[
          primaryMedia.caption||'',
          a?.likely_product?`Produto provável: ${a.likely_product}.`:'',
          a?.brand?`Marca: ${a.brand}.`:'',
          a?.search_query?`Busca sugerida: ${a.search_query}.`:'',
          a?.answer_note||''
        ].filter(Boolean);
        normalized.messageText=parts.join(' ').trim()||'[IMAGEM ANALISADA]';
        normalized.providerContext.image_analyzed=true;
      }else{
        mediaFallbackText='Recebi sua imagem, mas não consegui identificar com segurança o produto agora. Se puder, me diga o nome ou o que você quer encontrar.';
      }
    }else if(kind==='audio'){
      mediaFallbackText='Recebi seu áudio. A leitura de áudio ainda não está habilitada neste canal; se puder, me mande em texto o que você precisa.';
    }else if(kind==='image'&&!String(primaryMedia.caption||'').trim()){
      mediaFallbackText='Recebi sua imagem. A análise de imagem ainda não está habilitada neste canal; me diga o que você quer saber sobre ela.';
    }

    if(mediaProcessing){
      await sb.from('papoai_media_processing_runs').insert({
        correlation_id:correlationId,
        conversation_id:conversationId,
        media_kind:kind,
        source_url_host:mediaHost(mediaUrl),
        source_mime_type:primaryMedia.mime_type||null,
        operation:kind==='audio'?'transcribe':'vision',
        model:mediaProcessing?.model||(
          kind==='audio'
            ? channelRuntimeCfg?.transcription_model
            : channelRuntimeCfg?.vision_model
        )||null,
        detail:kind==='image'?(channelRuntimeCfg?.vision_detail||'low'):null,
        success:mediaProcessing?.ok===true,
        output_text:kind==='audio'
          ? (mediaProcessing?.text||null)
          : (mediaProcessing?.analysis?JSON.stringify(mediaProcessing.analysis).slice(0,6000):null),
        input_bytes:Number(mediaProcessing?.input_bytes||0)||null,
        input_tokens:Number(mediaProcessing?.usage?.input_tokens||0)||null,
        output_tokens:Number(mediaProcessing?.usage?.output_tokens||0)||null,
        latency_ms:Number(mediaProcessing?.latency_ms||0)||null,
        error_code:mediaProcessing?.ok===true?null:String(mediaProcessing?.error||'media_processing_failed'),
        metadata:{capability_verified:true,no_customer_side_effect:true}
      });
    }
  }

  if(conversationId){
    const [aiCfgQ,contextQ,serviceKnowledgeQ]=await Promise.all([
      sb.rpc('get_papoai_ai_runtime_config_v1'),
      sb.rpc('get_papoai_ai_context_pack_v3',{
        p_conversation_id:conversationId,
        p_current_message:normalized.messageText
      }),
      sb.rpc('search_service_knowledge_text_v1',{
        p_query:normalized.messageText,
        p_limit:4
      })
    ]);
    if(!aiCfgQ.error)aiRuntimeCfg=aiCfgQ.data;
    if(!contextQ.error){
      aiContextPack={
        ...(contextQ.data||{}),
        service_knowledge:serviceKnowledgeQ.error?[]:(serviceKnowledgeQ.data||[])
      };
    }
  }

  let canonicalInboundMessageId:string|null=null;
  if(
    commerceEnabled
    && commerceCfg?.canonical_message_persistence_enabled!==false
    && ingested?.conversation_id
  ){
    try{
      const persisted=await sb.rpc('persist_papoai_commerce_message_v1',{
        p_conversation_id:ingested.conversation_id,
        p_direction:'inbound',
        p_message_type:normalized.messageType||'text',
        p_body_text:normalized.messageText,
        p_external_message_key:'in:'+providerEventKey,
        p_metadata:{
          correlation_id:correlationId,
          provider_event_key:providerEventKey,
          provider_session_key:normalized.sessionKey,
          media_refs:storedMediaRefs
        }
      });
      canonicalInboundMessageId=persisted.data?.message_id||null;
      if(canonicalInboundMessageId&&mediaProcessing?.ok){
        try{
          if(primaryMedia?.kind==='audio'){
            await sb.from('messages').update({
              transcript:String(mediaProcessing?.text||'').slice(0,12000),
              ai_interpretation:{
                source:'papoai_multimodal_v1',
                operation:'transcribe',
                model:mediaProcessing?.model||channelRuntimeCfg?.transcription_model||null
              },
              updated_at:new Date().toISOString()
            }).eq('id',canonicalInboundMessageId);
          }else if(primaryMedia?.kind==='image'){
            await sb.from('messages').update({
              ai_interpretation:{
                source:'papoai_multimodal_v1',
                operation:'vision',
                model:mediaProcessing?.model||channelRuntimeCfg?.vision_model||null,
                detail:channelRuntimeCfg?.vision_detail||'low',
                analysis:mediaProcessing?.analysis||{}
              },
              updated_at:new Date().toISOString()
            }).eq('id',canonicalInboundMessageId);
          }
        }catch{}
      }
      if(canonicalInboundMessageId){
        await sb.rpc('maybe_enqueue_papoai_commerce_learning_v1',{
          p_conversation_id:ingested.conversation_id,
          p_message_id:canonicalInboundMessageId
        });
      }
    }catch{
      canonicalInboundMessageId=null;
    }
  }

  const {data:existingSession}=await sb.from('channel_provider_agent_lab_sessions')
    .select('id,status,paused_until,message_count').eq('adapter_id',adapter.id).eq('provider_session_key',normalized.sessionKey).maybeSingle();
  const sessionPayload={
    adapter_id:adapter.id,
    provider_session_key:normalized.sessionKey,
    phone_e164:normalized.phoneE164,
    conversation_id:ingested?.conversation_id||null,
    customer_id:ingested?.customer_id||null,
    message_count:Number(existingSession?.message_count||0)+1,
    last_correlation_id:correlationId,
    last_external_message_id:normalized.externalMessageId,
    last_external_event_id:normalized.externalEventId,
    last_seen_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  };
  const {data:labSession,error:sessionError}=await sb.from('channel_provider_agent_lab_sessions')
    .upsert(sessionPayload,{onConflict:'adapter_id,provider_session_key'}).select('id').single();
  if(sessionError||!labSession?.id)return jsonResponse({error:'lab_session_failed',correlation_id:correlationId},500);

  const reqSummary:any={
    message_length:normalized.messageText.length,
    history_count:normalized.history.length,
    has_media:Boolean(normalized.providerContext?.has_media),
    has_reply:Boolean(normalized.providerContext?.has_reply),
    phone:normalized.phoneE164,
    session_key:normalized.sessionKey,
    external_side_effect:false
  };
  if(r7HomologationActive&&!normalized.providerContext?.has_media){
    reqSummary.r7_latest_message_diag=latestProviderMessageDiagnostic(body);
  }
  const callInsert={
    correlation_id:correlationId,adapter_id:adapter.id,lab_session_id:labSession.id,
    provider_event_key:providerEventKey,external_message_id:normalized.externalMessageId,
    external_event_id:normalized.externalEventId,request_hash:await requestHash(normalized.messageText),
    processing_status:'normalized',request_summary:reqSummary
  };
  const {error:callError}=await sb.from('channel_provider_agent_lab_calls').insert(callInsert);
  if(callError){
    const {data:raced}=await sb.from('channel_provider_agent_lab_calls').select('response_body')
      .eq('adapter_id',adapter.id).eq('provider_event_key',providerEventKey).maybeSingle();
    if(raced?.response_body)return jsonResponse(raced.response_body,200,responseBearer);
    return jsonResponse({error:'lab_call_failed',correlation_id:correlationId},500);
  }

  await sb.rpc('set_channel_provider_capability_state_v1',{
    p_adapter_id:adapter.id,p_capability_key:'agent_external.request',p_state:'verified_lab',
    p_evidence_source:'lab_http',p_evidence:{correlation_id:correlationId,normalized_event_id:ingested?.normalized_event_id||null}
  });

  const {data:freshSession}=await sb.from('channel_provider_agent_lab_sessions')
    .select('id,status,paused_until,message_count').eq('adapter_id',adapter.id).eq('provider_session_key',normalized.sessionKey).maybeSingle();

  let responseBody:any;
  let processingStatus='responded';
  let responseKind='text';
  let observedPlanner:any=null;
  let channelResolution:any=null;
  let ttsResult:any=null;
  const pausedUntil=freshSession?.paused_until?new Date(freshSession.paused_until):null;
  const labHumanActive=freshSession?.status==='paused'&&(!pausedUntil||pausedUntil.getTime()>Date.now());

  if(
    commerceEnabled
    && ingested?.conversation_id
    && normalized.sessionHumanRequired!==true
  ){
    const aiMode=await sb.rpc('activate_papoai_commerce_ai_mode_v1',{
      p_conversation_id:ingested.conversation_id
    });
    if(aiMode.error)throw aiMode.error;
  }

  if(
    commerceEnabled
    && ingested?.conversation_id
    && normalized.sessionHumanRequired===true
  ){
    await sb.rpc('queue_papoai_commerce_handoff_v1',{
      p_conversation_id:ingested.conversation_id,
      p_reason:'papoai_session_human_required',
      p_summary:'PapoAI informou sessão com atendimento humano ativo.',
      p_priority:2
    });
  }

  const humanPrecedence=ingested?.conversation_id
    ? await sb.rpc('get_papoai_commerce_human_precedence_v1',{
        p_conversation_id:ingested.conversation_id
      })
    : {data:null};

  const canonicalHumanActive=humanPrecedence.data?.human_active===true;
  const humanActive=
    normalized.sessionHumanRequired===true
    || canonicalHumanActive
    || labHumanActive;
  const humanReason=normalized.sessionHumanRequired===true
    ? 'papoai_human_required'
    : canonicalHumanActive
      ? String(humanPrecedence.data?.reason||'canonical_human_active')
      : labHumanActive
        ? 'lab_session_paused'
        : null;

  const elapsed=Date.now()-started;
  const timeoutMs=Math.max(1000,Number(lab.response_timeout_seconds||20)*1000);

  if(r7HomologationActive&&normalized.sessionHumanRequired===true){
    await recordR7Case(sb,r7RunId,'handoff','verified',{
      correlation_id:correlationId,
      session_status:normalized.sessionStatus||null,
      session_human_required:true,
      session_human_user_id_present:Boolean(normalized.sessionHumanUserId)
    },'r7_session_human_required');
  }

  if(humanActive){
    processingStatus='silent';responseKind='silent';
    responseBody=buildLabSilentResponse({
      sessionKey:normalized.sessionKey,
      correlationId,
      reason:humanReason||'human_active',
      pausedUntil:freshSession?.paused_until||null,
      handoff:false
    });
  }else if(lab.enabled===true){
    const labCommand=String(normalized.messageText||'').trim().toUpperCase();

    if(r7HomologationActive&&labCommand==='TESTE_R7_STATUS_DONA_ANTONIA'){
      const statusQ=await sb.rpc('get_papoai_r7_homologation_status_v1',{p_run_id:r7RunId});
      const s=statusQ.data||{};
      responseBody=buildLabTextResponse({
        text:`R7 ativa. Casos resolvidos: ${s.resolved_cases||0}/${s.total_cases||0}. Core verificado: ${s.core_verified||0}/${s.core_total||0}. Rotação: ${s.key_rotation_state||'staged'}.`,
        sessionKey:normalized.sessionKey,
        correlationId
      });
    }else if(r7HomologationActive&&labCommand==='TESTE_R7_TEXTO_DONA_ANTONIA'){
      await recordR7Case(sb,r7RunId,'text','attempted',{correlation_id:correlationId},'r7_text_probe');
      responseBody=buildLabTextResponse({
        text:'R7 TEXTO OK — Dona Antônia',
        sessionKey:normalized.sessionKey,
        correlationId
      });
    }else if(r7HomologationActive&&labCommand==='TESTE_R7_IMAGEM_DONA_ANTONIA'){
      const productQ=await sb.from('products')
        .select('id,name,image_url')
        .eq('is_active',true)
        .eq('physically_verified',true)
        .gt('stock',0)
        .not('image_url','is',null)
        .order('sort_order',{ascending:true})
        .limit(1)
        .maybeSingle();
      const imageUrl=String(productQ.data?.image_url||'');
      if(imageUrl){
        const compat=await ensurePapoCompatibleImage(
          sb,
          String(productQ.data?.id||''),
          imageUrl
        );
        await recordR7Case(sb,r7RunId,'outbound_image','attempted',{
          correlation_id:correlationId,
          product_id:productQ.data?.id||null,
          original_media_host:mediaHost(imageUrl),
          original_format:imageUrl.toLowerCase().endsWith('.webp')?'webp':'other',
          compatibility_ok:compat?.ok===true,
          compatibility_converted:compat?.converted===true,
          compatibility_cached:compat?.cached===true,
          compatibility_content_type:compat?.content_type||null,
          compatibility_error:compat?.error||null,
          compatibility_detail:compat?.detail||null,
          compatibility_source_bytes:compat?.source_bytes||null,
          compatibility_output_bytes:compat?.output_bytes||null,
          compatibility_cache_path:compat?.cache_path||null
        },'r7_outbound_image_probe');
        if(compat?.ok&&compat?.media_url){
          processingStatus='responded';responseKind='image';
          responseBody={
            message:{
              text:`R7 IMAGEM — ${String(productQ.data?.name||'produto')}`,
              media_url:String(compat.media_url)
            },
            handoff:false,
            reason:'r7_outbound_image_probe',
            session_id:normalized.sessionKey,
            correlation_id:correlationId
          };
        }else{
          processingStatus='responded';responseKind='text';
          responseBody=buildLabTextResponse({
            text:'R7: a imagem do produto existe, mas não foi possível gerar a versão compatível para o WhatsApp.',
            sessionKey:normalized.sessionKey,
            correlationId
          });
        }
      }else{
        await recordR7Case(sb,r7RunId,'outbound_image','failed',{reason:'test_image_unavailable'},'r7_outbound_image_probe');
        responseBody=buildLabTextResponse({
          text:'R7: não encontrei imagem de teste disponível.',
          sessionKey:normalized.sessionKey,
          correlationId
        });
      }
    }else if(r7HomologationActive&&labCommand==='TESTE_R7_AUDIO_SAIDA_DONA_ANTONIA'){
      const voiceProbe=await ensureR7PublicVoiceProbe(sb);
      if(voiceProbe?.ok&&voiceProbe?.media_url){
        await recordR7Case(sb,r7RunId,'outbound_voice','attempted',{
          correlation_id:correlationId,
          public_probe:true,
          public_path:voiceProbe.path||null,
          cached:Boolean(voiceProbe.cached),
          media_format:'ogg',
          content_type:voiceProbe.content_type||'audio/ogg'
        },'r7_outbound_voice_public_ogg_probe');

        processingStatus='responded';
        responseKind='voice';
        responseBody={
          message:{
            text:'R7 ÁUDIO',
            media_url:String(voiceProbe.media_url),
            media_type:'audio',
            mime_type:'audio/ogg',
            voice:true
          },
          handoff:false,
          reason:'r7_outbound_voice_public_ogg_probe',
          session_id:normalized.sessionKey,
          correlation_id:correlationId
        };

        await sb.from('channel_provider_agent_lab_calls').update({
          processing_status:'responded',
          response_kind:'voice',
          http_status:200,
          duration_ms:Date.now()-started,
          response_summary:{
            handoff:false,
            silent:false,
            reason:'r7_outbound_voice_public_ogg_probe',
            channel:{
              requested_type:'voice',
              resolved_type:'voice',
              fallback_used:false,
              capability_state:'physical_probe',
              media_inbound:false,
              media_processed:false,
              tts_generated:true
            },
            ...LAB_GUARD
          },
          response_body:responseBody,
          updated_at:new Date().toISOString()
        }).eq('correlation_id',correlationId);

        return jsonResponse(responseBody,200,responseBearer);
      }else{
        await recordR7Case(sb,r7RunId,'outbound_voice','failed',{
          correlation_id:correlationId,
          public_probe:true,
          error:voiceProbe?.error||'public_voice_probe_failed',
          detail:voiceProbe?.detail||null
        },'r7_outbound_voice_public_ogg_probe');

        responseBody=buildLabTextResponse({
          text:'R7: o áudio de teste não pôde ser preparado.',
          sessionKey:normalized.sessionKey,
          correlationId
        });

        await sb.from('channel_provider_agent_lab_calls').update({
          processing_status:'responded',
          response_kind:'text',
          http_status:200,
          duration_ms:Date.now()-started,
          response_summary:{
            handoff:false,
            silent:false,
            reason:'r7_outbound_voice_public_ogg_failed',
            ...LAB_GUARD
          },
          response_body:responseBody,
          updated_at:new Date().toISOString()
        }).eq('correlation_id',correlationId);

        return jsonResponse(responseBody,200,responseBearer);
      }
    }else if(r7HomologationActive&&labCommand==='TESTE_R7_SILENCIO_DONA_ANTONIA'){
      await recordR7Case(sb,r7RunId,'silent','attempted',{correlation_id:correlationId},'r7_silent_probe');
      processingStatus='silent';responseKind='silent';
      responseBody=buildLabSilentResponse({
        sessionKey:normalized.sessionKey,
        correlationId,
        reason:'r7_silent_probe',
        handoff:false
      });
    }else if(isReservedLabHandoff(normalized.messageText)&&normalized.messageText.toUpperCase()===RESERVED_HANDOFF_COMMAND){
      const localPauseUntil=lab?.metadata?.expires_at
        ? String(lab.metadata.expires_at)
        : new Date(Date.now()+60*60*1000).toISOString();
      let assistedHandoff:any=null;
      if(conversationId){
        try{
          const queued=await sb.rpc('queue_papoai_commerce_handoff_v1',{
            p_conversation_id:conversationId,
            p_reason:'r7_assisted_handoff',
            p_summary:'R7: transferência assistida para atendimento humano no PapoAI.',
            p_priority:2
          });
          if(!queued.error)assistedHandoff=queued.data||null;
        }catch{}
      }
      try{
        await sb.from('channel_provider_agent_lab_sessions').update({
          status:'paused',
          paused_until:localPauseUntil,
          updated_at:new Date().toISOString()
        }).eq('id',labSession.id);
      }catch{}
      if(r7HomologationActive){
        await recordR7Case(sb,r7RunId,'handoff','attempted',{
          correlation_id:correlationId,
          local_fail_safe_paused:true,
          local_pause_until:localPauseUntil,
          assisted_handoff:true,
          assisted_handoff_id:assistedHandoff?.handoff_id||null,
          provider_url:assistedHandoff?.provider_url||null,
          provider_automatic_takeover:false,
          operator_action_required:true
        },'r7_assisted_handoff_probe');
      }
      processingStatus='handoff';responseKind='handoff';
      responseBody=buildLabHandoffResponse({text:'Vou chamar uma pessoa da nossa equipe para continuar com você.',sessionKey:normalized.sessionKey,correlationId,reason:'assisted_manual_handoff'});
    }else if(elapsed>=timeoutMs){
      processingStatus='handoff';responseKind='handoff';
      responseBody=buildLabHandoffResponse({text:'O teste demorou além do limite. Vou transferir para atendimento humano.',sessionKey:normalized.sessionKey,correlationId,reason:'lab_timeout'});
    }else{
      responseBody=buildLabTextResponse({text:String(lab.fixed_response_text),sessionKey:normalized.sessionKey,correlationId});
    }
  }else{
    if(mediaFallbackText){
      responseBody=buildLabTextResponse({
        text:mediaFallbackText,
        sessionKey:normalized.sessionKey,
        correlationId
      });
      processingStatus='responded';
      responseKind='text';
    }

    if(
      !responseBody
      && conversationId
      && commerceCfg?.ai_enabled===true
      && aiRuntimeCfg?.enabled===true
      && aiRuntimeCfg?.execution_mode==='observe'
      && aiRuntimeCfg?.observe_live_messages===true
      && aiContextPack?.ok===true
    ){
      try{
        const [plannerKey,plannerToolsQ]=await Promise.all([
          resolveOpenAiKey(sb),
          sb.rpc('get_papoai_ai_planner_tools_v1')
        ]);
        observedPlanner=await planPapoAiTurn({
          message:normalized.messageText,
          contextPack:aiContextPack,
          tools:Array.isArray(plannerToolsQ.data)?plannerToolsQ.data:[],
          apiKey:plannerKey,
          model:aiRuntimeCfg?.primary_model||'gpt-5.6-terra',
          reasoningEffort:aiRuntimeCfg?.primary_reasoning_effort||'low',
          maxOutputTokens:Number(aiRuntimeCfg?.max_output_tokens||500)
        });
        const usage=observedPlanner?.usage||{};
        await sb.from('papoai_ai_planner_runs').insert({
          correlation_id:correlationId,
          conversation_id:conversationId,
          mode:'observe',
          model:aiRuntimeCfg?.primary_model||'gpt-5.6-terra',
          reasoning_effort:aiRuntimeCfg?.primary_reasoning_effort||'low',
          context_schema_version:aiContextPack?.schema_version||null,
          context_bytes:Number(aiContextPack?.context_budget?.bytes||0),
          message_length:normalized.messageText.length,
          decision:observedPlanner?.plan?.decision||null,
          confidence:observedPlanner?.plan?.confidence??null,
          commercial_opportunity:observedPlanner?.plan?.commercial_opportunity||null,
          commercial_reason:aiContextPack?.commercial?.reason||null,
          journey_stage:observedPlanner?.plan?.journey_stage||aiContextPack?.journey?.stage||null,
          sales_next_step:observedPlanner?.plan?.sales_next_step||null,
          proactive_offer_requested:Boolean(observedPlanner?.plan?.proactive_offer_requested),
          policy_adjusted:Boolean(observedPlanner?.policy_adjusted),
          policy_violations:Array.isArray(observedPlanner?.policy_violations)?observedPlanner.policy_violations:[],
          proposed_tool_calls:Array.isArray(observedPlanner?.plan?.tool_calls)?observedPlanner.plan.tool_calls:[],
          response_draft:observedPlanner?.plan?.response_draft||null,
          response_id:observedPlanner?.response_id||null,
          input_tokens:Number(usage?.input_tokens||0)||null,
          cached_input_tokens:Number(usage?.input_tokens_details?.cached_tokens||0)||null,
          output_tokens:Number(usage?.output_tokens||0)||null,
          latency_ms:Number(observedPlanner?.latency_ms||0)||null,
          success:observedPlanner?.ok===true,
          error_code:observedPlanner?.ok===true?null:String(observedPlanner?.error||'planner_failed'),
          metadata:{
            planner_version:'v1',
            no_customer_effect:true,
            no_tool_execution:true,
            should_handoff:Boolean(observedPlanner?.plan?.should_handoff)
          }
        });
      }catch{
        observedPlanner={ok:false,error:'observer_internal_error'};
      }
    }

    const historyLimit=Math.max(1,Math.min(12,Number(aiRuntimeCfg?.max_recent_messages||commerceCfg?.max_history_messages||6)));
    const aiRuntimeEnabled=aiRuntimeCfg?.enabled===true;
    const apiKey=(commerceCfg?.ai_enabled===true&&aiRuntimeEnabled)?await resolveOpenAiKey(sb):'';
    const compactHistory=Array.isArray(aiContextPack?.recent_messages)
      ? aiContextPack.recent_messages
          .slice(-historyLimit)
          .map((m:any)=>({
            role:m?.direction==='outbound'?'assistant':'user',
            content:String(m?.text||'').slice(0,Number(aiRuntimeCfg?.max_message_chars||700))
          }))
          .filter((m:any)=>m.content)
      : [];
    let intent=await classifyCommerceIntent({
      message:normalized.messageText,
      history:compactHistory.length?compactHistory:normalized.history.slice(-historyLimit),
      apiKey,
      model:(Deno.env.get('OPENAI_CONVERSATION_MODEL')||aiRuntimeCfg?.utility_model||'gpt-5.6-luna')
    });

    let pendingProductChoice:any=null;
    let pendingChoiceResolution:any=null;
    if(conversationId){
      const pendingChoiceQ=await sb.from('papoai_commerce_pending_actions')
        .select('id,payload,expires_at')
        .eq('conversation_id',conversationId)
        .eq('action_type','product_choice')
        .eq('status','pending')
        .gt('expires_at',new Date().toISOString())
        .order('created_at',{ascending:false})
        .limit(1)
        .maybeSingle();
      if(!pendingChoiceQ.error&&pendingChoiceQ.data){
        pendingProductChoice=pendingChoiceQ.data;
        const selectedItem=pendingProductChoice?.payload?.selected_item||null;
        const proposedItem=pendingProductChoice?.payload?.proposed_candidate||null;
        const awaitingCandidateConfirmation=pendingProductChoice?.payload?.awaiting_selection_confirmation===true;
        const foldedCurrent=foldProductText(normalized.messageText);
        if(selectedItem&&isExplicitPhotoRequest(normalized.messageText)){
          intent={intent:'selected_product_photo',source:'pending_product_choice'};
        }else if(
          proposedItem
          && awaitingCandidateConfirmation
          && /^(sim|s|isso|isso mesmo|esse|essa|pode|pode sim|ok|certo|exato)$/i.test(foldedCurrent)
        ){
          pendingChoiceResolution={
            status:'resolved',
            index:Number(pendingProductChoice?.payload?.proposed_index||0),
            item:proposedItem,
            method:'confirmed_candidate'
          };
          intent={intent:'identify_product_choice',source:'pending_product_choice_confirmation'};
        }else if(
          proposedItem
          && awaitingCandidateConfirmation
          && /^(nao|não|n|outro|outra|nao e|não e|não é)$/i.test(foldedCurrent)
        ){
          intent={intent:'product_choice_reask',source:'pending_product_choice_confirmation'};
        }else{
          pendingChoiceResolution=resolvePendingProductChoiceText(normalized.messageText,pendingProductChoice);
          if(pendingChoiceResolution?.status==='resolved'){
            intent={intent:'identify_product_choice',source:'pending_product_choice'};
          }else if(pendingChoiceResolution?.status==='confirm_candidate'){
            intent={intent:'confirm_product_choice_candidate',source:'pending_product_choice'};
          }else if(pendingChoiceResolution?.status==='ambiguous'){
            intent={intent:'clarify_product_choice',source:'pending_product_choice'};
          }else if(pendingChoiceResolution?.status==='out_of_range'){
            intent={intent:'product_choice_out_of_range',source:'pending_product_choice'};
          }
        }
      }
    }
    let result:any=null;
    let text='';

    if(conversationId){
      const salesStateQ=await sb.from('whatsapp_sales_state')
        .select('awaiting,pending_name,pending_delivery_address,pending_payment_method')
        .eq('conversation_id',conversationId)
        .maybeSingle();
      const awaiting=String(salesStateQ.data?.awaiting||'');

      if(awaiting==='checkout_address_confirmation'){
        intent={intent:'handled_checkout_profile',source:'checkout_address_confirmation'};
        const decision=detectCheckoutYesNo(normalized.messageText);

        if(decision===null){
          const nextQ=await sb.rpc('get_papoai_checkout_next_step_v1',{
            p_conversation_id:conversationId
          });
          result=nextQ.data;
          text=nextQ.data?.prompt
            ||'Só preciso confirmar o endereço de entrega. Ele continua o mesmo que usei acima?';
        }else if(commerceCfg?.write_enabled!==true){
          text='Entendi sua confirmação, mas a gravação do checkout ainda está desativada nesta homologação.';
        }else{
          const addressQ=await sb.rpc('confirm_papoai_checkout_saved_address_v1',{
            p_conversation_id:conversationId,
            p_accept:decision
          });
          if(addressQ.error)throw addressQ.error;

          const nextQ=await sb.rpc('begin_papoai_checkout_v2',{
            p_conversation_id:conversationId
          });
          if(nextQ.error)throw nextQ.error;
          result={address:addressQ.data,next:nextQ.data};

          if(nextQ.data?.step==='needs_human'){
            const queued=await sb.rpc('queue_papoai_commerce_handoff_v1',{
              p_conversation_id:conversationId,
              p_reason:'checkout_question_limit_reached',
              p_summary:'Checkout não ficou completo após o limite de duas perguntas.',
              p_priority:2
            });
            if(queued.error)throw queued.error;
            processingStatus='handoff';responseKind='handoff';
            responseBody=commerceTextResponse({
              text:'Para não ficar te fazendo mais perguntas, vou chamar alguém da nossa equipe para terminar essa confirmação com você.',
              sessionKey:normalized.sessionKey,
              correlationId,
              handoff:true,
              reason:'checkout_question_limit_reached'
            });
          }else{
            text=nextQ.data?.prompt
              ||(decision
                ?'Perfeito. Agora só preciso da forma de pagamento.'
                :'Sem problema. Me mande o novo endereço e a forma de pagamento em uma mensagem.');
          }
        }
      }

      if(
        !responseBody
        && intent.intent!=='handled_checkout_profile'
        && awaiting==='checkout_profile'
      ){
        const currentProfileQ=await sb.rpc('get_papoai_commerce_checkout_profile_v2',{
          p_conversation_id:conversationId
        });
        const currentProfile=currentProfileQ.data||{};
        const needName=!String(currentProfile?.name||'').trim();

        const parsed=await parseCheckoutProfile({
          message:normalized.messageText,
          apiKey,
          model:(Deno.env.get('OPENAI_CONVERSATION_MODEL')||aiRuntimeCfg?.utility_model||'gpt-5.6-luna'),
          needName
        });
        const paymentMethod=extractCheckoutPaymentMethod(normalized.messageText);
        const missing=missingCheckoutProfileFields(parsed,{needName});
        intent={intent:'handled_checkout_profile',source:'checkout_profile_v2'};

        if(missing.length){
          if(commerceCfg?.write_enabled!==true){
            text=checkoutProfileMissingPrompt(missing);
            result={profile:parsed,missing};
          }else{
            const counted=await sb.rpc('record_papoai_checkout_prompt_v1',{
              p_conversation_id:conversationId,
              p_prompt_key:'missing_checkout_profile_fields'
            });
            if(counted.error)throw counted.error;

            if(counted.data?.ok!==true){
              const queued=await sb.rpc('queue_papoai_commerce_handoff_v1',{
                p_conversation_id:conversationId,
                p_reason:'checkout_question_limit_reached',
                p_summary:'Dados de entrega incompletos após duas perguntas de checkout.',
                p_priority:2
              });
              if(queued.error)throw queued.error;
              processingStatus='handoff';responseKind='handoff';
              responseBody=commerceTextResponse({
                text:'Para não te prender aqui com mais perguntas, vou chamar alguém da nossa equipe para confirmar seus dados de entrega.',
                sessionKey:normalized.sessionKey,
                correlationId,
                handoff:true,
                reason:'checkout_question_limit_reached'
              });
            }else{
              text=checkoutProfileMissingPrompt(missing);
              result={profile:parsed,missing,question_count:counted.data?.question_count};
            }
          }
        }else if(commerceCfg?.write_enabled!==true){
          text='Perfeito, entendi seus dados. A gravação do checkout ainda está desativada nesta homologação.';
          result={profile:parsed,payment_method:paymentMethod||null};
        }else{
          const saved=await sb.rpc('save_papoai_commerce_checkout_profile_pending_v2',{
            p_conversation_id:conversationId,
            p_name:parsed.name||currentProfile?.name||'',
            p_street:parsed.street,
            p_number:parsed.number,
            p_complement:parsed.complement||'',
            p_neighborhood:parsed.neighborhood,
            p_city:parsed.city,
            p_postal_code:parsed.postal_code||null,
            p_reference:parsed.reference||null,
            p_payment_method:paymentMethod||null
          });
          if(saved.error)throw saved.error;
          result=saved.data;

          if(result?.ok){
            const nextQ=await sb.rpc('get_papoai_checkout_next_step_v1',{
              p_conversation_id:conversationId
            });
            if(nextQ.error)throw nextQ.error;

            if(nextQ.data?.step==='ready_to_prepare_confirmation'){
              const prep=await sb.rpc('prepare_papoai_commerce_order_confirmation_v2',{
                p_conversation_id:conversationId,
                p_payment_method:nextQ.data?.payment_method
              });
              if(prep.error)throw prep.error;
              result={...result,confirmation:prep.data};
              if(prep.data?.ok){
                text=(prep.data?.summary?.message_text||`Total do pedido: ${moneyBR(prep.data?.total)}`)
                  +`\n\nPagamento: **${prep.data?.payment_label||''}**\n\nEstá tudo certo? Posso confirmar o pedido?`;
              }else{
                text='Entendi seus dados, mas ainda preciso revisar uma informação antes de confirmar o pedido.';
              }
            }else if(nextQ.data?.step==='collect_payment'){
              const beginQ=await sb.rpc('begin_papoai_checkout_v2',{
                p_conversation_id:conversationId
              });
              if(beginQ.error)throw beginQ.error;
              if(beginQ.data?.step==='needs_human'){
                const queued=await sb.rpc('queue_papoai_commerce_handoff_v1',{
                  p_conversation_id:conversationId,
                  p_reason:'checkout_question_limit_reached',
                  p_summary:'Forma de pagamento não informada dentro do limite do checkout.',
                  p_priority:2
                });
                if(queued.error)throw queued.error;
                processingStatus='handoff';responseKind='handoff';
                responseBody=commerceTextResponse({
                  text:'Para não ficar te fazendo mais perguntas, vou chamar alguém da equipe para concluir o pagamento e a entrega com você.',
                  sessionKey:normalized.sessionKey,
                  correlationId,
                  handoff:true,
                  reason:'checkout_question_limit_reached'
                });
              }else{
                text=beginQ.data?.prompt||'Como você prefere pagar?';
              }
            }else if(nextQ.data?.step==='needs_human'){
              const queued=await sb.rpc('queue_papoai_commerce_handoff_v1',{
                p_conversation_id:conversationId,
                p_reason:'checkout_question_limit_reached',
                p_summary:'Checkout ainda incompleto após o limite de perguntas.',
                p_priority:2
              });
              if(queued.error)throw queued.error;
              processingStatus='handoff';responseKind='handoff';
              responseBody=commerceTextResponse({
                text:'Vou chamar uma pessoa da nossa equipe para continuar com você. Vou deixar a confirmação do pedido com ela.',
                sessionKey:normalized.sessionKey,
                correlationId,
                handoff:true,
                reason:'checkout_question_limit_reached'
              });
            }else{
              text=nextQ.data?.prompt||'Perfeito. Vamos continuar o fechamento do seu pedido.';
            }
          }else if(result?.reason==='delivery_city_not_supported'){
            text='No momento entregamos em **Cuiabá e Várzea Grande**.';
          }else{
            text='Não consegui validar seu endereço com segurança.';
          }
        }
      }

      if(
        !responseBody
        && intent.intent!=='handled_checkout_profile'
        && awaiting==='payment_method'
      ){
        const paymentMethod=extractCheckoutPaymentMethod(normalized.messageText);
        if(paymentMethod){
          intent={
            intent:'set_payment_method',
            query:paymentMethod,
            source:'checkout_payment_state'
          };
        }
      }
    }

    if(
      !responseBody
      && intent.intent!=='handled_checkout_profile'
      && conversationId
      && commerceCfg?.metadata?.conversation_governor_enabled===true
      && intent.intent==='general'
      && normalized.messageText.length<=80
    ){
      const {data:governorState}=await sb.from('papoai_conversation_governor_state')
        .select('topic_key,clarification_count,last_question_key,last_action,last_reason,context,updated_at')
        .eq('conversation_id',conversationId)
        .maybeSingle();

      const stateAgeMs=governorState?.updated_at
        ? Date.now()-new Date(governorState.updated_at).getTime()
        : Number.POSITIVE_INFINITY;
      const originalQuery=String(governorState?.context?.original_query||'').trim();

      if(
        governorState?.last_action==='ASK'
        && stateAgeMs<=15*60*1000
        && originalQuery
        && ['brand_preference','product_type','budget_or_recommendation'].includes(governorState?.last_question_key||'')
      ){
        intent={
          ...intent,
          intent:'search_products',
          query:`${originalQuery} ${normalized.messageText}`.trim(),
          source:'governor_followup',
          governor_topic_key:governorState.topic_key
        };
      }
    }

    if(
      conversationId
      && commerceCfg?.write_enabled===true
      && intent.intent!=='handled_checkout_profile'
    ){
      const supersede=await sb.rpc('supersede_papoai_commerce_pending_action_v1',{
        p_conversation_id:conversationId,
        p_new_intent:intent.intent
      });
      if(supersede.error)throw supersede.error;
    }

    if(intent.intent==='handled_checkout_profile'){
      // text/responseBody already prepared above.
    }else if(intent.intent==='greeting'&&conversationId){
      const [customerQ,repeatQ]=await Promise.all([
        sb.rpc('get_papoai_commerce_customer_snapshot_v2',{p_conversation_id:conversationId}),
        sb.rpc('preview_papoai_commerce_repeat_last_purchase_v1',{p_conversation_id:conversationId})
      ]);
      const customer=customerQ.data||{};
      const repeat=repeatQ.data||{};
      result={customer,repeat};
      if(customer?.known_customer){
        const name=customer?.person_name||customer?.name||'';
        if(repeat?.available){
          text=`Oi${name?', '+name:''} 😊 Que bom falar com você de novo. Se quiser, posso repetir sua última cesta com os preços de hoje, mostrar nossas cestas ou ver as ofertas.`;
        }else{
          text=`Oi${name?', '+name:''} 😊 Que bom falar com você. Posso te ajudar com cestas, produtos ou ofertas.`;
        }
      }else{
        text='Oi 😊 Bem-vindo à Dona Antônia. Posso te ajudar com cestas básicas, produtos do mercado ou ofertas. O que você precisa hoje?';
      }
    }else if(intent.intent==='delivery_info'){
      const msg=String(normalized.messageText||'').toLowerCase();
      const kq=await sb.from('service_knowledge_items')
        .select('knowledge_key,content')
        .in('knowledge_key',['delivery_area','entrega_taxa_v1','entrega_prazo_11h_v1'])
        .eq('status','published');
      const km=new Map((kq.data||[]).map((x:any)=>[x.knowledge_key,String(x.content||'')]));
      if(/chapada\s+dos\s+guimar[aã]es|\bchapada\b/.test(msg)){
        text='No momento nossas entregas próprias atendem **Cuiabá e Várzea Grande**. Ainda não atendemos Chapada dos Guimarães.';
      }else if(/taxa|frete|gr[aá]tis|gratis/.test(msg)){
        text=km.get('entrega_taxa_v1')||'Não cobramos taxa de entrega.';
      }else if(/hoje|hj|agora|agr|mesmo dia|pr[oó]ximo dia/.test(msg)){
        text=(km.get('entrega_prazo_11h_v1')||'Pedidos feitos até as 11h têm previsão padrão para o mesmo dia; depois disso, para o próximo dia útil.')
          .replace(/\s*Trate isso[\s\S]*$/i,'')
          .trim();
      }else{
        text='Sim 😊 Fazemos entrega em **Cuiabá e Várzea Grande**, sem taxa de entrega.';
      }
      result={source:'published_service_knowledge',read_only:true};
    }else if(intent.intent==='safety_policy'){
      text='Não posso alterar regras comerciais, liberar condição fora do sistema nem fornecer senhas, chaves ou dados internos. Posso te ajudar com produtos, preços, cestas e condições publicadas.';
      result={source:'deterministic_safety_policy',read_only:true};
    }else if(intent.intent==='business_info'){
      const kq=await sb.from('service_knowledge_items')
        .select('knowledge_key,content')
        .in('knowledge_key',['how_to_buy','info_operacao_exclusivamente_por_delivery_mttk8umi_wfuz'])
        .eq('status','published');
      const items=kq.data||[];
      const operation=items.find((x:any)=>x.knowledge_key==='info_operacao_exclusivamente_por_delivery_mttk8umi_wfuz');
      text=operation?.content
        ? String(operation.content)
        : 'A Dona Antônia trabalha com cestas básicas e produtos de mercado por delivery em Cuiabá e Várzea Grande. Você pode comprar direto pelo WhatsApp.';
      result={source:'published_service_knowledge',read_only:true};
    }else if(intent.intent==='delivery_schedule'){
      if(conversationId){
        const queued=await sb.rpc('queue_papoai_commerce_handoff_v1',{
          p_conversation_id:conversationId,
          p_reason:'delivery_schedule_confirmation',
          p_summary:'Cliente pediu confirmação de horário ou janela específica de entrega.',
          p_priority:2
        });
        if(queued.error)throw queued.error;
        result=queued.data;
      }
      processingStatus='handoff';responseKind='handoff';
      responseBody=commerceTextResponse({
        text:'Vou chamar uma pessoa da nossa equipe para continuar com você. O horário exato depende da rota e da operação do dia, então ela confirma essa janela com você.',
        sessionKey:normalized.sessionKey,
        correlationId,
        handoff:true,
        reason:'delivery_schedule_confirmation'
      });
    }else if(intent.intent==='handoff'){
      if(conversationId){
        const queued=await sb.rpc('queue_papoai_commerce_handoff_v1',{
          p_conversation_id:conversationId,
          p_reason:'customer_requested_human',
          p_summary:'Cliente pediu atendimento humano durante conversa no WhatsApp.',
          p_priority:2
        });
        if(queued.error)throw queued.error;
        result=queued.data;
      }
      processingStatus='handoff';responseKind='handoff';
      responseBody=commerceTextResponse({
        text:'Vou chamar uma pessoa da nossa equipe para continuar com você. 😊',
        sessionKey:normalized.sessionKey,
        correlationId,
        handoff:true,
        reason:'customer_requested_human'
      });
    }else if(intent.intent==='basket_disambiguate'){
      const q=await sb.rpc('get_papoai_commerce_basket_catalog_v1');
      const catalog=Array.isArray(q.data)?q.data:[];
      const scale=String(intent.basket||intent.query||'').toLowerCase();
      const matches=catalog.filter((x:any)=>String(x?.name||x?.display_name||'').toLowerCase().includes(scale));
      result=matches;
      if(matches.length>1){
        const names=matches.slice(0,4).map((x:any)=>x?.display_name||x?.name).filter(Boolean);
        text=`Temos ${names.join(' e ')}. Qual delas você quer ver?`;
      }else if(matches.length===1){
        text=`Você quer a **${matches[0]?.display_name||matches[0]?.name}**?`;
      }else{
        text='Tenho mais de uma cesta disponível. Você quer Bonini ou Koblenz?';
      }
    }else if(intent.intent==='list_baskets'){
      const q=await sb.rpc('get_papoai_commerce_basket_catalog_v1');
      result=q.data;
      text=basketsText(result);
    }else if(intent.intent==='basket_detail'){
      const q=await sb.rpc('format_papoai_commerce_basket_message_v1',{p_basket_query:intent.basket||intent.query});
      result=q.data;
      text=result?.message_text||'Não consegui localizar essa cesta. Me diga o nome dela que eu verifico.';
    }else if(intent.intent==='repeat_last_purchase'&&conversationId){
      if(commerceCfg?.write_enabled===true){
        const q=await sb.rpc('execute_papoai_commerce_command_v1',{
          p_conversation_id:conversationId,
          p_command:{type:'repeat_last_purchase'}
        });
        if(q.error)throw q.error;
        result=q.data;
        if(result?.available===false){
          if(result?.reason==='no_purchase_history')text='Ainda não encontrei uma compra anterior para repetir. Posso te mostrar nossas cestas.';
          else if(result?.reason==='basket_not_available')text='Sua última cesta não está disponível atualmente. Posso te mostrar as cestas disponíveis hoje.';
          else text='Não consegui preparar sua última compra para repetição agora.';
        }else{
          const preview=result?.preview||{};
          const basket=preview?.basket||{};
          const warnings=[];
          if(Number(preview?.unavailable_addon_count||0)>0)warnings.push(`${preview.unavailable_addon_count} adicional(is) não está(ão) disponível(is) hoje`);
          if(Number(preview?.adjusted_addon_count||0)>0)warnings.push(`${preview.adjusted_addon_count} adicional(is) precisaria(m) de ajuste de quantidade`);
          if(Number(preview?.historical_substitution_count||0)>0)warnings.push('trocas antigas não serão repetidas automaticamente');
          text=`Encontrei sua última compra 😊\n\nCesta: **${basket.name||'cesta básica'}**\nValor daquela compra: **${moneyBR(preview?.historical_total)}**\nEstimativa com preços e disponibilidade de hoje: **${moneyBR(preview?.current_estimate)}**`
            +(warnings.length?`\n\nObservação: ${warnings.join('; ')}.`:'')
            +'\n\nQuer que eu monte novamente com as condições de hoje?';
        }
      }else{
        const q=await sb.rpc('preview_papoai_commerce_repeat_last_purchase_v1',{p_conversation_id:conversationId});
        result=q.data;
        if(result?.available){
          text=`Sua última cesta foi **${result?.basket?.name||'cesta básica'}**. Pelas condições atuais, a estimativa seria **${moneyBR(result?.current_estimate)}**. A montagem do carrinho ainda está desativada nesta homologação.`;
        }else text='Não encontrei uma compra anterior disponível para repetir.';
      }
    }else if(intent.intent==='delegated_value_replacement'&&conversationId){
      const commandType=commerceCfg?.write_enabled===true?'propose_value_replacement':'recommend_value_replacement';
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{
        p_conversation_id:conversationId,
        p_command:{type:commandType,source_query:intent.source_query,limit:3}
      });
      if(q.error)throw q.error;
      result=q.data||{};
      const options=Array.isArray(result?.options)?result.options:[];
      if(result?.needs_clarification){
        const names=(Array.isArray(result?.source_candidates)?result.source_candidates:[])
          .slice(0,3).map((x:any)=>x.name).filter(Boolean);
        text=names.length
          ? `Encontrei mais de um item parecido no seu pedido: ${names.join(', ')}. Qual deles você quer retirar?`
          : 'Não consegui identificar com segurança qual item você quer retirar.';
      }else if(!result?.ok||!options.length){
        text='Não encontrei uma substituição segura e com valor próximo para esse item agora.';
      }else{
        const source=result?.source?.name||intent.source_query;
        const budget=moneyBR(result?.replacement_budget);
        text=`Posso escolher por você 😊 Se eu retirar **${source}**, tenho cerca de **${budget}** para substituir sem mudar muito o valor da cesta.\n\n${valueReplacementOptionsText(options)}\n\nQual dessas você prefere? Pode responder **1, 2 ou 3**.`;
        if(commerceCfg?.write_enabled!==true){
          text+='\n\n(Nesta homologação a aplicação da troca ainda está desativada.)';
        }
      }
    }else if(intent.intent==='identify_product_choice'&&conversationId&&pendingProductChoice){
      const resolved=pendingChoiceResolution;
      const selected=resolved?.item||null;
      if(!selected){
        text='Não consegui identificar qual item da lista você escolheu. Pode me passar o número da opção?';
      }else{
        const nextPayload={
          ...(pendingProductChoice.payload||{}),
          selected_index:Number(resolved.index||0),
          selected_item:selected,
          selection_method:String(resolved.method||'contextual'),
          selected_at:new Date().toISOString(),
          awaiting_selection_confirmation:false,
          proposed_candidate:null,
          proposed_index:null
        };
        await sb.from('papoai_commerce_pending_actions')
          .update({payload:nextPayload,updated_at:new Date().toISOString()})
          .eq('id',pendingProductChoice.id);

        result={selected,items:[selected],force_media_url:null};
        text=`✅ Entendi: **${selected.name}** — **${moneyBR(selected.commercial_price??selected.offer_price??selected.regular_price)}**.`;
        if(!isBasicStapleProduct(selected)&&selected?.image_url){
          text+='\n\nSe quiser conferir antes, posso mandar a foto desse produto.';
        }
        if(commerceCfg?.write_enabled===true){
          text+='\n\nQuer adicionar esse item ao pedido?';
        }
      }
    }else if(intent.intent==='confirm_product_choice_candidate'&&conversationId){
      const candidate=pendingChoiceResolution?.item||null;
      if(candidate){
        if(pendingProductChoice?.id){
          await sb.from('papoai_commerce_pending_actions')
            .update({
              payload:{
                ...(pendingProductChoice.payload||{}),
                proposed_candidate:candidate,
                proposed_index:Number(pendingChoiceResolution?.index||0),
                awaiting_selection_confirmation:true,
                proposed_at:new Date().toISOString()
              },
              updated_at:new Date().toISOString()
            })
            .eq('id',pendingProductChoice.id);
        }
        text=`Você quis dizer **${candidate.name} — ${moneyBR(candidate.commercial_price??candidate.offer_price??candidate.regular_price)}**?`;
        result={items:[candidate],candidate};
      }else{
        text='Não consegui confirmar qual item você quis dizer. Pode me passar o número da opção?';
        result={items:[]};
      }
    }else if(intent.intent==='product_choice_reask'&&conversationId){
      const count=Array.isArray(pendingProductChoice?.payload?.candidates)
        ? pendingProductChoice.payload.candidates.length
        : 0;
      text=count
        ? `Tudo bem. Me diga o **número do produto** na lista, de 1 a ${count}.`
        : 'Tudo bem. Me diga novamente qual produto você procura.';
      result={items:[]};
    }else if(intent.intent==='clarify_product_choice'&&conversationId){
      const matches=Array.isArray(pendingChoiceResolution?.matches)?pendingChoiceResolution.matches:[];
      const rows=matches.map((x:any)=>`${x.index}. ${x.item?.name} — ${moneyBR(x.item?.commercial_price??x.item?.offer_price??x.item?.regular_price)}`);
      text=rows.length
        ? `Encontrei mais de uma opção parecida:\n\n${rows.join('\n')}\n\nQual delas você quer? Pode responder pelo número.`
        : 'Encontrei mais de uma opção parecida. Pode me passar o número do produto na lista?';
      result={items:matches.map((x:any)=>x.item)};
    }else if(intent.intent==='product_choice_out_of_range'){
      text=`Essa opção não existe nessa lista. Escolha um número de **1 a ${pendingChoiceResolution?.candidate_count||20}**.`;
      result={items:[]};
    }else if(intent.intent==='selected_product_photo'&&conversationId&&pendingProductChoice){
      const selected=pendingProductChoice?.payload?.selected_item||null;
      if(selected?.image_url){
        text=`📷 Aqui está **${selected.name}** — **${moneyBR(selected.commercial_price??selected.offer_price??selected.regular_price)}**.`;
        result={selected,items:[selected],force_media_url:selected.image_url};
      }else{
        text='Esse produto não tem uma foto disponível no catálogo agora.';
        result={selected,items:selected?[selected]:[]};
      }
    }else if(intent.intent==='search_products'&&conversationId){
      const governorEnabled=commerceCfg?.metadata?.conversation_governor_enabled===true;
      const productQuery=intent.query||normalized.messageText;
      const catalogList=isCatalogListRequest(normalized.messageText);

      if(catalogList){
        const q=await sb.rpc('execute_papoai_commerce_command_v1',{
          p_conversation_id:conversationId,
          p_command:{type:'propose_product_choice',query:productQuery,limit:20}
        });
        if(q.error)throw q.error;
        const choices=Array.isArray(q.data?.candidates)?q.data.candidates:[];
        result={...(q.data||{}),items:choices};
        if(!choices.length){
          text='Não encontrei esse produto disponível agora. Se quiser, me diga outra marca, tamanho ou tipo.';
        }else if(choices.length===1){
          const p=choices[0];
          text=`🛒 Encontrei:\n\n1. ${p.name} — ${moneyBR(p.commercial_price)}`;
          if(!isBasicStapleProduct(p)&&p?.image_url)text+='\n\nSe quiser conferir, posso mandar a foto.';
          if(commerceCfg?.write_enabled===true)text+='\n\nQuer adicionar esse item ao pedido?';
        }else{
          text=`🛒 Encontrei ${choices.length} opções:\n\n${numberedProductsText(choices,20)}\n\nResponda com o **número da opção**. Se preferir, pode escrever o nome e um valor aproximado, por exemplo: “OMO de 19 reais”.`;
        }
      }else if(governorEnabled){
        const broadQ=await sb.rpc('search_papoai_commerce_products_for_customer_v1',{
          p_conversation_id:conversationId,
          p_query:productQuery,
          p_limit:12
        });
        if(broadQ.error)throw broadQ.error;
        const broadItems=Array.isArray(broadQ.data?.items)?broadQ.data.items:[];
        const hasStrongPersonalization=broadItems.some((item:any)=>
          Number(item?.personalization?.direct_bonus||0)>0
          || Number(item?.personalization?.frequent_bonus||0)>0
        );
        const topicKey=intent?.governor_topic_key
          || buildGovernorTopicKey({intent:'search_products',query:productQuery});
        const stateQ=await sb.rpc('get_papoai_conversation_governor_state_v1',{
          p_conversation_id:conversationId,
          p_topic_key:topicKey
        });
        const governor=decideConversationAction({
          intent:'search_products',
          message:normalized.messageText,
          query:productQuery,
          items:broadItems,
          candidateCount:broadItems.length,
          resultLimit:12,
          clarificationCount:Number(stateQ.data?.clarification_count||0),
          hasStrongPersonalization
        });

        const recorded=await sb.rpc('record_papoai_conversation_governor_decision_v1',{
          p_conversation_id:conversationId,
          p_topic_key:governor.topicKey,
          p_intent:'search_products',
          p_action:governor.action,
          p_reason:governor.reason,
          p_candidate_count:broadItems.length,
          p_delegated:Boolean(governor.delegated),
          p_question_key:governor.questionKey||null,
          p_metadata:{
            result_limit:12,
            candidate_sample_count:broadItems.length,
            governor_version:'v1',
            original_query:String(stateQ.data?.context?.original_query||productQuery),
            strong_personalization:hasStrongPersonalization,
            search_personalized:Boolean(broadQ.data?.personalized)
          }
        });
        const finalAction=recorded.data?.action||governor.action;

        if(finalAction==='ASK'){
          result={governor:recorded.data||governor,items:[]};
          text=governor.question||'Posso fazer uma pergunta rápida para encontrar opções melhores para você?';
        }else if(finalAction==='RECOMMEND'){
          const q=await sb.rpc('execute_papoai_commerce_command_v1',{
            p_conversation_id:conversationId,
            p_command:{type:'propose_product_choice',query:productQuery,limit:3}
          });
          if(q.error)throw q.error;
          const recommendations=Array.isArray(q.data?.candidates)?q.data.candidates:[];
          result={...(q.data||{}),governor:recorded.data||governor,items:recommendations};
          text=recommendations.length
            ? `Eu escolheria estas opções para você:\n\n${numberedProductsText(recommendations,3)}\n\nSe quiser, pode responder **1, 2 ou 3**.`
            : 'Não encontrei uma opção segura para recomendar agora.';
        }else{
          const responseLimit=Math.max(1,Math.min(10,Number(governor?.maxResults||3)));
          const q=await sb.rpc('execute_papoai_commerce_command_v1',{
            p_conversation_id:conversationId,
            p_command:{type:'propose_product_choice',query:productQuery,limit:responseLimit}
          });
          if(q.error)throw q.error;
          const choices=Array.isArray(q.data?.candidates)?q.data.candidates:[];
          result={...(q.data||{}),governor:recorded.data||governor,items:choices};
          if(!choices.length){
            text='Não encontrei um produto disponível que combine bem com o que você pediu.';
          }else if(choices.length===1){
            const p=choices[0];
            text=`Encontrei **${p.name}** por **${moneyBR(p.commercial_price)}**. Quer que eu adicione ao pedido?`;
          }else{
            text=`Encontrei estas opções:\n\n${numberedProductsText(choices,responseLimit)}\n\nQual você prefere? Pode responder pelo **número da opção**.`;
          }
        }
      }else{
        const q=await sb.rpc('execute_papoai_commerce_command_v1',{
          p_conversation_id:conversationId,
          p_command:{type:'propose_product_choice',query:productQuery,limit:5}
        });
        if(q.error)throw q.error;
        const choices=Array.isArray(q.data?.candidates)?q.data.candidates:[];
        result={...(q.data||{}),items:choices};
        if(!choices.length){
          text='Não encontrei um produto disponível que combine bem com o que você pediu.';
        }else if(choices.length===1){
          const p=choices[0];
          text=`Encontrei **${p.name}** por **${moneyBR(p.commercial_price)}**. Quer que eu adicione ao pedido?`;
        }else{
          text=`Encontrei estas opções:\n\n${numberedProductsText(choices,5)}\n\nQual você prefere? Pode responder pelo **número da opção**.`;
        }
      }
    }else if(intent.intent==='search_products'){
      const q=await sb.rpc('search_papoai_commerce_products_v1',{p_query:intent.query||normalized.messageText,p_limit:20});
      result=q.data;
      text=productsText(result?.items||[],20);
    }else if(intent.intent==='select_product_choice'&&conversationId){
      if(commerceCfg?.write_enabled!==true){
        text='A escolha foi entendida, mas a gravação do carrinho ainda está desativada nesta homologação.';
      }else{
        const pending=await sb.rpc('get_papoai_commerce_pending_action_v1',{p_conversation_id:conversationId});
        const pendingType=pending.data?.action_type||'';
        const command=pendingType==='value_replacement'
          ? {type:'select_value_replacement',selection:intent.quantity}
          : {type:'select_product_choice',selection:intent.quantity,quantity:1};

        const q=await sb.rpc('execute_papoai_commerce_command_v1',{
          p_conversation_id:conversationId,
          p_command:command
        });
        if(q.error)throw q.error;
        result=q.data||{};

        if(pendingType==='value_replacement'&&q.data?.ok){
          text=(q.data?.summary?.message_text||'Pronto 😊 Fiz a substituição escolhida.')
            +`\n\nA substituição usou aproximadamente **${moneyBR(q.data?.replacement?.total_value)}** do valor retirado.`;
        }else{
          const selected=q.data?.selected||null;
          result={...(q.data||{}),items:selected?[selected]:[]};
          if(q.data?.ok&&selected){
            text=`Pronto 😊 Adicionei **${selected.name}**. O total atual do pedido é **${moneyBR(q.data?.cart?.total)}**.`;
            if(q.data?.offer_event?.recorded!==true){
              const proactive=await maybeProactiveOffer(sb,conversationId);
              if(proactive){
                result={...result,proactive_offer:proactive,items:[selected,proactive.offer]};
                text+=`\n\n${proactive.text}`;
              }
            }
          }else if(q.data?.reason==='product_choice_expired'||q.data?.reason==='no_pending_product_choice'){
            text='Essas opções já não estão mais ativas. Me diga novamente qual produto você procura que eu atualizo a busca.';
          }else if(q.data?.reason==='value_replacement_expired'||q.data?.reason==='no_pending_value_replacement'){
            text='Essas sugestões de troca já expiraram. Me diga novamente o item que quer retirar e eu recalculo com os preços atuais.';
          }else if(q.data?.reason==='cart_changed_recommend_again'){
            text='Seu pedido mudou desde que eu montei aquelas sugestões. Vou precisar recalcular a troca para não alterar o valor errado.';
          }else if(q.data?.reason==='selection_out_of_range'){
            text=`Essa opção não existe nessa lista. Escolha um número de 1 a ${q.data?.candidate_count||3}.`;
          }else{
            text='Não consegui aplicar essa escolha com segurança. Me diga novamente qual opção você quer.';
          }
        }
      }
    }else if(intent.intent==='offers'&&conversationId){
      const q=await sb.rpc('propose_papoai_commerce_offer_choice_v1',{
        p_conversation_id:conversationId,
        p_limit:10
      });
      if(q.error)throw q.error;
      const offers=Array.isArray(q.data?.candidates)?q.data.candidates:[];
      result={...(q.data||{}),items:offers};
      if(!offers.length){
        text='Não encontrei ofertas ativas para te mostrar agora.';
      }else{
        text=`🔥 Ofertas disponíveis\n\n${numberedProductsText(offers,10)}\n\nSe quiser alguma, pode responder pelo número.`;
      }
    }else if(intent.intent==='customer_context'&&conversationId){
      const q=await sb.rpc('get_papoai_commerce_customer_snapshot_v2',{p_conversation_id:conversationId});
      result=q.data;
      text=result?.known_customer&&result?.person_name?`Encontrei seu cadastro, ${result.person_name}. Como posso ajudar hoje?`:'Posso te ajudar com cestas, produtos e ofertas.';
    }else if(intent.intent==='cart_state'&&conversationId){
      const q=await sb.rpc('get_papoai_commerce_cart_state_v1',{p_conversation_id:conversationId});
      result=q.data;
      text=result?.has_cart?`Seu pedido está em ${moneyBR(result.total)}.`:'Você ainda não começou um pedido.';
    }else if(intent.intent==='cart_summary'&&conversationId){
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{
        p_conversation_id:conversationId,p_command:{type:'cart_summary'}
      });
      if(q.error)throw q.error;
      result=q.data;
      text=result?.message_text||'Você ainda não começou um pedido.';
    }else if(intent.intent==='checkout_readiness'&&conversationId){
      const q=commerceCfg?.write_enabled===true
        ? await sb.rpc('begin_papoai_checkout_v2',{p_conversation_id:conversationId})
        : await sb.rpc('get_papoai_checkout_next_step_v1',{p_conversation_id:conversationId});
      if(q.error)throw q.error;
      result=q.data||{};
      const step=String(result?.step||'');

      if(step==='cart_missing'){
        text='Você ainda não começou um pedido. Posso te mostrar nossas cestas ou produtos.';
      }else if(['confirm_saved_address','collect_profile','collect_payment'].includes(step)){
        text=result?.prompt||'Só preciso confirmar alguns dados para finalizar.';
      }else if(step==='ready_to_prepare_confirmation'){
        if(commerceCfg?.write_enabled===true){
          const prep=await sb.rpc('prepare_papoai_commerce_order_confirmation_v2',{
            p_conversation_id:conversationId,
            p_payment_method:result?.payment_method||null
          });
          if(prep.error)throw prep.error;
          result=prep.data||{};
          text=result?.ok
            ? (result?.summary?.message_text||`Total do pedido: ${moneyBR(result?.total)}`)
              +`\n\nPagamento: **${result?.payment_label||''}**\n\nEstá tudo certo? Posso confirmar o pedido?`
            :'Não consegui preparar a confirmação final agora.';
        }else{
          const preview=await sb.rpc('get_papoai_order_preview_v2',{
            p_conversation_id:conversationId,
            p_payment_method:result?.payment_method||null
          });
          result=preview.data||result;
          text=(result?.summary?.message_text||'Seu pedido está pronto para revisão.')
            +'\n\nA confirmação final ainda está desativada nesta homologação.';
        }
      }else if(step==='awaiting_final_confirmation'){
        const pending=result?.pending_action||{};
        text=`Seu pedido já está pronto para a confirmação final, no valor de **${moneyBR(pending?.prepared_total)}**. Se estiver tudo certo, pode me dizer **confirmo**.`;
      }else if(step==='needs_human'){
        if(commerceCfg?.write_enabled===true){
          const queued=await sb.rpc('queue_papoai_commerce_handoff_v1',{
            p_conversation_id:conversationId,
            p_reason:'checkout_question_limit_reached',
            p_summary:'Checkout precisa de ajuda humana após o limite de duas perguntas.',
            p_priority:2
          });
          if(queued.error)throw queued.error;
        }
        processingStatus='handoff';responseKind='handoff';
        responseBody=commerceTextResponse({
          text:'Para não te prender em mais perguntas, vou chamar alguém da nossa equipe para finalizar com você.',
          sessionKey:normalized.sessionKey,
          correlationId,
          handoff:true,
          reason:'checkout_question_limit_reached'
        });
      }else{
        text='Vou revisar o pedido antes de finalizar.';
      }
    }else if((intent.intent==='confirm_pending'||intent.intent==='cancel_pending')&&conversationId){
      const pending=await sb.rpc('get_papoai_commerce_pending_action_v1',{p_conversation_id:conversationId});
      if(!pending.data?.has_pending&&intent.intent==='cancel_pending'){
        text='Tudo certo. Não há nenhuma alteração pendente.';
      }else if(commerceCfg?.write_enabled!==true){
        text='A alteração está identificada, mas a gravação do pedido ainda está desativada.';
      }else{
        const q=await sb.rpc('execute_papoai_commerce_command_v1',{
          p_conversation_id:conversationId,
          p_command:{type:'confirm_pending',confirm:intent.intent==='confirm_pending'}
        });
        if(q.error)throw q.error;
        result=q.data;
        if(result?.cancelled)text='Tudo bem 😊 Não fiz a alteração.';
        else if(result?.confirmed&&result?.action_type==='replace_basket_item'){
          const total=result?.result?.cart?.total;
          text=`Pronto 😊 Fiz a troca. O valor atual do pedido é ${moneyBR(total)}.`;
        }else if(result?.confirmed&&result?.action_type==='confirm_order'){
          const order=result?.result||{};
          text=`Pedido confirmado ✅\n\nNúmero: **${order.order_number||''}**\nTotal: **${moneyBR(order.total)}**\nPagamento: **${order.payment_label||order.payment_method||''}**\n\nAgora vamos seguir com a separação e entrega.`;
        }else if(result?.confirmed&&result?.action_type==='repeat_last_purchase'){
          const repeated=result?.result||{};
          text=(repeated?.summary?.message_text||`Montei novamente sua ${repeated?.basket_name||'última cesta'}.`)
            +'\n\nQuer alterar alguma coisa ou podemos seguir para finalizar?';
        }else if(result?.confirmed&&result?.action_type==='delegated_replacement'){
          const applied=result?.result||{};
          text=(applied?.summary?.message_text||'Pronto 😊 Fiz a substituição.')
            +'\n\nA troca foi aplicada e o total já foi recalculado.';
        }else if(result?.confirmed&&result?.action_type==='product_choice'){
          const selected=result?.result?.selected||null;
          const cart=result?.result?.cart||{};
          result={...result,items:selected?[selected]:[]};
          text=selected
            ? `Pronto 😊 Adicionei **${selected.name}**. O total atual do pedido é **${moneyBR(cart.total)}**.`
            : 'Pronto 😊 Adicionei o produto ao pedido.';
        }else if(result?.reason==='product_selection_required'){
          const candidates=Array.isArray(result?.candidates)?result.candidates:[];
          result={...result,items:candidates};
          text=`Tenho mais de uma opção:\n\n${numberedProductsText(candidates)}\n\nQual você prefere? Responda **1, 2 ou 3**.`;
        }else if(result?.reason==='cart_changed_reconfirm'){
          text=(result?.summary?.message_text||'Seu pedido mudou desde a última confirmação.')
            +'\n\nO carrinho mudou antes da confirmação, então não finalizei. Confira o novo resumo e me diga a forma de pagamento novamente.';
        }else text='Não consegui confirmar essa alteração. Vou precisar que você me diga novamente o que deseja fazer.';
      }
    }else if(intent.intent==='payment_info'){
      const policyQ=await sb.from('service_knowledge_items')
        .select('knowledge_key,title,content')
        .eq('knowledge_key','payment_baseline')
        .eq('status','published')
        .maybeSingle();
      result={
        policy_key:policyQ.data?.knowledge_key||'payment_baseline',
        source:'published_service_knowledge',
        read_only:true
      };
      text=String(policyQ.data?.content||'Aceitamos Pix, dinheiro, cartão de débito, cartão de crédito e cartão alimentação/refeição. Não vendemos para 30 dias nem boleto.')
        .replace(/\s*Nunca invente[\s\S]*$/i,'')
        .trim();
    }else if(intent.intent==='set_payment_method'&&conversationId&&commerceCfg?.write_enabled===true){
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{
        p_conversation_id:conversationId,
        p_command:{type:'prepare_order_confirmation',payment_method:intent.query}
      });
      if(q.error)throw q.error;
      result=q.data;
      if(result?.needs_payment_method){
        text='Qual forma de pagamento você prefere? Pode ser Pix, dinheiro, cartão de crédito ou cartão alimentação/refeição.';
      }else if(result?.checkout_not_ready){
        const missing=Array.isArray(result?.missing)?result.missing:[];
        if(missing.includes('checkout_profile')){
          const profileQ=await sb.rpc('begin_papoai_checkout_v2',{p_conversation_id:conversationId});
          if(profileQ.error)throw profileQ.error;
          result={...result,checkout_profile:profileQ.data};
          text=profileQ.data?.prompt||'Antes de confirmar, preciso completar seus dados de entrega.';
        }else{
          text='Seu pedido ainda precisa de uma validação antes da confirmação.';
        }
      }else if(result?.ok){
        text=(result?.summary?.message_text||`Total do pedido: ${moneyBR(result?.total)}`)
          +`\n\nPagamento: **${result?.payment_label||intent.query}**\n\nEstá tudo certo? Posso confirmar o pedido?`;
      }else{
        text='Não consegui preparar a confirmação do pedido agora. Vou precisar revisar os dados com você.';
      }
    }else if(intent.intent==='start_basket'&&conversationId&&commerceCfg?.write_enabled===true){
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{p_conversation_id:conversationId,p_command:{type:'start_basket',basket:intent.basket}});
      if(q.error)throw q.error;
      result=q.data;
      text=`Certo 😊 Comecei a ${result?.basket?.display_name||result?.basket?.name||intent.basket}. O valor atual é ${moneyBR(result?.cart?.total)}. Você quer receber assim ou personalizar algum item?`;
      const proactive=await maybeProactiveOffer(sb,conversationId);
      if(proactive){
        result={...result,proactive_offer:proactive,items:[proactive.offer]};
        text+=`\n\n${proactive.text}`;
      }
    }else if(intent.intent==='set_basket_quantity'&&conversationId&&commerceCfg?.write_enabled===true){
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{
        p_conversation_id:conversationId,
        p_command:{type:'set_basket_quantity',source_query:intent.source_query,quantity:intent.quantity}
      });
      if(q.error)throw q.error;
      result=q.data;
      if(result?.needs_clarification){
        const names=(Array.isArray(result?.candidates)?result.candidates:[]).slice(0,3).map((x:any)=>x.name).filter(Boolean);
        text=names.length?`Encontrei mais de uma possibilidade: ${names.join(', ')}. Qual deles você quer alterar?`:'Não consegui identificar com segurança qual item você quer alterar.';
      }else{
        text=`Pronto 😊 Atualizei o item. O valor atual da cesta ficou em ${moneyBR(result?.cart?.total)}.`;
      }
    }else if(intent.intent==='set_addon_quantity'&&conversationId&&commerceCfg?.write_enabled===true){
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{
        p_conversation_id:conversationId,
        p_command:{type:'set_addon_quantity',query:intent.query||normalized.messageText,quantity:intent.quantity||1}
      });
      if(q.error)throw q.error;
      result=q.data;
      if(result?.needs_clarification){
        const candidates=(Array.isArray(result?.candidates)?result.candidates:[]).slice(0,4);
        text=candidates.length?`Encontrei estas opções:\n\n${productsText(candidates)}\n\nQual delas você quer adicionar?`:'Não consegui identificar com segurança qual produto você quer adicionar.';
      }else{
        text=`Pronto 😊 Adicionei ${result?.resolved?.name||'o produto'}. O total atual é ${moneyBR(result?.cart?.total)}.`;
        const proactive=await maybeProactiveOffer(sb,conversationId);
        if(proactive){
          result={...result,proactive_offer:proactive,items:[proactive.offer]};
          text+=`\n\n${proactive.text}`;
        }
      }
    }else if(intent.intent==='replace_basket_item'&&conversationId&&commerceCfg?.write_enabled===true){
      const delegated=detectCustomerDelegation(normalized.messageText)
        || !String(intent.replacement_query||'').trim()
        || /^(outra coisa|algo diferente)$/i.test(String(intent.replacement_query||'').trim());

      if(delegated){
        const q=await sb.rpc('execute_papoai_commerce_command_v1',{
          p_conversation_id:conversationId,
          p_command:{
            type:'propose_value_replacement',
            source_query:intent.source_query
          }
        });
        if(q.error)throw q.error;
        result=q.data;

        if(result?.needs_clarification){
          const sourceCandidates=Array.isArray(result?.source_candidates)?result.source_candidates:[];
          text=sourceCandidates.length
            ? `Quero ter certeza de qual item você quer tirar. Encontrei: ${sourceCandidates.slice(0,3).map((x:any)=>x.name).join(', ')}. Qual deles é?`
            : 'Qual item da cesta você quer tirar?';
        }else if(result?.ok){
          const option=result?.selected_option||result?.options?.[0]||null;
          const sourceName=result?.source?.name||intent.source_query||'esse item';
          const diff=Number(option?.difference_value??option?.difference??0);
          const diffText=Math.abs(diff)<=0.01
            ? 'o valor fica praticamente igual'
            : diff>0
              ? `a diferença fica em **+${moneyBR(diff)}**`
              : `a diferença fica em **-${moneyBR(Math.abs(diff))}**`;
          text=`Eu faria assim: tiro **${sourceName}** e coloco **${replacementOptionText(option)}**. ${diffText}. Quer que eu faça?`;
        }else{
          text='Não encontrei uma combinação segura e próxima do valor para substituir esse item. Posso tentar outra ideia se você me disser o que prefere manter na cesta.';
        }
      }else{
        const q=await sb.rpc('execute_papoai_commerce_command_v1',{
          p_conversation_id:conversationId,
          p_command:{
            type:'propose_replacement',
            source_query:intent.source_query,
            replacement_query:intent.replacement_query
          }
        });
        if(q.error)throw q.error;
        result=q.data;
        if(result?.needs_clarification){
          const candidates=(Array.isArray(result?.candidates)?result.candidates:[]).slice(0,4);
          text=candidates.length?`Encontrei estas possibilidades para a troca:\n\n${productsText(candidates)}\n\nQual delas você quer?`:'Não encontrei uma troca segura para esses produtos. Me diga com mais detalhes qual produto você quer colocar no lugar.';
        }else{
          const from=result?.source?.name||intent.source_query;
          const to=result?.replacement?.name||intent.replacement_query;
          text=`Posso trocar **${from}** por **${to}**. Quer que eu faça essa troca?`;
        }
      }
    }else if(['set_basket_quantity','set_addon_quantity','replace_basket_item'].includes(intent.intent)){
      text='Entendi a alteração. A gravação do pedido ainda está desativada, então não vou mexer no carrinho agora.';
    }else{
      const q=await sb.rpc('search_papoai_commerce_products_v1',{p_query:intent.query||normalized.messageText,p_limit:3});
      result=q.data;
      if(result?.items?.length)text=productsText(result.items);
      else text='Posso te ajudar com nossas cestas, produtos, ofertas ou com um pedido. O que você está procurando?';
    }

    if(!responseBody){
      const explicitMedia=isExplicitPhotoRequest(normalized.messageText);
      const mediaUrl=result?.force_media_url
        ||(explicitMedia
          ? (result?.image_url||result?.basket?.image_url||(result?.items?.length===1?result.items[0]?.image_url:null)||null)
          : null);
      responseBody=commerceTextResponse({text,mediaUrl,sessionKey:normalized.sessionKey,correlationId});
    }
  }

  if(
    commerceEnabled
    && !labHumanActive
    && lab.enabled!==true
    && responseBody
    && !responseBody?.silent
  ){
    let requestedType=responseBody?.handoff
      ? 'handoff'
      : responseBody?.message?.media_type==='audio'
        ? 'voice'
        : responseBody?.message?.media_url
          ? 'image_caption'
          : 'text';

    const customerWantsVoice=
      normalized.messageType==='audio'
      || aiContextPack?.conversation?.response_preference==='audio';

    if(
      requestedType==='text'
      && customerWantsVoice
      && channelRuntimeCfg?.enabled===true
      && channelRuntimeCfg?.outbound_voice_enabled===true
      && channelCapabilityVerified({capabilities:channelCapabilities},'voice')
      && typeof responseBody?.message?.text==='string'
      && responseBody.message.text.trim()
    ){
      const key=await resolveOpenAiKey(sb);
      ttsResult=await synthesizeVoiceToStorage({
        text:responseBody.message.text,
        apiKey:key,
        model:channelRuntimeCfg?.tts_model||'gpt-4o-mini-tts',
        voice:channelRuntimeCfg?.tts_voice||'marin',
        instructions:channelRuntimeCfg?.tts_instructions||'',
        supabase:sb,
        bucket:channelRuntimeCfg?.media_storage_bucket||'shopping-room-media',
        correlationId
      });
      if(ttsResult?.ok){
        requestedType='voice';
        await sb.from('papoai_media_processing_runs').insert({
          correlation_id:correlationId,
          conversation_id:conversationId,
          media_kind:'audio',
          operation:'tts',
          model:ttsResult?.model||channelRuntimeCfg?.tts_model||null,
          success:true,
          input_bytes:Number(ttsResult?.input_bytes||0)||null,
          latency_ms:Number(ttsResult?.latency_ms||0)||null,
          metadata:{voice:ttsResult?.voice||channelRuntimeCfg?.tts_voice||null}
        });
      }
    }

    const deliveryPayload={
      text:responseBody?.message?.text||'',
      media_url:requestedType==='voice'
        ? ttsResult?.media_url
        : responseBody?.message?.media_url||null
    };

    const resolved=await sb.rpc('resolve_papoai_channel_delivery_v1',{
      p_requested_type:requestedType,
      p_payload:deliveryPayload
    });
    if(!resolved.error&&resolved.data){
      channelResolution=resolved.data;
      responseBody=buildPapoAiExternalDelivery({
        requestedType,
        resolution:channelResolution,
        payload:deliveryPayload,
        sessionKey:normalized.sessionKey,
        correlationId,
        handoff:Boolean(responseBody?.handoff),
        reason:responseBody?.reason||null
      });
      responseKind=channelResolution?.resolved_type||responseKind;

      await sb.from('papoai_channel_delivery_audit').insert({
        correlation_id:correlationId,
        conversation_id:conversationId,
        requested_type:requestedType,
        resolved_type:channelResolution?.resolved_type||'text',
        capability_key:channelResolution?.capability||null,
        capability_state:channelResolution?.capability_state||null,
        fallback_used:Boolean(channelResolution?.fallback_used),
        fallback_reason:channelResolution?.fallback_used
          ? String(channelResolution?.reason||'fallback')
          : null,
        payload_summary:{
          has_text:Boolean(deliveryPayload.text),
          has_media_url:Boolean(deliveryPayload.media_url),
          tts_generated:Boolean(ttsResult?.ok)
        }
      });
    }
  }

  if(
    commerceEnabled
    && commerceCfg?.canonical_message_persistence_enabled!==false
    && ingested?.conversation_id
    && responseBody?.message
    && typeof responseBody.message.text==='string'
    && responseBody.message.text.trim()
  ){
    try{
      await sb.rpc('persist_papoai_commerce_message_v1',{
        p_conversation_id:ingested.conversation_id,
        p_direction:'outbound',
        p_message_type:responseBody?.message?.media_url?'image':'text',
        p_body_text:responseBody.message.text,
        p_external_message_key:'out:'+providerEventKey,
        p_metadata:{
          correlation_id:correlationId,
          provider_event_key:providerEventKey,
          provider_session_key:normalized.sessionKey,
          handoff:Boolean(responseBody?.handoff),
          media:Boolean(responseBody?.message?.media_url)
        }
      });
    }catch{}
  }

  await sb.from('channel_provider_agent_lab_calls').update({
    processing_status:processingStatus,response_kind:responseKind,http_status:200,duration_ms:Date.now()-started,
    response_summary:{
      handoff:Boolean(responseBody?.handoff),
      silent:Boolean(responseBody?.silent),
      reason:responseBody?.reason||null,
      ai_context:{
        schema_version:aiContextPack?.schema_version||null,
        bytes:Number(aiContextPack?.context_budget?.bytes||0),
        limit_bytes:Number(aiContextPack?.context_budget?.limit_bytes||0),
        within_budget:aiContextPack?.context_budget?.within_budget!==false,
        recent_messages:Array.isArray(aiContextPack?.recent_messages)?aiContextPack.recent_messages.length:0,
        runtime_enabled:aiRuntimeCfg?.enabled===true
      },
      channel:{
        requested_type:channelResolution?.requested_type||null,
        resolved_type:channelResolution?.resolved_type||null,
        fallback_used:Boolean(channelResolution?.fallback_used),
        capability_state:channelResolution?.capability_state||null,
        media_inbound:Boolean(primaryMedia),
        media_processed:Boolean(mediaProcessing?.ok),
        tts_generated:Boolean(ttsResult?.ok)
      },
      planner_observe:{
        ran:Boolean(observedPlanner),
        ok:observedPlanner?.ok===true,
        decision:observedPlanner?.plan?.decision||null,
        commercial_opportunity:observedPlanner?.plan?.commercial_opportunity||null,
        journey_stage:observedPlanner?.plan?.journey_stage||null,
        sales_next_step:observedPlanner?.plan?.sales_next_step||null,
        proactive_offer_requested:Boolean(observedPlanner?.plan?.proactive_offer_requested),
        policy_adjusted:Boolean(observedPlanner?.policy_adjusted),
        policy_violation_count:Array.isArray(observedPlanner?.policy_violations)?observedPlanner.policy_violations.length:0,
        proposed_tool_count:Array.isArray(observedPlanner?.plan?.tool_calls)?observedPlanner.plan.tool_calls.length:0,
        no_customer_effect:true
      },
      ...LAB_GUARD
    },
    response_body:responseBody,updated_at:new Date().toISOString()
  }).eq('correlation_id',correlationId);

  return jsonResponse(responseBody,200,responseBearer);
});
