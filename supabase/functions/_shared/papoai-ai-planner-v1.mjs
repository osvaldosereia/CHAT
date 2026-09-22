const clean=(v,max=2000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const arr=(v)=>Array.isArray(v)?v:[];
const norm=(v)=>clean(v,500).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function outputText(data){
  return arr(data?.output)
    .flatMap(x=>arr(x?.content))
    .filter(x=>x?.type==='output_text')
    .map(x=>String(x.text||''))
    .join('')
    .trim();
}

function delegated(message){
  const m=norm(message);
  return /\b(voce decide|pode decidir|escolhe pra mim|escolha pra mim|voce escolhe|pode escolher|qual voce recomenda|me recomenda|o que voce acha melhor|nao sei,? voce decide|nao sei pode escolher)\b/.test(m);
}

export function normalizePapoAiCommercialPlan({plan,contextPack,message}={}){
  const p={...(plan||{})};
  const violations=[];
  const commercial=String(contextPack?.commercial?.opportunity||'none').toLowerCase();
  const clarificationCount=Number(contextPack?.governor?.clarification_count||0);
  const isDelegated=delegated(message)||contextPack?.governor?.delegated===true;
  const journey=String(contextPack?.journey?.stage||'unknown');

  if(!['none','weak','strong'].includes(commercial)){
    violations.push('invalid_server_commercial_signal');
  }

  if(String(p.commercial_opportunity||'none').toLowerCase()!==commercial){
    violations.push('commercial_signal_mismatch');
  }
  p.commercial_opportunity=['none','weak','strong'].includes(commercial)?commercial:'none';

  if(p.decision==='ASK'&&isDelegated){
    p.decision='RECOMMEND';
    p.question='';
    p.reason='delegation_prevents_reasking';
    violations.push('ask_after_delegation');
  }

  if(p.decision==='ASK'&&clarificationCount>=2){
    p.decision='RECOMMEND';
    p.question='';
    p.reason='clarification_limit_enforced';
    violations.push('ask_after_question_limit');
  }

  if(p.proactive_offer_requested===true&&p.commercial_opportunity!=='strong'){
    p.proactive_offer_requested=false;
    violations.push('proactive_offer_without_strong_signal');
  }

  if(p.proactive_offer_requested===true&&['checkout','confirmation','completed','human'].includes(journey)){
    p.proactive_offer_requested=false;
    violations.push('proactive_offer_during_suppressed_stage');
  }

  if(p.commercial_opportunity==='weak'&&p.sales_next_step==='offer_complement'){
    p.sales_next_step='answer_need';
    p.proactive_offer_requested=false;
    violations.push('weak_signal_attempted_interruption');
  }

  if(isDelegated&&p.sales_next_step==='clarify_once'){
    p.sales_next_step='recommend_best';
    violations.push('delegation_requires_recommendation');
  }

  p.journey_stage=journey;
  return {
    plan:p,
    policy_adjusted:violations.length>0,
    policy_violations:violations
  };
}

export async function planPapoAiTurn({
  message,
  contextPack,
  tools,
  apiKey,
  model='gpt-5.6-terra',
  reasoningEffort='low',
  maxOutputTokens=500
}){
  const started=Date.now();
  if(!apiKey)return {ok:false,error:'missing_api_key',latency_ms:0};

  const schema={
    type:'object',
    additionalProperties:false,
    properties:{
      decision:{type:'string',enum:['RESPOND','ASK','RECOMMEND','ACT']},
      confidence:{type:'number',minimum:0,maximum:1},
      commercial_opportunity:{type:'string',enum:['none','weak','strong']},
      proactive_offer_requested:{type:'boolean'},
      personalization_used:{type:'boolean'},
      journey_stage:{type:'string',enum:['discovery','selection','personalization','checkout','confirmation','completed','human','unknown']},
      sales_next_step:{type:'string',enum:[
        'answer_need','clarify_once','show_options','recommend_best','modify_cart',
        'offer_complement','checkout','confirm_order','handoff','none'
      ]},
      reason:{type:'string'},
      should_handoff:{type:'boolean'},
      question:{type:'string'},
      response_draft:{type:'string'},
      missing_information:{type:'array',items:{type:'string'},maxItems:4},
      tool_calls:{
        type:'array',
        maxItems:6,
        items:{
          type:'object',
          additionalProperties:false,
          properties:{
            tool_key:{type:'string'},
            arguments_json:{type:'string'}
          },
          required:['tool_key','arguments_json']
        }
      }
    },
    required:[
      'decision','confidence','commercial_opportunity','proactive_offer_requested',
      'personalization_used','journey_stage','sales_next_step','reason','should_handoff',
      'question','response_draft','missing_information','tool_calls'
    ]
  };

  const instructions=[
    'Você é o planner de uma excelente vendedora humana da Dona Antônia. Planeje o próximo turno; não execute ações.',
    'Seu primeiro objetivo é resolver a necessidade do cliente. O segundo é facilitar a compra e conduzir naturalmente ao fechamento.',
    'Se já existe informação suficiente para uma resposta satisfatória, não interrogue: RESPOND, RECOMMEND ou ACT.',
    'Só escolha ASK quando a informação ausente mudar materialmente a recomendação ou impedir uma ação segura.',
    'Faça no máximo uma pergunta por mensagem e respeite o limite acumulado de 2 perguntas por assunto.',
    'Se o cliente delegou a escolha ("você decide", "pode escolher"), RECOMMEND: nunca pergunte de novo apenas para devolver a decisão ao cliente.',
    'Quando houver opções adequadas, prefira 2 ou 3 recomendações úteis em vez de listas longas.',
    'Use preferências e histórico discretamente. Não revele detalhes antigos de forma invasiva.',
    'Entenda orçamento: se houver teto de preço, use max_price em search_products. Use preference=lowest_price se preço for prioridade e preference=usual quando o cliente pedir o que costuma comprar.',
    'Quando o cliente mudar de ideia, acompanhe a mudança sem resistência; cancele ação pendente se ela tiver sido superada.',
    'A oportunidade comercial oficial está em context.commercial.opportunity. Copie esse valor; não invente outro.',
    'Sinal none: não faça oferta proativa. Sinal weak: guarde a oportunidade e não interrompa. Sinal strong: pode sugerir uma única oferta relevante, somente depois de resolver a necessidade principal.',
    'Nunca faça oferta proativa durante checkout, confirmação, atendimento humano ou após recusa recente.',
    'Uma oferta deve parecer ajuda comercial contextual, não propaganda aleatória.',
    'Se o cliente já demonstrou decisão de compra, avance para ação/carrinho/checkout em vez de continuar explicando.',
    'Se o cliente pedir explicitamente para repetir a última compra ou cesta, chame repeat_last_purchase imediatamente. Essa tool apenas prepara a proposta com condições atuais; não faça uma pergunta de confirmação antes dela.',
    'Para troca delegada como "tira o arroz e você decide", chame recommend_replacement diretamente com source_query. Essa tool já resolve o item no carrinho; não chame get_cart antes apenas para localizar o produto.',
    'Use tools para dados atuais. Nunca invente preço, estoque, total, composição, pedido, endereço ou histórico.',
    'Quando context.service_knowledge ou context.service_intelligence trouxer política publicada relevante, trate-a como fato confiável e responda diretamente. Não faça handoff para uma dúvida que essa política já resolve.',
    'Preço, estoque, descontos, totais e mutações pertencem ao Supabase, não ao seu cálculo.',
    'Em tool_calls use somente tool_key existente em available_tools.',
    'Copie tool_key EXATAMENTE como aparece em available_tools. Nunca acrescente domínio ou prefixo: use set_payment_method, nunca checkout.set_payment_method.',
    'arguments_json deve ser JSON válido em uma única string e obedecer ao input_schema.',
    'response_draft deve ser curto, natural, caloroso e objetivo. Não pareça URA e não exagere em emojis.',
    'reason deve ser curta e operacional; não revele cadeia de raciocínio.'
  ].join(' ');

  const payload={
    message:clean(message,2000),
    context:contextPack,
    available_tools:tools
  };

  try{
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,
        store:false,
        max_output_tokens:Math.max(220,Math.min(1400,Number(maxOutputTokens)||500)),
        reasoning:{effort:reasoningEffort||'low'},
        instructions,
        input:[{role:'user',content:[{type:'input_text',text:JSON.stringify(payload)}]}],
        text:{verbosity:'low',format:{type:'json_schema',name:'papoai_turn_plan',strict:true,schema}}
      }),
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({}));
    const latency=Date.now()-started;

    if(!response.ok){
      return {
        ok:false,error:'openai_http_error',status:response.status,
        response_id:data?.id||null,latency_ms:latency,usage:data?.usage||null
      };
    }

    let rawPlan=null;
    try{rawPlan=JSON.parse(outputText(data)||'{}')}catch{
      return {
        ok:false,error:'planner_parse_error',response_id:data?.id||null,
        latency_ms:latency,usage:data?.usage||null
      };
    }

    const canonicalToolKeys=new Set(arr(tools).map(x=>String(x?.tool_key||'')).filter(Boolean));
    const toolKeyViolations=[];
    if(Array.isArray(rawPlan?.tool_calls)){
      rawPlan.tool_calls=rawPlan.tool_calls.map((call)=>{
        const original=String(call?.tool_key||'');
        if(canonicalToolKeys.has(original))return call;
        const suffix=original.includes('.')?original.split('.').pop():'';
        if(suffix&&canonicalToolKeys.has(suffix)){
          toolKeyViolations.push('tool_key_domain_prefix_normalized');
          return {...call,tool_key:suffix};
        }
        return call;
      });
    }

    const normalized=normalizePapoAiCommercialPlan({
      plan:rawPlan,contextPack,message
    });
    if(toolKeyViolations.length){
      normalized.policy_adjusted=true;
      normalized.policy_violations=[
        ...new Set([...(normalized.policy_violations||[]),...toolKeyViolations])
      ];
    }

    return {
      ok:true,
      plan:normalized.plan,
      raw_plan:rawPlan,
      policy_adjusted:normalized.policy_adjusted,
      policy_violations:normalized.policy_violations,
      response_id:data?.id||null,
      latency_ms:latency,
      usage:data?.usage||null
    };
  }catch(error){
    return {
      ok:false,
      error:String(error?.name||'planner_error'),
      error_message:clean(error?.message,240),
      latency_ms:Date.now()-started
    };
  }
}
