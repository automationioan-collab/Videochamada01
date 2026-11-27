import type { Request } from 'express';
import {
  fetchMercadoPagoMerchantOrderById,
  fetchMercadoPagoPaymentById,
  isMercadoPagoConfigured,
  verifyMercadoPagoChargeByReferenceOrId,
  verifyMercadoPagoWebhookSignature,
  type MercadoPagoMerchantOrderDetails,
  type MercadoPagoPaymentDetails,
} from './pix.js';
import type {
  ModelWorkspaceData,
  StoredModelAccount,
  StoredPixCharge,
} from './modelStore.js';

/**
 * ============================================================================
 * INSTRUÇÃO OPERACIONAL & FLUXO DE CONFIRMAÇÃO PIX VIA WEBHOOK MERCADO PAGO
 * ============================================================================
 *
 * Objetivo:
 *   Receber notificações assíncronas (Webhooks v1/v2 e IPN legado) enviadas
 *   pelo Mercado Pago para `POST /api/webhooks/mercadopago`, validar sua
 *   autenticidade criptográfica e confirmar diretamente nos servidores do
 *   Mercado Pago antes de atualizar o banco de dados para `approvalStatus = 'aprovado'`
 *   (`status = 'paid'`) e liberar o acesso automaticamente.
 *
 * Etapas obrigatórias executadas no backend:
 *   1. Extração segura do evento (`extractMercadoPagoWebhookNotification`):
 *      Lê `type`/`topic`, `action` e o identificador (`data.id`, `id` ou `resource`)
 *      sem confiar em campos de status enviados no corpo do webhook.
 *   2. Validação HMAC-SHA256 (`verifyMercadoPagoWebhookSignature`):
 *      Se `MERCADOPAGO_WEBHOOK_SECRET` estiver configurado, exige os cabeçalhos
 *      `x-signature` (`ts`, `v1`) e verifica via comparação em tempo constante
 *      (`crypto.timingSafeEqual`). Assinaturas ausentes ou inválidas retornam HTTP 401.
 *   3. Consulta autoritativa Server-to-Server (`resolveAuthoritativePayment`):
 *      Nunca aprova um pagamento apenas com base no payload do webhook. Consulta:
 *      - `GET https://api.mercadopago.com/v1/payments/{id}` (para tópico `payment`); ou
 *      - `GET https://api.mercadopago.com/merchant_orders/{id}` + consulta do pagamento
 *        aprovado / `external_reference` (para tópico `merchant_order`).
 *   4. Bloqueio de concorrência idempotente (`withPaymentVerificationLock`):
 *      Serializa notificações simultâneas (Webhook + polling/reconciliação) pela
 *      chave `charge:{txid|paymentId}` para impedir duplicação de sessões ou gorjetas.
 *   5. Integridade financeira (`isMercadoPagoPaymentAmountValid`):
 *      Confirma que `currency_id === 'BRL'` e que `transaction_amount` cobre
 *      integralmente `charge.amountCents` (tolerância máxima de 1 centavo para arredondamento).
 *   6. Atualização automática no banco de dados para `'aprovado'`:
 *      Quando `details.status === 'approved'`, grava imediatamente no registro da cobrança:
 *      - `approvalStatus = 'aprovado'`
 *      - `status = 'paid'`
 *      - `mercadoPagoStatus = 'approved'`
 *      - `webhookVerifiedAt = Date.now()`
 *      - `webhookNotificationId` / `externalPaymentId` / `paymentMethodUsed` / `verifiedAmountCents`
 *      Em seguida executa a entrega automática (fila privativa 1-para-1, álbum privado,
 *      meta de gorjeta e convite WhatsApp) e persiste atomicamente com `saveStore()`.
 *      Em caso de `refunded` / `charged_back`, atualiza para `'estornado'` e revoga
 *      acessos pendentes; em caso de `rejected` / `cancelled` do pagamento ativo, marca
 *      como `'rejeitado'` ou `'cancelado'`.
 *   7. Notificação em tempo real via WebSocket:
 *      Emite atualização para o painel privativo da modelo e evento `pix:charge_paid`
 *      para o navegador do internauta liberar a sala imediatamente.
 */

export interface ExtractedWebhookNotification {
  topic: string;
  dataId: string;
  signatureDataId: string;
  action: string;
  requestId: string;
}

export interface WebhookProcessResult {
  httpStatus: number;
  ok: boolean;
  ignored?: boolean;
  processed?: boolean;
  source?: 'payment' | 'merchant_order' | 'merchant_order_ref';
  topic?: string;
  matched?: boolean;
  chargeId?: string;
  approvalStatus?: StoredPixCharge['approvalStatus'];
  action?:
    | 'fulfilled'
    | 'already_fulfilled'
    | 'amount_mismatch'
    | 'refunded'
    | 'cancelled'
    | 'pending_or_ignored'
    | 'unmatched'
    | 'unchanged';
  error?: string;
}

