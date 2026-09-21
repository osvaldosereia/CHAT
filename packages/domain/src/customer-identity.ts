import type { UUID } from "./contracts";

export type IdentityKind =
  | "phone"
  | "cpf"
  | "email"
  | "web_session"
  | "whatsapp"
  | "instagram"
  | "external";

export interface IdentityCandidate {
  kind: IdentityKind;
  value: string;
}

export interface NormalizedIdentity extends IdentityCandidate {
  normalizedValue: string;
}

export function normalizeIdentity(candidate: IdentityCandidate): NormalizedIdentity {
  const raw = candidate.value.trim();

  switch (candidate.kind) {
    case "phone":
    case "cpf":
      return {
        ...candidate,
        normalizedValue: raw.replace(/\D/g, ""),
      };

    case "email":
      return {
        ...candidate,
        normalizedValue: raw.toLocaleLowerCase("pt-BR"),
      };

    default:
      return {
        ...candidate,
        normalizedValue: raw,
      };
  }
}

export interface CustomerIdentityMatch {
  customerId: UUID;
  organizationId: UUID;
  matchedBy: IdentityKind;
  confidence: "exact" | "verified";
}

// Regra arquitetural:
// matching fuzzy de pessoas nunca deve mesclar clientes automaticamente.
// Correspondências não exatas deverão ir para revisão/fluxo explícito.
