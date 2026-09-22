import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";
import {
  normalizeExternalAgentPayload,
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
import {parseCheckoutProfile,missingCheckoutProfileFields,checkoutProfileMissingPrompt} from "../_shared/papoai-checkout-profile-v1.mjs";
import {planPapoAiTurn} from "../_shared/papoai-ai-planner-v1.mjs";

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
function basketsText(items:any[]){
  const lines=(Array.isArray(items)?items:[]).map((b:any)=>`• ${b.display_name||b.name} — ${moneyBR(b.commercial_price)}`);
  return lines.length?`Estas são nossas cestas disponíveis:\n\n${lines.join('\n')}\n\nSe quiser, me diga o nome de uma delas que eu mando a lista completa do que vem.`:'Não encontrei cestas disponíveis agora.';
}
function productsText(items:any[]){
  const list=(Array.isArray(items)?items:[]).slice(0,6);
  if(!list.length)return 'Não encontrei um produto disponível que combine com esse pedido agora.';
  return list.map((p:any)=>`• ${p.name} — ${moneyBR(p.commercial_price??p.offer_price??p.regular_price)}${p.is_offer?' (oferta)':''}`).join('\n');
}
function numberedProductsText(items:any[],maxItems=3){
  const max=Math.max(1,Math.min(10,Number(maxItems)||3));
  const list=(Array.isArray(items)?items:[]).slice(0,max);
  if(!list.length)return '';
  return list.map((p:any,index:number)=>`${index+1}. ${p.name} — ${moneyBR(p.commercial_price??p.offer_price??p.regular_price)}${p.is_offer?' (oferta)':''}`).join('\n');
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

  const {data:expected,error:keyError}=await sb.rpc('get_papoai_agent_external_lab_key_v1');
  if(keyError||!expected)return jsonResponse({error:'webhook_not_configured',correlation_id:correlationId},503);

  const suppliedResponseToken=(req.headers.get('x-papo-response-token')||'')
    .trim()
    .replace(/^Bearer\s+/i,'')
    .slice(0,1000);
  const {data:storedResponseBearer}=suppliedResponseToken
    ? {data:null}
    : await sb.rpc('get_papoai_agent_external_response_bearer_v1');
  const responseBearer=suppliedResponseToken||String(storedResponseBearer||'');
  if(!responseBearer)return jsonResponse({error:'response_bearer_not_configured',correlation_id:correlationId},503);

  const suppliedValues=(req.headers.get('x-api-key')||'')
    .split(',')
    .map((value)=>value.trim())
    .filter(Boolean);
  const authorized=suppliedValues.some((value)=>safeEqual(value,String(expected)));
  if(!authorized)return jsonResponse({error:'unauthorized',correlation_id:correlationId},401);

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
    p_media_refs:normalized.mediaRefs||[],
    p_tags:[],
    p_provider_context:{...normalized.providerContext,agent_external:true,session_key:normalized.sessionKey},
    p_referral:{provider_adapter:PROVIDER_KEY,agent_external_lab:true},
    p_occurred_at:new Date().toISOString()
  });
  if(ingestError)return jsonResponse({error:'adapter_ingest_failed',correlation_id:correlationId},500);

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

  if(conversationId&&primaryMedia){
    const kind=String(primaryMedia.kind||'');
    const mediaUrl=String(primaryMedia.url||'');
    const apiKey=channelRuntimeCfg?.enabled===true?await resolveOpenAiKey(sb):'';
    const common={
      url:mediaUrl,
      allowedHosts:Array.isArray(channelRuntimeCfg?.allowed_media_hosts)?channelRuntimeCfg.allowed_media_hosts:[],
      apiKey
    };

    if(
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
    const [aiCfgQ,contextQ]=await Promise.all([
      sb.rpc('get_papoai_ai_runtime_config_v1'),
      sb.rpc('get_papoai_ai_context_pack_v2',{
        p_conversation_id:conversationId,
        p_current_message:normalized.messageText
      })
    ]);
    if(!aiCfgQ.error)aiRuntimeCfg=aiCfgQ.data;
    if(!contextQ.error)aiContextPack=contextQ.data;
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
          media_refs:normalized.mediaRefs||[]
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

  const reqSummary={
    message_length:normalized.messageText.length,
    history_count:normalized.history.length,
    has_media:Boolean(normalized.providerContext?.has_media),
    has_reply:Boolean(normalized.providerContext?.has_reply),
    phone:normalized.phoneE164,
    session_key:normalized.sessionKey,
    external_side_effect:false
  };
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
    if(isReservedLabHandoff(normalized.messageText)&&normalized.messageText.toUpperCase()===RESERVED_HANDOFF_COMMAND){
      processingStatus='handoff';responseKind='handoff';
      responseBody=buildLabHandoffResponse({text:'Vou transferir este teste para atendimento humano.',sessionKey:normalized.sessionKey,correlationId,reason:'lab_reserved_command'});
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
    let result:any=null;
    let text='';

    if(conversationId){
      const salesStateQ=await sb.from('whatsapp_sales_state')
        .select('awaiting,pending_name,pending_delivery_address')
        .eq('conversation_id',conversationId)
        .maybeSingle();

      if(salesStateQ.data?.awaiting==='checkout_profile'){
        const currentProfileQ=await sb.rpc('get_papoai_commerce_checkout_profile_v1',{
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
        const missing=missingCheckoutProfileFields(parsed,{needName});
        const topicKey='checkout_profile:delivery';
        const governorStateQ=await sb.rpc('get_papoai_conversation_governor_state_v1',{
          p_conversation_id:conversationId,
          p_topic_key:topicKey
        });
        const asked=Number(governorStateQ.data?.clarification_count||0);

        if(missing.length){
          if(asked>=2){
            await sb.rpc('record_papoai_conversation_governor_decision_v1',{
              p_conversation_id:conversationId,
              p_topic_key:topicKey,
              p_intent:'checkout_profile',
              p_action:'ACT',
              p_reason:'checkout_profile_question_limit_reached',
              p_candidate_count:null,
              p_delegated:false,
              p_question_key:null,
              p_metadata:{missing,parser_source:parsed.source}
            });
            processingStatus='handoff';responseKind='handoff';
            responseBody=commerceTextResponse({
              text:'Pra não te prender aqui com mais perguntas, vou chamar alguém da nossa equipe para confirmar seus dados de entrega.',
              sessionKey:normalized.sessionKey,
              correlationId,
              handoff:true,
              reason:'checkout_profile_question_limit_reached'
            });
          }else{
            await sb.rpc('record_papoai_conversation_governor_decision_v1',{
              p_conversation_id:conversationId,
              p_topic_key:topicKey,
              p_intent:'checkout_profile',
              p_action:'ASK',
              p_reason:'checkout_profile_incomplete',
              p_candidate_count:null,
              p_delegated:false,
              p_question_key:'missing_checkout_profile_fields',
              p_metadata:{missing,parser_source:parsed.source}
            });
            intent={intent:'handled_checkout_profile',source:'system'};
            text=checkoutProfileMissingPrompt(missing);
            result={profile:parsed,missing};
          }
        }else{
          const saved=await sb.rpc('save_papoai_commerce_checkout_profile_pending_v1',{
            p_conversation_id:conversationId,
            p_name:parsed.name||currentProfile?.name||'',
            p_street:parsed.street,
            p_number:parsed.number,
            p_complement:parsed.complement||'',
            p_neighborhood:parsed.neighborhood,
            p_city:parsed.city,
            p_postal_code:parsed.postal_code||null,
            p_reference:parsed.reference||null
          });
          if(saved.error)throw saved.error;
          result=saved.data;
          intent={intent:'handled_checkout_profile',source:'system'};
          if(result?.ok){
            await sb.rpc('record_papoai_conversation_governor_decision_v1',{
              p_conversation_id:conversationId,
              p_topic_key:topicKey,
              p_intent:'checkout_profile',
              p_action:'ACT',
              p_reason:'checkout_profile_captured',
              p_candidate_count:null,
              p_delegated:false,
              p_question_key:null,
              p_metadata:{parser_source:parsed.source}
            });
            text='Perfeito 😊 Já tenho seus dados de entrega. Como você prefere pagar? Pode ser **Pix, dinheiro, cartão de crédito ou cartão alimentação/refeição**.';
          }else if(result?.reason==='delivery_city_not_supported'){
            text='No momento entregamos em **Cuiabá e Várzea Grande**. Qual dessas duas cidades é o endereço de entrega?';
          }else{
            text='Ainda faltou algum dado do endereço. Pode me mandar rua, número, bairro e cidade em uma única mensagem?';
          }
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
        text:'Claro 😊 Vou chamar alguém da nossa equipe para continuar com você.',
        sessionKey:normalized.sessionKey,
        correlationId,
        handoff:true,
        reason:'customer_requested_human'
      });
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
    }else if(intent.intent==='search_products'&&conversationId){
      const governorEnabled=commerceCfg?.metadata?.conversation_governor_enabled===true;
      const productQuery=intent.query||normalized.messageText;

      if(governorEnabled){
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
          p_command:{type:'propose_product_choice',query:productQuery,limit:3}
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
          text=`Encontrei estas opções:\n\n${numberedProductsText(choices)}\n\nQual você prefere? Pode responder **1, 2 ou 3**.`;
        }
      }
    }else if(intent.intent==='search_products'){
      const q=await sb.rpc('search_papoai_commerce_products_v1',{p_query:intent.query||normalized.messageText,p_limit:3});
      result=q.data;
      text=productsText(result?.items||[]);
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
        text=`Estas são as ofertas disponíveis:\n\n${numberedProductsText(offers,10)}\n\nSe quiser alguma, pode responder pelo número.`;
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
      const q=await sb.rpc('execute_papoai_commerce_command_v1',{
        p_conversation_id:conversationId,p_command:{type:'checkout_readiness'}
      });
      if(q.error)throw q.error;
      result=q.data;
      if(result?.ready){
        text=(result?.summary?.message_text||'Seu pedido está pronto para a confirmação final.')
          +'\n\nComo você prefere pagar? Pode ser **Pix, dinheiro, cartão de crédito ou cartão alimentação/refeição**.';
      }else{
        const missing=Array.isArray(result?.missing)?result.missing:[];
        if(missing.includes('cart')){
          text='Você ainda não começou um pedido. Posso te mostrar as cestas.';
        }else if(missing.includes('checkout_profile')){
          const profileQ=await sb.rpc('begin_papoai_commerce_checkout_profile_v1',{p_conversation_id:conversationId});
          if(profileQ.error)throw profileQ.error;
          result={...result,checkout_profile:profileQ.data};
          text=profileQ.data?.prompt||'Para finalizar, preciso confirmar seu nome e endereço de entrega.';
        }else{
          text='Seu pedido ainda precisa de uma validação antes da confirmação final.';
        }
      }
    }else if((intent.intent==='confirm_pending'||intent.intent==='cancel_pending')&&conversationId){
      const pending=await sb.rpc('get_papoai_commerce_pending_action_v1',{p_conversation_id:conversationId});
      if(!pending.data?.has_pending){
        text=intent.intent==='confirm_pending'?'Não tenho nenhuma alteração pendente para confirmar agora.':'Tudo certo. Não há nenhuma alteração pendente.';
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
          const profileQ=await sb.rpc('begin_papoai_commerce_checkout_profile_v1',{p_conversation_id:conversationId});
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
      const mediaUrl=(result?.items?.length===1?result.items[0]?.image_url:null)||null;
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
