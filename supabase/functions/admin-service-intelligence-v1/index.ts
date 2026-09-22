import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { planPapoAiTurn } from "../_shared/papoai-ai-planner-v1.mjs";
import { deterministicCommerceIntent } from "../_shared/papoai-commerce-intent-v1.mjs";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=2000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80))?clean(v,80):"";
const strArray=(v:unknown,max=30)=>Array.isArray(v)?v.map(x=>clean(x,120)).filter(Boolean).slice(0,max):[];
const obj=(v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};

async function r8Sha256Hex(value:string){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function r8MergeEvalContext(base:any,fixture:any){
  const f=obj(fixture),b=obj(base);
  const merged:any={...b,...f};
  for(const k of ["conversation","customer_summary","cart","checkout","journey","governor","commercial","human_precedence","policies"]){
    merged[k]={...obj(b[k]),...obj(f[k])};
  }
  if(Object.prototype.hasOwnProperty.call(f,"pending_action"))merged.pending_action=f.pending_action;
  return merged;
}
function r8EvalCheck(expectedRaw:any,result:any){
  const e=obj(expectedRaw),failures:string[]=[];
  const decision=clean(result?.decision,60);
  const tools=(Array.isArray(result?.tools)?result.tools:[]).map((x:any)=>clean(x?.tool_key,80)).filter(Boolean);
  const toolResults=Array.isArray(result?.tool_results)?result.tool_results:[];
  const response=String(result?.response||"");
  const low=response.toLowerCase();
  const decisions=Array.isArray(e.decision_any)?e.decision_any.map((x:any)=>clean(x,60)):[];
  const toolAny=Array.isArray(e.tool_any)?e.tool_any.map((x:any)=>clean(x,80)):[];
  const contains=Array.isArray(e.response_contains_any)?e.response_contains_any.map((x:any)=>clean(x,200).toLowerCase()):[];
  const notContains=Array.isArray(e.response_not_contains_any)?e.response_not_contains_any.map((x:any)=>clean(x,200).toLowerCase()):[];
  if(result?.ok!==true)failures.push("simulation_not_ok");
  if(decisions.length&&!decisions.includes(decision))failures.push("decision_mismatch");
  if(toolAny.length&&!toolAny.some((x:string)=>tools.includes(x)))failures.push("expected_tool_missing");
  if(typeof e.should_handoff==="boolean"&&Boolean(result?.should_handoff)!==e.should_handoff)failures.push("handoff_mismatch");
  if(e.media_required===true&&!result?.media_preview?.url)failures.push("media_missing");
  if(typeof e.known_customer==="boolean"&&Boolean(result?.context?.customer_summary?.known_customer)!==e.known_customer)failures.push("known_customer_mismatch");
  if(contains.length&&!contains.some((x:string)=>low.includes(x)))failures.push("response_semantic_missing");
  if(notContains.some((x:string)=>x&&low.includes(x)))failures.push("prohibited_text_present");
  if(result?.external_side_effect!==false||result?.writes_executed!==false)failures.push("unsafe_side_effect");
  if(result?.context_mode!=="strict_read_only")failures.push("context_not_strict_readonly");
  for(const tr of toolResults){
    if(tr?.operation_kind==="read"&&tr?.ok===false&&!tr?.skipped)failures.push("read_tool_error");
    if(["write","commitment"].includes(String(tr?.operation_kind||""))&&tr?.executed===true)failures.push("write_executed");
  }
  return {
    passed:failures.length===0,
    failures:[...new Set(failures)],
    checks:{
      decision,tools,
      should_handoff:Boolean(result?.should_handoff),
      media_present:Boolean(result?.media_preview?.url),
      known_customer:Boolean(result?.context?.customer_summary?.known_customer),
      response_length:response.length,
      strict_read_only:result?.context_mode==="strict_read_only",
      external_side_effect:result?.external_side_effect
    }
  };
}
const entityTable=(type:string)=>({knowledge:"service_knowledge_items",guidance:"service_guidance_rules",procedure:"service_procedures",media:"service_media_library",regression_case:"service_regression_cases"} as Record<string,string>)[type]||"";


const R8_CONFIGS:any={
  ai:{table:"papoai_ai_runtime_config",fields:["primary_model","utility_model","primary_reasoning_effort","utility_reasoning_effort","max_recent_messages","max_message_chars","max_context_bytes","max_output_tokens","max_tool_calls","customer_preference_limit","frequent_product_limit","prompt_cache_key","prompt_cache_ttl"]},
  brain:{table:"papoai_commerce_brain_config",fields:["offers_enabled","upsell_enabled","max_history_messages","max_product_results","component_prices_visible"]},
  commercial:{table:"papoai_commercial_policy_config",fields:["max_segmenting_questions","max_recommendations","max_proactive_offers_per_cart","rejection_cooldown_days","strong_min_discount_percent","strong_min_discount_amount","strong_min_personalized_score","suppress_during_checkout","suppress_when_pending_action","suppress_after_decline"]},
  channel:{table:"papoai_channel_runtime_config",fields:["transcription_model","vision_model","vision_detail","tts_model","tts_voice","tts_instructions","max_audio_bytes","max_image_bytes"]}
};
const r8OutputText=(data:any)=>Array.isArray(data?.output)?data.output.flatMap((v:any)=>Array.isArray(v?.content)?v.content:[]).filter((v:any)=>v?.type==="output_text").map((v:any)=>String(v.text||"")).join("").trim():"";
async function r8OpenAiKey(sb:any){let k=Deno.env.get("OPENAI_API_KEY")||"";if(!k){try{const q=await sb.rpc("get_conversation_worker_provider_secret_v1");if(typeof q.data==="string")k=q.data}catch{}}return k}
async function r8Snapshot(sb:any,entityType:string,entityKey:string,value:any,actor:string,action="update",note=""){await sb.from("papoai_admin_config_versions").insert({entity_type:entityType,entity_key:entityKey,snapshot:value??{},action,actor_user_id:actor||null,note:clean(note,500)||null})}
function r8Patch(area:string,input:any){const cfg=R8_CONFIGS[area],out:any={};if(!cfg)return out;for(const k of cfg.fields){if(input?.[k]===undefined)continue;const v=input[k];if(typeof v==="boolean")out[k]=v;else if(typeof v==="number"&&Number.isFinite(v))out[k]=v;else if(typeof v==="string")out[k]=clean(v,k==="tts_instructions"?1500:240)}out.updated_at=new Date().toISOString();return out}
async function r8Configs(sb:any){const [ai,brain,commercial,channel,prices]=await Promise.all([sb.from("papoai_ai_runtime_config").select("*").eq("id",1).maybeSingle(),sb.from("papoai_commerce_brain_config").select("*").eq("id",1).maybeSingle(),sb.from("papoai_commercial_policy_config").select("*").eq("id",1).maybeSingle(),sb.from("papoai_channel_runtime_config").select("*").eq("id",1).maybeSingle(),sb.from("papoai_model_price_profiles").select("*").order("model")]);return {ai:ai.data,brain:brain.data,commercial:commercial.data,channel:channel.data,prices:prices.data||[]}}
async function r8Overview(sb:any){const since24=new Date(Date.now()-86400000).toISOString(),since7=new Date(Date.now()-7*86400000).toISOString();const [activation,r7,products,customers,convs,orders,handoffs,planner,recent]=await Promise.all([sb.rpc("get_papoai_commerce_activation_readiness_v1"),sb.rpc("get_papoai_r7_readiness_v1"),sb.from("products").select("id",{count:"exact",head:true}).eq("is_active",true).eq("physically_verified",true).gt("stock",0).gt("price",0),sb.from("customers").select("id",{count:"exact",head:true}).eq("is_active",true),sb.from("conversations").select("id",{count:"exact",head:true}).gte("updated_at",since24),sb.from("orders").select("id",{count:"exact",head:true}).gte("created_at",since7),sb.from("human_handoffs").select("id",{count:"exact",head:true}).in("status",["open","claimed"]),sb.from("papoai_ai_planner_runs").select("id,success,decision,commercial_opportunity,latency_ms,input_tokens,cached_input_tokens,output_tokens,created_at").order("created_at",{ascending:false}).limit(12),sb.from("orders").select("id,order_number,status,total,source,created_at").order("created_at",{ascending:false}).limit(8)]);return {activation:activation.data||{},r7:r7.data||{},counts:{sellable_products:products.count||0,active_customers:customers.count||0,conversations_24h:convs.count||0,orders_7d:orders.count||0,pending_handoffs:handoffs.count||0},recent_orders:recent.data||[],recent_planner_runs:planner.data||[]}}
async function r8Health(sb:any){const since=new Date(Date.now()-86400000).toISOString();const [activation,r7,r6,channel,pe,te,se,hq]=await Promise.all([sb.rpc("get_papoai_commerce_activation_readiness_v1"),sb.rpc("get_papoai_r7_readiness_v1"),sb.rpc("get_papoai_r6_readiness_v1"),sb.rpc("get_papoai_channel_readiness_v1"),sb.from("papoai_ai_planner_runs").select("id",{count:"exact",head:true}).eq("success",false).gte("created_at",since),sb.from("papoai_ai_tool_audit").select("id",{count:"exact",head:true}).eq("success",false).gte("created_at",since),sb.from("papoai_admin_simulator_runs").select("id",{count:"exact",head:true}).eq("success",false).gte("created_at",since),sb.rpc("get_papoai_assisted_handoff_queue_v1")]);return {activation:activation.data||{},r7:r7.data||{},r6:r6.data||{},channel:channel.data||{},errors_24h:{planner:pe.count||0,tools:te.count||0,simulator:se.count||0},handoff_queue:hq.data||{ok:true,count:0,items:[]}}}
async function r8ReadTool(sb:any,key:string,args:any,conversationId:string|null,context:any){
  try{
    if(key==="search_products"){
      const q=await sb.rpc("search_papoai_commerce_products_v1",{
        p_query:clean(args?.query,200),
        p_limit:Math.max(1,Math.min(12,Number(args?.limit||3)))
      });
      return {
        ok:!q.error,
        result:q.data?.items||[],
        search_meta:q.data?{
          normalized_query:q.data.normalized_query||null,
          count:q.data.count||0,
          ranking_version:q.data.ranking_version||null
        }:null,
        error:q.error?.message||null
      };
    }
    if(key==="search_baskets"){
      const q=await sb.rpc("get_papoai_commerce_basket_catalog_v1");
      return {ok:!q.error,result:q.data,error:q.error?.message||null};
    }
    if(key==="get_basket"){
      const [detail,catalog]=await Promise.all([
        sb.rpc("get_papoai_commerce_basket_detail_v1",{p_basket_query:clean(args?.basket,180)}),
        sb.rpc("get_papoai_commerce_basket_catalog_v1")
      ]);
      let result=detail.data||null;
      if(result?.found&&result?.basket&&Array.isArray(catalog.data)){
        const match=catalog.data.find((x:any)=>
          String(x?.id||"")===String(result.basket.id||"")
          || String(x?.name||"").toLowerCase()===String(result.basket.name||"").toLowerCase()
        );
        if(match?.image_url){
          result={...result,basket:{...result.basket,image_url:match.image_url}};
        }
      }
      return {ok:!detail.error,result,error:detail.error?.message||null};
    }
    if(key==="get_product"&&uuid(args?.product_id)){
      const q=await sb.rpc("get_papoai_commerce_product_v1",{p_product_id:uuid(args.product_id)});
      return {ok:!q.error,result:q.data,error:q.error?.message||null};
    }
    if(key==="identify_customer"){
      const s=context?.customer_summary||{};
      return {ok:true,result:{
        known_customer:Boolean(s.known_customer),
        customer_id:s.customer_id||null,
        first_name:s.first_name||null,
        order_count:Number(s.order_count||0),
        read_only:true
      }};
    }
    if(key==="get_customer_context"){
      return {ok:true,result:{...(context?.customer_summary||{}),read_only:true}};
    }
    if(key==="get_cart"){
      return {ok:true,result:{...(context?.cart||{has_cart:false}),read_only:true}};
    }
    if(key==="get_checkout_next_step"){
      const cart=context?.cart||{has_cart:false};
      const checkout=context?.checkout||{};
      const result=!cart?.has_cart
        ? {step:"cart_missing",ready:false,read_only:true}
        : !checkout?.payment_method
          ? {
              step:"collect_payment",
              ready:false,
              question_count:Number(checkout?.question_count||0),
              prompt:"Como você prefere pagar? Pode ser Pix, dinheiro, cartão de crédito ou cartão alimentação/refeição.",
              read_only:true
            }
          : {
              step:"simulator_readonly",
              ready:false,
              payment_method:checkout.payment_method,
              reason:"full checkout mutation is intentionally disabled in simulator",
              read_only:true
            };
      return {ok:true,result};
    }
    if(key==="preview_order"){
      return {ok:true,result:{
        ready:false,
        cart:context?.cart||{has_cart:false},
        checkout:context?.checkout||{},
        payment_method:args?.payment_method||context?.checkout?.payment_method||null,
        writes_performed:false,
        simulator_read_only:true
      }};
    }
    if(key==="get_offers"){
      const limit=Math.max(1,Math.min(10,Number(args?.limit||4)));
      const q=await sb.from("products")
        .select("id,name,brand,category,price,offer_price,stock,image_url")
        .eq("is_active",true)
        .eq("physically_verified",true)
        .eq("is_offer",true)
        .gt("stock",0)
        .gt("offer_price",0)
        .order("sort_order",{ascending:true,nullsFirst:false})
        .limit(limit);
      const items=(q.data||[])
        .filter((x:any)=>Number(x.offer_price||0)<=Number(x.price||0))
        .map((x:any)=>({
          product_id:x.id,name:x.name,brand:x.brand,category:x.category,
          regular_price:x.price,offer_price:x.offer_price,commercial_price:x.offer_price,
          stock:x.stock,image_url:x.image_url
        }));
      return {ok:!q.error,result:{ok:!q.error,count:items.length,items,personalized:false,read_only:true},error:q.error?.message||null};
    }
    if(key==="recommend_replacement"){
      if(!conversationId)return {ok:false,skipped:true,reason:"conversation_required"};
      const q=await sb.rpc("recommend_papoai_commerce_value_replacement_v1",{
        p_conversation_id:conversationId,
        p_source_query:clean(args?.source_query,180),
        p_limit:Math.max(1,Math.min(3,Number(args?.limit||3)))
      });
      return {ok:!q.error,result:q.data,error:q.error?.message||null};
    }
    return {ok:false,skipped:true,reason:"write_or_unsupported_tool"};
  }catch(e){
    return {ok:false,error:clean((e as Error)?.message,300)};
  }
}
async function r8FinalDraft(apiKey:string,model:string,message:string,plan:any,toolResults:any[]){
  if(!apiKey||!toolResults.length)return {text:plan?.response_draft||"",usage:null,latency_ms:0};
  const st=Date.now();
  try{
    const res=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        model,store:false,max_output_tokens:400,reasoning:{effort:"low"},
        instructions:[
          "Redija a resposta final da atendente Dona Antônia em português brasileiro.",
          "Seja natural, curta e objetiva.",
          "Use somente fatos presentes nos resultados das tools.",
          "Nunca invente preço, estoque, total, produto, pedido ou dados do cliente.",
          "Se o cliente pediu foto ou imagem e o resultado contém image_url, diga que a imagem está disponível e será mostrada; nunca diga que não conseguiu acessar.",
          "Não mencione ferramentas, JSON, sistema interno ou simulação."
        ].join(" "),
        input:[{role:"user",content:[{type:"input_text",text:JSON.stringify({message,plan,tool_results:toolResults})}]}],
        text:{verbosity:"low"}
      }),
      signal:AbortSignal.timeout(15000)
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok)return {text:plan?.response_draft||"",usage:data?.usage||null,latency_ms:Date.now()-st,error:"final_http_"+res.status};
    return {text:r8OutputText(data)||plan?.response_draft||"",usage:data?.usage||null,latency_ms:Date.now()-st};
  }catch(e){
    return {text:plan?.response_draft||"",usage:null,latency_ms:Date.now()-st,error:clean((e as Error)?.message,200)};
  }
}
function r8MediaPreview(message:string,toolResults:any[]){
  if(!/(foto|imagem|mostrar|mostra|mande|manda|ver\s+(a|uma)?\s*(foto|imagem))/i.test(message))return null;
  for(const tr of toolResults||[]){
    const r=tr?.result;
    if(r?.basket?.image_url)return {url:r.basket.image_url,label:r.basket.display_name||r.basket.name||"Cesta",kind:"basket"};
    if(Array.isArray(r)){
      const x=r.find((v:any)=>v?.image_url);
      if(x)return {url:x.image_url,label:x.name||"Produto",kind:"product"};
    }
    if(Array.isArray(r?.items)){
      const x=r.items.find((v:any)=>v?.image_url);
      if(x)return {url:x.image_url,label:x.name||"Produto",kind:"product"};
    }
    if(r?.image_url)return {url:r.image_url,label:r.name||"Produto",kind:"product"};
  }
  return null;
}
async function r8Simulator(sb:any,actorId:string|null,body:any){
  const started=Date.now(),message=clean(body?.message,2000);
  const evalMode=body?.eval_mode===true;
  if(!message)return {status:400,body:{ok:false,error:"message_required"}};

  let customerId=uuid(body?.customer_id)||null;
  let conversationId=uuid(body?.conversation_id)||null;
  const phone=clean(body?.phone,40).replace(/[^\d+]/g,"");

  if(!customerId&&phone){
    const d=phone.replace(/\D/g,"");
    const n=d.startsWith("55")?("+"+d):("+55"+d);
    const q=await sb.from("customers").select("id").eq("primary_whatsapp_e164",n).maybeSingle();
    customerId=q.data?.id||null;
  }
  if(!conversationId&&customerId){
    const q=await sb.from("conversations")
      .select("id")
      .eq("customer_id",customerId)
      .order("updated_at",{ascending:false})
      .limit(1)
      .maybeSingle();
    conversationId=q.data?.id||null;
  }

  const [contextQ,knowledgeQ,cfgQ,toolsQ,key]=await Promise.all([
    sb.rpc("get_papoai_admin_simulator_context_v1",{
      p_message:message,
      p_customer_id:customerId,
      p_conversation_id:conversationId
    }),
    sb.rpc("search_service_knowledge_text_v1",{p_query:message,p_limit:4}),
    sb.from("papoai_ai_runtime_config").select("*").eq("id",1).single(),
    sb.rpc("get_papoai_ai_planner_tools_v1"),
    r8OpenAiKey(sb)
  ]);

  if(contextQ.error)return {status:400,body:{ok:false,error:"context_failed",detail:contextQ.error.message}};
  if(cfgQ.error||!cfgQ.data)return {status:500,body:{ok:false,error:"runtime_config_missing"}};
  if(toolsQ.error)return {status:500,body:{ok:false,error:"tools_missing"}};
  if(!key)return {status:503,body:{ok:false,error:"openai_key_missing"}};

  const serviceKnowledge=knowledgeQ.error?[]:(knowledgeQ.data||[]);
  const baseContext={
    ...(contextQ.data||{}),
    service_knowledge:serviceKnowledge,
    service_intelligence:{
      ...((contextQ.data||{})?.service_intelligence||{}),
      enabled:true,
      retrieval:"admin_simulator_published_knowledge",
      simulation_only:true,
      knowledge:serviceKnowledge
    }
  };
  const context=evalMode
    ? r8MergeEvalContext(baseContext,body?.context_fixture||{})
    : baseContext;

  const paymentPolicy=Array.isArray(serviceKnowledge)
    ? serviceKnowledge.find((x:any)=>x?.key==="payment_baseline")
    : null;
  const deterministicIntent=deterministicCommerceIntent(message);

  const deterministicReturn=async({
    response,
    decision="RESPOND",
    tools=[],
    toolResults=[],
    mediaPreview=null,
    model="deterministic-router",
    salesNextStep="answer_need",
    question="",
    shouldHandoff=false
  }:any)=>{
    const latency=Date.now()-started;
    const contextBytes=new TextEncoder().encode(JSON.stringify(context)).length;
    const row:any={
      actor_user_id:actorId,customer_id:customerId,conversation_id:conversationId,input_text:message,
      model,decision,commercial_opportunity:"none",
      journey_stage:context?.journey?.stage||"discovery",sales_next_step:salesNextStep,
      proposed_tool_calls:tools,tool_results:toolResults,response_text:response,
      context_snapshot:context,context_bytes:contextBytes,
      input_tokens:0,cached_input_tokens:0,output_tokens:0,estimated_cost_usd:0,
      latency_ms:latency,success:true,error_code:null
    };
    let saved:any={data:null};
    if(!evalMode&&actorId){
      saved=await sb.from("papoai_admin_simulator_runs").insert(row).select("id,created_at").single();
    }
    return {status:200,body:{
      ok:true,simulation_id:saved.data?.id||null,created_at:saved.data?.created_at||new Date().toISOString(),
      response,decision,confidence:1,
      commercial_opportunity:"none",journey_stage:row.journey_stage,sales_next_step:salesNextStep,
      should_handoff:shouldHandoff,question,tools,tool_results:toolResults,context,
      media_preview:mediaPreview,
      metrics:{model,input_tokens:0,cached_input_tokens:0,output_tokens:0,estimated_cost_usd:0,latency_ms:latency,context_bytes:contextBytes},
      policy:{adjusted:false,violations:[]},
      external_side_effect:false,writes_executed:false,context_mode:"strict_read_only"
    }};
  };

  if(deterministicIntent?.intent==="payment_info"){
    let paymentContent=paymentPolicy?.content||"";
    if(!paymentContent){
      const policyQ=await sb.from("service_knowledge_items")
        .select("content")
        .eq("knowledge_key","payment_baseline")
        .eq("status","published")
        .maybeSingle();
      paymentContent=String(policyQ.data?.content||"");
    }
    if(paymentContent){
      const responseText=String(paymentContent)
        .replace(/\s*Nunca invente[\s\S]*$/i,"")
        .trim();
      return await deterministicReturn({
        response:responseText,
        decision:"RESPOND",
        model:"deterministic-policy",
        salesNextStep:"answer_need"
      });
    }
  }

  if(deterministicIntent?.intent==="greeting"){
    return await deterministicReturn({
      response:"Oi 😊 Bem-vindo à Dona Antônia. Posso te ajudar com cestas básicas, produtos do mercado ou ofertas. O que você precisa hoje?",
      decision:"RESPOND",salesNextStep:"answer_need"
    });
  }

  if(deterministicIntent?.intent==="delivery_info"){
    const msg=String(message||"").toLowerCase();
    let responseText="";
    if(/chapada\s+dos\s+guimar[aã]es|\bchapada\b/.test(msg)){
      responseText="No momento nossas entregas próprias atendem Cuiabá e Várzea Grande. Ainda não atendemos Chapada dos Guimarães.";
    }else if(/taxa|frete|gr[aá]tis|gratis/.test(msg)){
      responseText="Não cobramos taxa de entrega.";
    }else if(/hoje|hj|agora|agr|mesmo dia|pr[oó]ximo dia/.test(msg)){
      responseText="Pedidos feitos até as 11h têm previsão padrão de entrega no mesmo dia; após as 11h, a previsão padrão é o próximo dia útil. É uma previsão, não um horário garantido.";
    }else{
      responseText="Sim 😊 Fazemos entrega em Cuiabá e Várzea Grande, sem taxa de entrega.";
    }
    return await deterministicReturn({
      response:responseText,decision:"RESPOND",model:"deterministic-policy",salesNextStep:"answer_need"
    });
  }

  if(deterministicIntent?.intent==="safety_policy"){
    return await deterministicReturn({
      response:"Não posso alterar regras comerciais, liberar condição fora do sistema nem fornecer senhas, chaves ou dados internos. Posso te ajudar com produtos, preços, cestas e condições publicadas.",
      decision:"RESPOND",model:"deterministic-safety",salesNextStep:"answer_need"
    });
  }

  if(deterministicIntent?.intent==="business_info"){
    return await deterministicReturn({
      response:"A Dona Antônia trabalha com cestas básicas e produtos de mercado por delivery em Cuiabá e Várzea Grande. Você pode comprar direto pelo WhatsApp.",
      decision:"RESPOND",model:"deterministic-policy",salesNextStep:"answer_need"
    });
  }

  if(deterministicIntent?.intent==="customer_context"){
    const cs=context?.customer_summary||{};
    const known=Boolean(cs?.known_customer);
    const name=String(cs?.first_name||"").trim();
    const responseText=known
      ? `Sim${name?", "+name:""} 😊 Tenho seu contexto de atendimento e compras para te ajudar sem você precisar repetir tudo. O que você precisa hoje?`
      : "Ainda não identifiquei um histórico seu com segurança, mas posso te ajudar normalmente com cestas, produtos e ofertas.";
    return await deterministicReturn({
      response:responseText,decision:"RESPOND",model:"deterministic-customer-context",salesNextStep:"answer_need"
    });
  }

  if(deterministicIntent?.intent==="search_products"){
    const query=String(deterministicIntent?.query||message).trim();
    const rr=await r8ReadTool(sb,"search_products",{query,limit:6},conversationId,context);
    const items=Array.isArray(rr?.result)?rr.result:[];
    const tools=[{tool_key:"search_products",arguments_json:JSON.stringify({query,limit:6})}];
    const toolResults=[{tool_key:"search_products",operation_kind:"read",arguments:{query,limit:6},...rr}];
    let responseText="";
    if(!items.length){
      responseText="Não encontrei esse produto disponível agora. Se quiser, me diga outra marca, tamanho ou tipo que eu procuro uma alternativa.";
    }else{
      const rows=items.slice(0,6).map((x:any)=>`• ${x?.name} — R$ ${Number(x?.commercial_price||0).toFixed(2).replace(".",",")}`);
      responseText="Encontrei estas opções:\n"+rows.join("\n");
      if(items.length>1)responseText+="\n\nSe quiser, me diga qual delas você prefere.";
      else responseText+="\n\nQuer que eu adicione ao pedido?";
    }
    const mediaPreview=r8MediaPreview(message,toolResults);
    return await deterministicReturn({
      response:responseText,decision:"ACT",tools,toolResults,mediaPreview,
      salesNextStep:"show_options"
    });
  }

  if(deterministicIntent?.intent==="list_baskets"){
    const rr=await r8ReadTool(sb,"search_baskets",{},conversationId,context);
    const items=Array.isArray(rr?.result)?rr.result:[];
    const response=items.length
      ? "Temos estas cestas: "+items.map((x:any)=>`${x?.display_name||x?.name} — R$ ${Number(x?.commercial_price||0).toFixed(2).replace(".",",")}`).join("; ")+"."
      : "Não encontrei cestas disponíveis agora.";
    const tools=[{tool_key:"search_baskets",arguments_json:"{}"}];
    const toolResults=[{tool_key:"search_baskets",operation_kind:"read",arguments:{},...rr}];
    return await deterministicReturn({
      response,decision:"ACT",tools,toolResults,salesNextStep:"show_options"
    });
  }

  if(deterministicIntent?.intent==="offers"){
    const rr=await r8ReadTool(sb,"get_offers",{limit:4},conversationId,context);
    const items=Array.isArray(rr?.result?.items)?rr.result.items:[];
    const response=items.length
      ? "Estas são algumas ofertas de hoje: "+items.map((x:any)=>`${x?.name} — R$ ${Number(x?.commercial_price||x?.offer_price||0).toFixed(2).replace(".",",")}`).join("; ")+"."
      : "Não encontrei ofertas disponíveis agora.";
    const tools=[{tool_key:"get_offers",arguments_json:JSON.stringify({limit:4})}];
    const toolResults=[{tool_key:"get_offers",operation_kind:"read",arguments:{limit:4},...rr}];
    return await deterministicReturn({
      response,decision:"ACT",tools,toolResults,salesNextStep:"show_options"
    });
  }

  if(deterministicIntent?.intent==="basket_disambiguate"){
    const rr=await r8ReadTool(sb,"search_baskets",{},conversationId,context);
    const catalog=Array.isArray(rr?.result)?rr.result:[];
    const scale=String(deterministicIntent?.basket||deterministicIntent?.query||"").toLowerCase();
    const matches=catalog.filter((x:any)=>String(x?.name||x?.display_name||"").toLowerCase().includes(scale));
    const names=matches.slice(0,4).map((x:any)=>x?.display_name||x?.name).filter(Boolean);
    const responseText=names.length>1
      ? `Temos ${names.join(" e ")}. Qual delas você quer ver?`
      : names.length===1
        ? `Você quer a ${names[0]}?`
        : "Temos mais de uma cesta. Você quer Bonini ou Koblenz?";
    const tools=[{tool_key:"search_baskets",arguments_json:"{}"}];
    const toolResults=[{tool_key:"search_baskets",operation_kind:"read",arguments:{},...rr}];
    return await deterministicReturn({
      response:responseText,decision:"ASK",tools,toolResults,
      question:responseText,salesNextStep:"clarify_basket"
    });
  }

  if(deterministicIntent?.intent==="basket_detail"){
    const basket=String(deterministicIntent?.basket||deterministicIntent?.query||"").trim();
    const rr=await r8ReadTool(sb,"get_basket",{basket},conversationId,context);
    const detail=rr?.result||{};
    const b=detail?.basket||{};
    const items=Array.isArray(detail?.items)?detail.items:[];
    const wantsPhoto=/(foto|imagem|mostrar|mostra|manda)/i.test(message);
    let responseText="";
    if(detail?.found){
      if(wantsPhoto&&b?.image_url){
        responseText=`Claro! Aqui está a ${b?.display_name||b?.name||basket}.`;
      }else{
        const itemText=items.map((x:any)=>`${Number(x?.quantity||1)}x ${x?.name||"item"}`).join(", ");
        responseText=`${b?.display_name||b?.name||basket} custa R$ ${Number(b?.commercial_price||0).toFixed(2).replace(".",",")} e vem com: ${itemText}.`;
      }
    }else{
      responseText="Não consegui localizar essa cesta pelo nome. Me diga se é Bonini ou Koblenz.";
    }
    const tools=[{tool_key:"get_basket",arguments_json:JSON.stringify({basket})}];
    const toolResults=[{tool_key:"get_basket",operation_kind:"read",arguments:{basket},...rr}];
    const mediaPreview=r8MediaPreview(message,toolResults);
    return await deterministicReturn({
      response:responseText,
      decision:detail?.found?"ACT":"ASK",
      tools,toolResults,mediaPreview,
      question:detail?.found?"":"Qual cesta você quer ver?",
      salesNextStep:detail?.found?"answer_need":"clarify_basket"
    });
  }

  if(deterministicIntent?.intent==="delivery_schedule"){
    const tools=[{tool_key:"request_handoff",arguments_json:JSON.stringify({
      reason:"delivery_schedule_confirmation",
      summary:"Cliente pediu confirmação de horário ou janela específica de entrega."
    })}];
    const toolResults=[{
      tool_key:"request_handoff",operation_kind:"commitment",
      arguments:{
        reason:"delivery_schedule_confirmation",
        summary:"Cliente pediu confirmação de horário ou janela específica de entrega."
      },
      ok:true,executed:false,blocked_by_simulator:true
    }];
    return await deterministicReturn({
      response:"Vou chamar uma pessoa da nossa equipe para continuar com você. O horário exato depende da rota e da operação do dia, então ela confirma essa janela com você.",
      decision:"ACT",tools,toolResults,shouldHandoff:true,salesNextStep:"handoff"
    });
  }

  if(deterministicIntent?.intent==="handoff"){
    const tools=[{tool_key:"request_handoff",arguments_json:JSON.stringify({
      reason:"customer_requested_human",
      summary:"Cliente pediu atendimento humano."
    })}];
    const toolResults=[{
      tool_key:"request_handoff",operation_kind:"commitment",
      arguments:{reason:"customer_requested_human",summary:"Cliente pediu atendimento humano."},
      ok:true,executed:false,blocked_by_simulator:true
    }];
    return await deterministicReturn({
      response:"Vou chamar uma pessoa da nossa equipe para continuar com você. 😊",
      decision:"ACT",tools,toolResults,shouldHandoff:true,salesNextStep:"handoff"
    });
  }

  if(deterministicIntent?.intent==="checkout_readiness"&&context?.cart?.has_cart){
    const rr=await r8ReadTool(sb,"get_checkout_next_step",{},conversationId,context);
    const step=rr?.result||{};
    const tools=[{tool_key:"get_checkout_next_step",arguments_json:"{}"}];
    const toolResults=[{tool_key:"get_checkout_next_step",operation_kind:"read",arguments:{},...rr}];
    if(step?.step==="collect_payment"){
      return await deterministicReturn({
        response:step?.prompt||"Como você prefere pagar? Pode ser Pix, dinheiro, cartão de crédito ou cartão alimentação/refeição.",
        decision:"ASK",tools,toolResults,
        question:step?.prompt||"Como você prefere pagar?",
        salesNextStep:"collect_payment"
      });
    }
    if(step?.step==="cart_missing"){
      return await deterministicReturn({
        response:"Seu carrinho ainda está vazio. O que você gostaria de comprar?",
        decision:"ASK",tools,toolResults,
        question:"O que você gostaria de comprar?",
        salesNextStep:"build_cart"
      });
    }
    const prepareCall={tool_key:"prepare_order_confirmation",arguments_json:"{}"};
    toolResults.push({
      tool_key:"prepare_order_confirmation",operation_kind:"commitment",
      arguments:{},ok:true,executed:false,blocked_by_simulator:true
    });
    return await deterministicReturn({
      response:"Perfeito. Vou preparar o resumo final para você confirmar antes de fechar o pedido.",
      decision:"ACT",tools:[...tools,prepareCall],toolResults,
      salesNextStep:"prepare_confirmation"
    });
  }

  if(deterministicIntent?.intent==="cancel_pending"&&context?.pending_action){
    const tools=[{tool_key:"cancel_pending",arguments_json:"{}"}];
    const toolResults=[{
      tool_key:"cancel_pending",operation_kind:"write",
      arguments:{},ok:true,executed:false,blocked_by_simulator:true
    }];
    return await deterministicReturn({
      response:"Tudo bem, não vou confirmar essa ação.",
      decision:"ACT",tools,toolResults,salesNextStep:"return_to_conversation"
    });
  }

  if(deterministicIntent?.intent==="confirm_pending"&&context?.pending_action){
    const tools=[{tool_key:"confirm_order",arguments_json:JSON.stringify({confirm:true})}];
    const toolResults=[{
      tool_key:"confirm_order",operation_kind:"commitment",
      arguments:{confirm:true},ok:true,executed:false,blocked_by_simulator:true
    }];
    return await deterministicReturn({
      response:"Perfeito, confirmação recebida. No fluxo real, este é o ponto de confirmar o pedido de forma idempotente.",
      decision:"ACT",tools,toolResults,salesNextStep:"confirm_order"
    });
  }

  if(deterministicIntent?.intent==="set_basket_quantity"&&context?.cart?.has_cart){
    const source=String(deterministicIntent?.source_query||"").trim();
    const quantity=Math.max(0,Number(deterministicIntent?.quantity||0));
    const norm=(v:any)=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    const sourceNorm=norm(source);
    const items=Array.isArray(context?.cart?.items)?context.cart.items:[];
    const matched=items.find((x:any)=>{
      const name=norm(x?.name);
      return name===sourceNorm||name.includes(sourceNorm)||sourceNorm.includes(name);
    })||null;
    if(matched?.product_id){
      const toolKey=quantity===0?"remove_cart_item":"change_quantity";
      const args=quantity===0
        ? {product_id:matched.product_id}
        : {product_id:matched.product_id,quantity};
      const tools=[{tool_key:toolKey,arguments_json:JSON.stringify(args)}];
      const toolResults=[{
        tool_key:toolKey,operation_kind:"write",
        arguments:args,ok:true,executed:false,blocked_by_simulator:true
      }];
      const response=quantity===0
        ? `Certo, vou retirar ${matched.name||source} da cesta.`
        : `Certo, vou ajustar ${matched.name||source} para ${quantity} unidade(s).`;
      return await deterministicReturn({
        response,decision:"ACT",tools,toolResults,salesNextStep:"update_cart"
      });
    }
    return await deterministicReturn({
      response:`Não consegui identificar com segurança qual item corresponde a "${source}". Qual item da cesta você quer alterar?`,
      decision:"ASK",tools:[],toolResults:[],
      question:"Qual item da cesta você quer alterar?",salesNextStep:"clarify_cart_item"
    });
  }

  if(deterministicIntent?.intent==="set_payment_method"&&context?.cart?.has_cart){
    const payment=String(deterministicIntent?.query||"").trim();
    const tools=[{tool_key:"set_payment_method",arguments_json:JSON.stringify({payment_method:payment})}];
    const toolResults=[{
      tool_key:"set_payment_method",operation_kind:"write",
      arguments:{payment_method:payment},ok:true,executed:false,blocked_by_simulator:true
    }];
    return await deterministicReturn({
      response:`Perfeito, pagamento por ${payment}. Posso seguir para a confirmação do pedido.`,
      decision:"ACT",tools,toolResults,salesNextStep:"prepare_confirmation"
    });
  }

  if(deterministicIntent?.intent==="set_addon_quantity"){
    const query=String(deterministicIntent?.query||message).trim();
    const quantity=Math.max(1,Number(deterministicIntent?.quantity||1));
    const rr=await r8ReadTool(sb,"search_products",{query,limit:4},conversationId,context);
    const items=Array.isArray(rr?.result)?rr.result:[];
    const readCall={tool_key:"search_products",arguments_json:JSON.stringify({query,limit:4})};
    const toolResults:any[]=[{tool_key:"search_products",operation_kind:"read",arguments:{query,limit:4},...rr}];
    if(items.length===1){
      const selected=items[0];
      const writeCall={tool_key:"add_cart_item",arguments_json:JSON.stringify({product_id:selected.product_id||selected.id,quantity})};
      toolResults.push({
        tool_key:"add_cart_item",operation_kind:"write",
        arguments:{product_id:selected.product_id||selected.id,quantity},
        ok:true,executed:false,blocked_by_simulator:true
      });
      return await deterministicReturn({
        response:`Certo. Vou acrescentar ${quantity} unidade(s) de ${selected.name} ao pedido.`,
        decision:"ACT",tools:[readCall,writeCall],toolResults,salesNextStep:"update_cart"
      });
    }
    const names=items.slice(0,4).map((x:any)=>x?.name).filter(Boolean);
    const responseText=names.length
      ? `Encontrei estas opções: ${names.join("; ")}. Qual delas você quer adicionar?`
      : `Não encontrei ${query} com segurança. Quer tentar outro nome ou marca?`;
    return await deterministicReturn({
      response:responseText,decision:"ASK",tools:[readCall],toolResults,
      question:responseText,salesNextStep:"clarify_product"
    });
  }

  const model=cfgQ.data.primary_model||"gpt-5.6-terra";
  let planned=await planPapoAiTurn({
    message,
    contextPack:context,
    tools:Array.isArray(toolsQ.data)?toolsQ.data:[],
    apiKey:key,
    model,
    reasoningEffort:cfgQ.data.primary_reasoning_effort||"low",
    maxOutputTokens:Math.min(800,Number(cfgQ.data.max_output_tokens||500))
  });
  if(evalMode&&planned?.ok!==true){
    await new Promise(resolve=>setTimeout(resolve,900));
    planned=await planPapoAiTurn({
      message,
      contextPack:context,
      tools:Array.isArray(toolsQ.data)?toolsQ.data:[],
      apiKey:key,
      model,
      reasoningEffort:cfgQ.data.primary_reasoning_effort||"low",
      maxOutputTokens:Math.min(800,Number(cfgQ.data.max_output_tokens||500))
    });
  }
  if(evalMode&&planned?.ok!==true){
    await new Promise(resolve=>setTimeout(resolve,1800));
    planned=await planPapoAiTurn({
      message,
      contextPack:context,
      tools:Array.isArray(toolsQ.data)?toolsQ.data:[],
      apiKey:key,
      model,
      reasoningEffort:cfgQ.data.primary_reasoning_effort||"low",
      maxOutputTokens:Math.min(800,Number(cfgQ.data.max_output_tokens||500))
    });
  }

  const tr:any[]=[];
  for(const call of Array.isArray(planned?.plan?.tool_calls)?planned.plan.tool_calls.slice(0,6):[]){
    let args:any={};
    try{args=JSON.parse(String(call?.arguments_json||"{}"))}catch{}
    const tool=(Array.isArray(toolsQ.data)?toolsQ.data:[]).find((t:any)=>t?.tool_key===call?.tool_key);
    if(tool?.operation_kind==="read"){
      const rr=await r8ReadTool(sb,String(call.tool_key||""),args,conversationId,context);
      tr.push({tool_key:call.tool_key,operation_kind:"read",arguments:args,...rr});
    }else{
      tr.push({
        tool_key:call?.tool_key||"",
        operation_kind:tool?.operation_kind||"unknown",
        arguments:args,ok:true,executed:false,blocked_by_simulator:true
      });
    }
  }

  const mediaPreview=r8MediaPreview(message,tr);
  const final=planned?.ok
    ? await r8FinalDraft(key,model,message,planned.plan,tr)
    : {text:"",usage:null,latency_ms:0};

  let responseText=final?.text||planned?.plan?.response_draft||"";
  if(mediaPreview&&/(não consegui|nao consegui|não foi possível|nao foi possivel)/i.test(responseText)){
    responseText="Claro! Aqui está "+mediaPreview.label+".";
  }

  const u1=planned?.usage||{},u2=final?.usage||{};
  const input=Number(u1?.input_tokens||0)+Number(u2?.input_tokens||0);
  const cached=Number(u1?.input_tokens_details?.cached_tokens||0)+Number(u2?.input_tokens_details?.cached_tokens||0);
  const output=Number(u1?.output_tokens||0)+Number(u2?.output_tokens||0);
  const pq=await sb.from("papoai_model_price_profiles").select("*").eq("model",model).maybeSingle();
  const price=pq.data;
  let cost:number|null=null;
  if(price){
    const nc=Math.max(0,input-cached);
    cost=(nc*Number(price.input_usd_per_million||0)+cached*Number(price.cached_input_usd_per_million||0)+output*Number(price.output_usd_per_million||0))/1000000;
  }

  const cb=new TextEncoder().encode(JSON.stringify(context)).length;
  const success=planned?.ok===true;
  const row:any={
    actor_user_id:actorId,customer_id:customerId,conversation_id:conversationId,input_text:message,
    model,decision:planned?.plan?.decision||null,commercial_opportunity:planned?.plan?.commercial_opportunity||null,
    journey_stage:planned?.plan?.journey_stage||null,sales_next_step:planned?.plan?.sales_next_step||null,
    proposed_tool_calls:planned?.plan?.tool_calls||[],tool_results:tr,response_text:responseText,
    context_snapshot:context,context_bytes:cb,input_tokens:input,cached_input_tokens:cached,output_tokens:output,
    estimated_cost_usd:cost,latency_ms:Date.now()-started,success,
    error_code:success?null:String(planned?.error||"planner_failed")
  };
  let saved:any={data:null};
  if(!evalMode&&actorId){
    saved=await sb.from("papoai_admin_simulator_runs").insert(row).select("id,created_at").single();
  }

  return {status:200,body:{
    ok:success,simulation_id:saved.data?.id||null,created_at:saved.data?.created_at||new Date().toISOString(),
    response:responseText,decision:row.decision,confidence:planned?.plan?.confidence??null,
    commercial_opportunity:row.commercial_opportunity,journey_stage:row.journey_stage,
    sales_next_step:row.sales_next_step,should_handoff:Boolean(planned?.plan?.should_handoff),
    question:planned?.plan?.question||"",tools:row.proposed_tool_calls,tool_results:tr,context,
    media_preview:mediaPreview,
    metrics:{
      model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,
      estimated_cost_usd:cost,latency_ms:row.latency_ms,context_bytes:cb
    },
    policy:{adjusted:Boolean(planned?.policy_adjusted),violations:planned?.policy_violations||[]},
    planner_error:success?null:(planned?.error||"planner_failed"),
    planner_error_status:success?null:(planned?.status??null),
    planner_error_message:success?null:(planned?.error_message||null),
    external_side_effect:false,writes_executed:false,context_mode:"strict_read_only"
  }};
}


