import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";
import {planPapoAiTurn} from "../_shared/papoai-ai-planner-v1.mjs";

const ALLOWED_ORIGINS=new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br"
]);
const clean=(v:unknown,max=2000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const safeArray=(v:unknown,max=30)=>Array.isArray(v)?v.map(x=>clean(x,180)).filter(Boolean).slice(0,max):[];
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80))?clean(v,80):"";
const json=(req:Request,body:unknown,status=200,extra:Record<string,string>={})=>{
  const origin=req.headers.get("origin");
  const supabaseOrigin=new URL(Deno.env.get("SUPABASE_URL")||"https://example.invalid").origin;
  const allow=origin&&(ALLOWED_ORIGINS.has(origin)||origin===supabaseOrigin)?origin:supabaseOrigin;
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "Access-Control-Allow-Origin":allow,
      "Access-Control-Allow-Credentials":"true",
      "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
      "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
      "Vary":"Origin",
      ...extra
    }
  });
};
const sha256=async(v:string)=>{
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
};
const cookieValue=(req:Request,name:string)=>{
  const raw=req.headers.get("cookie")||"";
  for(const part of raw.split(";")){
    const [k,...rest]=part.trim().split("=");
    if(k===name)return decodeURIComponent(rest.join("=")||"");
  }
  return "";
};
const outputText=(data:any)=>Array.isArray(data?.output)
  ? data.output.flatMap((x:any)=>Array.isArray(x?.content)?x.content:[])
      .filter((x:any)=>x?.type==="output_text")
      .map((x:any)=>String(x.text||"")).join("").trim()
  : "";

async function resolveOpenAiKey(sb:any){
  let key=Deno.env.get("OPENAI_API_KEY")||"";
  if(!key){
    try{
      const q=await sb.rpc("get_conversation_worker_provider_secret_v1");
      if(typeof q.data==="string")key=q.data;
    }catch{}
  }
  return key;
}

async function authAdmin(req:Request,sb:any){
  const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(bearer){
    const {data,error}=await sb.auth.getUser(bearer);
    if(!error&&data?.user?.id){
      const a=await sb.from("admin_users").select("user_id,role,is_active,display_name,email").eq("user_id",data.user.id).maybeSingle();
      if(a.data?.is_active)return a.data;
    }
  }
  const raw=cookieValue(req,"papoai_admin_session");
  if(!raw)return null;
  const hash=await sha256(raw);
  const s=await sb.from("papoai_admin_web_sessions")
    .select("id,user_id,expires_at,revoked_at")
    .eq("token_hash",hash)
    .gt("expires_at",new Date().toISOString())
    .is("revoked_at",null)
    .maybeSingle();
  if(!s.data?.user_id)return null;
  await sb.from("papoai_admin_web_sessions").update({last_seen_at:new Date().toISOString()}).eq("id",s.data.id);
  const a=await sb.from("admin_users").select("user_id,role,is_active,display_name,email").eq("user_id",s.data.user_id).maybeSingle();
  return a.data?.is_active?a.data:null;
}

async function login(req:Request,sb:any,body:any){
  const pin=clean(body?.pin,12);
  if(!/^\d{6}$/.test(pin))return json(req,{ok:false,error:"invalid_pin_format"},400);
  const forwarded=clean(req.headers.get("x-forwarded-for"),200).split(",")[0]?.trim();
  const ip=clean(req.headers.get("cf-connecting-ip")||forwarded||"unknown",120);
  const ua=clean(req.headers.get("user-agent"),500);
  const fingerprint=await sha256(ip+"|"+ua);
  const check=await sb.rpc("verify_admin_pin_access_v1",{p_pin:pin,p_fingerprint:fingerprint});
  if(check.error)return json(req,{ok:false,error:"pin_check_failed"},500);
  if(check.data?.allowed!==true){
    const retry=Math.max(0,Number(check.data?.retry_after_seconds||0));
    return json(req,{ok:false,error:check.data?.reason||"invalid_pin",retry_after_seconds:retry},retry>0?429:401);
  }
  const owner=await sb.from("admin_users").select("user_id,role,is_active,display_name,email").eq("role","owner").eq("is_active",true).limit(1).maybeSingle();
  if(!owner.data?.user_id)return json(req,{ok:false,error:"owner_unavailable"},500);
  const raw=(crypto.randomUUID()+crypto.randomUUID()).replace(/-/g,"");
  const hash=await sha256(raw);
  const expires=new Date(Date.now()+8*60*60*1000).toISOString();
  await sb.from("papoai_admin_web_sessions").delete().lt("expires_at",new Date().toISOString());
  const ins=await sb.from("papoai_admin_web_sessions").insert({token_hash:hash,user_id:owner.data.user_id,expires_at:expires});
  if(ins.error)return json(req,{ok:false,error:"session_create_failed"},500);
  const cookie="papoai_admin_session="+encodeURIComponent(raw)+"; Path=/functions/v1/admin-papoai-commerce-v1; Max-Age=28800; HttpOnly; Secure; SameSite=Strict";
  return json(req,{ok:true,user:owner.data,expires_at:expires},200,{"Set-Cookie":cookie});
}