export interface MercadoPagoWebhookDeps {
  withVerificationLock: <T>(lockKey: string, fn: () => Promise<T>) => Promise<T>;
  findCharge: (params: {
    externalReference?: string;
    externalPaymentId?: string;
  }) => {
    model: StoredModelAccount;
    workspace: ModelWorkspaceData;
    charge: StoredPixCharge;
  } | null;
  applyApprovedPayment: (params: {
    modelId: string;
    workspace: ModelWorkspaceData;
    charge: StoredPixCharge;
    verifiedPaymentId?: string;
    paymentMethodId?: string;
    transactionAmount?: number;
    currencyId?: string;
    mercadoPagoStatus?: string;
    webhookNotificationId?: string;
  }) => {
    ok: boolean;
    newlyPaid: boolean;
    amountMismatch: boolean;
  };
  revokeRefundedCharge: (params: {
    modelId: string;
    workspace: ModelWorkspaceData;
    charge: StoredPixCharge;
    mercadoPagoStatus?: string;
    webhookNotificationId?: string;
  }) => boolean;
  saveStore: () => void;
  emitWorkspaceRefresh: (modelId: string, includeDirectory: boolean) => void;
  fetchPaymentById?: (paymentId: string) => Promise<MercadoPagoPaymentDetails | null>;
  fetchMerchantOrderById?: (
    orderId: string
  ) => Promise<MercadoPagoMerchantOrderDetails | null>;
  verifyByReferenceOrId?: typeof verifyMercadoPagoChargeByReferenceOrId;
  verifySignature?: typeof verifyMercadoPagoWebhookSignature;
  isConfigured?: () => boolean;
}

export function extractMercadoPagoWebhookNotification(
  req: Request
): ExtractedWebhookNotification {
  const body = (req.body || {}) as Record<string, unknown>;
  const rawBodyData =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : null;

  const queryDataId =
    typeof req.query['data.id'] === 'string'
      ? req.query['data.id'].trim()
      : typeof req.query.id === 'string'
        ? req.query.id.trim()
        : '';

  const bodyDataId =
    typeof rawBodyData?.id === 'string' || typeof rawBodyData?.id === 'number'
      ? String(rawBodyData.id).trim()
      : '';

  let resourceId = '';
  let resourceTopic = '';
  if (typeof body.resource === 'string' && body.resource.trim()) {
    const resStr = body.resource.trim();
    const resMatch =
      /(?:\/(payments|merchant_orders)\/)?([0-9a-zA-Z_-]+)\/?$/i.exec(resStr);
    if (resMatch) {
      resourceId = resMatch[2] || '';
      if (resMatch[1]?.toLowerCase() === 'merchant_orders') {
        resourceTopic = 'merchant_order';
      } else if (resMatch[1]?.toLowerCase() === 'payments') {
        resourceTopic = 'payment';
      }
    }
  }

  const rawTopic =
    (typeof body.type === 'string' && body.type.trim()) ||
    (typeof body.topic === 'string' && body.topic.trim()) ||
    (typeof req.query.type === 'string' && req.query.type.trim()) ||
    (typeof req.query.topic === 'string' && req.query.topic.trim()) ||
    resourceTopic ||
    '';

  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const dataId = bodyDataId || queryDataId || resourceId;
  const signatureDataId = queryDataId || bodyDataId || resourceId;
  const requestId = (req.header('x-request-id') || '').trim();

  return {
    topic: rawTopic.toLowerCase(),
    dataId,
    signatureDataId,
    action: action.toLowerCase(),
    requestId,
  };
}

export function isMercadoPagoPaymentAmountValid(
  charge: StoredPixCharge,
  transactionAmount?: number,
  currencyId?: string
): boolean {
  if (currencyId && currencyId.trim().toUpperCase() !== 'BRL') {
    return false;
  }
  if (typeof transactionAmount !== 'number' || !Number.isFinite(transactionAmount)) {
    return false;
  }
  const paidCents = Math.round(transactionAmount * 100);
  return paidCents >= charge.amountCents - 1;
}

