export interface EmailContent {
  subject: string;
  text: string;
}

interface TemplateContext {
  userName: string;
  orderUrl: string;
}

type Template = (ctx: TemplateContext) => EmailContent;

const footer = "\n\nEventMaster";

/** Um modelo de e-mail por tipo de evento de domínio. */
const TEMPLATES: Record<string, Template> = {
  "order.paid": ({ userName, orderUrl }) => ({
    subject: "Pagamento confirmado: seus ingressos estão disponíveis",
    text: `Olá, ${userName}.\n\nRecebemos o pagamento do seu pedido. Seus ingressos já estão disponíveis em:\n${orderUrl}${footer}`,
  }),
  "order.cancelled": ({ userName, orderUrl }) => ({
    subject: "Pedido cancelado: pagamento não aprovado",
    text: `Olá, ${userName}.\n\nO pagamento do seu pedido não foi aprovado e a reserva foi cancelada. Você pode fazer um novo pedido quando quiser.\n${orderUrl}${footer}`,
  }),
  "order.expired": ({ userName, orderUrl }) => ({
    subject: "Sua reserva expirou",
    text: `Olá, ${userName}.\n\nA reserva dos seus ingressos expirou porque o pagamento não foi concluído em 15 minutos. Os ingressos voltaram a ficar disponíveis.\n${orderUrl}${footer}`,
  }),
  "payment.refunded": ({ userName, orderUrl }) => ({
    subject: "Pagamento estornado",
    text: `Olá, ${userName}.\n\nSeu pagamento chegou depois de a reserva ter expirado e foi estornado.\n${orderUrl}${footer}`,
  }),
};

/** Retorna `null` para tipos de evento que não geram e-mail. */
export function buildEmail(type: string, ctx: TemplateContext): EmailContent | null {
  return TEMPLATES[type]?.(ctx) ?? null;
}