async function snapshot(sb:any,entityType:string,entityKey:string,value:any,actor:string,action="update",note=""){
  await sb.from("papoai_admin_config_versions").insert({
    entity_type:entityType,entity_key:entityKey,snapshot:value??{},action,
    actor_user_id:actor||null,note:clean(note,500)||null
  });
}

const CONFIGS:any={
  ai:{
    table:"papoai_ai_runtime_config",
    key:"1",
    fields:["primary_model","utility_model","primary_reasoning_effort","utility_reasoning_effort","max_recent_messages","max_message_chars","max_context_bytes","max_output_tokens","max_tool_calls","customer_preference_limit","frequent_product_limit","prompt_cache_key","prompt_cache_ttl"]
  },
  brain:{
    table:"papoai_commerce_brain_config",
    key:"1",
    fields:["offers_enabled","upsell_enabled","max_history_messages","max_product_results","component_prices_visible"]
  },
  commercial:{
    table:"papoai_commercial_policy_config",
    key:"1",
    fields:["max_segmenting_questions","max_recommendations","max_proactive_offers_per_cart","rejection_cooldown_days","strong_min_discount_percent","strong_min_discount_amount","strong_min_personalized_score","suppress_during_checkout","suppress_when_pending_action","suppress_after_decline"]
  },
  channel:{
    table:"papoai_channel_runtime_config",
    key:"1",
    fields:["transcription_model","vision_model","vision_detail","tts_model","tts_voice","tts_instructions","max_audio_bytes","max_image_bytes"]
  }
};

function sanitizePatch(area:string,input:any){
  const cfg=CONFIGS[area];
  const out:any={};
  if(!cfg)return out;
  for(const k of cfg.fields){
    if(input?.[k]===undefined)continue;
    const v=input[k];
    if(typeof v==="boolean")out[k]=v;
    else if(typeof v==="number"&&Number.isFinite(v))out[k]=v;
    else if(typeof v==="string")out[k]=clean(v,k==="tts_instructions"?1500:200);
  }
  out.updated_at=new Date().toISOString();
  return out;
}

async function configBundle(sb:any){
  const [ai,brain,commercial,channel,prices]=await Promise.all([
    sb.from("papoai_ai_runtime_config").select("*").eq("id",1).maybeSingle(),
    sb.from("papoai_commerce_brain_config").select("*").eq("id",1).maybeSingle(),
    sb.from("papoai_commercial_policy_config").select("*").eq("id",1).maybeSingle(),
    sb.from("papoai_channel_runtime_config").select("*").eq("id",1).maybeSingle(),
    sb.from("papoai_model_price_profiles").select("*").order("model")
  ]);
  return {ai:ai.data,brain:brain.data,commercial:commercial.data,channel:channel.data,prices:prices.data||[]};
}

async function overview(sb:any){
  const [activation,r7,products,customers,conversations,orders,handoffs,planner]=await Promise.all([
    sb.rpc("get_papoai_commerce_activation_readiness_v1"),
    sb.rpc("get_papoai_r7_readiness_v1"),
    sb.from("products").select("id",{count:"exact",head:true}).eq("is_active",true).eq("physically_verified",true).gt("stock",0).gt("price",0),
    sb.from("customers").select("id",{count:"exact",head:true}).eq("is_active",true),
    sb.from("conversations").select("id",{count:"exact",head:true}).gte("updated_at",new Date(Date.now()-86400000).toISOString()),
    sb.from("orders").select("id",{count:"exact",head:true}).gte("created_at",new Date(Date.now()-7*86400000).toISOString()),
    sb.from("human_handoffs").select("id",{count:"exact",head:true}).in("status",["open","claimed"]),
    sb.from("papoai_ai_planner_runs").select("id,success,decision,commercial_opportunity,latency_ms,input_tokens,cached_input_tokens,output_tokens,created_at").order("created_at",{ascending:false}).limit(12)
  ]);
  const recentOrders=await sb.from("orders").select("id,order_number,status,total,source,created_at").order("created_at",{ascending:false}).limit(8);
  return {
    activation:activation.data||{},
    r7:r7.data||{},
    counts:{
      sellable_products:products.count||0,
      active_customers:customers.count||0,
      conversations_24h:conversations.count||0,
      orders_7d:orders.count||0,
      pending_handoffs:handoffs.count||0
    },
    recent_orders:recentOrders.data||[],
    recent_planner_runs:planner.data||[]
  };
}