export async function processMercadoPagoWebhookEvent(
  req: Request,
  deps: MercadoPagoWebhookDeps
): Promise<WebhookProcessResult> {
  const { topic, dataId, signatureDataId, action, requestId } =
    extractMercadoPagoWebhookNotification(req);

  const checkSig = deps.verifySignature || verifyMercadoPagoWebhookSignature;
  const sigValid = checkSig({
    xSignatureHeader: req.header('x-signature'),
    xRequestIdHeader: requestId,
    dataId: signatureDataId,
  });
  if (!sigValid) {
    return {
      httpStatus: 401,
      ok: false,
      error: 'Assinatura de webhook inválida.',
    };
  }

  const configured = (deps.isConfigured || isMercadoPagoConfigured)();
  if (!dataId || !configured) {
    return {
      httpStatus: 200,
      ok: true,
      ignored: true,
    };
  }

  const isPaymentTopic =
    topic === 'payment' ||
    action.startsWith('payment.') ||
    (!topic && !action);
  const isMerchantOrderTopic =
    topic === 'merchant_order' || topic === 'merchant_orders';

  if (!isPaymentTopic && !isMerchantOrderTopic) {
    return {
      httpStatus: 200,
      ok: true,
      ignored: true,
      topic,
    };
  }

  const fetchPayment = deps.fetchPaymentById || fetchMercadoPagoPaymentById;
  const fetchMerchantOrder =
    deps.fetchMerchantOrderById || fetchMercadoPagoMerchantOrderById;
  const verifyRefOrId =
    deps.verifyByReferenceOrId || verifyMercadoPagoChargeByReferenceOrId;

  const processPaymentDetails = async (
    details: MercadoPagoPaymentDetails
  ): Promise<Omit<WebhookProcessResult, 'httpStatus' | 'ok' | 'source'>> => {
    const lockId = details.externalReference || details.id;
    return deps.withVerificationLock(`charge:${lockId}`, async () => {
      const matched = deps.findCharge({
        externalReference: details.externalReference,
        externalPaymentId: details.id,
      });
      if (!matched) {
        return { matched: false, action: 'unmatched' as const };
      }

      const { model, workspace, charge } = matched;
      const notificationRef = requestId || details.id;

      if (details.status === 'approved') {
        const applied = deps.applyApprovedPayment({
          modelId: model.id,
          workspace,
          charge,
          verifiedPaymentId: details.id,
          paymentMethodId: details.paymentMethodId,
          transactionAmount: details.transactionAmount,
          currencyId: details.currencyId,
          mercadoPagoStatus: details.rawStatus || 'approved',
          webhookNotificationId: notificationRef,
        });
        return {
          matched: true,
          chargeId: charge.id,
          approvalStatus: charge.approvalStatus,
          action: applied.newlyPaid
            ? ('fulfilled' as const)
            : applied.amountMismatch
              ? ('amount_mismatch' as const)
              : ('already_fulfilled' as const),
        };
      }

      if (
        details.rawStatus === 'refunded' ||
        details.rawStatus === 'charged_back'
      ) {
        if (charge.externalPaymentId === details.id) {
          const revoked = deps.revokeRefundedCharge({
            modelId: model.id,
            workspace,
            charge,
            mercadoPagoStatus: details.rawStatus,
            webhookNotificationId: notificationRef,
          });
          return {
            matched: true,
            chargeId: charge.id,
            approvalStatus: charge.approvalStatus,
            action: revoked ? ('refunded' as const) : ('unchanged' as const),
          };
        }
      }

      if (
        (details.status === 'cancelled' || details.status === 'rejected') &&
        charge.status === 'pending' &&
        charge.externalPaymentId === details.id
      ) {
        charge.status = 'cancelled';
        charge.approvalStatus =
          details.status === 'rejected' ? 'rejeitado' : 'cancelado';
        charge.mercadoPagoStatus = details.rawStatus || details.status;
        charge.webhookVerifiedAt = Date.now();
        charge.webhookNotificationId = notificationRef;
        deps.saveStore();
        deps.emitWorkspaceRefresh(model.id, false);
        return {
          matched: true,
          chargeId: charge.id,
          approvalStatus: charge.approvalStatus,
          action: 'cancelled' as const,
        };
      }

      return {
        matched: true,
        chargeId: charge.id,
        approvalStatus: charge.approvalStatus,
        action: 'pending_or_ignored' as const,
      };
    });
  };

  if (isMerchantOrderTopic) {
    const order = await fetchMerchantOrder(dataId);
    if (!order) {
      return {
        httpStatus: 200,
        ok: true,
        source: 'merchant_order',
        processed: false,
      };
    }

    const approvedPayment = order.payments.find((p) => p.status === 'approved');
    if (approvedPayment) {
      const details = await fetchPayment(approvedPayment.id);
      if (details) {
        const outcome = await processPaymentDetails({
          ...details,
          externalReference:
            details.externalReference || order.externalReference,
        });
        return {
          httpStatus: 200,
          ok: true,
          source: 'merchant_order',
          ...outcome,
        };
      }
    }

    if (order.externalReference) {
      const verification = await verifyRefOrId({
        externalReference: order.externalReference,
      });
      if (verification.status === 'approved') {
        const outcome = await processPaymentDetails({
          id: verification.verifiedPaymentId || order.id,
          status: 'approved',
          rawStatus: verification.rawStatus || 'approved',
          externalReference: order.externalReference,
          transactionAmount: verification.transactionAmount,
          currencyId: verification.currencyId,
          paymentMethodId: verification.paymentMethodId,
        });
        return {
          httpStatus: 200,
          ok: true,
          source: 'merchant_order_ref',
          ...outcome,
        };
      }
    }

    return {
      httpStatus: 200,
      ok: true,
      source: 'merchant_order',
      processed: false,
    };
  }

  const details = await fetchPayment(dataId);
  if (!details) {
    return {
      httpStatus: 200,
      ok: true,
      source: 'payment',
      processed: false,
    };
  }

  const outcome = await processPaymentDetails(details);
  return {
    httpStatus: 200,
    ok: true,
    source: 'payment',
    ...outcome,
  };
}
