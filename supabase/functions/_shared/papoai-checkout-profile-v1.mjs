const clean=(v,max=800)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const arr=(v)=>Array.isArray(v)?v:[];

function outputText(data){
  return arr(data?.output)
    .flatMap(x=>arr(x?.content))
    .filter(x=>x?.type==='output_text')
    .map(x=>String(x.text||''))
    .join('')
    .trim();
}

function normalizeCity(value){
  const v=clean(value,80).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(v==='cuiaba')return 'Cuiabá';
  if(v==='varzea grande')return 'Várzea Grande';
  return '';
}

export function deterministicCheckoutProfile(message,{needName=true}={}){
  const raw=clean(message,1200);
  if(!raw)return {name:'',street:'',number:'',complement:'',neighborhood:'',city:'',postal_code:'',reference:'',source:'deterministic',confidence:0};

  const parts=raw.split(/[,;|]/).map(x=>x.trim()).filter(Boolean);
  let city='';
  for(const p of parts){
    const c=normalizeCity(p.replace(/\bmt\b/ig,'').trim());
    if(c){city=c;break;}
  }

  let number='';
  let street='';
  let neighborhood='';
  let name='';

  const streetPart=parts.find(p=>/\b(rua|r\.?|avenida|av\.?|travessa|estrada|rodovia)\b/i.test(p));
  if(streetPart){
    const m=streetPart.match(/^(.*?)(?:\s+|,)(\d+[a-zA-Z-]*)\s*$/);
    if(m){street=m[1].trim();number=m[2].trim();}
    else street=streetPart.trim();
  }

  if(!number){
    const numbered=parts.find(p=>/^\s*(?:n(?:º|°|o)?\.?\s*)?\d+[a-zA-Z-]*\s*$/i.test(p));
    if(numbered)number=(numbered.match(/\d+[a-zA-Z-]*/)||[''])[0];
  }

  const bairroPart=parts.find(p=>/^bairro\b/i.test(p));
  if(bairroPart)neighborhood=bairroPart.replace(/^bairro\s*/i,'').trim();

  const usable=parts.filter(p=>{
    if(p===streetPart||p===bairroPart)return false;
    if(normalizeCity(p.replace(/\bmt\b/ig,'').trim()))return false;
    if(/^\s*(?:n(?:º|°|o)?\.?\s*)?\d+[a-zA-Z-]*\s*$/i.test(p))return false;
    return true;
  });

  if(needName&&usable.length)name=usable[0];
  if(!neighborhood){
    const idx=needName?1:0;
    neighborhood=usable[idx]||'';
  }

  return {
    name:clean(name,120),
    street:clean(street,180),
    number:clean(number,30),
    complement:'',
    neighborhood:clean(neighborhood,120),
    city,
    postal_code:'',
    reference:'',
    source:'deterministic',
    confidence:(street&&number&&neighborhood&&city?(needName&&name?0.82:0.78):0.35)
  };
}

export async function parseCheckoutProfile({message,apiKey='',model='gpt-5.6-luna',needName=true}){
  const fallback=deterministicCheckoutProfile(message,{needName});
  if(!apiKey)return fallback;

  const schema={
    type:'object',
    additionalProperties:false,
    properties:{
      name:{type:'string'},
      street:{type:'string'},
      number:{type:'string'},
      complement:{type:'string'},
      neighborhood:{type:'string'},
      city:{type:'string'},
      postal_code:{type:'string'},
      reference:{type:'string'}
    },
    required:['name','street','number','complement','neighborhood','city','postal_code','reference']
  };

  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      model,store:false,max_output_tokens:220,reasoning:{effort:'low'},
      instructions:[
        'Extraia dados de entrega de uma mensagem em português brasileiro.',
        'Não invente dados ausentes.',
        'Cidade só pode ser Cuiabá ou Várzea Grande quando estiver explicitamente informada ou inequivocamente escrita.',
        needName?'Extraia o nome da pessoa quando estiver presente.':'O nome pode ficar vazio.',
        'Número é o número do imóvel, não telefone nem CEP.',
        'Se um campo não estiver presente, retorne string vazia.'
      ].join(' '),
      input:[{role:'user',content:[{type:'input_text',text:clean(message,1400)}]}],
      text:{verbosity:'low',format:{type:'json_schema',name:'checkout_profile',strict:true,schema}}
    }),
    signal:AbortSignal.timeout(12000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return {...fallback,source:'ai_error'};

  try{
    const parsed=JSON.parse(outputText(data)||'{}');
    return {
      name:clean(parsed.name,120),
      street:clean(parsed.street,180),
      number:clean(parsed.number,30),
      complement:clean(parsed.complement,120),
      neighborhood:clean(parsed.neighborhood,120),
      city:normalizeCity(parsed.city),
      postal_code:clean(parsed.postal_code,20),
      reference:clean(parsed.reference,180),
      source:'openai',
      confidence:0.95
    };
  }catch{
    return {...fallback,source:'parse_error'};
  }
}

export function missingCheckoutProfileFields(profile,{needName=true}={}){
  const missing=[];
  if(needName&&!clean(profile?.name))missing.push('name');
  if(!clean(profile?.street))missing.push('street');
  if(!clean(profile?.number))missing.push('number');
  if(!clean(profile?.neighborhood))missing.push('neighborhood');
  if(!normalizeCity(profile?.city))missing.push('city');
  return missing;
}

export function checkoutProfileMissingPrompt(missing=[]){
  const set=new Set(Array.isArray(missing)?missing:[]);
  const labels=[];
  if(set.has('name'))labels.push('seu nome');
  if(set.has('street'))labels.push('a rua');
  if(set.has('number'))labels.push('o número');
  if(set.has('neighborhood'))labels.push('o bairro');
  if(set.has('city'))labels.push('a cidade (Cuiabá ou Várzea Grande)');
  if(!labels.length)return '';
  return `Só faltou ${labels.join(', ')}. Pode me mandar esses dados em uma única mensagem?`;
}
