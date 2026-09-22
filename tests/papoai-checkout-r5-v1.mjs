import {
  extractCheckoutPaymentMethod,
  detectCheckoutYesNo
} from "../supabase/functions/_shared/papoai-checkout-profile-v1.mjs";

function assert(value,message){
  if(!value) throw new Error(message);
}

assert(extractCheckoutPaymentMethod("vou pagar no pix")==="pix","pix");
assert(extractCheckoutPaymentMethod("pode ser dinheiro")==="cash","cash");
assert(extractCheckoutPaymentMethod("cartão de crédito")==="credit_card","credit");
assert(extractCheckoutPaymentMethod("cartão alimentação")==="food_card","food card");

assert(detectCheckoutYesNo("sim")===true,"yes");
assert(detectCheckoutYesNo("isso mesmo")===true,"yes natural");
assert(detectCheckoutYesNo("não, mudou")===false,"no");
assert(detectCheckoutYesNo("quero outro endereço")===false,"new address");
assert(detectCheckoutYesNo("vou ver")===null,"ambiguous");

console.log("papoai R5 checkout helpers: ok");
