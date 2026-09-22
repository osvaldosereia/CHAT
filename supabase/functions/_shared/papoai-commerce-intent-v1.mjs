const clean=(v,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const arr=(v)=>Array.isArray(v)?v:[];

function normalizeProductSearchQuery(raw){
  let q=clean(raw,220).toLowerCase()
    .replace(/\bmiojos?\b/g,'macarrão lámen')
    .replace(/\blamens?\b/g,'lámen')
    .replace(/[?!.,;:]+/g,' ');
  q=q
    .replace(/\b(?:me passa|passa pra mim|passa para mim|me fala|me diz|por favor)\b/g,' ')
    .replace(/\b(?:tem|t[eê]m|vende|vendem|quanto|qto|qual|quais|pre[cç]o|preco|valor|procuro|queria|quero|voc[eê]s?|voc[eê]|a[ií])\b/g,' ')
    .replace(/\s+/g,' ')
    .trim();
  return q||clean(raw,160).toLowerCase();
}

function finalText(data){
  return arr(data?.output)
    .flatMap(x=>arr(x?.content))
    .filter(x=>x?.type==='output_text')
    .map(x=>String(x.text||''))
    .join('')
    .trim();
}

function historyRole(item){
  const raw=String(item?.role??item?.direction??'').toLowerCase();
  if(raw==='assistant'||raw==='outbound')return 'assistant';
  if(raw==='user'||raw==='inbound')return 'user';
  return raw;
}
function historyContent(item){
  return clean(item?.content??item?.text??item?.body_text??'',700);
}
function canonicalBasketName(raw){
  return clean(raw,80).toLowerCase()
    .replace(/\beconomica\b/g,'econômica')
    .replace(/\bmedia\b/g,'média');
}
export function contextualCommerceIntent(message,history=[]){
  const m=clean(message,160).toLowerCase();
  if(!m)return null;
  const recent=arr(history).slice(-16);
  let assistantIndex=-1;
  for(let i=recent.length-1;i>=0;i--){
    if(historyRole(recent[i])==='assistant'&&historyContent(recent[i])){
      assistantIndex=i;
      break;
    }
  }
  if(assistantIndex<0)return null;

  const lastAssistant=historyContent(recent[assistantIndex]);
  const lastLower=lastAssistant.toLowerCase();
  const choicePrompt=/\b(qual delas|qual voc[eê] quer|qual prefere|voc[eê] quer a|me diga o nome da cesta|quer ver o que vem)\b/.test(lastLower);
  if(!choicePrompt)return null;

  const matches=[...lastLower.matchAll(/\b(econ[oô]mica|mini|pequena|m[eé]dia|grande)\s+(bonini|koblenz)\b/g)];
  const candidates=[];
  for(const mm of matches){
    const name=canonicalBasketName(mm[0]);
    if(name&&!candidates.includes(name))candidates.push(name);
  }
  if(!candidates.length)return null;

  let previousUser='';
  for(let i=assistantIndex-1;i>=0;i--){
    if(historyRole(recent[i])==='user'){
      previousUser=historyContent(recent[i]).toLowerCase();
      break;
    }
  }
  const desiredIntent=/\b(quero|vou querer|comprar|compra|pegar|adiciona|adicione|monta|montar|fecha|fechar)\b/.test(previousUser)
    ? 'start_basket'
    : 'basket_detail';

  const direct=canonicalBasketName(m);
  if(candidates.includes(direct)){
    return {intent:desiredIntent,basket:direct,query:'',source_query:'',replacement_query:'',quantity:0,source:'contextual_followup'};
  }

  const family=m.match(/^(?:a\s+|o\s+)?(bonini|koblenz)$/i)?.[1]?.toLowerCase();
  if(family){
    const filtered=candidates.filter(x=>x.endsWith(' '+family));
    if(filtered.length===1){
      return {intent:desiredIntent,basket:filtered[0],query:'',source_query:'',replacement_query:'',quantity:0,source:'contextual_followup'};
    }
  }

  const scaleRaw=m.match(/^(?:a\s+|o\s+)?(econ[oô]mica|mini|pequena|m[eé]dia|grande)$/i)?.[1];
  if(scaleRaw){
    const scale=canonicalBasketName(scaleRaw);
    const filtered=candidates.filter(x=>x.startsWith(scale+' '));
    if(filtered.length===1){
      return {intent:desiredIntent,basket:filtered[0],query:'',source_query:'',replacement_query:'',quantity:0,source:'contextual_followup'};
    }
  }

  const ordinalMap=new Map([
    ['1',1],['primeiro',1],['primeira',1],['o primeiro',1],['a primeira',1],
    ['2',2],['segundo',2],['segunda',2],['o segundo',2],['a segunda',2],
    ['3',3],['terceiro',3],['terceira',3],['o terceiro',3],['a terceira',3]
  ]);
  const selected=ordinalMap.get(m);
  if(selected&&candidates[selected-1]){
    return {intent:desiredIntent,basket:candidates[selected-1],query:'',source_query:'',replacement_query:'',quantity:0,source:'contextual_followup'};
  }

  if(candidates.length===1&&/^(sim|s|isso|isso mesmo|essa|esse|pode|pode sim|ok|beleza)$/i.test(m)){
    return {intent:desiredIntent,basket:candidates[0],query:'',source_query:'',replacement_query:'',quantity:0,source:'contextual_followup'};
  }

  return null;
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
  if(/^(sim|s|pode|pode sim|confirmo|confirma|isso|isso mesmo|ok|okay|beleza|pode trocar|troca)$/i.test(m)
     || /\b(?:sim|pode|ok|confirmo)\b.*\b(?:confirma|confirmar)\b(?:.*\b(?:pedido|compra)\b)?/.test(m)
     || /\b(?:confirma|confirmar)\b.*\b(?:pedido|compra)\b/.test(m)){
    return {intent:'confirm_pending',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  }
  if(/\bfiado\b/.test(m))return {intent:'payment_info',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};
  if(/\b(?:pix|cart[aã]o(?:\s+de\s+cr[eé]dito)?|cr[eé]dito|d[eé]bito|dinheiro|alimenta[cç][aã]o|refei[cç][aã]o)\b.*\b(?:pode|aceita|passa|funciona)\??$/.test(m))
    return {intent:'payment_info',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};
  if(/\b(?:pode|aceita|passa)\b.*\b(?:pix|cart[aã]o|cr[eé]dito|d[eé]bito|dinheiro|alimenta[cç][aã]o|refei[cç][aã]o)\b/.test(m))
    return {intent:'payment_info',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};
  if(/\b(?:tem\s+como|aceita|aceitam|passa|passam|posso|pode)\b.*\b(?:d[eé]bito|debito)\b/.test(m))return {intent:'payment_info',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};
  if(/\b(?:anota|anotar)\b.*\b(?:pago|pagar)\b.*\b(?:dps|depois)\b/.test(m))return {intent:'payment_info',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};
  if(/\b(?:da|d[aá]|tem)\s+pra\s+(?:paga|pagar)\s+(?:dps|depois)\b/.test(m)
     || /\b(?:paga|pagar)\s+(?:dps|depois)\b/.test(m))
    return {intent:'payment_info',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};
  if(/\b(?:passa|aceita|aceitam)\b.*\b(?:alimenta[cç][aã]o|refei[cç][aã]o|alelo|sodexo|puxee|caju|flash|ifood)\b/.test(m))return {intent:'payment_info',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};
  if(/\b(?:anota|pagar|paga)\b.*\b(?:m[eê]s\s+(?:que|q)\s+vem|30\s*dias?|30d)\b/.test(m))return {intent:'payment_info',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};
  if(
    /\b(formas?\s+d[eo]?\s*pagamento|forma\s+de\s+pagar|como\s+(?:posso|pode|podemos|voc[eê]s?\s+aceitam?)\s+pagar|aceita(?:m)?\s+(?:pix|cart[aã]o|dinheiro|boleto|alimenta[cç][aã]o|refei[cç][aã]o)|passa(?:m)?\s+(?:pix|cart[aã]o|alimenta[cç][aã]o|refei[cç][aã]o|alelo|sodexo|puxee|caju|flash|ifood)|30\s*dias?|30d|boleto|parcelamento|parcela(?:m|do|r)?|quantas\s+vezes|qts?\s+vezes|sem\s+juros|vende(?:m)?\s+(?:pra|para|a)\s+prazo|fiado|pagar\s+(?:no|o)?\s*m[eê]s\s+que\s+vem|paga(?:r)?\s+m[eê]s\s+q\s+vem|anota\s+pra\s+(?:eu\s+)?pagar)\b/.test(m)
  )return {intent:'payment_info',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};
  if(/\bpix\b/.test(m))return {intent:'set_payment_method',basket:'',query:'pix',source_query:'',replacement_query:'',quantity:0};
  if(/\b(dinheiro|cash)\b/.test(m))return {intent:'set_payment_method',basket:'',query:'dinheiro',source_query:'',replacement_query:'',quantity:0};
  if(/\b(cart[aã]o de cr[eé]dito|cr[eé]dito|cart[aã]o)\b/.test(m)&&!/\b(alimenta[cç][aã]o|refei[cç][aã]o)\b/.test(m))return {intent:'set_payment_method',basket:'',query:'cartao de credito',source_query:'',replacement_query:'',quantity:0};
  if(/\b(cart[aã]o.*alimenta[cç][aã]o|cart[aã]o.*refei[cç][aã]o|alimenta[cç][aã]o|refei[cç][aã]o)\b/.test(m))return {intent:'set_payment_method',basket:'',query:'cartao alimentacao',source_query:'',replacement_query:'',quantity:0};
  if(
    /^(?:n[aã]o|nao|n)?[\s,.-]*(?:cancela|cancelar|deixa|deixa\s+pra\s+l[aá]|deixa\s+isso|esquece|n[aã]o\s+quero\s+mais)(?:[\s,.!-].*)?$/i.test(m)
  )return {intent:'cancel_pending',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  if(/\b(repete|repetir|repetir a|quero a mesma|mesma cesta|mesmo pedido|ultima cesta|última cesta|ultimo pedido|último pedido|comprar de novo|compra de novo|quero comprar de novo)\b/.test(m))return {intent:'repeat_last_purchase',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  if(
    /\b(fecha|fechar|finaliza|finalizar|conclui|concluir)\b.*\b(pedido|compra|cesta)\b/.test(m)
    || /\b(pedido|compra|cesta)\b.*\b(fecha|fechar|finaliza|finalizar|conclui|concluir)\b/.test(m)
    || /^(?:pronto\s+)?(?:pode\s+)?(?:fecha|fechar|finaliza|finalizar|conclui|concluir)(?:\s+(?:isso|essa|pra\s+mim|para\s+mim))?(?:\s+(?:pedido|compra|cesta))?$/i.test(m)
    || /\b(?:pode\s+)?(?:fecha|fechar)\s+(?:pra|para)\s+mim\b/.test(m)
  )return {intent:'checkout_readiness',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  if(/\b(resumo|como ficou|quanto ficou|ver pedido|meu pedido)\b/.test(m))return {intent:'cart_summary',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  if(
    /\b(?:entrega|entregar|chega|chegar)\b/.test(m)
    && /\b(?:amanh[aã]\s+cedo|amanh[aã]\s+(?:de\s+)?manh[aã]|amanh[aã]\s+(?:a|à)\s+tarde|hoje\s+cedo|hoje\s+(?:de\s+)?manh[aã]|hoje\s+(?:a|à)\s+tarde|que\s+horas?|hor[aá]rio|janela|antes\s+das|depois\s+das|[àa]s?\s*\d{1,2}(?::\d{2})?\s*h?)\b/.test(m)
  )return {intent:'delivery_schedule',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};
  if(
    /\b(?:entrega|entregar|frete|taxa\s+de\s+entrega|chega|chegar|manda(?:r)?\s+(?:pra|para)|delivery)\b/.test(m)
    || /\b(?:cuiab[aá]|cba|v[aá]rzea\s+grande|vg|chapada\s+dos\s+guimar[aã]es|cpa|cristo\s+rei|shopping\s+pantanal)\b/.test(m)
       && /\b(?:entrega|manda|chega|frete)\b/.test(m)
  )return {intent:'delivery_info',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};
  if(/\b(atendente|humano|pessoa|falar com algu[eé]m|vendedor(?:a)?|algu[eé]m da equipe|gente de verdade|quero fala?r? com gente|falar com gente|n[aã]o quero falar com rob[oô]|sem rob[oô]|me passa (?:pra|para) algu[eé]m|passa (?:pra|para) algu[eé]m)\b/.test(m))return {intent:'handoff',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  if(/\b(voce decide|você decide|pode decidir|escolhe pra mim|escolha pra mim|voce escolhe|você escolhe)\b/.test(m)
     && /\b(tira|tirar|retira|retirar|remove|remover|troca|trocar)\b/.test(m)){
    const mm=m.match(/\b(?:tira|tirar|retira|retirar|remove|remover|troca|trocar)\s+(?:o|a|os|as)?\s*([^,.;!?]+?)(?:\s+e\s+|\s+por\s+|$)/);
    const source=(mm?.[1]||'').replace(/\b(voce decide|você decide|pode decidir|escolhe pra mim|escolha pra mim|voce escolhe|você escolhe)\b/g,'').trim();
    if(source)return {intent:'delegated_value_replacement',basket:'',query:'',source_query:source,replacement_query:'',quantity:0};
  }
  const ambiguousBasketScale=m.match(/\b(econ[oô]mica|mini|pequena|m[eé]dia|grande)\b/);
  if(ambiguousBasketScale
     && !/\b(bonini|koblenz)\b/.test(m)
     && (
       /\bcesta\b/.test(m)
       || /\b(vem|cont[eé]m|produtos?|itens?|dentro|foto|imagem|valor|pre[cç]o|quanto|qual|oq|o que)\b/.test(m)
     )){
    const scale=ambiguousBasketScale[1];
    return {intent:'basket_disambiguate',basket:scale,query:scale,source_query:'',replacement_query:'',quantity:0};
  }
  if(
    /\b(quais|qual|ver|mostrar|tem|t[eê]m|manda)\b.*\bcestas?\b/.test(m)
    || /\bcestas?\b.*\b(quais|qual|ver|mostrar|tem|t[eê]m|manda)\b/.test(m)
    || /\b(qto|quanto|valor|pre[cç]o|preco)\b.*\bcestas?(?:\s+b[aá]sicas?)?\b/.test(m)
    || /\bcestas?(?:\s+b[aá]sicas?)?\b.*\b(qto|quanto|valor|pre[cç]o|preco)\b/.test(m)
  )return {intent:'list_baskets',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};
  const basketMatch=m.match(/\b(econ[oô]mica|mini|pequena|m[eé]dia|grande)\s+(bonini|koblenz)\b/);
  if(basketMatch&&/\b(vem|cont[eé]m|produtos?|itens?|dentro|foto|imagem|mostrar|mostra|manda|valor|pre[cç]o|quanto|tem)\b/.test(m))return {intent:'basket_detail',basket:basketMatch[0],query:'',source_query:'',replacement_query:'',quantity:0};
  if(basketMatch&&/\b(quero|escolho|vou querer|pegar|comprar)\b/.test(m))return {intent:'start_basket',basket:basketMatch[0],query:'',source_query:'',replacement_query:'',quantity:0};

  const addQuantity=m.match(/\b(?:bota|coloca|coloque|adiciona|adicione|acrescenta|acrescente|poe|p[oõ]e)\s+(?:mais\s+)?(\d+)\s+(?:de\s+)?(.+?)\s*$/);
  if(addQuantity)return {
    intent:'set_addon_quantity',
    basket:'',
    query:addQuantity[2].trim(),
    source_query:'',
    replacement_query:'',
    quantity:Number(addQuantity[1]||1)
  };

  const removeBasketItem=m.match(/\b(?:tira|tirar|retira|retirar|remove|remover)\s+(?:o|a|os|as)?\s*([^,.!?]+?)(?:\s+(?:da|do)\s+(?:cesta|pedido))?\s*$/);
  if(removeBasketItem){
    const source=String(removeBasketItem[1]||'')
      .replace(/\s+(?:da|do)\s+(?:cesta|pedido)\s*$/,'')
      .trim();
    if(source)return {
      intent:'set_basket_quantity',
      basket:'',
      query:'',
      source_query:source,
      replacement_query:'',
      quantity:0
    };
  }
  if(/\b(ofertas?|promo[cç][aã]o|promo[cç][oõ]es|descontos?|promo)\b/.test(m))return {intent:'offers',basket:'',query:'',source_query:'',replacement_query:'',quantity:0};

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

  if(/\b(?:voce sabe quem eu sou|você sabe quem eu sou|sabe quem eu sou|o que eu costumo comprar|oq eu costumo comprar|meu hist[oó]rico|minhas compras)\b/.test(m))
    return {intent:'customer_context',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};

  if(/\b(?:senha|chave api|api key|service[_ -]?role|token|segredo|credencial|pre[cç]o de custo|custo dos produtos|custo do arroz|ignora (?:as |suas )?regras|finge que sou administrador|vende sem cobrar|confirma sem pagar|desconto de 50|desconto de 90)\b/.test(m))
    return {intent:'safety_policy',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};

  if(/\b(?:vc vende mercado|voc[eê]s vendem mercado|como funciona ai|como funciona a[ií]|o que voc[eê]s vendem|como comprar|tem loja|posso retirar)\b/.test(m))
    return {intent:'business_info',basket:'',query:m,source_query:'',replacement_query:'',quantity:0};

  if(
    /\b(?:tem|t[eê]m|vende|vendem|quanto|qto|qual|quais|pre[cç]o|preco|procuro|queria|quero)\b/.test(m)
    || /\b(?:rexona|arroz|aroz|leite|omo|shampoo|shampu|caf[eé]|a[cç][uú]car|sab[aã]o|detergente|colgate|papel\s+higi[eê]nico|feij[aã]o|amaciante|sabonete|saboneti|[oó]leo|miojo|miojos|l[aá]men|lamen)\b/.test(m)
  )return {intent:'search_products',basket:'',query:normalizeProductSearchQuery(m),source_query:'',replacement_query:'',quantity:0};

  return null;
}

export async function classifyCommerceIntent({message,history,apiKey,model='gpt-5.6-luna'}){
  const contextual=contextualCommerceIntent(message,history);
  if(contextual)return contextual;
  const det=deterministicCommerceIntent(message);
  if(det)return {...det,source:'deterministic'};
  if(!apiKey)return {intent:'general',basket:'',query:clean(message,160),source_query:'',replacement_query:'',quantity:0,source:'fallback'};

  const recent=arr(history).slice(-12).map(x=>({role:x.role,content:clean(x.content,600)}));
  const schema={
    type:'object',additionalProperties:false,
    properties:{
      intent:{type:'string',enum:['greeting','list_baskets','basket_disambiguate','basket_detail','delivery_schedule','delivery_info','business_info','safety_policy','start_basket','repeat_last_purchase','search_products','select_product_choice','delegated_value_replacement','offers','cart_state','cart_summary','checkout_readiness','customer_context','set_basket_quantity','set_addon_quantity','replace_basket_item','payment_info','set_payment_method','confirm_pending','cancel_pending','handoff','general']},
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
        'Para conteúdo, preço, foto ou itens de uma cesta com nome identificável use basket_detail. Para escolher cesta use start_basket. Se o cliente disser apenas cesta grande sem informar Bonini ou Koblenz, use basket_disambiguate.',
        'Para repetir a última compra ou última cesta do cliente use repeat_last_purchase.',
        'Para retirar/aumentar item que já faz parte da cesta use set_basket_quantity: source_query é o produto e quantity é a quantidade final desejada.',
        'Para adicionar um produto novo ao pedido use set_addon_quantity: query é o produto desejado e quantity é a quantidade final pedida.',
        'Para trocar produto use replace_basket_item: source_query é o item atual e replacement_query é o desejado.',
        'Para retirada com escolha delegada, como "tira o arroz e você decide", use delegated_value_replacement e coloque em source_query somente o item a retirar.',
        'Se o cliente perguntar quais formas de pagamento existem, se aceita Pix/cartão, parcelamento, boleto, prazo ou 30 dias, use payment_info.',
        'Use set_payment_method apenas quando o cliente estiver escolhendo/informando a forma de pagamento do pedido, e coloque em query exatamente uma destas ideias: pix, dinheiro, cartao de credito ou cartao alimentacao.',
        'Se o cliente estiver confirmando uma ação pendente use confirm_pending; se estiver recusando/cancelando use cancel_pending.',
        'Se pedir para fechar/finalizar a compra use checkout_readiness. Se pedir como ficou o pedido use cart_summary.',
        'Se pedir horário específico de entrega, por exemplo amanhã cedo, que horas, antes/depois de um horário ou uma janela, use delivery_schedule. Se pedir pessoa/atendente use handoff. Se não souber, general.'
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
