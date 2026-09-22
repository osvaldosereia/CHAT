const arr=(v)=>Array.isArray(v)?v:[];
const clean=(v,max=2000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

function parseArguments(value){
  if(value&&typeof value==='object')return value;
  try{return JSON.parse(String(value||'{}'))}catch{return {}}
}
function getPath(obj,path){
  return String(path||'').split('.').filter(Boolean).reduce((cur,key)=>cur&&typeof cur==='object'?cur[key]:undefined,obj);
}
function compare(actual,operator,expected){
  if(operator==='eq')return actual===expected;
  if(operator==='lte')return Number(actual)<=Number(expected);
  if(operator==='gte')return Number(actual)>=Number(expected);
  if(operator==='includes')return Array.isArray(actual)?actual.includes(expected):String(actual??'').includes(String(expected));
  return false;
}

export function evaluatePlannerScenario({scenario,plannerResult}={}){
  const expectation=scenario?.expectation||{};
  const failures=[];
  const plan=plannerResult?.plan||{};
  const decision=String(plan?.decision||'');
  const calls=arr(plan?.tool_calls);
  const toolKeys=calls.map(x=>String(x?.tool_key||'')).filter(Boolean);

  if(plannerResult?.ok!==true)failures.push('planner_failed');
  if(expectation.no_ask===true&&decision==='ASK')failures.push('unnecessary_ask');

  const allowed=arr(expectation.allowed_decisions).map(String);
  if(allowed.length&&!allowed.includes(decision))failures.push('decision_not_allowed');

  const requiredAny=arr(expectation.required_any_tools).map(String);
  const requiredToolSatisfied=!requiredAny.length||requiredAny.some(k=>toolKeys.includes(k));
  if(!requiredToolSatisfied)failures.push('required_tool_missing');

  const requiredAll=arr(expectation.required_all_tools).map(String);
  if(requiredAll.some(k=>!toolKeys.includes(k)))failures.push('required_all_tools_missing');

  const forbidden=arr(expectation.forbidden_tools).map(String);
  if(forbidden.some(k=>toolKeys.includes(k)))failures.push('forbidden_tool_used');

  if(Number.isFinite(Number(expectation.max_tool_calls))&&calls.length>Number(expectation.max_tool_calls)){
    failures.push('too_many_tool_calls');
  }

  if(expectation.forbid_proactive_offer===true&&plan?.proactive_offer_requested===true){
    failures.push('proactive_offer_forbidden');
  }

  let handoffSatisfied=true;
  if(typeof expectation.should_handoff==='boolean'){
    handoffSatisfied=Boolean(plan?.should_handoff)===expectation.should_handoff;
    if(!handoffSatisfied)failures.push('handoff_mismatch');
  }

  for(const check of arr(expectation.tool_argument_checks)){
    const call=calls.find(x=>String(x?.tool_key||'')===String(check?.tool_key||''));
    if(!call){failures.push('argument_check_tool_missing:'+String(check?.tool_key||''));continue;}
    const args=parseArguments(call?.arguments_json);
    const actual=getPath(args,check?.path);
    if(!compare(actual,String(check?.operator||'eq'),check?.value)){
      failures.push('tool_argument_check_failed:'+String(check?.tool_key||'')+':'+String(check?.path||''));
    }
  }

  const draft=clean(plan?.response_draft,2000);
  const input=clean(scenario?.input_text,2000);
  const priceClaims=[...draft.matchAll(/R\$\s*(\d+(?:[.,]\d+)?)/ig)].map(m=>String(m[1]||'').replace(',','.'));
  const inputNumbers=[...input.matchAll(/\d+(?:[.,]\d+)?/g)].map(m=>String(m[0]||'').replace(',','.'));
  const inventedPrice=priceClaims.some(price=>!inputNumbers.some(n=>Number(n)===Number(price)));
  const commercialHallucination=
    ['product_search','offers','baskets'].includes(String(scenario?.category||''))
    && inventedPrice
    && requiredAny.length>0;
  if(commercialHallucination)failures.push('commercial_price_claim_before_tool_result');

  return {
    passed:failures.length===0,
    failures,
    decision,
    tool_keys:toolKeys,
    metadata:{
      required_tool_satisfied:requiredToolSatisfied,
      handoff_satisfied:handoffSatisfied,
      commercial_hallucination:commercialHallucination,
      policy_adjusted:Boolean(plannerResult?.policy_adjusted),
      policy_violations:arr(plannerResult?.policy_violations)
    }
  };
}
