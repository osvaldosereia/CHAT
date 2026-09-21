import { withSupabase } from "npm:@supabase/server@1.7.0";

type Json = Record<string, unknown>;
type AdminClient = any;

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 2000;

function response(data: Json, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function corsHeaders(req: Request): HeadersInit {
  const configured = (Deno.env.get("CHAT_ALLOWED_ORIGINS") ?? "*")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin =
    configured.includes("*") || configured.includes(origin)
      ? origin || "*"
      : configured[0] || "*";

  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-chat-session-token",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function clientFingerprint(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
  const ua = (req.headers.get("user-agent") || "unknown").slice(0, 180);
  return `${ip}|${ua}`;
}

async function consumeRateLimit(
  admin: AdminClient,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const keyHash = await sha256(key);
  const { data, error } = await admin.rpc("consume_public_rate_limit", {
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  return data === true;
}

async function readBody(req: Request): Promise<Json> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function textValue(value: unknown, max = MAX_MESSAGE_LENGTH): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBudget(text: string): number | null {
  const normalized = text.replace(/\./g, "").replace(",", ".");
  const matches = [...normalized.matchAll(/(?:r\$\s*)?(\d{2,4})(?:\.\d{1,2})?/gi)];
  for (const match of matches) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= 50 && value <= 2000) return Math.round(value * 100);
  }
  return null;
}

function searchTerm(text: string): string {
  const stop = new Set([
    "tem","quero","queria","preciso","procuro","procurar","produto","produtos","me","mostra",
    "mostrar","ver","um","uma","uns","umas","o","a","os","as","de","do","da","dos","das","por",
    "favor","voces","voce","ai","hoje","qual","quais","vende","vendem"
  ]);
  return normalize(text)
    .split(" ")
    .filter((word) => word.length >= 2 && !stop.has(word))
    .join(" ")
    .trim();
}


async function enforceRate(
  admin: AdminClient,
  organizationId: string,
  requestKey: string,
  action: string,
  limitPerMinute: number,
) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await admin
    .from("public_chat_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("request_key", requestKey)
    .gte("created_at", since);

  if (error) throw error;
  if ((count ?? 0) >= limitPerMinute) return false;

  const { error: insertError } = await admin
    .from("public_chat_rate_events")
    .insert({
      organization_id: organizationId,
      request_key: requestKey,
      action,
    });

  if (insertError) throw insertError;
  return true;
}

async function publicRequestKey(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = req.headers.get("cf-connecting-ip") || forwarded || "unknown";
  return "ip:" + await sha256(ip);
}

async function insertAssistant(
  admin: AdminClient,
  session: any,
  bodyText: string,
  messageType = "text",
  payload: Json = {},
) {
  const { data, error } = await admin
    .from("messages")
    .insert({
      organization_id: session.organization_id,
      conversation_id: session.conversation_id,
      sender_type: "assistant",
      message_type: messageType,
      body_text: bodyText,
      payload,
    })
    .select("id,sender_type,message_type,body_text,payload,created_at")
    .single();

  if (error) throw error;
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", session.conversation_id);

  return data;
}

async function listBaskets(admin: AdminClient, organizationId: string, budgetCents?: number | null) {
  const { data, error } = await admin
    .from("baskets")
    .select("id,name,description,display_price_cents,image_url")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("display_price_cents", { ascending: true });

  if (error) throw error;

  const rows = [...(data ?? [])];
  if (budgetCents) {
    rows.sort((a: any, b: any) =>
      Math.abs((a.display_price_cents ?? 0) - budgetCents) -
      Math.abs((b.display_price_cents ?? 0) - budgetCents)
    );
  }

  return rows.slice(0, 3).map((row: any) => ({
    kind: "basket",
    id: row.id,
    name: row.name,
    description: row.description,
    priceCents: row.display_price_cents,
    imageUrl: row.image_url,
    action: "add_basket",
  }));
}

async function listOffers(admin: AdminClient, organizationId: string) {
  const now = Date.now();
  const { data: offers, error } = await admin
    .from("offers")
    .select("id,product_id,title,sale_price_cents,starts_at,ends_at")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .limit(12);

  if (error) throw error;

  const valid = (offers ?? []).filter((offer: any) => {
    if (offer.starts_at && new Date(offer.starts_at).getTime() > now) return false;
    if (offer.ends_at && new Date(offer.ends_at).getTime() < now) return false;
    return true;
  });

  const ids = valid.map((offer: any) => offer.product_id);
  if (!ids.length) return [];

  const { data: products, error: productError } = await admin
    .from("products")
    .select("id,name,sale_price_cents,image_url,stock_quantity")
    .in("id", ids)
    .eq("active", true);

  if (productError) throw productError;
  const productMap = new Map((products ?? []).map((product: any) => [product.id, product]));

  return valid
    .map((offer: any) => {
      const product: any = productMap.get(offer.product_id);
      if (!product) return null;
      return {
        kind: "product",
        id: product.id,
        name: product.name,
        regularPriceCents: product.sale_price_cents,
        priceCents: offer.sale_price_cents,
        imageUrl: product.image_url,
        stockQuantity: product.stock_quantity,
        badge: "Oferta",
        action: "add_product",
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

async function searchProducts(admin: AdminClient, organizationId: string, term: string) {
  const clean = normalize(term);
  if (!clean) return [];

  const tokens = clean.split(" ").filter((token) => token.length >= 2);
  if (!tokens.length) return [];
  const primary = [...tokens].sort((a, b) => b.length - a.length)[0];

  const { data, error } = await admin
    .from("products")
    .select("id,name,sale_price_cents,image_url,stock_quantity")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .ilike("name", `%${primary}%`)
    .limit(24);

  if (error) throw error;

  const ranked = [...(data ?? [])].sort((a: any, b: any) => {
    const an = normalize(a.name || "");
    const bn = normalize(b.name || "");
    const score = (name: string) =>
      tokens.reduce((sum, token) => sum + (name.includes(token) ? 3 : 0), 0) +
      (name.startsWith(primary) ? 2 : 0) +
      (Number(name.includes(clean)) * 5);
    return score(bn) - score(an) || an.localeCompare(bn, "pt-BR");
  });

  const ids = ranked.slice(0, 8).map((product: any) => product.id);
  let offerMap = new Map<string, number>();

  if (ids.length) {
    const { data: offers } = await admin
      .from("offers")
      .select("product_id,sale_price_cents,starts_at,ends_at")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .in("product_id", ids);

    const now = Date.now();
    for (const offer of offers ?? []) {
      if (offer.starts_at && new Date(offer.starts_at).getTime() > now) continue;
      if (offer.ends_at && new Date(offer.ends_at).getTime() < now) continue;
      offerMap.set(offer.product_id, offer.sale_price_cents);
    }
  }

  return ranked.slice(0, 3).map((product: any) => {
    const offerPrice = offerMap.get(product.id);
    return {
      kind: "product",
      id: product.id,
      name: product.name,
      regularPriceCents: offerPrice ? product.sale_price_cents : null,
      priceCents: offerPrice ?? product.sale_price_cents,
      imageUrl: product.image_url,
      stockQuantity: product.stock_quantity,
      badge: offerPrice ? "Oferta" : null,
      action: "add_product",
    };
  });
}

async function ensureCart(admin: AdminClient, session: any) {
  const { data: existing, error } = await admin
    .from("carts")
    .select("id,status,subtotal_cents,discount_cents,total_cents")
    .eq("conversation_id", session.conversation_id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (existing) return existing;

  const { data, error: insertError } = await admin
    .from("carts")
    .insert({
      organization_id: session.organization_id,
      customer_id: session.customer_id,
      conversation_id: session.conversation_id,
      status: "open",
    })
    .select("id,status,subtotal_cents,discount_cents,total_cents")
    .single();

  if (insertError) throw insertError;

  await admin.from("customer_events").insert({
    organization_id: session.organization_id,
    customer_id: session.customer_id,
    conversation_id: session.conversation_id,
    event_type: "cart.created",
    data: {},
  });

  return data;
}

async function recalcCart(admin: AdminClient, cartId: string) {
  const { data: items, error } = await admin
    .from("cart_items")
    .select("id,item_kind,name_snapshot,sku_snapshot,quantity,unit_price_cents,total_cents,product_id,basket_id,metadata")
    .eq("cart_id", cartId)
    .order("id");

  if (error) throw error;

  const subtotal = (items ?? []).reduce((sum: number, item: any) => sum + Number(item.total_cents ?? 0), 0);

  const { data: cart, error: updateError } = await admin
    .from("carts")
    .update({
      subtotal_cents: subtotal,
      discount_cents: 0,
      total_cents: subtotal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cartId)
    .select("id,status,subtotal_cents,discount_cents,total_cents")
    .single();

  if (updateError) throw updateError;

  return {
    ...cart,
    items: items ?? [],
    itemCount: (items ?? []).reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0),
  };
}

async function addBasket(admin: AdminClient, session: any, basketId: string) {
  const { data: basket, error } = await admin
    .from("baskets")
    .select("id,name,display_price_cents")
    .eq("id", basketId)
    .eq("organization_id", session.organization_id)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  if (!basket) return { error: "basket_not_found" };

  const { data: basketItems, error: basketItemsError } = await admin
    .from("basket_items")
    .select("product_id,quantity,sort_order")
    .eq("basket_id", basket.id)
    .order("sort_order");

  if (basketItemsError) throw basketItemsError;

  const productIds = (basketItems ?? []).map((item: any) => item.product_id);
  const { data: componentProducts, error: componentError } = productIds.length
    ? await admin
      .from("products")
      .select("id,name,sku")
      .in("id", productIds)
    : { data: [], error: null };

  if (componentError) throw componentError;
  const productMap = new Map((componentProducts ?? []).map((product: any) => [product.id, product]));
  const components = (basketItems ?? []).map((item: any) => {
    const product: any = productMap.get(item.product_id);
    return {
      productId: item.product_id,
      name: product?.name ?? "Produto",
      sku: product?.sku ?? null,
      quantity: Number(item.quantity),
      sortOrder: item.sort_order,
    };
  });

  const cart = await ensureCart(admin, session);
  const { data: existing } = await admin
    .from("cart_items")
    .select("id,quantity")
    .eq("cart_id", cart.id)
    .eq("basket_id", basket.id)
    .limit(1)
    .maybeSingle();

  const metadata = { basket_components: components };

  if (existing) {
    const quantity = Number(existing.quantity) + 1;
    await admin.from("cart_items").update({
      quantity,
      total_cents: quantity * basket.display_price_cents,
      metadata,
    }).eq("id", existing.id);
  } else {
    await admin.from("cart_items").insert({
      organization_id: session.organization_id,
      cart_id: cart.id,
      basket_id: basket.id,
      item_kind: "basket",
      name_snapshot: basket.name,
      quantity: 1,
      unit_price_cents: basket.display_price_cents,
      total_cents: basket.display_price_cents,
      metadata,
    });
  }

  return { cart: await recalcCart(admin, cart.id), itemName: basket.name };
}

async function addProduct(admin: AdminClient, session: any, productId: string) {
  const { data: product, error } = await admin
    .from("products")
    .select("id,name,sku,sale_price_cents,stock_quantity")
    .eq("id", productId)
    .eq("organization_id", session.organization_id)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  if (!product) return { error: "product_not_found" };
  if (product.stock_quantity !== null && Number(product.stock_quantity) <= 0) {
    return { error: "out_of_stock" };
  }

  const { data: offers } = await admin
    .from("offers")
    .select("sale_price_cents,starts_at,ends_at")
    .eq("product_id", product.id)
    .eq("organization_id", session.organization_id)
    .eq("active", true)
    .limit(3);

  const now = Date.now();
  const activeOffer = (offers ?? []).find((offer: any) => {
    if (offer.starts_at && new Date(offer.starts_at).getTime() > now) return false;
    if (offer.ends_at && new Date(offer.ends_at).getTime() < now) return false;
    return true;
  });
  const unitPrice = activeOffer?.sale_price_cents ?? product.sale_price_cents;

  const cart = await ensureCart(admin, session);
  const { data: existing } = await admin
    .from("cart_items")
    .select("id,quantity")
    .eq("cart_id", cart.id)
    .eq("product_id", product.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const quantity = Number(existing.quantity) + 1;
    await admin.from("cart_items").update({
      quantity,
      unit_price_cents: unitPrice,
      total_cents: quantity * unitPrice,
    }).eq("id", existing.id);
  } else {
    await admin.from("cart_items").insert({
      organization_id: session.organization_id,
      cart_id: cart.id,
      product_id: product.id,
      item_kind: "product",
      name_snapshot: product.name,
      sku_snapshot: product.sku,
      quantity: 1,
      unit_price_cents: unitPrice,
      total_cents: unitPrice,
    });
  }

  return { cart: await recalcCart(admin, cart.id), itemName: product.name };
}

async function loadCart(admin: AdminClient, session: any) {
  const { data: cart, error } = await admin
    .from("carts")
    .select("id")
    .eq("conversation_id", session.conversation_id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!cart) return null;
  return recalcCart(admin, cart.id);
}


function normalizePhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  return null;
}

function normalizePayment(value: string): string | null {
  const text = normalize(value);
  if (text.includes("pix")) return "pix";
  if (text.includes("dinheiro")) return "cash";
  if (text.includes("aliment") || text.includes("refeic")) return "meal_card";
  if (text.includes("credito") || text.includes("cartao")) return "credit_card";
  return null;
}

function paymentLabel(method: string): string {
  if (method === "pix") return "PIX";
  if (method === "cash") return "Dinheiro";
  if (method === "meal_card") return "Cartão alimentação/refeição";
  if (method === "credit_card") return "Cartão de crédito";
  return method;
}

async function getActiveCheckout(admin: AdminClient, session: any) {
  const { data, error } = await admin
    .from("checkout_sessions")
    .select("*")
    .eq("conversation_id", session.conversation_id)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function startCheckout(admin: AdminClient, session: any) {
  const cart = await loadCart(admin, session);
  if (!cart || !cart.items?.length) return { error: "empty_cart" };

  const existing = await getActiveCheckout(admin, session);
  if (existing) {
    const prompts: Record<string, string> = {
      collect_name: "Para fechar, qual seu nome?",
      collect_phone: "Qual telefone usamos para falar com você sobre a entrega?",
      collect_address: "Agora me manda o endereço de entrega.",
      collect_payment: "Como você prefere pagar na entrega?",
      review: "Seu pedido já está pronto para revisão.",
    };
    return {
      checkout: existing,
      cart,
      message: await insertAssistant(
        admin,
        session,
        prompts[existing.state] ?? "Vamos continuar seu pedido.",
        "text",
        existing.state === "collect_payment"
          ? { suggestions: ["PIX", "Dinheiro", "Cartão de crédito", "Cartão alimentação/refeição"] }
          : {},
      ),
    };
  }

  const { data: checkout, error } = await admin
    .from("checkout_sessions")
    .insert({
      organization_id: session.organization_id,
      conversation_id: session.conversation_id,
      cart_id: cart.id,
      customer_id: session.customer_id,
      state: "collect_name",
      status: "active",
    })
    .select("*")
    .single();

  if (error) throw error;

  const message = await insertAssistant(
    admin,
    session,
    "Para fechar, qual seu nome?",
    "text",
    {},
  );
  return { checkout, cart, message };
}

async function persistCustomerAddress(
  admin: AdminClient,
  session: any,
  customerId: string,
  rawText: string,
) {
  const clean = rawText.trim().replace(/\s+/g, " ").slice(0, 500);
  if (!clean) return null;

  const { data: existing, error: existingError } = await admin
    .from("customer_addresses")
    .select("id,is_default")
    .eq("organization_id", session.organization_id)
    .eq("customer_id", customerId)
    .eq("raw_text", clean)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing.id;

  const { count, error: countError } = await admin
    .from("customer_addresses")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", session.organization_id)
    .eq("customer_id", customerId)
    .eq("active", true);

  if (countError) throw countError;

  const { data: address, error: insertError } = await admin
    .from("customer_addresses")
    .insert({
      organization_id: session.organization_id,
      customer_id: customerId,
      label: "Entrega",
      raw_text: clean,
      is_default: (count ?? 0) === 0,
      active: true,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return address.id;
}

async function confirmOrder(admin: AdminClient, session: any, checkout: any) {
  const cart = await loadCart(admin, session);
  if (!cart || !cart.items?.length) return { error: "empty_cart" };
  if (!checkout.customer_id) return { error: "customer_required" };

  const addressId = await persistCustomerAddress(
    admin,
    session,
    checkout.customer_id,
    checkout.address_raw,
  );

  const addressSnapshot = {
    addressId,
    rawText: checkout.address_raw,
  };
  const paymentSnapshot = {
    method: checkout.payment_method,
    label: paymentLabel(checkout.payment_method),
  };

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      organization_id: session.organization_id,
      customer_id: checkout.customer_id,
      conversation_id: session.conversation_id,
      source_cart_id: cart.id,
      status: "confirmed",
      subtotal_cents: cart.subtotal_cents,
      discount_cents: cart.discount_cents,
      delivery_cents: 0,
      total_cents: cart.total_cents,
      delivery_address_snapshot: addressSnapshot,
      payment_method_snapshot: paymentSnapshot,
      confirmed_at: new Date().toISOString(),
    })
    .select("id,order_number,total_cents,confirmed_at")
    .single();

  if (orderError) throw orderError;

  for (const item of cart.items) {
    const { data: orderItem, error: itemError } = await admin
      .from("order_items")
      .insert({
        organization_id: session.organization_id,
        order_id: order.id,
        product_id: item.product_id,
        basket_id: item.basket_id,
        item_kind: item.item_kind,
        name_snapshot: item.name_snapshot,
        sku_snapshot: item.sku_snapshot,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
        total_cents: item.total_cents,
        metadata: item.metadata ?? {},
      })
      .select("id")
      .single();

    if (itemError) throw itemError;

    if (item.item_kind === "basket") {
      const components = item.metadata?.basket_components ?? [];
      if (Array.isArray(components) && components.length) {
        const rows = components.map((component: any) => ({
          organization_id: session.organization_id,
          order_item_id: orderItem.id,
          product_id: component.productId,
          name_snapshot: component.name,
          sku_snapshot: component.sku,
          quantity: Number(component.quantity) * Number(item.quantity),
          metadata: { basket_id: item.basket_id },
        }));
        const { error: componentError } = await admin
          .from("order_item_components")
          .insert(rows);
        if (componentError) throw componentError;
      }
    }
  }

  await Promise.all([
    admin.from("carts").update({
      status: "converted",
      updated_at: new Date().toISOString(),
    }).eq("id", cart.id),
    admin.from("checkout_sessions").update({
      state: "confirmed",
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", checkout.id),
    admin.from("customer_events").insert({
      organization_id: session.organization_id,
      customer_id: checkout.customer_id,
      conversation_id: session.conversation_id,
      event_type: "order.confirmed",
      data: { order_id: order.id, order_number: order.order_number, total_cents: order.total_cents },
    }),
  ]);

  const message = await insertAssistant(
    admin,
    session,
    `Pedido confirmado 😊 Número ${order.order_number}. Total: R$ ${(order.total_cents / 100).toFixed(2).replace(".", ",")}.`,
    "order",
    {
      order: {
        id: order.id,
        orderNumber: order.order_number,
        totalCents: order.total_cents,
        paymentMethod: paymentSnapshot,
        address: addressSnapshot,
      },
    },
  );

  return { order, message };
}

async function handleCheckoutInput(admin: AdminClient, session: any, text: string) {
  const checkout = await getActiveCheckout(admin, session);
  if (!checkout) return null;

  if (checkout.state === "collect_name") {
    const name = text.trim().replace(/\s+/g, " ").slice(0, 120);
    if (name.length < 2) {
      return insertAssistant(admin, session, "Me diga seu nome, por favor.", "text", {});
    }
    await admin.from("checkout_sessions").update({
      customer_name: name,
      state: "collect_phone",
      updated_at: new Date().toISOString(),
    }).eq("id", checkout.id);
    return insertAssistant(
      admin,
      session,
      "Obrigada. Qual telefone usamos para falar com você sobre a entrega?",
      "text",
      {},
    );
  }

  if (checkout.state === "collect_phone") {
    const phone = normalizePhone(text);
    if (!phone) {
      return insertAssistant(
        admin,
        session,
        "Não consegui entender o telefone. Pode me enviar com DDD? Ex.: 65 99999-9999.",
        "text",
        {},
      );
    }

    const { data: identity, error: identityError } = await admin
      .from("customer_identities")
      .select("customer_id")
      .eq("organization_id", session.organization_id)
      .eq("kind", "phone")
      .eq("normalized_value", phone)
      .maybeSingle();

    if (identityError) throw identityError;

    let customerId = identity?.customer_id ?? null;
    if (!customerId) {
      const { data: customer, error: customerError } = await admin
        .from("customers")
        .insert({
          organization_id: session.organization_id,
          display_name: checkout.customer_name,
          first_name: checkout.customer_name,
          status: "active",
        })
        .select("id")
        .single();
      if (customerError) throw customerError;
      customerId = customer.id;

      const { error: identityInsertError } = await admin
        .from("customer_identities")
        .insert({
          organization_id: session.organization_id,
          customer_id: customerId,
          kind: "phone",
          normalized_value: phone,
          is_primary: true,
        });
      if (identityInsertError) throw identityInsertError;

      await admin.from("customer_events").insert({
        organization_id: session.organization_id,
        customer_id: customerId,
        conversation_id: session.conversation_id,
        event_type: "customer.created",
        data: { source: "web_chat" },
      });
    }

    await Promise.all([
      admin.from("checkout_sessions").update({
        customer_id: customerId,
        phone_normalized: phone,
        state: "collect_address",
        updated_at: new Date().toISOString(),
      }).eq("id", checkout.id),
      admin.from("public_chat_sessions").update({ customer_id: customerId }).eq("id", session.id),
      admin.from("conversations").update({ customer_id: customerId }).eq("id", session.conversation_id),
      admin.from("carts").update({ customer_id: customerId }).eq("id", checkout.cart_id),
    ]);

    return insertAssistant(
      admin,
      { ...session, customer_id: customerId },
      identity
        ? `Encontrei seu cadastro 😊 Agora me manda o endereço de entrega.`
        : "Perfeito. Agora me manda o endereço de entrega.",
      "text",
      {},
    );
  }

  if (checkout.state === "collect_address") {
    const address = text.trim().replace(/\s+/g, " ").slice(0, 500);
    if (address.length < 8) {
      return insertAssistant(
        admin,
        session,
        "Pode me mandar o endereço mais completo, com rua, número e bairro?",
        "text",
        {},
      );
    }

    await admin.from("checkout_sessions").update({
      address_raw: address,
      state: "collect_payment",
      updated_at: new Date().toISOString(),
    }).eq("id", checkout.id);

    return insertAssistant(
      admin,
      session,
      "Como você prefere pagar na entrega?",
      "text",
      { suggestions: ["PIX", "Dinheiro", "Cartão de crédito", "Cartão alimentação/refeição"] },
    );
  }

  if (checkout.state === "collect_payment") {
    const payment = normalizePayment(text);
    if (!payment) {
      return insertAssistant(
        admin,
        session,
        "Você pode escolher PIX, dinheiro, cartão de crédito ou cartão alimentação/refeição.",
        "text",
        { suggestions: ["PIX", "Dinheiro", "Cartão de crédito", "Cartão alimentação/refeição"] },
      );
    }

    const cart = await loadCart(admin, session);
    await admin.from("checkout_sessions").update({
      payment_method: payment,
      state: "review",
      updated_at: new Date().toISOString(),
    }).eq("id", checkout.id);

    return insertAssistant(
      admin,
      session,
      `Seu pedido ficou em R$ ${((cart?.total_cents ?? 0) / 100).toFixed(2).replace(".", ",")}. Entrega em: ${checkout.address_raw}. Pagamento: ${paymentLabel(payment)}. Posso confirmar assim?`,
      "order",
      {
        cart,
        checkout: {
          state: "review",
          addressRaw: checkout.address_raw,
          paymentMethod: payment,
        },
        suggestions: ["Confirmar pedido", "Corrigir endereço", "Cancelar"],
      },
    );
  }

  if (checkout.state === "review") {
    const value = normalize(text);
    if (value.includes("confirm")) {
      const refreshed = await getActiveCheckout(admin, session);
      const result = await confirmOrder(admin, session, refreshed);
      if (result.error) {
        return insertAssistant(admin, session, "Não consegui confirmar o pedido agora. Tente novamente.", "text", {});
      }
      return result.message;
    }
    if (value.includes("endereco") || value.includes("corrigir")) {
      await admin.from("checkout_sessions").update({
        state: "collect_address",
        updated_at: new Date().toISOString(),
      }).eq("id", checkout.id);
      return insertAssistant(admin, session, "Claro. Me manda o endereço correto.", "text", {});
    }
    if (value.includes("cancel")) {
      await admin.from("checkout_sessions").update({
        state: "cancelled",
        status: "cancelled",
        updated_at: new Date().toISOString(),
      }).eq("id", checkout.id);
      return insertAssistant(admin, session, "Tudo bem. O fechamento foi cancelado, mas seu carrinho continua salvo.", "text", {});
    }
    return insertAssistant(
      admin,
      session,
      "Posso confirmar esse pedido ou, se preferir, corrigir o endereço.",
      "text",
      { suggestions: ["Confirmar pedido", "Corrigir endereço", "Cancelar"] },
    );
  }

  return null;
}

async function saveCommerceAssistant(admin: AdminClient, session: any, text: string) {
  const normalized = normalize(text);
  const budget = extractBudget(text);

  if (/\b(cesta|cestas)\b/.test(normalized) || budget) {
    const items = await listBaskets(admin, session.organization_id, budget);
    const reply = budget
      ? "Tenho estas cestas mais próximas desse valor."
      : "Claro. Separei algumas cestas para você começar.";
    return insertAssistant(admin, session, reply, "basket", {
      ui: { type: "commerce_list", items },
    });
  }

  if (/\b(oferta|ofertas|promocao|promocoes)\b/.test(normalized)) {
    const items = await listOffers(admin, session.organization_id);
    const reply = items.length
      ? "Estas são algumas ofertas boas de hoje."
      : "No momento não encontrei ofertas ativas.";
    return insertAssistant(admin, session, reply, "offer", {
      ui: { type: "commerce_list", items },
    });
  }

  if (/^(oi|ola|bom dia|boa tarde|boa noite|opa)\b/.test(normalized)) {
    return insertAssistant(
      admin,
      session,
      "Oi 😊 Pode falar normalmente comigo. Posso te ajudar com uma cesta, uma oferta ou procurar um produto.",
      "text",
      { suggestions: ["Ver cestas", "Ver ofertas", "Procurar produto"] },
    );
  }

  const term = searchTerm(text);
  if (term.length >= 2) {
    const items = await searchProducts(admin, session.organization_id, term);
    if (items.length) {
      return insertAssistant(
        admin,
        session,
        items.length === 1 ? "Encontrei este produto." : "Encontrei estas opções.",
        "product_list",
        { ui: { type: "commerce_list", items }, searchTerm: term },
      );
    }
  }

  return insertAssistant(
    admin,
    session,
    "Ainda estou aprendendo essa parte. Você pode me dizer se procura uma cesta, uma oferta ou o nome de algum produto?",
    "text",
    { suggestions: ["Ver cestas", "Ver ofertas"] },
  );
}

const coreHandler = withSupabase(
  { auth: "none" },
  async (req, ctx) => {
    const admin = ctx.supabaseAdmin;

    if (req.method === "GET") {
      return response({
        ok: true,
        service: "chat-gateway-v1",
        version: 3,
      });
    }

    if (req.method !== "POST") {
      return response({ ok: false, error: "method_not_allowed" }, 405);
    }

    const body = await readBody(req);
    const action = textValue(body.action, 64);

    if (action === "start_session") {
      const startAllowed = await consumeRateLimit(
        admin,
        "start:" + clientFingerprint(req),
        20,
        3600,
      );
      if (!startAllowed) {
        return response({ ok: false, error: "rate_limited" }, 429);
      }

      const organizationSlug = textValue(body.organizationSlug, 80);
      if (!organizationSlug) {
        return response({ ok: false, error: "organization_required" }, 400);
      }

      const { data: organization, error: orgError } = await admin
        .from("organizations")
        .select("id,name,slug,status")
        .eq("slug", organizationSlug)
        .eq("status", "active")
        .maybeSingle();

      if (orgError) throw orgError;
      if (!organization) {
        return response({ ok: false, error: "organization_not_found" }, 404);
      }

      const { data: chatModule, error: moduleError } = await admin
        .from("organization_modules")
        .select("enabled")
        .eq("organization_id", organization.id)
        .eq("module_key", "chat")
        .maybeSingle();

      if (moduleError) throw moduleError;
      if (!chatModule?.enabled) {
        return response({ ok: false, error: "chat_disabled" }, 403);
      }

      const startKey = await publicRequestKey(req);
      const startAllowed = await enforceRate(
        admin,
        organization.id,
        startKey,
        "start_session",
        8,
      );
      if (!startAllowed) {
        return response({ ok: false, error: "rate_limited" }, 429);
      }

      const { data: conversation, error: conversationError } = await admin
        .from("conversations")
        .insert({
          organization_id: organization.id,
          channel: "web",
          status: "open",
        })
        .select("id,started_at")
        .single();

      if (conversationError) throw conversationError;

      const token = randomToken();
      const tokenHash = await sha256(token);
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

      const { data: session, error: sessionError } = await admin
        .from("public_chat_sessions")
        .insert({
          organization_id: organization.id,
          conversation_id: conversation.id,
          token_hash: tokenHash,
          status: "active",
          expires_at: expiresAt,
        })
        .select("id,expires_at")
        .single();

      if (sessionError) {
        await admin.from("conversations").delete().eq("id", conversation.id);
        throw sessionError;
      }

      const welcome =
        "Oi 😊 Eu sou a assistente virtual da Dona Antônia. Posso montar seu pedido por aqui. O que você está procurando hoje?";

      const welcomeMessage = await admin
        .from("messages")
        .insert({
          organization_id: organization.id,
          conversation_id: conversation.id,
          sender_type: "assistant",
          message_type: "text",
          body_text: welcome,
          payload: { suggestions: ["Ver cestas", "Ver ofertas", "Procurar produto"] },
        })
        .select("id,sender_type,message_type,body_text,payload,created_at")
        .single();

      if (welcomeMessage.error) throw welcomeMessage.error;

      await admin.from("customer_events").insert({
        organization_id: organization.id,
        conversation_id: conversation.id,
        event_type: "conversation.started",
        data: { channel: "web" },
      });

      return response({
        ok: true,
        session: {
          id: session.id,
          token,
          expiresAt: session.expires_at,
          conversationId: conversation.id,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        messages: [welcomeMessage.data],
      }, 201);
    }

    const publicAllowed = await consumeRateLimit(
      admin,
      "public:" + clientFingerprint(req),
      240,
      60,
    );
    if (!publicAllowed) {
      return response({ ok: false, error: "rate_limited" }, 429);
    }

    const token = textValue(req.headers.get("x-chat-session-token"), 256);
    if (!token) {
      return response({ ok: false, error: "session_token_required" }, 401);
    }

    const tokenHash = await sha256(token);
    const sessionAllowed = await consumeRateLimit(
      admin,
      "session:" + tokenHash,
      180,
      60,
    );
    if (!sessionAllowed) {
      return response({ ok: false, error: "rate_limited" }, 429);
    }

    const now = new Date().toISOString();

    const { data: session, error: sessionError } = await admin
      .from("public_chat_sessions")
      .select("id,organization_id,conversation_id,customer_id,status,expires_at")
      .eq("token_hash", tokenHash)
      .eq("status", "active")
      .gt("expires_at", now)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return response({ ok: false, error: "invalid_or_expired_session" }, 401);
    }

    await admin
      .from("public_chat_sessions")
      .update({ last_seen_at: now })
      .eq("id", session.id);

    const sessionLimit = action === "send_message" ? 20 : 60;
    const sessionAllowed = await enforceRate(
      admin,
      session.organization_id,
      "session:" + session.id,
      action || "unknown",
      sessionLimit,
    );
    if (!sessionAllowed) {
      return response({ ok: false, error: "rate_limited" }, 429);
    }

    if (action === "get_messages") {
      const { data: messages, error } = await admin
        .from("messages")
        .select("id,sender_type,message_type,body_text,payload,created_at")
        .eq("conversation_id", session.conversation_id)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;

      return response({
        ok: true,
        conversationId: session.conversation_id,
        messages: messages ?? [],
        cart: await loadCart(admin, session),
      });
    }

    if (action === "list_baskets") {
      const items = await listBaskets(admin, session.organization_id, null);
      const message = await insertAssistant(
        admin,
        session,
        "Claro. Separei algumas cestas para você.",
        "basket",
        { ui: { type: "commerce_list", items } },
      );
      return response({ ok: true, message });
    }

    if (action === "list_offers") {
      const items = await listOffers(admin, session.organization_id);
      const message = await insertAssistant(
        admin,
        session,
        items.length ? "Estas são algumas ofertas boas de hoje." : "No momento não encontrei ofertas ativas.",
        "offer",
        { ui: { type: "commerce_list", items } },
      );
      return response({ ok: true, message });
    }

    if (action === "search_products") {
      const term = textValue(body.term, 120);
      const items = await searchProducts(admin, session.organization_id, term);
      const message = await insertAssistant(
        admin,
        session,
        items.length ? "Encontrei estas opções." : "Não encontrei esse produto nessa primeira seleção do catálogo.",
        "product_list",
        { ui: { type: "commerce_list", items }, searchTerm: term },
      );
      return response({ ok: true, message });
    }

    if (action === "add_basket") {
      const basketId = textValue(body.basketId, 64);
      const result = await addBasket(admin, session, basketId);
      if (result.error) return response({ ok: false, error: result.error }, 404);

      const message = await insertAssistant(
        admin,
        session,
        `Pronto. Coloquei ${result.itemName} no seu pedido 😊`,
        "cart",
        { cart: result.cart, suggestions: ["Ver ofertas", "Fechar pedido", "Ver meu pedido"] },
      );

      return response({ ok: true, message, cart: result.cart });
    }

    if (action === "add_product") {
      const productId = textValue(body.productId, 64);
      const result = await addProduct(admin, session, productId);
      if (result.error === "out_of_stock") {
        return response({ ok: false, error: "out_of_stock" }, 409);
      }
      if (result.error) return response({ ok: false, error: result.error }, 404);

      const message = await insertAssistant(
        admin,
        session,
        `Pronto. Adicionei ${result.itemName} ao seu pedido.`,
        "cart",
        { cart: result.cart, suggestions: ["Continuar comprando", "Fechar pedido", "Ver meu pedido"] },
      );

      return response({ ok: true, message, cart: result.cart });
    }

    if (action === "get_cart") {
      return response({ ok: true, cart: await loadCart(admin, session) });
    }

    if (action === "start_checkout") {
      const result = await startCheckout(admin, session);
      if (result.error === "empty_cart") {
        return response({ ok: false, error: "empty_cart" }, 400);
      }
      return response({ ok: true, message: result.message, cart: result.cart });
    }

    if (action === "confirm_order") {
      const checkout = await getActiveCheckout(admin, session);
      if (!checkout || checkout.state !== "review") {
        return response({ ok: false, error: "checkout_not_ready" }, 409);
      }
      const result = await confirmOrder(admin, session, checkout);
      if (result.error) return response({ ok: false, error: result.error }, 400);
      return response({ ok: true, message: result.message, order: result.order });
    }

    if (action === "send_message") {
      const messageText = textValue(body.text);
      const clientMessageId = textValue(body.clientMessageId, 120);

      if (!messageText) {
        return response({ ok: false, error: "message_required" }, 400);
      }
      if (!clientMessageId) {
        return response({ ok: false, error: "client_message_id_required" }, 400);
      }

      const insertPayload = {
        organization_id: session.organization_id,
        conversation_id: session.conversation_id,
        sender_type: "customer",
        message_type: "text",
        body_text: messageText,
        client_message_id: clientMessageId,
      };

      let inserted = true;
      let { data: message, error: messageError } = await admin
        .from("messages")
        .insert(insertPayload)
        .select("id,sender_type,message_type,body_text,payload,created_at")
        .single();

      if (messageError?.code === "23505") {
        inserted = false;
        const existing = await admin
          .from("messages")
          .select("id,sender_type,message_type,body_text,payload,created_at")
          .eq("conversation_id", session.conversation_id)
          .eq("client_message_id", clientMessageId)
          .single();

        message = existing.data;
        messageError = existing.error;
      }

      if (messageError) throw messageError;

      let assistant = null;
      if (inserted) {
        await Promise.all([
          admin
            .from("conversations")
            .update({ last_message_at: now })
            .eq("id", session.conversation_id),
          admin.from("customer_events").insert({
            organization_id: session.organization_id,
            customer_id: session.customer_id,
            conversation_id: session.conversation_id,
            event_type: "message.received",
            data: { message_type: "text" },
          }),
        ]);

        const { data: liveConversation, error: conversationStateError } = await admin
          .from("conversations")
          .select("status")
          .eq("id", session.conversation_id)
          .single();

        if (conversationStateError) throw conversationStateError;

        if (liveConversation.status === "open" || liveConversation.status === "waiting_customer") {
          assistant = await handleCheckoutInput(admin, session, messageText);
          if (!assistant) {
            assistant = await saveCommerceAssistant(admin, session, messageText);
          }
        }
      }

      return response({
        ok: true,
        message,
        assistant,
        cart: await loadCart(admin, session),
        duplicate: !inserted,
      });
    }

    if (action === "request_human") {
      const { error: updateError } = await admin
        .from("conversations")
        .update({
          status: "waiting_human",
          last_message_at: now,
        })
        .eq("id", session.conversation_id);

      if (updateError) throw updateError;

      await admin.from("customer_events").insert({
        organization_id: session.organization_id,
        customer_id: session.customer_id,
        conversation_id: session.conversation_id,
        event_type: "human.requested",
        data: { channel: "web" },
      });

      await admin.from("conversation_assignment_events").insert({
        organization_id: session.organization_id,
        conversation_id: session.conversation_id,
        actor_user_id: null,
        assigned_user_id: null,
        event_type: "requested",
        metadata: { channel: "web", source: "customer" },
      });

      const systemText =
        "Certo. Você pediu atendimento humano. Quando alguém assumir, a conversa continua por aqui.";

      const message = await admin.from("messages").insert({
        organization_id: session.organization_id,
        conversation_id: session.conversation_id,
        sender_type: "system",
        message_type: "text",
        body_text: systemText,
      }).select("id,sender_type,message_type,body_text,payload,created_at").single();

      if (message.error) throw message.error;

      return response({
        ok: true,
        status: "waiting_human",
        message: message.data,
      });
    }

    return response({ ok: false, error: "unknown_action" }, 400);
  },
);

export default {
  fetch: async (req: Request) => {
    const headers = corsHeaders(req);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    try {
      const result = await coreHandler(req);
      const responseHeaders = new Headers(result.headers);
      Object.entries(headers).forEach(([key, value]) => {
        if (typeof value === "string") responseHeaders.set(key, value);
      });

      return new Response(result.body, {
        status: result.status,
        statusText: result.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error("chat-gateway-v1", error);
      return response(
        { ok: false, error: "internal_error" },
        500,
        headers,
      );
    }
  },
};
