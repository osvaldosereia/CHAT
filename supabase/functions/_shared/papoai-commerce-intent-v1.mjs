const clean=(v,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const arr=(v)=>Array.isArray(v)?v:[];

function finalText(data){
  return arr(data?.output)
    .flatMap(x=>arr(x?.content))
    .filter(x=>x?.type==='output_text')
    .map(x=>String(x.text||''))
    .join('')
    .trim();
}

export function deterministicCommerceIntent(message){
  const m=clean(message,500).toLowerCase();
  if(!m)return null;
  if(/^(oi+|ol[aá]|opa|bom dia|boa tarde|boa noite|e a[ií]|ei|hello|hey)([!,. ]*)$/i.test(m))return {intent:'greeting',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  if(/^(1|primeiro|primeira|o primeiro|a primeira)$/i.test(m))return {intent:'select_product_choice',basket:'',query:'',source_query:'',replacement_query:'',quantity:1};
  if(/^(2|segundo|segunda|o segundo|a segunda)$/i.test(m))return {intent:'select_product_choice',basket:'',query:'',source_query:'',replacement_query:'',quantity:2};
  if(/^(3|terceiro|terceira|o terceiro|a terceira)$/i.test(m))return {intent:'select_product_choice',basket:'',query:'',source_query:'',replacement_query:'',quantity:3};
  if(/^(4|quarto|quarta|o quarto|a quarta)$/i.test(m))return {intent:'select_product_choice',basket:'',query:'',source_query:'',replacement_query:'',quantity:4};
  if(/^(5|quinto|quinta|o quinto|a quinta)$/i.test(m))return {intent:'select_product_choice',basket:'',query:'',source_query:'',replacement_query:'',quantity:5};
  if(/^(6|sexto|sexta|o sexto|a sexta)$/i.test(m))return {intent:'select_product_choice',basket:'',query:'',source_query:'',replacement_query:'',quantity:6};
  if(/^(7|setimo|sétimo|setima|sétima|o setimo|o sétimo|a setima|a sétima)$/i.test(m))return {intent:'select_product_choice',basket:'',query:'',source_query:'',replacement_query:'',quantity:7};
  if(/^(8|oitavo|oitava|o oitavo|a oitava)$/i.test(m))return {intent:'select_product_choice',basket:'',query:'',source_query:'',replacement_query:'',quantity:8};
  if(/^(9|nono|nona|o nono|a nona)$/i.test(m))return {intent:'select_product_choice',basket:'',query:'',source_query:'',replacement_query:'',quantity:9};
  if(/^(10|decimo|décimo|decima|décima|o decimo|o décimo|a decima|a décima)$/i.test(m))return {intent:'select_product_choice',basket:'',query:'',source_query:'',replacement_query:'',quantity:10};
  if(/^(sim|s|pode|pode sim|confirmo|confirma|isso|isso mesmo|ok|okay|beleza|pode trocar|troca)$/i.test(m))return {intent:'confirm_pending',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  if(/\bpix\b/.test(m))return {intent:'set_payment_method',basket:'',query:'pix',source_query:'',replacement_query:'',quantity:0};
  if(/\b(dinheiro|cash)\b/.test(m))return {intent:'set_payment_method',basket:'',query:'dinheiro',source_query:'',replacement_query:'',quantity:0};
  if(/\b(cart[aã]o de cr[eé]dito|cr[eé]dito|cart[aã]o)\b/.test(m)&&!/\b(alimenta[cç][aã]o|refei[cç][aã]o)\b/.test(m))return {intent:'set_payment_method',basket:'',query:'cartao de credito',source_query:'',replacement_query:'',quantity:0};
  if(/\b(cart[aã]o.*alimenta[cç][aã]o|cart[aã]o.*refei[cç][aã]o|alimenta[cç][aã]o|refei[cç][aã]o)\b/.test(m))return {intent:'set_payment_method',basket:'',query:'cartao alimentacao',source_query:'',replacement_query:'',quantity:0};
  if(/^(n[aã]o|nao|n|cancela|cancelar|deixa|deixa pra l[aá]|esquece)$/i.test(m))return {intent:'cancel_pending',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  if(/\b(repete|repetir|repetir a|quero a mesma|mesma cesta|mesmo pedido|ultima cesta|última cesta|ultimo pedido|último pedido)\b/.test(m))return {intent:'repeat_last_purchase',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  if(/\b(fechar|finalizar|concluir|confirmar)\b.*\b(pedido|compra)\b|\b(pedido|compra)\b.*\b(fechar|finalizar|concluir)\b/.test(m))return {intent:'checkout_readiness',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  if(/\b(resumo|como ficou|quanto ficou|ver pedido|meu pedido)\b/.test(m))return {intent:'cart_summary',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  if(/\b(atendente|humano|pessoa|falar com algu[eé]m)\b/.test(m))return {intent:'handoff',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  if(/\b(voce decide|você decide|pode decidir|escolhe pra mim|escolha pra mim|voce escolhe|você escolhe)\b/.test(m)
     && /\b(tira|tirar|retira|retirar|remove|remover|troca|trocar)\b/.test(m)){
    const mm=m.match(/\b(?:tira|tirar|retira|retirar|remove|remover|troca|trocar)\s+(?:o|a|os|as)?\s*([^,.;!?]+?)(?:\s+e\s+|\s+por\s+|$)/);
    const source=(mm?.[1]||'').replace(/\b(voce decide|você decide|pode decidir|escolhe pra mim|escolha pra mim|voce escolhe|você escolhe)\b/g,'').trim();
    if(source)return {intent:'delegated_value_replacement',basket:'',query:'',source_query:source,replacement_query:'',quantity:0};
  }
  if(/\b(quais|qual|ver|mostrar|tem|t[eê]m)\b.*\bcestas?\b|\bcestas?\b.*\b(quais|ver|mostrar|tem|t[eê]m)\b/.test(m))return {intent:'list_baskets',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  const basketMatch=m.match(/\b(econ[oô]mica|mini|pequena|m[eé]dia|grande)\s+bonini\b/);
  if(basketMatch&&/\b(vem|cont[eé]m|produtos?|itens?|dentro)\b/.test(m))return {intent:'basket_detail',basket:basketMatch[0],query:'',source_query:'',replacement_query:'',quantity:0};
  if(basketMatch&&/\b(quero|escolho|vou querer|pegar|comprar)\b/.test(m))return {intent:'start_basket',basket:basketMatch[0],query:'',source_query:'',replacement_query:'',quantity:0};
  if(/\b(ofertas?|promo[cç][aã]o|promo[cç][oõ]es)\b/.test(m))return {intent:'offers',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};

  const delegatedReplacement=m.match(/\b(?:troca|trocar|tira|tirar|retira|retirar|remove|remover)\s+(?:o|a|os|as)?\s*([^,.!?]+?)\s+(?:por|e coloca|e poe|e põe)\s+(?:outra coisa|algo diferente|o que voce quiser|o que você quiser)\b/);
  if(delegatedReplacement)return {
    intent:'replace_basket_item',
    basket:'',
    query:'',
    source_query:delegatedReplacement[1].trim(),
    replacement_query:'',
    quantity:0
  };

  const delegatedReplacementShort=m.match(/\b(?:troca|trocar|tira|tirar|retira|retirar|remove|remover)\s+(?:o|a|os|as)?\s*([^,.!?]+?)(?:,|\s+e)?\s+(?:voce decide|você decide|pode escolher|escolhe pra mim)\b/);
  if(delegatedReplacementShort)return {
    intent:'replace_basket_item',
    basket:'',
    query:'',
    source_query:delegatedReplacementShort[1].trim(),
    replacement_query:'',
    quantity:0
  };

  return null;
}

export async function classifyCommerceIntent({message,history,apiKey,model='gpt-5.6-luna'}){
  const det=deterministicCommerceIntent(message);
  if(det)return {...det,source:'deterministic'};
  if(!apiKey)return {intent:'general',basket:'',query:clean(message,160),source_query:'',replacement_query:'',quantity:0,source:'fallback'};

  const recent=arr(history).slice(-12).map(x=>({role:x.role,content:clean(x.content,600)}));
  const schema={
    type:'object',additionalProperties:false,
    properties:{
      intent:{type:'string',enum:['greeting','list_baskets','basket_detail','start_basket','repeat_last_purchase','search_products','select_product_choice','delegated_value_replacement','offers','cart_state','cart_summary','checkout_readiness','customer_context','set_basket_quantity','set_addon_quantity','replace_basket_item','set_payment_method','confirm_pending','cancel_pending','handoff','general']},
      basket:{type:'string'},
      query:{type:'string'},
      source_query:{type:'string'},
      replacement_query:{type:'string'},
      quantity:{type:'number'}
    },
    required:['intent','basket','query','source_query','replacement_query','quantity']
  };
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      model,store:false,max_output_tokens:180,reasoning:{effort:'low'},
      instructions:[
        'Você classifica mensagens de clientes do mercado Dona Antônia.',
        'Sua função é SOMENTE extrair intenção e entidades. Nunca calcule preços, totais, descontos ou estoque.',
        'Para uma saudação simples use greeting.',
        'Para perguntas de produto use search_products e coloque em query o que o cliente procura.',
        'Se o cliente escolher uma opção numerada mostrada anteriormente use select_product_choice e coloque o número da opção em quantity.',
        'Para conteúdo de cesta use basket_detail. Para escolher cesta use start_basket.',
        'Para repetir a última compra ou última cesta do cliente use repeat_last_purchase.',
        'Para retirar/aumentar item que já faz parte da cesta use set_basket_quantity: source_query é o produto e quantity é a quantidade final desejada.',
        'Para adicionar um produto novo ao pedido use set_addon_quantity: query é o produto desejado e quantity é a quantidade final pedida.',
        'Para trocar produto use replace_basket_item: source_query é o item atual e replacement_query é o desejado.',
        'Para retirada com escolha delegada, como "tira o arroz e você decide", use delegated_value_replacement e coloque em source_query somente o item a retirar.',
        'Se o cliente informar forma de pagamento use set_payment_method e coloque em query exatamente uma destas ideias: pix, dinheiro, cartao de credito ou cartao alimentacao.',
        'Se o cliente estiver confirmando uma ação pendente use confirm_pending; se estiver recusando/cancelando use cancel_pending.',
        'Se pedir para fechar/finalizar a compra use checkout_readiness. Se pedir como ficou o pedido use cart_summary.',
        'Se pedir pessoa/atendente use handoff. Se não souber, general.'
      ].join(' '),
      input:[{role:'user',content:[{type:'input_text',text:JSON.stringify({message:clean(message,1000),history:recent})}]}],
      text:{verbosity:'low',format:{type:'json_schema',name:'commerce_intent',strict:true,schema}}
    }),
    signal:AbortSignal.timeout(12000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return {intent:'general',basket:'',query:clean(message,160),source_query:'',replacement_query:'',quantity:0,source:'ai_error'};
  try{return {...JSON.parse(finalText(data)||'{}'),source:'openai'}}catch{
    return {intent:'general',basket:'',query:clean(message,160),source_query:'',replacement_query:'',quantity:0,source:'parse_error'};
  }
}