async function health(sb:any){
  const since=new Date(Date.now()-86400000).toISOString();
  const [activation,r7,r6,channel,plannerErrors,toolErrors,simErrors,handoffQueue]=await Promise.all([
    sb.rpc("get_papoai_commerce_activation_readiness_v1"),
    sb.rpc("get_papoai_r7_readiness_v1"),
    sb.rpc("get_papoai_r6_readiness_v1"),
    sb.rpc("get_papoai_channel_readiness_v1"),
    sb.from("papoai_ai_planner_runs").select("id",{count:"exact",head:true}).eq("success",false).gte("created_at",since),
    sb.from("papoai_ai_tool_audit").select("id",{count:"exact",head:true}).eq("success",false).gte("created_at",since),
    sb.from("papoai_admin_simulator_runs").select("id",{count:"exact",head:true}).eq("success",false).gte("created_at",since),
    sb.rpc("get_papoai_assisted_handoff_queue_v1")
  ]);
  return {
    activation:activation.data||{},
    r7:r7.data||{},
    r6:r6.data||{},
    channel:channel.data||{},
    errors_24h:{planner:plannerErrors.count||0,tools:toolErrors.count||0,simulator:simErrors.count||0},
    handoff_queue:handoffQueue.data||{ok:true,count:0,items:[]}
  };
}

async function executeReadTool(sb:any,toolKey:string,args:any,conversationId:string|null){
  const key=clean(toolKey,80);
  try{
    if(key==="search_products"){
      if(conversationId){
        const q=await sb.rpc("search_papoai_commerce_products_for_customer_v2",{
          p_conversation_id:conversationId,
          p_query:clean(args?.query,200),
          p_limit:Math.max(1,Math.min(12,Number(args?.limit||3))),
          p_max_price:args?.max_price??null,
          p_preference:["best_match","lowest_price","usual"].includes(args?.preference)?args.preference:"best_match"
        });
        return {ok:!q.error,result:q.data,error:q.error?.message||null};
      }
      const q=await sb.rpc("search_whatsapp_sellable_products_v1",{p_query:clean(args?.query,200),p_limit:Math.max(1,Math.min(12,Number(args?.limit||3)))});
      return {ok:!q.error,result:q.data,error:q.error?.message||null};
    }
    if(key==="search_baskets"){
      const q=await sb.rpc("get_papoai_commerce_basket_catalog_v1");
      return {ok:!q.error,result:q.data,error:q.error?.message||null};
    }
    if(key==="get_basket"){
      const q=await sb.rpc("get_papoai_commerce_basket_detail_v1",{p_basket:clean(args?.basket,180)});
      return {ok:!q.error,result:q.data,error:q.error?.message||null};
    }
    if(key==="get_product"&&uuid(args?.product_id)){
      const q=await sb.rpc("get_papoai_commerce_product_v1",{p_product_id:uuid(args.product_id)});
      return {ok:!q.error,result:q.data,error:q.error?.message||null};
    }
    if(!conversationId)return {ok:false,skipped:true,reason:"conversation_required"};
    const mapping:any={
      identify_customer:["get_papoai_commerce_customer_snapshot_v2",{p_conversation_id:conversationId}],
      get_customer_context:["get_papoai_commerce_customer_context_v3",{p_conversation_id:conversationId}],
      get_cart:["get_papoai_commerce_cart_state_v1",{p_conversation_id:conversationId}],
      get_checkout_next_step:["get_papoai_checkout_next_step_v1",{p_conversation_id:conversationId}],
      preview_order:["get_papoai_order_preview_v2",{p_conversation_id:conversationId,p_payment_method:args?.payment_method||null}],
      get_offers:["get_papoai_commerce_offers_v1",{p_conversation_id:conversationId,p_limit:Math.max(1,Math.min(10,Number(args?.limit||4)))}],
      recommend_replacement:["recommend_papoai_commerce_value_replacement_v1",{p_conversation_id:conversationId,p_source_query:clean(args?.source_query,180),p_limit:Math.max(1,Math.min(3,Number(args?.limit||3)))}]
    };
    if(!mapping[key])return {ok:false,skipped:true,reason:"write_or_unsupported_tool"};
    const q=await sb.rpc(mapping[key][0],mapping[key][1]);
    return {ok:!q.error,result:q.data,error:q.error?.message||null};
  }catch(e){
    return {ok:false,error:clean((e as Error)?.message,300)};
  }
}

async function finalDraft(apiKey:string,model:string,message:string,plan:any,toolResults:any[]){
  if(!apiKey)return {text:plan?.response_draft||"",usage:null,latency_ms:0};
  if(!toolResults.length)return {text:plan?.response_draft||"",usage:null,latency_ms:0};
  const started=Date.now();
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        model,store:false,max_output_tokens:400,reasoning:{effort:"low"},
        instructions:[
          "Redija a resposta final da atendente Dona Antônia em português brasileiro.",
          "Seja natural, curta, calorosa e objetiva.",
          "Use somente os fatos presentes no resultado das tools.",
          "Nunca invente preço, estoque, total, produto, pedido ou dado do cliente.",
          "Se a ação planejada for escrita/compromisso, explique o próximo passo sem executar.",
          "Não mencione ferramentas, JSON, sistema interno ou simulação."
        ].join(" "),
        input:[{role:"user",content:[{type:"input_text",text:JSON.stringify({message,plan,tool_results:toolResults})}]}],
        text:{verbosity:"low"}
      }),
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return {text:plan?.response_draft||"",usage:data?.usage||null,latency_ms:Date.now()-started,error:"final_http_"+response.status};
    return {text:outputText(data)||plan?.response_draft||"",usage:data?.usage||null,latency_ms:Date.now()-started};
  }catch(e){
    return {text:plan?.response_draft||"",usage:null,latency_ms:Date.now()-started,error:clean((e as Error)?.message,200)};
  }
}

