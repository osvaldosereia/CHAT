const clean=(v,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const norm=(v)=>clean(v,500).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

export function detectCustomerDelegation(message){
  const m=norm(message);
  return /\b(voce decide|pode decidir|escolhe pra mim|escolha pra mim|voce escolhe|pode escolher|qual voce recomenda|me recomenda|o que voce acha melhor|nao sei,? voce decide|nao sei pode escolher)\b/.test(m);
}

export function buildGovernorTopicKey({intent='',query='',sourceQuery='',replacementQuery=''}={}){
  return [
    norm(intent),
    norm(query||sourceQuery||replacementQuery).slice(0,120)
  ].join(':');
}

function uniqueStrings(values){
  return [...new Set((Array.isArray(values)?values:[]).map(v=>clean(v,80)).filter(Boolean))];
}

export function chooseProductClarifier({query='',items=[]}={}){
  const q=norm(query);
  const list=Array.isArray(items)?items:[];
  const brands=uniqueStrings(list.map(x=>x?.brand)).filter(b=>!q.includes(norm(b)));
  const categories=uniqueStrings(list.map(x=>x?.subcategory||x?.category));

  if(brands.length>=2){
    const shown=brands.slice(0,5);
    return {
      key:'brand_preference',
      question:shown.length<=4
        ? `Tem preferência de marca? Encontrei, por exemplo, ${shown.join(', ')}. Se preferir, eu também posso escolher boas opções para você.`
        : 'Tem preferência de marca? Se preferir, eu posso escolher algumas boas opções para você.'
    };
  }

  if(categories.length>=2&&categories.length<=5){
    return {
      key:'product_type',
      question:`Qual tipo você procura? Encontrei opções de ${categories.join(', ')}.`
    };
  }

  return {
    key:'budget_or_recommendation',
    question:'Tem alguma faixa de preço em mente ou prefere que eu escolha algumas boas opções para você?'
  };
}

export function decideConversationAction({
  intent='general',
  message='',
  query='',
  sourceQuery='',
  replacementQuery='',
  items=[],
  candidateCount=null,
  resultLimit=null,
  clarificationCount=0,
  hasPendingAction=false,
  hasStrongPersonalization=false
}={}){
  const delegated=detectCustomerDelegation(message);
  const count=Number.isFinite(Number(candidateCount))?Number(candidateCount):(Array.isArray(items)?items.length:0);
  const limit=Number.isFinite(Number(resultLimit))?Number(resultLimit):null;
  const saturated=limit!==null&&limit>0&&count>=limit;
  const asked=Math.max(0,Number(clarificationCount)||0);
  const topicKey=buildGovernorTopicKey({intent,query,sourceQuery,replacementQuery});

  if(hasPendingAction&&['confirm_pending','cancel_pending','select_product_choice','set_payment_method'].includes(intent)){
    return {action:'ACT',reason:'pending_action_reply',topicKey,delegated,shouldIncrementClarification:false};
  }

  if(['greeting','list_baskets','basket_detail','cart_state','cart_summary','customer_context','offers','checkout_readiness'].includes(intent)){
    return {action:'RESPOND',reason:'direct_answer_available',topicKey,delegated,shouldIncrementClarification:false};
  }

  if(['start_basket','set_basket_quantity','set_addon_quantity','select_product_choice','set_payment_method','confirm_pending','cancel_pending'].includes(intent)){
    return {action:'ACT',reason:'deterministic_action_ready',topicKey,delegated,shouldIncrementClarification:false};
  }

  if(intent==='handoff'){
    return {action:'ACT',reason:'human_requested',topicKey,delegated,shouldIncrementClarification:false};
  }

  if(intent==='replace_basket_item'&&delegated){
    return {action:'RECOMMEND',reason:'customer_delegated_replacement',topicKey,delegated,shouldIncrementClarification:false};
  }

  if(intent==='search_products'){
    if(count===0){
      return {action:'RESPOND',reason:'no_candidates',topicKey,delegated,shouldIncrementClarification:false,effectiveCandidateCount:0};
    }
    if(delegated){
      return {action:'RECOMMEND',reason:'customer_delegated_choice',topicKey,delegated,shouldIncrementClarification:false,maxRecommendations:3,effectiveCandidateCount:count};
    }

    if(hasStrongPersonalization){
      return {
        action:'RECOMMEND',
        reason:'strong_customer_preference_available',
        topicKey,
        delegated,
        shouldIncrementClarification:false,
        maxRecommendations:3,
        effectiveCandidateCount:count
      };
    }

    const list=Array.isArray(items)?items:[];
    const top=list.length?list[0]:null;
    const totalTokens=Number(top?.total_tokens||0);
    const fullyQualified=totalTokens>=2
      ? list.filter((item)=>Number(item?.total_tokens||0)===totalTokens&&Number(item?.token_hits||0)>=totalTokens)
      : [];
    const effectiveCount=fullyQualified.length>0?fullyQualified.length:count;

    if(totalTokens>=2&&fullyQualified.length>0&&fullyQualified.length<=10){
      return {
        action:'RESPOND',
        reason:'query_well_qualified',
        topicKey,delegated,shouldIncrementClarification:false,
        maxResults:Math.min(10,fullyQualified.length),
        effectiveCandidateCount:fullyQualified.length
      };
    }

    if(count<=10&&!saturated){
      return {
        action:'RESPOND',
        reason:'manageable_candidate_set',
        topicKey,delegated,shouldIncrementClarification:false,
        maxResults:Math.min(10,count),
        effectiveCandidateCount:count
      };
    }

    if(asked>=2){
      return {action:'RECOMMEND',reason:'clarification_limit_reached',topicKey,delegated,shouldIncrementClarification:false,maxRecommendations:3,effectiveCandidateCount:effectiveCount};
    }

    const clarifier=chooseProductClarifier({query,items});
    return {
      action:'ASK',
      reason:'candidate_set_too_broad',
      topicKey,
      delegated,
      questionKey:clarifier.key,
      question:clarifier.question,
      shouldIncrementClarification:true,
      effectiveCandidateCount:effectiveCount
    };
  }

  if(intent==='replace_basket_item'){
    if(clean(replacementQuery)){
      return {action:'ACT',reason:'replacement_target_provided',topicKey,delegated,shouldIncrementClarification:false};
    }
    if(asked>=2){
      return {action:'RECOMMEND',reason:'replacement_clarification_limit_reached',topicKey,delegated,shouldIncrementClarification:false};
    }
    return {
      action:'ASK',
      reason:'replacement_target_missing',
      topicKey,
      delegated,
      questionKey:'replacement_goal',
      question:'Você quer trocar por outro produto parecido ou prefere que eu escolha uma combinação de valor próximo?',
      shouldIncrementClarification:true
    };
  }

  if(delegated){
    return {action:'RECOMMEND',reason:'customer_delegated_general_choice',topicKey,delegated,shouldIncrementClarification:false};
  }

  return {action:'RESPOND',reason:'default_answer_path',topicKey,delegated,shouldIncrementClarification:false};
}
