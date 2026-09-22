import {normalizePapoAiCommercialPlan} from "../supabase/functions/_shared/papoai-ai-planner-v1.mjs";

function assert(condition,message){
  if(!condition) throw new Error(message);
}

let r=normalizePapoAiCommercialPlan({
  message:"você decide",
  contextPack:{
    commercial:{opportunity:"weak"},
    governor:{clarification_count:0},
    journey:{stage:"selection"}
  },
  plan:{
    decision:"ASK",
    commercial_opportunity:"strong",
    proactive_offer_requested:true,
    sales_next_step:"clarify_once",
    question:"qual marca?"
  }
});
assert(r.plan.decision==="RECOMMEND","delegation must become recommendation");
assert(r.plan.proactive_offer_requested===false,"weak signal must suppress proactive offer");
assert(r.plan.sales_next_step==="recommend_best","delegation must not re-ask");

r=normalizePapoAiCommercialPlan({
  message:"qualquer um",
  contextPack:{
    commercial:{opportunity:"none"},
    governor:{clarification_count:2},
    journey:{stage:"discovery"}
  },
  plan:{
    decision:"ASK",
    commercial_opportunity:"none",
    proactive_offer_requested:false,
    sales_next_step:"clarify_once",
    question:"mais uma pergunta"
  }
});
assert(r.plan.decision==="RECOMMEND","third segmenting question must be blocked");

r=normalizePapoAiCommercialPlan({
  message:"pode incluir",
  contextPack:{
    commercial:{opportunity:"strong"},
    governor:{clarification_count:0},
    journey:{stage:"personalization"}
  },
  plan:{
    decision:"RECOMMEND",
    commercial_opportunity:"strong",
    proactive_offer_requested:true,
    sales_next_step:"offer_complement",
    question:""
  }
});
assert(r.plan.proactive_offer_requested===true,"strong signal should allow one offer outside checkout");

r=normalizePapoAiCommercialPlan({
  message:"vamos fechar",
  contextPack:{
    commercial:{opportunity:"strong"},
    governor:{clarification_count:0},
    journey:{stage:"checkout"}
  },
  plan:{
    decision:"RESPOND",
    commercial_opportunity:"strong",
    proactive_offer_requested:true,
    sales_next_step:"offer_complement",
    question:""
  }
});
assert(r.plan.proactive_offer_requested===false,"checkout must suppress proactive offer");

console.log("papoai R3 planner policy tests: ok");