async function simulator(sb:any,actor:any,body:any){
  const started=Date.now();
  const message=clean(body?.message,2000);
  if(!message)return {status:400,body:{ok:false,error:"message_required"}};
  let customerId=uuid(body?.customer_id)||null;
  let conversationId=uuid(body?.conversation_id)||null;
  const phone=clean(body?.phone,40).replace(/[^\d+]/g,"");
  if(!customerId&&phone){
    const digits=phone.replace(/\D/g,"");
    const normalized=digits.startsWith("55")?("+"+digits):("+55"+digits);
    const q=await sb.from("customers").select("id").eq("primary_whatsapp_e164",normalized).maybeSingle();
    customerId=q.data?.id||null;
  }
  if(!conversationId&&customerId){
    const q=await sb.from("conversations").select("id").eq("customer_id",customerId).order("updated_at",{ascending:false}).limit(1).maybeSingle();
    conversationId=q.data?.id||null;
  }

  let context:any;
  if(conversationId){
    const q=await sb.rpc("get_papoai_ai_context_pack_v3",{p_conversation_id:conversationId,p_current_message:message});
    if(q.error)return {status:400,body:{ok:false,error:"context_failed",detail:q.error.message}};
    context=q.data||{};
  }else{
    context={
      ok:true,
      schema_version:"papoai-admin-simulator-v1",
      current_message:message,
      conversation:{mode:"ai",stage:"new",response_preference:"auto"},
      customer_summary:{known_customer:false,personalization_available:false,direct_preferences:[],soft_preferences:[],frequent_products:[]},
      cart:{has_cart:false},
      checkout:{complete:false,question_count:0},
      pending_action:null,
      journey:{stage:"discovery",reason:"admin_simulator"},
      governor:{clarification_count:0,delegated:false},
      commercial:{opportunity:"none",reason:"simulator_default",candidate:null,recent_rejection:false,proactive_offer_count:0,max_proactive_offers_per_cart:1},
      human_precedence:{human_active:false,reason:"simulator"},
      policies:{max_segmenting_questions:2,delegation_means_recommend:true,ai_may_calculate_totals:false,commercial_calculation_authority:"supabase",full_catalog_in_context:false,full_history_in_context:false,sensitive_customer_fields_in_context:false},
      recent_messages:[],
      context_budget:{bytes:0,limit_bytes:18000,within_budget:true,recent_message_limit:0}
    };
  }

  const [cfgQ,toolsQ,key]=await Promise.all([
    sb.from("papoai_ai_runtime_config").select("*").eq("id",1).single(),
    sb.rpc("get_papoai_ai_planner_tools_v1"),
    resolveOpenAiKey(sb)
  ]);
  if(cfgQ.error||!cfgQ.data)return {status:500,body:{ok:false,error:"runtime_config_missing"}};
  if(toolsQ.error)return {status:500,body:{ok:false,error:"tools_missing"}};
  if(!key)return {status:503,body:{ok:false,error:"openai_key_missing"}};

  const model=cfgQ.data.primary_model||"gpt-5.6-terra";
  const planned=await planPapoAiTurn({
    message,contextPack:context,tools:Array.isArray(toolsQ.data)?toolsQ.data:[],
    apiKey:key,model,reasoningEffort:cfgQ.data.primary_reasoning_effort||"low",
    maxOutputTokens:Math.min(800,Number(cfgQ.data.max_output_tokens||500))
  });

  const toolResults:any[]=[];
  for(const call of Array.isArray(planned?.plan?.tool_calls)?planned.plan.tool_calls.slice(0,6):[]){
    let args:any={};
    try{args=JSON.parse(String(call?.arguments_json||"{}"))}catch{}
    const tool=(Array.isArray(toolsQ.data)?toolsQ.data:[]).find((x:any)=>x?.tool_key===call?.tool_key);
    if(tool?.operation_kind==="read"){
      const result=await executeReadTool(sb,String(call.tool_key||""),args,conversationId);
      toolResults.push({tool_key:call.tool_key,operation_kind:"read",arguments:args,...result});
    }else{
      toolResults.push({tool_key:call?.tool_key||"",operation_kind:tool?.operation_kind||"unknown",arguments:args,ok:true,executed:false,blocked_by_simulator:true});
    }
  }

  const final=planned?.ok?await finalDraft(key,model,message,planned.plan,toolResults):{text:"",usage:null,latency_ms:0};
  const usage1=planned?.usage||{};
  const usage2=final?.usage||{};
  const inputTokens=Number(usage1?.input_tokens||0)+Number(usage2?.input_tokens||0);
  const cachedTokens=Number(usage1?.input_tokens_details?.cached_tokens||0)+Number(usage2?.input_tokens_details?.cached_tokens||0);
  const outputTokens=Number(usage1?.output_tokens||0)+Number(usage2?.output_tokens||0);
  const priceQ=await sb.from("papoai_model_price_profiles").select("*").eq("model",model).maybeSingle();
  const price=priceQ.data;
  let cost:number|null=null;
  if(price){
    const nonCached=Math.max(0,inputTokens-cachedTokens);
    cost=(nonCached*Number(price.input_usd_per_million||0)+cachedTokens*Number(price.cached_input_usd_per_million||0)+outputTokens*Number(price.output_usd_per_million||0))/1000000;
  }
  const contextBytes=new TextEncoder().encode(JSON.stringify(context)).length;
  const success=planned?.ok===true;
  const row={
    actor_user_id:actor.user_id,customer_id:customerId,conversation_id:conversationId,input_text:message,
    model,decision:planned?.plan?.decision||null,commercial_opportunity:planned?.plan?.commercial_opportunity||null,
    journey_stage:planned?.plan?.journey_stage||null,sales_next_step:planned?.plan?.sales_next_step||null,
    proposed_tool_calls:planned?.plan?.tool_calls||[],tool_results:toolResults,response_text:final?.text||planned?.plan?.response_draft||null,
    context_snapshot:context,context_bytes:contextBytes,input_tokens:inputTokens,cached_input_tokens:cachedTokens,output_tokens:outputTokens,
    estimated_cost_usd:cost,latency_ms:Date.now()-started,success,error_code:success?null:String(planned?.error||"planner_failed")
  };
  const saved=await sb.from("papoai_admin_simulator_runs").insert(row).select("id,created_at").single();
  return {status:200,body:{
    ok:success,simulation_id:saved.data?.id||null,created_at:saved.data?.created_at||null,
    response:row.response_text,decision:row.decision,confidence:planned?.plan?.confidence??null,
    commercial_opportunity:row.commercial_opportunity,journey_stage:row.journey_stage,sales_next_step:row.sales_next_step,
    should_handoff:Boolean(planned?.plan?.should_handoff),question:planned?.plan?.question||"",
    tools:row.proposed_tool_calls,tool_results:toolResults,context,
    metrics:{model,input_tokens:inputTokens,cached_input_tokens:cachedTokens,output_tokens:outputTokens,estimated_cost_usd:cost,latency_ms:row.latency_ms,context_bytes:contextBytes},
    policy:{adjusted:Boolean(planned?.policy_adjusted),violations:planned?.policy_violations||[]},
    external_side_effect:false,writes_executed:false
  }};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return json(req,{ok:true});
  const url=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return json(req,{ok:false,error:"server_config"},500);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

  if(req.method==="GET"){
    return json(req,{ok:true,service:"admin-papoai-commerce-v1",version:1,r8:true,production_activation_authorized:false});
  }
  if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:"invalid_json"},400)}
  const action=clean(body?.action||"session",80).toLowerCase();

  if(action==="login")return await login(req,sb,body);

  const admin=await authAdmin(req,sb);
  if(!admin)return json(req,{ok:false,error:"admin_auth_required"},401);
  const isOwner=admin.role==="owner";
  const canEdit=isOwner||["admin","manager"].includes(String(admin.role||""));

  if(action==="logout"){
    const raw=cookieValue(req,"papoai_admin_session");
    if(raw){const hash=await sha256(raw);await sb.from("papoai_admin_web_sessions").update({revoked_at:new Date().toISOString()}).eq("token_hash",hash);}
    return json(req,{ok:true},200,{"Set-Cookie":"papoai_admin_session=; Path=/functions/v1/admin-papoai-commerce-v1; Max-Age=0; HttpOnly; Secure; SameSite=Strict"});
  }
  if(action==="session")return json(req,{ok:true,user:admin});
  if(action==="overview")return json(req,{ok:true,...await overview(sb)});
  if(action==="health")return json(req,{ok:true,...await health(sb)});
  if(action==="intelligence")return json(req,{ok:true,configs:await configBundle(sb)});

  if(action==="save_config"){
    if(!canEdit)return json(req,{ok:false,error:"editor_required"},403);
    const area=clean(body?.area,40);
    const cfg=CONFIGS[area];
    if(!cfg)return json(req,{ok:false,error:"invalid_area"},400);
    const before=await sb.from(cfg.table).select("*").eq("id",1).maybeSingle();
    if(!before.data)return json(req,{ok:false,error:"config_missing"},404);
    const patch=sanitizePatch(area,body?.patch||{});
    if(Object.keys(patch).length<=1)return json(req,{ok:false,error:"no_editable_fields"},400);
    await snapshot(sb,"config:"+area,"1",before.data,admin.user_id,"update",body?.note||"");
    const saved=await sb.from(cfg.table).update(patch).eq("id",1).select("*").single();
    if(saved.error)return json(req,{ok:false,error:"config_save_failed",detail:saved.error.message},400);
    return json(req,{ok:true,config:saved.data});
  }

  if(action==="save_model_price"){
    if(!isOwner)return json(req,{ok:false,error:"owner_required"},403);
    const model=clean(body?.model,120);
    if(!model)return json(req,{ok:false,error:"model_required"},400);
    const before=await sb.from("papoai_model_price_profiles").select("*").eq("model",model).maybeSingle();
    if(before.data)await snapshot(sb,"model_price",model,before.data,admin.user_id,"update",body?.note||"");
    const row={
      model,
      input_usd_per_million:Number(body?.input_usd_per_million),
      cached_input_usd_per_million:Number(body?.cached_input_usd_per_million),
      output_usd_per_million:Number(body?.output_usd_per_million),
      source_note:clean(body?.source_note,500)||null,
      updated_by:admin.user_id,updated_at:new Date().toISOString()
    };
    if([row.input_usd_per_million,row.cached_input_usd_per_million,row.output_usd_per_million].some(x=>!Number.isFinite(x)||x<0))return json(req,{ok:false,error:"invalid_price"},400);
    const saved=await sb.from("papoai_model_price_profiles").upsert(row,{onConflict:"model"}).select("*").single();
    if(saved.error)return json(req,{ok:false,error:"price_save_failed",detail:saved.error.message},400);
    return json(req,{ok:true,price:saved.data});
  }

  if(action==="versions"){
    const entityType=clean(body?.entity_type,80),entityKey=clean(body?.entity_key,120);
    let q=sb.from("papoai_admin_config_versions").select("*").order("created_at",{ascending:false}).limit(100);
    if(entityType)q=q.eq("entity_type",entityType);
    if(entityKey)q=q.eq("entity_key",entityKey);
    const r=await q;
    return json(req,{ok:!r.error,versions:r.data||[],error:r.error?.message||null},r.error?400:200);
  }

  if(action==="rollback_config"){
    if(!isOwner)return json(req,{ok:false,error:"owner_required"},403);
    const versionId=Number(body?.version_id||0);
    const v=await sb.from("papoai_admin_config_versions").select("*").eq("id",versionId).maybeSingle();
    if(!v.data)return json(req,{ok:false,error:"version_not_found"},404);
    const entity=String(v.data.entity_type||"");
    if(!entity.startsWith("config:"))return json(req,{ok:false,error:"unsupported_rollback_entity"},400);
    const area=entity.slice(7),cfg=CONFIGS[area];
    if(!cfg)return json(req,{ok:false,error:"invalid_area"},400);
    const current=await sb.from(cfg.table).select("*").eq("id",1).maybeSingle();
    if(current.data)await snapshot(sb,entity,"1",current.data,admin.user_id,"rollback","rollback to version "+versionId);
    const patch=sanitizePatch(area,v.data.snapshot||{});
    const saved=await sb.from(cfg.table).update(patch).eq("id",1).select("*").single();
    if(saved.error)return json(req,{ok:false,error:"rollback_failed",detail:saved.error.message},400);
    return json(req,{ok:true,config:saved.data});
  }

  if(action==="knowledge_list"){
    const type=clean(body?.type||"knowledge",30);
    const map:any={knowledge:"service_knowledge_items",guidance:"service_guidance_rules",procedure:"service_procedures"};
    const table=map[type];if(!table)return json(req,{ok:false,error:"invalid_type"},400);
    let q=sb.from(table).select("*").order("updated_at",{ascending:false}).limit(200);
    const status=clean(body?.status,30),search=clean(body?.q,120).replace(/[%_,()]/g," ");
    if(status)q=q.eq("status",status);
    if(search)q=q.ilike("title","%"+search+"%");
    const r=await q;return json(req,{ok:!r.error,items:r.data||[],error:r.error?.message||null},r.error?400:200);
  }

  if(action==="knowledge_save"){
    if(!canEdit)return json(req,{ok:false,error:"editor_required"},403);
    const type=clean(body?.type,30),id=uuid(body?.id);
    const map:any={
      knowledge:{table:"service_knowledge_items",key:"knowledge_key"},
      guidance:{table:"service_guidance_rules",key:"rule_key"},
      procedure:{table:"service_procedures",key:"procedure_key"}
    };
    const def=map[type];if(!def)return json(req,{ok:false,error:"invalid_type"},400);
    let row:any={updated_by:admin.user_id,updated_at:new Date().toISOString()};
    if(type==="knowledge")row={...row,knowledge_key:clean(body?.knowledge_key,100).toLowerCase(),category:clean(body?.category,80),title:clean(body?.title,180),content:clean(body?.content,12000),keywords:safeArray(body?.keywords),channel_scope:safeArray(body?.channel_scope).length?safeArray(body?.channel_scope):["whatsapp"],priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50)),source_note:clean(body?.source_note,500)||null,status:["draft","published","archived"].includes(body?.status)?body.status:"draft"};
    if(type==="guidance")row={...row,rule_key:clean(body?.rule_key,100).toLowerCase(),title:clean(body?.title,180),instruction:clean(body?.instruction,8000),intent_scope:safeArray(body?.intent_scope),stage_scope:safeArray(body?.stage_scope),channel_scope:safeArray(body?.channel_scope).length?safeArray(body?.channel_scope):["whatsapp"],behavior_tags:safeArray(body?.behavior_tags),priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50)),status:["draft","published","archived"].includes(body?.status)?body.status:"draft"};
    if(type==="procedure")row={...row,procedure_key:clean(body?.procedure_key,100).toLowerCase(),title:clean(body?.title,180),trigger_description:clean(body?.trigger_description,2000),steps:Array.isArray(body?.steps)?body.steps.slice(0,30):[],allowed_actions:safeArray(body?.allowed_actions),confirmation_actions:safeArray(body?.confirmation_actions),fallback:clean(body?.fallback,2000)||null,priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50)),status:["draft","published","archived"].includes(body?.status)?body.status:"draft"};
    if(id){
      const before=await sb.from(def.table).select("*").eq("id",id).maybeSingle();
      if(!before.data)return json(req,{ok:false,error:"item_not_found"},404);
      await snapshot(sb,"knowledge:"+type,id,before.data,admin.user_id,"update",body?.note||"");
      const saved=await sb.from(def.table).update(row).eq("id",id).select("*").single();
      return json(req,{ok:!saved.error,item:saved.data,error:saved.error?.message||null},saved.error?400:200);
    }
    row.created_by=admin.user_id;
    const saved=await sb.from(def.table).insert(row).select("*").single();
    return json(req,{ok:!saved.error,item:saved.data,error:saved.error?.message||null},saved.error?400:200);
  }

  if(action==="products"){
    const search=clean(body?.q,120);
    const limit=Math.max(1,Math.min(50,Number(body?.limit||20)));
    let q=sb.from("products").select("id,name,sku,gtin,brand,category,subcategory,price,offer_price,stock,image_url,is_active,physically_verified,updated_at").eq("is_active",true).order("name").limit(limit);
    if(search){const s=search.replace(/[,%()]/g," ");q=q.or("name.ilike.%"+s+"%,gtin.ilike.%"+s+"%,brand.ilike.%"+s+"%");}
    const r=await q;
    if(r.error)return json(req,{ok:false,error:"products_failed",detail:r.error.message},400);
    const ids=(r.data||[]).map((x:any)=>x.id);
    const k=ids.length?await sb.from("product_sales_knowledge").select("*").in("product_id",ids):{data:[]};
    const km=new Map((k.data||[]).map((x:any)=>[x.product_id,x]));
    return json(req,{ok:true,products:(r.data||[]).map((x:any)=>({...x,sales_knowledge:km.get(x.id)||null}))});
  }

  if(action==="product_knowledge_save"){
    if(!canEdit)return json(req,{ok:false,error:"editor_required"},403);
    const productId=uuid(body?.product_id);if(!productId)return json(req,{ok:false,error:"product_id_required"},400);
    const before=await sb.from("product_sales_knowledge").select("*").eq("product_id",productId).maybeSingle();
    if(before.data)await snapshot(sb,"product_sales_knowledge",productId,before.data,admin.user_id,"update",body?.note||"");
    const row:any={
      product_id:productId,
      aliases:safeArray(body?.aliases,40),
      use_cases:safeArray(body?.use_cases,40),
      audiences:safeArray(body?.audiences,40),
      search_terms:safeArray(body?.search_terms,80),
      cautions:safeArray(body?.cautions,40),
      attributes:body?.attributes&&typeof body.attributes==="object"&&!Array.isArray(body.attributes)?body.attributes:{},
      confidence:Math.max(0,Math.min(1,Number(body?.confidence??1))),
      enrichment_status:clean(body?.enrichment_status||"manual",40),
      enrichment_model:before.data?.enrichment_model||null,
      evidence:before.data?.evidence||{},
      source_urls:before.data?.source_urls||[],
      catalog_search_text:clean(body?.catalog_search_text||before.data?.catalog_search_text||"",8000),
      updated_at:new Date().toISOString()
    };
    const saved=await sb.from("product_sales_knowledge").upsert(row,{onConflict:"product_id"}).select("*").single();
    return json(req,{ok:!saved.error,item:saved.data,error:saved.error?.message||null},saved.error?400:200);
  }

  if(action==="customers"){
    const search=clean(body?.q,120).replace(/[,%()]/g," ");
    let q=sb.from("customers").select("id,name,primary_whatsapp_e164,preferred_reply,shopping_mode,order_count,lifetime_value,last_order_at,last_inbound_message_type,updated_at").eq("is_active",true).order("updated_at",{ascending:false}).limit(50);
    if(search)q=q.or("name.ilike.%"+search+"%,primary_whatsapp_e164.ilike.%"+search+"%");
    const r=await q;return json(req,{ok:!r.error,customers:r.data||[],error:r.error?.message||null},r.error?400:200);
  }

  if(action==="customer_detail"){
    const customerId=uuid(body?.customer_id);if(!customerId)return json(req,{ok:false,error:"customer_id_required"},400);
    const [customer,memories,convs]=await Promise.all([
      sb.from("customers").select("id,name,primary_whatsapp_e164,preferred_reply,shopping_mode,order_count,lifetime_value,last_order_at,last_inbound_message_type,marketing_opt_in,updated_at").eq("id",customerId).maybeSingle(),
      sb.from("customer_service_memory").select("id,memory_key,memory_value,confidence,status,source_kind,evidence_count,last_evidence_at,expires_at,updated_at").eq("customer_id",customerId).order("updated_at",{ascending:false}).limit(100),
      sb.from("conversations").select("id,status,stage,mode,human_required,context_summary,updated_at").eq("customer_id",customerId).order("updated_at",{ascending:false}).limit(10)
    ]);
    return json(req,{ok:true,customer:customer.data||null,memories:memories.data||[],conversations:convs.data||[]});
  }

  if(action==="customer_memory_save"){
    if(!canEdit)return json(req,{ok:false,error:"editor_required"},403);
    const customerId=uuid(body?.customer_id),id=uuid(body?.id);
    if(!customerId)return json(req,{ok:false,error:"customer_id_required"},400);
    const key=clean(body?.memory_key,100).toLowerCase().replace(/[^a-z0-9_.-]/g,"_");
    const value=clean(body?.memory_value,1000);
    if(!key||!value)return json(req,{ok:false,error:"memory_key_value_required"},400);
    if(/cpf|cnpj|password|senha|health|saude|relig|politic|sexual|criminal/.test(key))return json(req,{ok:false,error:"sensitive_memory_key_blocked"},400);
    const row:any={customer_id:customerId,memory_key:key,memory_value:value,confidence:1,status:["active","inactive","rejected"].includes(body?.status)?body.status:"active",source_kind:"declared",evidence_count:1,last_evidence_at:new Date().toISOString(),updated_at:new Date().toISOString(),metadata:{source:"r8_admin_manual"}};
    if(id){
      const before=await sb.from("customer_service_memory").select("*").eq("id",id).maybeSingle();
      if(!before.data)return json(req,{ok:false,error:"memory_not_found"},404);
      await snapshot(sb,"customer_memory",id,before.data,admin.user_id,"update",body?.note||"");
      const saved=await sb.from("customer_service_memory").update(row).eq("id",id).select("*").single();
      return json(req,{ok:!saved.error,item:saved.data,error:saved.error?.message||null},saved.error?400:200);
    }
    const saved=await sb.from("customer_service_memory").insert(row).select("*").single();
    return json(req,{ok:!saved.error,item:saved.data,error:saved.error?.message||null},saved.error?400:200);
  }

  if(action==="orders"){
    const r=await sb.from("orders").select("id,order_number,status,total,payment_method,source,bling_order_id,sync_status,sync_error,created_at,confirmed_at,customer:customers(name,primary_whatsapp_e164)").order("created_at",{ascending:false}).limit(100);
    return json(req,{ok:!r.error,orders:r.data||[],error:r.error?.message||null},r.error?400:200);
  }

  if(action==="handoff_queue"){
    const q=await sb.rpc("get_papoai_assisted_handoff_queue_v1");
    return json(req,{ok:!q.error,queue:q.data||{ok:true,count:0,items:[]},error:q.error?.message||null},q.error?400:200);
  }
  if(action==="handoff_claim"){
    if(!canEdit)return json(req,{ok:false,error:"editor_required"},403);
    const id=uuid(body?.handoff_id);if(!id)return json(req,{ok:false,error:"handoff_id_required"},400);
    const q=await sb.rpc("claim_human_handoff_admin_v1",{p_handoff_id:id,p_admin_user_id:admin.user_id});
    return json(req,{ok:!q.error,result:q.data,error:q.error?.message||null},q.error?400:200);
  }
  if(action==="handoff_complete"){
    if(!canEdit)return json(req,{ok:false,error:"editor_required"},403);
    const id=uuid(body?.handoff_id);if(!id)return json(req,{ok:false,error:"handoff_id_required"},400);
    const q=await sb.rpc("complete_papoai_assisted_handoff_v1",{p_handoff_id:id,p_admin_user_id:admin.user_id,p_notes:clean(body?.notes,1000)||null});
    return json(req,{ok:!q.error,result:q.data,error:q.error?.message||null},q.error?400:200);
  }

  if(action==="simulator") {
    const result=await simulator(sb,admin,body);
    return json(req,result.body,result.status);
  }
  if(action==="simulator_history"){
    const r=await sb.from("papoai_admin_simulator_runs").select("id,input_text,model,decision,commercial_opportunity,response_text,input_tokens,cached_input_tokens,output_tokens,estimated_cost_usd,latency_ms,success,error_code,created_at").order("created_at",{ascending:false}).limit(50);
    return json(req,{ok:!r.error,runs:r.data||[],error:r.error?.message||null},r.error?400:200);
  }

  return json(req,{ok:false,error:"unknown_action"},400);
});
