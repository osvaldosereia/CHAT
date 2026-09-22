import {deterministicCommerceIntent} from "../supabase/functions/_shared/papoai-commerce-intent-v1.mjs";
import {detectCustomerDelegation,decideConversationAction} from "../supabase/functions/_shared/papoai-conversation-governor-v1.mjs";
import {extractCheckoutPaymentMethod,detectCheckoutYesNo} from "../supabase/functions/_shared/papoai-checkout-profile-v1.mjs";
import {normalizePapoAiCommercialPlan} from "../supabase/functions/_shared/papoai-ai-planner-v1.mjs";

function assert(condition,message){
  if(!condition) throw new Error(message);
}

const intentCases=[
  ["oi","greeting"],["bom dia","greeting"],["1","select_product_choice"],
  ["confirmo","confirm_pending"],["não","cancel_pending"],["pix","set_payment_method"],
  ["pode ser dinheiro","set_payment_method"],["cartão de crédito","set_payment_method"],
  ["cartão alimentação","set_payment_method"],["quero repetir minha última cesta","repeat_last_purchase"],
  ["quero finalizar o pedido","checkout_readiness"],["quero falar com uma pessoa","handoff"],
  ["quais cestas tem?","list_baskets"],["quais ofertas tem?","offers"]
];
for(const [message,expected] of intentCases){
  const actual=deterministicCommerceIntent(message)?.intent;
  assert(actual===expected,`intent: ${message} => ${actual}, expected ${expected}`);
}

assert(detectCustomerDelegation("não sei, você decide")===true,"delegation");

let decision=decideConversationAction({
  intent:"search_products",message:"você decide",query:"detergente",
  items:[{name:"A"},{name:"B"}],candidateCount:2,clarificationCount:0
});
assert(decision.action==="RECOMMEND","delegated search must recommend");

decision=decideConversationAction({
  intent:"search_products",message:"qualquer um",query:"shampoo",
  items:Array.from({length:12},(_,i)=>({name:`P${i}`,brand:i%2?"A":"B"})),
  candidateCount:12,resultLimit:12,clarificationCount:2
});
assert(decision.action==="RECOMMEND","third clarification blocked");

decision=decideConversationAction({
  intent:"search_products",message:"quero shampoo",query:"shampoo",
  items:Array.from({length:12},(_,i)=>({name:`P${i}`,brand:i%2?"A":"B"})),
  candidateCount:12,resultLimit:12,clarificationCount:0
});
assert(decision.action==="ASK","broad search may clarify once");

assert(extractCheckoutPaymentMethod("vou pagar no pix")==="pix","pix");
assert(extractCheckoutPaymentMethod("em dinheiro")==="cash","cash");
assert(extractCheckoutPaymentMethod("cartão de crédito")==="credit_card","credit");
assert(extractCheckoutPaymentMethod("vale refeição")==="food_card","food card");
assert(detectCheckoutYesNo("sim, é esse")===true,"saved address yes");
assert(detectCheckoutYesNo("não, mudou")===false,"saved address no");
assert(detectCheckoutYesNo("vou ver")===null,"ambiguous address answer");

let normalized=normalizePapoAiCommercialPlan({
  message:"você decide",
  contextPack:{
    commercial:{opportunity:"weak"},
    governor:{clarification_count:0},
    journey:{stage:"selection"}
  },
  plan:{
    decision:"ASK",commercial_opportunity:"weak",proactive_offer_requested:false,
    sales_next_step:"clarify_once",question:"qual marca?"
  }
});
assert(normalized.plan.decision==="RECOMMEND","planner delegation guard");

normalized=normalizePapoAiCommercialPlan({
  message:"vamos fechar",
  contextPack:{
    commercial:{opportunity:"strong"},
    governor:{clarification_count:0},
    journey:{stage:"checkout"}
  },
  plan:{
    decision:"RESPOND",commercial_opportunity:"strong",proactive_offer_requested:true,
    sales_next_step:"offer_complement",question:""
  }
});
assert(normalized.plan.proactive_offer_requested===false,"checkout offer suppression");

console.log("papoai R6 deterministic conversation suite: ok");