async function r8VerifyEvalKey(sb:any,supplied:string){
  if(!supplied)return false;
  const hash=await r8Sha256Hex(supplied);
  const q=await sb.from("system_secrets")
    .select("key_hash,is_active")
    .eq("key_name","papoai_brain_eval_v1")
    .maybeSingle();
  return q.data?.is_active===true&&q.data?.key_hash===hash;
}
async function r8RunEvalChunk(sb:any,runId:string,limit:number){
  const claim=await sb.rpc("claim_papoai_brain_eval_batch_v1",{
    p_run_id:runId,
    p_limit:Math.max(1,Math.min(6,Number(limit||4)))
  });
  if(claim.error)return {ok:false,error:"claim_failed",detail:claim.error.message};
  const items=Array.isArray(claim.data?.items)?claim.data.items:[];
  let processed=0;
  for(const item of items){
    const started=Date.now();
    try{
      let sim=await r8Simulator(sb,null,{
        message:item.message_text,
        conversation_id:item.conversation_id||null,
        customer_id:item.customer_id||null,
        context_fixture:item.context_fixture||{},
        eval_mode:true
      });
      if(sim.status>=400||sim.body?.ok!==true){
        await new Promise(resolve=>setTimeout(resolve,250));
        sim=await r8Simulator(sb,null,{
          message:item.message_text,
          conversation_id:item.conversation_id||null,
          customer_id:item.customer_id||null,
          context_fixture:item.context_fixture||{},
          eval_mode:true
        });
      }
      const b=sim.body||{};
      const transientPlannerErrors=new Set(["openai_http_error","AbortError","TimeoutError","planner_parse_error","TypeError"]);
      const transientError=(sim.status>=400||b.ok!==true)
        && transientPlannerErrors.has(String(b.planner_error||b.error||""));
      if(transientError&&Number(item.attempt_count||1)<4){
        await sb.from("papoai_brain_eval_results").update({
          status:"queued",
          failure_codes:[],
          error_code:clean(b.planner_error||b.error||"transient_planner_error",120),
          error_detail:clean(b.planner_error_message||b.detail||"",1000),
          started_at:null,
          finished_at:null
        }).eq("id",item.result_id);
        processed++;
        continue;
      }
      const checked=r8EvalCheck(item.expected||{},b);
      const metrics=b.metrics||{};
      const status=sim.status>=400||b.ok!==true?"error":(checked.passed?"passed":"failed");
      const upd=await sb.from("papoai_brain_eval_results").update({
        status,
        decision:b.decision||null,
        commercial_opportunity:b.commercial_opportunity||null,
        journey_stage:b.journey_stage||null,
        should_handoff:Boolean(b.should_handoff),
        response_text:clean(b.response,12000)||null,
        proposed_tools:Array.isArray(b.tools)?b.tools:[],
        tool_results:Array.isArray(b.tool_results)?b.tool_results:[],
        media_preview:b.media_preview||null,
        checks:checked.checks||{},
        failure_codes:status==="error"?["simulation_error"]:checked.failures,
        error_code:status==="error"?clean(b.planner_error||b.error||"simulation_error",120):null,
        error_detail:status==="error"?clean(b.planner_error_message||b.detail||"",1000):null,
        input_tokens:Number(metrics.input_tokens||0),
        cached_input_tokens:Number(metrics.cached_input_tokens||0),
        output_tokens:Number(metrics.output_tokens||0),
        estimated_cost_usd:Number(metrics.estimated_cost_usd||0),
        latency_ms:Number(metrics.latency_ms||Date.now()-started),
        finished_at:new Date().toISOString()
      }).eq("id",item.result_id);
      if(upd.error)throw upd.error;
      processed++;
    }catch(e){
      await sb.from("papoai_brain_eval_results").update({
        status:"error",
        failure_codes:["runner_exception"],
        error_code:"runner_exception",
        error_detail:clean((e as Error)?.message,1000),
        latency_ms:Date.now()-started,
        finished_at:new Date().toISOString()
      }).eq("id",item.result_id);
      processed++;
    }
  }
  const fin=await sb.rpc("finalize_papoai_brain_eval_run_v1",{p_run_id:runId});
  if(!fin.error&&fin.data?.complete!==true){
    await sb.rpc("dispatch_papoai_brain_eval_run_v1",{p_run_id:runId});
  }
  return {ok:true,run_id:runId,processed,finalize:fin.data||null};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method==="GET")return Response.redirect("https://donaantonia.com.br/admin/commerce-os/",302);
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return json({ok:false,error:"server_config"},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=clean(body?.action||"dashboard",60).toLowerCase();

  if(action==="r8_eval_chunk_internal"){
    const supplied=req.headers.get("x-papoai-brain-eval-key")||"";
    if(!(await r8VerifyEvalKey(sb,supplied)))return json({ok:false,error:"eval_unauthorized"},401);
    const runId=uuid(body?.run_id);if(!runId)return json({ok:false,error:"run_id_required"},400);
    const r=await r8RunEvalChunk(sb,runId,Number(body?.limit||4));
    return json(r,r.ok?200:500);
  }

  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return json({ok:false,error:"missing_token"},401);
  const {data:userData,error:userError}=await sb.auth.getUser(token);if(userError||!userData?.user?.id)return json({ok:false,error:"invalid_user"},401);
  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active,display_name").eq("user_id",userData.user.id).maybeSingle();if(adminError)return json({ok:false,error:"admin_lookup_failed"},500);if(!admin?.is_active)return json({ok:false,error:"admin_not_authorized"},403);
  const isOwner=admin.role==="owner";const canEdit=isOwner||["admin","manager"].includes(admin.role);

  if(action==="r8_overview")return json({ok:true,...await r8Overview(sb)});
  if(action==="r8_health")return json({ok:true,...await r8Health(sb)});
  if(action==="r8_intelligence")return json({ok:true,configs:await r8Configs(sb)});
  if(action==="r8_save_config"){
    if(!canEdit)return json({ok:false,error:"editor_required"},403);
    const area=clean(body?.area,40),cfg=R8_CONFIGS[area];if(!cfg)return json({ok:false,error:"invalid_area"},400);
    const before=await sb.from(cfg.table).select("*").eq("id",1).maybeSingle();if(!before.data)return json({ok:false,error:"config_missing"},404);
    const patch=r8Patch(area,body?.patch||{});if(Object.keys(patch).length<=1)return json({ok:false,error:"no_editable_fields"},400);
    await r8Snapshot(sb,"config:"+area,"1",before.data,userData.user.id,"update",body?.note||"");
    const saved=await sb.from(cfg.table).update(patch).eq("id",1).select("*").single();if(saved.error)return json({ok:false,error:"config_save_failed",detail:saved.error.message},400);
    return json({ok:true,config:saved.data});
  }
  if(action==="r8_versions"){
    const et=clean(body?.entity_type,80),ek=clean(body?.entity_key,120);let q=sb.from("papoai_admin_config_versions").select("*").order("created_at",{ascending:false}).limit(100);if(et)q=q.eq("entity_type",et);if(ek)q=q.eq("entity_key",ek);const r=await q;return json({ok:!r.error,versions:r.data||[],error:r.error?.message||null},r.error?400:200);
  }
  if(action==="r8_rollback_config"){
    if(!isOwner)return json({ok:false,error:"owner_required"},403);const vid=Number(body?.version_id||0),v=await sb.from("papoai_admin_config_versions").select("*").eq("id",vid).maybeSingle();if(!v.data)return json({ok:false,error:"version_not_found"},404);const ent=String(v.data.entity_type||"");if(!ent.startsWith("config:"))return json({ok:false,error:"unsupported_rollback_entity"},400);const area=ent.slice(7),cfg=R8_CONFIGS[area];if(!cfg)return json({ok:false,error:"invalid_area"},400);const current=await sb.from(cfg.table).select("*").eq("id",1).maybeSingle();if(current.data)await r8Snapshot(sb,ent,"1",current.data,userData.user.id,"rollback","rollback to version "+vid);const patch=r8Patch(area,v.data.snapshot||{}),saved=await sb.from(cfg.table).update(patch).eq("id",1).select("*").single();if(saved.error)return json({ok:false,error:"rollback_failed",detail:saved.error.message},400);return json({ok:true,config:saved.data});
  }
  if(action==="r8_save_model_price"){
    if(!isOwner)return json({ok:false,error:"owner_required"},403);const model=clean(body?.model,120);if(!model)return json({ok:false,error:"model_required"},400);const before=await sb.from("papoai_model_price_profiles").select("*").eq("model",model).maybeSingle();if(before.data)await r8Snapshot(sb,"model_price",model,before.data,userData.user.id,"update",body?.note||"");const row:any={model,input_usd_per_million:Number(body?.input_usd_per_million),cached_input_usd_per_million:Number(body?.cached_input_usd_per_million),output_usd_per_million:Number(body?.output_usd_per_million),source_note:clean(body?.source_note,500)||null,updated_by:userData.user.id,updated_at:new Date().toISOString()};if([row.input_usd_per_million,row.cached_input_usd_per_million,row.output_usd_per_million].some((n:any)=>!Number.isFinite(n)||n<0))return json({ok:false,error:"invalid_price"},400);const saved=await sb.from("papoai_model_price_profiles").upsert(row,{onConflict:"model"}).select("*").single();return json({ok:!saved.error,price:saved.data,error:saved.error?.message||null},saved.error?400:200);
  }

  if(action==="r8_knowledge_save"){
    if(!canEdit)return json({ok:false,error:"editor_required"},403);
    const type=clean(body?.type,40),table=entityTable(type),id=uuid(body?.id);
    if(!["knowledge","guidance","procedure"].includes(type)||!table)return json({ok:false,error:"invalid_entity_type"},400);
    let row:any={updated_by:userData.user.id,updated_at:new Date().toISOString()};
    if(type==="knowledge")row={...row,knowledge_key:clean(body?.knowledge_key,100).toLowerCase(),category:clean(body?.category,80),title:clean(body?.title,180),content:clean(body?.content,12000),keywords:strArray(body?.keywords),channel_scope:strArray(body?.channel_scope).length?strArray(body?.channel_scope):["whatsapp"],priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50)),source_note:clean(body?.source_note,500)||null,status:["draft","published","archived"].includes(body?.status)?body.status:"draft"};
    if(type==="guidance")row={...row,rule_key:clean(body?.rule_key,100).toLowerCase(),title:clean(body?.title,180),instruction:clean(body?.instruction,8000),intent_scope:strArray(body?.intent_scope),stage_scope:strArray(body?.stage_scope),channel_scope:strArray(body?.channel_scope).length?strArray(body?.channel_scope):["whatsapp"],behavior_tags:strArray(body?.behavior_tags),priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50)),status:["draft","published","archived"].includes(body?.status)?body.status:"draft"};
    if(type==="procedure")row={...row,procedure_key:clean(body?.procedure_key,100).toLowerCase(),title:clean(body?.title,180),trigger_description:clean(body?.trigger_description,2000),steps:Array.isArray(body?.steps)?body.steps.slice(0,30):[],allowed_actions:strArray(body?.allowed_actions),confirmation_actions:strArray(body?.confirmation_actions),fallback:clean(body?.fallback,2000)||null,priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50)),status:["draft","published","archived"].includes(body?.status)?body.status:"draft"};
    const keyValue=type==="knowledge"?row.knowledge_key:type==="guidance"?row.rule_key:row.procedure_key;
    const mainValue=type==="knowledge"?row.content:type==="guidance"?row.instruction:row.trigger_description;
    if(!keyValue||!row.title||!mainValue)return json({ok:false,error:"required_fields_missing"},400);
    if(id){
      const before=await sb.from(table).select("*").eq("id",id).maybeSingle();
      if(!before.data)return json({ok:false,error:"entity_not_found"},404);
      await r8Snapshot(sb,"knowledge:"+type,id,before.data,userData.user.id,"update",body?.note||"");
      const saved=await sb.from(table).update(row).eq("id",id).select("*").single();
      if(saved.error)return json({ok:false,error:"save_failed",detail:saved.error.message},400);
      return json({ok:true,item:saved.data});
    }
    row.created_by=userData.user.id;
    const saved=await sb.from(table).insert(row).select("*").single();
    if(saved.error)return json({ok:false,error:"save_failed",detail:saved.error.message},400);
    await r8Snapshot(sb,"knowledge:"+type,String(saved.data.id),saved.data,userData.user.id,"create",body?.note||"");
    return json({ok:true,item:saved.data});
  }
  if(action==="r8_restore_version"){
    if(!isOwner)return json({ok:false,error:"owner_required"},403);
    const versionId=Number(body?.version_id||0);
    const v=await sb.from("papoai_admin_config_versions").select("*").eq("id",versionId).maybeSingle();
    if(!v.data)return json({ok:false,error:"version_not_found"},404);
    const entity=String(v.data.entity_type||""),key=String(v.data.entity_key||""),snap=v.data.snapshot||{};
    if(entity.startsWith("config:")){
      const area=entity.slice(7),cfg=R8_CONFIGS[area];if(!cfg)return json({ok:false,error:"invalid_area"},400);
      const current=await sb.from(cfg.table).select("*").eq("id",1).maybeSingle();
      if(current.data)await r8Snapshot(sb,entity,"1",current.data,userData.user.id,"rollback","rollback to version "+versionId);
      const patch=r8Patch(area,snap),saved=await sb.from(cfg.table).update(patch).eq("id",1).select("*").single();
      if(saved.error)return json({ok:false,error:"rollback_failed",detail:saved.error.message},400);
      return json({ok:true,item:saved.data});
    }
    let table="",idColumn="id",idValue=key;
    if(entity==="product_sales_knowledge"){table="product_sales_knowledge";idColumn="product_id"}
    else if(entity==="customer_memory"){table="customer_service_memory"}
    else if(entity==="knowledge:knowledge"){table="service_knowledge_items"}
    else if(entity==="knowledge:guidance"){table="service_guidance_rules"}
    else if(entity==="knowledge:procedure"){table="service_procedures"}
    else return json({ok:false,error:"unsupported_rollback_entity"},400);
    const current=await sb.from(table).select("*").eq(idColumn,idValue).maybeSingle();
    if(current.data)await r8Snapshot(sb,entity,key,current.data,userData.user.id,"rollback","rollback to version "+versionId);
    const restored=await sb.from(table).upsert(snap,{onConflict:idColumn}).select("*").single();
    if(restored.error)return json({ok:false,error:"rollback_failed",detail:restored.error.message},400);
    return json({ok:true,item:restored.data});
  }

  if(action==="r8_products"){
    const search=clean(body?.q,120),limit=Math.max(1,Math.min(50,Number(body?.limit||20)));let q=sb.from("products").select("id,name,sku,gtin,brand,category,subcategory,price,offer_price,stock,image_url,is_active,physically_verified,updated_at").eq("is_active",true).order("name").limit(limit);if(search){const s=search.replace(/[,%()]/g," ");q=q.or("name.ilike.%"+s+"%,gtin.ilike.%"+s+"%,brand.ilike.%"+s+"%")}const r=await q;if(r.error)return json({ok:false,error:"products_failed",detail:r.error.message},400);const ids=(r.data||[]).map((p:any)=>p.id),k=ids.length?await sb.from("product_sales_knowledge").select("*").in("product_id",ids):{data:[]},km=new Map((k.data||[]).map((p:any)=>[p.product_id,p]));return json({ok:true,products:(r.data||[]).map((p:any)=>({...p,sales_knowledge:km.get(p.id)||null}))});
  }
  if(action==="r8_product_knowledge_save"){
    if(!canEdit)return json({ok:false,error:"editor_required"},403);const pid=uuid(body?.product_id);if(!pid)return json({ok:false,error:"product_id_required"},400);const before=await sb.from("product_sales_knowledge").select("*").eq("product_id",pid).maybeSingle();if(before.data)await r8Snapshot(sb,"product_sales_knowledge",pid,before.data,userData.user.id,"update",body?.note||"");const row:any={product_id:pid,aliases:strArray(body?.aliases,40),use_cases:strArray(body?.use_cases,40),audiences:strArray(body?.audiences,40),search_terms:strArray(body?.search_terms,80),cautions:strArray(body?.cautions,40),attributes:obj(body?.attributes),confidence:Math.max(0,Math.min(1,Number(body?.confidence??1))),enrichment_status:clean(body?.enrichment_status||"manual",40),enrichment_model:before.data?.enrichment_model||null,evidence:before.data?.evidence||{},source_urls:before.data?.source_urls||[],catalog_search_text:clean(body?.catalog_search_text||before.data?.catalog_search_text||"",8000),updated_at:new Date().toISOString()};const saved=await sb.from("product_sales_knowledge").upsert(row,{onConflict:"product_id"}).select("*").single();return json({ok:!saved.error,item:saved.data,error:saved.error?.message||null},saved.error?400:200);
  }
  if(action==="r8_customers"){
    const search=clean(body?.q,120).replace(/[,%()]/g," ");let q=sb.from("customers").select("id,name,primary_whatsapp_e164,preferred_reply,shopping_mode,order_count,lifetime_value,last_order_at,last_inbound_message_type,updated_at").eq("is_active",true).order("updated_at",{ascending:false}).limit(50);if(search)q=q.or("name.ilike.%"+search+"%,primary_whatsapp_e164.ilike.%"+search+"%");const r=await q;return json({ok:!r.error,customers:r.data||[],error:r.error?.message||null},r.error?400:200);
  }
  if(action==="r8_customer_detail"){
    const cid=uuid(body?.customer_id);if(!cid)return json({ok:false,error:"customer_id_required"},400);const [c,m,cv]=await Promise.all([sb.from("customers").select("id,name,primary_whatsapp_e164,preferred_reply,shopping_mode,order_count,lifetime_value,last_order_at,last_inbound_message_type,marketing_opt_in,updated_at").eq("id",cid).maybeSingle(),sb.from("customer_service_memory").select("id,memory_key,memory_value,confidence,status,source_kind,evidence_count,last_evidence_at,expires_at,updated_at").eq("customer_id",cid).order("updated_at",{ascending:false}).limit(100),sb.from("conversations").select("id,status,stage,mode,human_required,context_summary,updated_at").eq("customer_id",cid).order("updated_at",{ascending:false}).limit(10)]);return json({ok:true,customer:c.data||null,memories:m.data||[],conversations:cv.data||[]});
  }
  if(action==="r8_customer_memory_save"){
    if(!canEdit)return json({ok:false,error:"editor_required"},403);const cid=uuid(body?.customer_id),id=uuid(body?.id);if(!cid)return json({ok:false,error:"customer_id_required"},400);const key=clean(body?.memory_key,100).toLowerCase().replace(/[^a-z0-9_.-]/g,"_"),value=clean(body?.memory_value,1000);if(!key||!value)return json({ok:false,error:"memory_key_value_required"},400);if(/cpf|cnpj|password|senha|health|saude|relig|politic|sexual|criminal/.test(key))return json({ok:false,error:"sensitive_memory_key_blocked"},400);const row:any={customer_id:cid,memory_key:key,memory_value:value,confidence:1,status:["active","inactive","rejected"].includes(body?.status)?body.status:"active",source_kind:"declared",evidence_count:1,last_evidence_at:new Date().toISOString(),updated_at:new Date().toISOString(),metadata:{source:"r8_admin_manual"}};if(id){const before=await sb.from("customer_service_memory").select("*").eq("id",id).maybeSingle();if(!before.data)return json({ok:false,error:"memory_not_found"},404);await r8Snapshot(sb,"customer_memory",id,before.data,userData.user.id,"update",body?.note||"");const saved=await sb.from("customer_service_memory").update(row).eq("id",id).select("*").single();return json({ok:!saved.error,item:saved.data,error:saved.error?.message||null},saved.error?400:200)}const saved=await sb.from("customer_service_memory").insert(row).select("*").single();return json({ok:!saved.error,item:saved.data,error:saved.error?.message||null},saved.error?400:200);
  }
  if(action==="r8_orders"){const r=await sb.from("orders").select("id,order_number,status,total,payment_method,source,bling_order_id,sync_status,sync_error,created_at,confirmed_at,customer:customers(name,primary_whatsapp_e164)").order("created_at",{ascending:false}).limit(100);return json({ok:!r.error,orders:r.data||[],error:r.error?.message||null},r.error?400:200)}
  if(action==="r8_handoff_queue"){const q=await sb.rpc("get_papoai_assisted_handoff_queue_v1");return json({ok:!q.error,queue:q.data||{ok:true,count:0,items:[]},error:q.error?.message||null},q.error?400:200)}
  if(action==="r8_handoff_claim"){if(!canEdit)return json({ok:false,error:"editor_required"},403);const id=uuid(body?.handoff_id);if(!id)return json({ok:false,error:"handoff_id_required"},400);const q=await sb.rpc("claim_human_handoff_admin_v1",{p_handoff_id:id,p_admin_user_id:userData.user.id});return json({ok:!q.error,result:q.data,error:q.error?.message||null},q.error?400:200)}
  if(action==="r8_handoff_complete"){if(!canEdit)return json({ok:false,error:"editor_required"},403);const id=uuid(body?.handoff_id);if(!id)return json({ok:false,error:"handoff_id_required"},400);const q=await sb.rpc("complete_papoai_assisted_handoff_v1",{p_handoff_id:id,p_admin_user_id:userData.user.id,p_notes:clean(body?.notes,1000)||null});return json({ok:!q.error,result:q.data,error:q.error?.message||null},q.error?400:200)}
  if(action==="r8_eval_dashboard"){const q=await sb.rpc("get_papoai_brain_eval_dashboard_v1");return json({ok:!q.error,dashboard:q.data||null,error:q.error?.message||null},q.error?400:200)}
  if(action==="r8_eval_scenarios"){const q=await sb.from("papoai_brain_eval_scenarios").select("scenario_key,category,message_text,expected,priority,source,active,updated_at").order("priority").order("category").order("scenario_key").limit(300);return json({ok:!q.error,scenarios:q.data||[],error:q.error?.message||null},q.error?400:200)}
  if(action==="r8_eval_start"){
    if(!canEdit)return json({ok:false,error:"editor_required"},403);
    const suite=["full","smoke","category"].includes(body?.suite)?body.suite:"full";
    const category=clean(body?.category,80)||null;
    const cr=await sb.rpc("create_papoai_brain_eval_run_v1",{p_suite:suite,p_category:category,p_limit:Math.max(1,Math.min(300,Number(body?.limit||300)))});
    if(cr.error||cr.data?.ok!==true)return json({ok:false,error:cr.error?.message||cr.data?.reason||"eval_create_failed"},400);
    const ds=await sb.rpc("dispatch_papoai_brain_eval_run_v1",{p_run_id:cr.data.run_id});
    return json({ok:!ds.error&&ds.data?.ok!==false,run:cr.data,dispatch:ds.data||null,error:ds.error?.message||null},ds.error?500:200);
  }
  if(action==="r8_simulator"){const r=await r8Simulator(sb,userData.user.id,body);return json(r.body,r.status)}
  if(action==="r8_simulator_history"){const r=await sb.from("papoai_admin_simulator_runs").select("id,input_text,model,decision,commercial_opportunity,response_text,input_tokens,cached_input_tokens,output_tokens,estimated_cost_usd,latency_ms,success,error_code,created_at").order("created_at",{ascending:false}).limit(50);return json({ok:!r.error,runs:r.data||[],error:r.error?.message||null},r.error?400:200)}

  if(action==="dashboard"){
    const [{data:runtime},{count:knowledge},{count:guidance},{count:procedures},{count:tests},{count:verified},{count:sellable}]=await Promise.all([
      sb.from("service_intelligence_runtime_config").select("*").eq("id",1).maybeSingle(),sb.from("service_knowledge_items").select("id",{count:"exact",head:true}),sb.from("service_guidance_rules").select("id",{count:"exact",head:true}),sb.from("service_procedures").select("id",{count:"exact",head:true}),sb.from("service_regression_cases").select("id",{count:"exact",head:true}).eq("status","active"),sb.from("products").select("id",{count:"exact",head:true}).eq("physically_verified",true).eq("is_active",true),sb.from("products").select("id",{count:"exact",head:true}).eq("physically_verified",true).eq("is_active",true).gt("stock",0).gte("price",0)]);
    const {data:cfg}=await sb.from("automation_config").select("whatsapp_sales_mvp_enabled,whatsapp_sales_catalog_source,whatsapp_sales_images_enabled,whatsapp_sales_interactive_enabled,whatsapp_sales_order_submit_enabled,whatsapp_sales_bling_submit_enabled,whatsapp_live_canary_percent,bling_order_sync_enabled,bling_order_homologation_only").eq("id",1).maybeSingle();
    return json({ok:true,user:{role:admin.role,display_name:admin.display_name||null},runtime,whatsapp:cfg,counts:{knowledge:knowledge||0,guidance:guidance||0,procedures:procedures||0,tests:tests||0,verified_products:verified||0,sellable_products:sellable||0},catalog_source:"counter_verified"});
  }
  if(action==="list"){
    const type=clean(body?.type,40),table=entityTable(type);if(!table)return json({ok:false,error:"invalid_entity_type"},400);const status=clean(body?.status,30),q=clean(body?.q,120);let query:any=sb.from(table).select("*").order("updated_at",{ascending:false}).limit(200);if(status)query=query.eq("status",status);if(q)query=query.ilike("title",`%${q.replace(/[%_,()]/g,'')}%`);const {data,error}=await query;if(error)return json({ok:false,error:"list_failed",detail:error.message},500);return json({ok:true,items:data||[]});
  }
  if(action==="save"){
    if(!canEdit)return json({ok:false,error:"editor_required"},403);const type=clean(body?.type,40),table=entityTable(type);if(!table)return json({ok:false,error:"invalid_entity_type"},400);const id=uuid(body?.id);let row:any={updated_by:userData.user.id,updated_at:new Date().toISOString()};
    if(type==="knowledge")row={...row,knowledge_key:clean(body?.knowledge_key,100).toLowerCase(),category:clean(body?.category,80),title:clean(body?.title,180),content:clean(body?.content,12000),keywords:strArray(body?.keywords),channel_scope:strArray(body?.channel_scope).length?strArray(body?.channel_scope):["whatsapp"],priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50)),source_note:clean(body?.source_note,500)||null};
    if(type==="guidance")row={...row,rule_key:clean(body?.rule_key,100).toLowerCase(),title:clean(body?.title,180),instruction:clean(body?.instruction,8000),intent_scope:strArray(body?.intent_scope),stage_scope:strArray(body?.stage_scope),channel_scope:strArray(body?.channel_scope).length?strArray(body?.channel_scope):["whatsapp"],behavior_tags:strArray(body?.behavior_tags),priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50))};
    if(type==="procedure")row={...row,procedure_key:clean(body?.procedure_key,100).toLowerCase(),title:clean(body?.title,180),trigger_description:clean(body?.trigger_description,2000),steps:Array.isArray(body?.steps)?body.steps.slice(0,30):[],allowed_actions:strArray(body?.allowed_actions),confirmation_actions:strArray(body?.confirmation_actions),fallback:clean(body?.fallback,2000)||null,priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50))};
    if(type==="media")row={...row,media_key:clean(body?.media_key,100).toLowerCase(),media_type:clean(body?.media_type,40),title:clean(body?.title,180),product_id:uuid(body?.product_id)||null,basket_id:uuid(body?.basket_id)||null,media_url:clean(body?.media_url,1000)||null,caption_template:clean(body?.caption_template,1000)||null,use_when:clean(body?.use_when,2000)||null};
    if(type==="regression_case")row={...row,case_key:clean(body?.case_key,100).toLowerCase(),title:clean(body?.title,180),customer_message:clean(body?.customer_message,4000),setup:obj(body?.setup),expected_intent:clean(body?.expected_intent,80)||null,expected_action:clean(body?.expected_action,80)||null,expected_assertions:obj(body?.expected_assertions),priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50))};
    const required=type==="knowledge"?[row.knowledge_key,row.category,row.title,row.content]:type==="guidance"?[row.rule_key,row.title,row.instruction]:type==="procedure"?[row.procedure_key,row.title,row.trigger_description]:type==="media"?[row.media_key,row.media_type,row.title]:[row.case_key,row.title,row.customer_message];if(required.some((x:any)=>!x))return json({ok:false,error:"required_fields_missing"},400);
    let result:any,error:any;if(id){({data:result,error}=await sb.from(table).update(row).eq("id",id).select("*").single())}else{row.created_by=userData.user.id;({data:result,error}=await sb.from(table).insert(row).select("*").single())}if(error)return json({ok:false,error:"save_failed",detail:error.message},400);return json({ok:true,item:result});
  }
  if(action==="set_status"){
    if(!isOwner)return json({ok:false,error:"owner_required"},403);const type=clean(body?.type,40),table=entityTable(type),id=uuid(body?.id),status=clean(body?.status,30);if(!table||!id)return json({ok:false,error:"invalid_entity"},400);const allowed=type==="regression_case"?["active","disabled","archived"]:["draft","published","archived"];if(!allowed.includes(status))return json({ok:false,error:"invalid_status"},400);const {data:before}=await sb.from(table).select("status").eq("id",id).maybeSingle();if(!before)return json({ok:false,error:"entity_not_found"},404);const {data:item,error}=await sb.from(table).update({status,updated_by:userData.user.id,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();if(error)return json({ok:false,error:"status_update_failed",detail:error.message},400);await sb.from("service_intelligence_publication_events").insert({entity_type:type,entity_id:id,from_status:before.status,to_status:status,actor_user_id:userData.user.id,note:clean(body?.note,500)||null});return json({ok:true,item});
  }
  if(action==="runtime"){
    if(!isOwner)return json({ok:false,error:"owner_required"},403);const patch:any={updated_at:new Date().toISOString()};for(const k of ["enabled","knowledge_enabled","guidance_enabled","procedures_enabled","media_enabled","regression_suite_enabled"])if(typeof body?.[k]==="boolean")patch[k]=body[k];if(["off","homologation","live"].includes(body?.execution_mode))patch.execution_mode=body.execution_mode;const {data,error}=await sb.from("service_intelligence_runtime_config").update(patch).eq("id",1).select("*").single();if(error)return json({ok:false,error:"runtime_update_failed",detail:error.message},400);return json({ok:true,runtime:data});
  }
  if(action==="preview_bundle"){const {data,error}=await sb.rpc("get_service_intelligence_bundle_v1",{p_channel:"whatsapp",p_intent:clean(body?.intent,80)||null,p_stage:clean(body?.stage,80)||null});if(error)return json({ok:false,error:"preview_failed",detail:error.message},400);return json({ok:true,bundle:data});}
  if(action==="product_search"){const {data,error}=await sb.rpc("search_whatsapp_sellable_products_v1",{p_query:clean(body?.q,120),p_limit:Math.max(1,Math.min(20,Number(body?.limit||10)))});if(error)return json({ok:false,error:"product_search_failed",detail:error.message},400);return json({ok:true,products:data||[],source:"counter_verified"});}
  return json({ok:false,error:"unknown_action"},400);
});