import crypto from 'crypto';
import QRCode from 'qrcode';

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp';

export interface PixBrCodeInput {
  pixKey: string;
  pixKeyType?: PixKeyType;
  merchantName: string;
  merchantCity: string;
  amountCents: number;
  txid: string;
  description?: string;
}

export const DEFAULT_STUDIO_EVP_PIX_KEY = 'eb2663cc-50a4-47d2-b6ae-1bcc86bdae6c';

export type MercadoPagoPreferredMethod =
  | 'pix'
  | 'credit_card'
  | 'debit_card'
  | 'account_money'
  | 'ticket';

export interface GeneratedPixPayload {
  provider: 'bacen' | 'mercadopago';
  preferredPaymentMethod: MercadoPagoPreferredMethod;
  brCode: string;
  qrCodeDataUrl: string;
  pixKeyUsed: string;
  pixKeyTypeUsed: PixKeyType;
  merchantName: string;
  merchantCity: string;
  txid: string;
  externalPaymentId?: string;
  checkoutUrl?: string;
  usingDemoKey: boolean;
}

export function isMercadoPagoConfigured(): boolean {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim());
}

function stripDiacritics(input?: string | null): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatEmvMerchantName(input: string): string {
  const clean = stripDiacritics(input)
    .replace(/[^A-Za-z0-9 .\-/&]/g, '')
    .trim()
    .slice(0, 25);
  return clean || 'MODEL GAT BRASIL';
}

export function formatEmvMerchantCity(input: string): string {
  const clean = stripDiacritics(input)
    .replace(/[^A-Za-z0-9 \-]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, 15);
  return clean || 'SAO PAULO';
}

export function sanitizePixTxid(input: string): string {
  const clean = stripDiacritics(input)
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 25);
  return clean || `PIX${Date.now().toString(36).toUpperCase().slice(-12)}`;
}

export function detectPixKeyType(rawKey: string): PixKeyType {
  const trimmed = rawKey.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'email';
  }
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed
    )
  ) {
    return 'evp';
  }
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return 'phone';
  }
  if (digits.length === 14) {
    return 'cnpj';
  }
  if (digits.length === 11) {
    // 11 digits with area code + 9xxxx-xxxx is phone if formatted or explicitly selected;
    // default 11 digits without '+' to CPF unless starts with country/DDD heuristic
    return 'cpf';
  }
  if (digits.length >= 10 && digits.length <= 13) {
    return 'phone';
  }
  return 'evp';
}

export function normalizePixKey(
  rawKey: string,
  explicitType?: PixKeyType
): { key: string; keyType: PixKeyType } {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    return { key: '', keyType: explicitType || 'evp' };
  }
  const keyType = explicitType || detectPixKeyType(trimmed);

  if (keyType === 'email') {
    return { key: trimmed.toLowerCase().slice(0, 77), keyType: 'email' };
  }
  if (keyType === 'evp') {
    return { key: trimmed.toLowerCase().slice(0, 77), keyType: 'evp' };
  }
  if (keyType === 'cpf') {
    const digits = trimmed.replace(/\D/g, '').slice(0, 11);
    return { key: digits, keyType: 'cpf' };
  }
  if (keyType === 'cnpj') {
    const digits = trimmed.replace(/\D/g, '').slice(0, 14);
    return { key: digits, keyType: 'cnpj' };
  }
  // Phone in BACEN standard: +55 + DDD + number
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return { key: `+${digits}`.slice(0, 15), keyType: 'phone' };
  }
  if (digits.startsWith('55') && digits.length >= 12) {
    return { key: `+${digits}`.slice(0, 15), keyType: 'phone' };
  }
  return { key: `+55${digits}`.slice(0, 15), keyType: 'phone' };
}

export function isValidPixKey(rawKey: string, explicitType?: PixKeyType): boolean {
  const { key, keyType } = normalizePixKey(rawKey, explicitType);
  if (!key) return false;
  switch (keyType) {
    case 'cpf':
      return /^\d{11}$/.test(key);
    case 'cnpj':
      return /^\d{14}$/.test(key);
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key) && key.length <= 77;
    case 'phone':
      return /^\+\d{10,14}$/.test(key);
    case 'evp':
      return (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          key
        ) || (key.length >= 8 && key.length <= 77)
      );
    default:
      return false;
  }
}

export function maskPixKeyForDisplay(pixKey: string, keyType: PixKeyType): string {
  if (!pixKey) return '';
  if (keyType === 'cpf' && pixKey.length === 11) {
    return `***.${pixKey.slice(3, 6)}.${pixKey.slice(6, 9)}-**`;
  }
  if (keyType === 'cnpj' && pixKey.length === 14) {
    return `${pixKey.slice(0, 2)}.***.***/${pixKey.slice(8, 12)}-**`;
  }
  if (keyType === 'email') {
    const [local, domain] = pixKey.split('@');
    if (!domain) return pixKey;
    const prefix = local.slice(0, 2);
    return `${prefix}***@${domain}`;
  }
  if (keyType === 'phone' && pixKey.length >= 8) {
    return `${pixKey.slice(0, 5)}*****${pixKey.slice(-4)}`;
  }
  if (pixKey.length > 14) {
    return `${pixKey.slice(0, 8)}...${pixKey.slice(-4)}`;
  }
  return pixKey;
}

function tlv(id: string, value: string): string {
  const len = Buffer.byteLength(value, 'utf8').toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * CRC16-CCITT (False): Polynomial 0x1021, Initial Value 0xFFFF
 * Required by BACEN EMV BR Code specification (Tag 63, Length 04).
 */
export function computeCrc16Ccitt(payloadWithCrcPrefix: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payloadWithCrcPrefix.length; i += 1) {
    crc ^= payloadWithCrcPrefix.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildPixBrCode(input: PixBrCodeInput): string {
  const { key } = normalizePixKey(input.pixKey, input.pixKeyType);
  if (!key) {
    throw new Error('Chave PIX não configurada para geração do BR Code.');
  }

  const amountBrl = (Math.max(1, Math.round(input.amountCents)) / 100).toFixed(2);
  const merchantName = formatEmvMerchantName(input.merchantName);
  const merchantCity = formatEmvMerchantCity(input.merchantCity);
  const txid = sanitizePixTxid(input.txid);

  // Tag 26: Merchant Account Information (GUI + Chave PIX + opcional Descrição)
  const cleanDesc = input.description
    ? stripDiacritics(input.description).slice(0, 40)
    : '';
  const guiAndKey =
    tlv('00', 'br.gov.bcb.pix') +
    tlv('01', key) +
    (cleanDesc ? tlv('02', cleanDesc) : '');

  // Ensure Tag 26 stays within EMV 99-char limit
  const merchantAccountInfo =
    Buffer.byteLength(guiAndKey, 'utf8') <= 99
      ? guiAndKey
      : tlv('00', 'br.gov.bcb.pix') + tlv('01', key);

  const additionalDataField = tlv('05', txid);

  const partialPayload =
    tlv('00', '01') + // Payload Format Indicator
    tlv('01', '12') + // Point of Initiation Method (12 = unique transaction / priced)
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') + // Merchant Category Code
    tlv('53', '986') + // Transaction Currency (BRL = 986)
    tlv('54', amountBrl) +
    tlv('58', 'BR') + // Country Code
    tlv('59', merchantName) +
    tlv('60', merchantCity) +
    tlv('62', additionalDataField) +
    '6304';

  const crc = computeCrc16Ccitt(partialPayload);
  return `${partialPayload}${crc}`;
}

export async function renderPixQrDataUrl(brCode: string): Promise<string> {
  return QRCode.toDataURL(brCode, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: {
      dark: '#070B1E',
      light: '#FFFFFF',
    },
  });
}

function parseSafeHttpsOrigin(raw?: string | null): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol === 'https:' &&
      host &&
      host !== 'localhost' &&
      host !== '127.0.0.1' &&
      host !== '0.0.0.0'
    ) {
      return parsed.origin;
    }
  } catch {
    // Ignore invalid URL
  }
  return null;
}

function getPublicHttpsAppUrl(preferredOrigin?: string): string | null {
  return (
    parseSafeHttpsOrigin(process.env.APP_URL) ||
    parseSafeHttpsOrigin(preferredOrigin)
  );
}

function buildCheckoutPaymentMethodsConfig(
  preferred?: MercadoPagoPreferredMethod
): Record<string, unknown> | undefined {
  if (!preferred || preferred === 'pix') {
    return { installments: 12 };
  }
  if (preferred === 'credit_card') {
    return {
      excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
      installments: 12,
    };
  }
  if (preferred === 'debit_card') {
    return {
      excluded_payment_types: [{ id: 'ticket' }, { id: 'credit_card' }, { id: 'atm' }],
    };
  }
  if (preferred === 'account_money') {
    return {
      excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
      installments: 12,
    };
  }
  if (preferred === 'ticket') {
    return {
      excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }],
    };
  }
  return undefined;
}

async function createMercadoPagoCheckoutPreference(params: {
  amount: number;
  description: string;
  payerEmail: string;
  payerName: string;
  externalReference: string;
  preferredPaymentMethod?: MercadoPagoPreferredMethod;
  publicOrigin?: string;
  token: string;
}): Promise<{ checkoutUrl?: string; preferenceId?: string; errorReason?: string }> {
  const appOrigin = getPublicHttpsAppUrl(params.publicOrigin);
  const paymentMethods = buildCheckoutPaymentMethodsConfig(
    params.preferredPaymentMethod
  );

  const sendPreferenceRequest = async (includeFilters: boolean) => {
    const basePayload: Record<string, unknown> = {
      items: [
        {
          id: params.externalReference,
          title: params.description.slice(0, 120),
          quantity: 1,
          currency_id: 'BRL',
          unit_price: params.amount,
        },
      ],
      payer: {
        email: params.payerEmail || 'visitante@modelgatbrasil.com.br',
        name: (params.payerName || 'Participante').slice(0, 80),
      },
      external_reference: params.externalReference,
      statement_descriptor: 'MODEL GAT BRASIL',
    };

    if (includeFilters && paymentMethods) {
      basePayload.payment_methods = paymentMethods;
    }
    if (appOrigin) {
      basePayload.notification_url = `${appOrigin}/api/webhooks/mercadopago`;
      basePayload.back_urls = {
        success: `${appOrigin}/?mp_status=approved&ref=${encodeURIComponent(params.externalReference)}`,
        pending: `${appOrigin}/?mp_status=pending&ref=${encodeURIComponent(params.externalReference)}`,
        failure: `${appOrigin}/?mp_status=failure&ref=${encodeURIComponent(params.externalReference)}`,
      };
      if (includeFilters) {
        basePayload.auto_return = 'approved';
      }
    }

    return fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(7000),
      body: JSON.stringify(basePayload),
    });
  };

  try {
    let response = await sendPreferenceRequest(true);
    if (!response.ok && response.status >= 400 && response.status < 500) {
      const firstErr = (await response.text().catch(() => '')).slice(0, 180);
      console.warn(
        'Mercado Pago preference filtered attempt failed, retrying base preference:',
        response.status,
        firstErr
      );
      response = await sendPreferenceRequest(false);
    }
    if (!response.ok) {
      const errSnippet = (await response.text().catch(() => '')).slice(0, 180);
      console.warn('Mercado Pago preference error:', response.status, errSnippet);
      return { errorReason: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
    };
    const url = (data.init_point || data.sandbox_init_point || '').trim();
    return {
      checkoutUrl: url.startsWith('https://') ? url : undefined,
      preferenceId: data.id ? String(data.id) : undefined,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'timeout_or_network';
    console.warn('Mercado Pago preference exception:', reason);
    return { errorReason: reason };
  }
}

async function createMercadoPagoPixCharge(params: {
  amountCents: number;
  description: string;
  payerEmail: string;
  payerName: string;
  externalReference: string;
  publicOrigin?: string;
}): Promise<{
  paymentId: string;
  brCode: string;
  qrCodeBase64?: string;
  checkoutUrl?: string;
} | null> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) return null;

  const amount = Number((Math.max(100, params.amountCents) / 100).toFixed(2));
  const [firstName, ...restName] = (params.payerName || 'Visitante Studio')
    .trim()
    .split(/\s+/);
  const lastName = restName.join(' ') || 'Cliente';
  const appOrigin = getPublicHttpsAppUrl(params.publicOrigin);

  try {
    const [paymentRes, prefRes] = await Promise.all([
      fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': params.externalReference,
        },
        signal: AbortSignal.timeout(7000),
        body: JSON.stringify({
          transaction_amount: amount,
          description: params.description.slice(0, 120),
          payment_method_id: 'pix',
          external_reference: params.externalReference,
          ...(appOrigin
            ? { notification_url: `${appOrigin}/api/webhooks/mercadopago` }
            : {}),
          payer: {
            email: params.payerEmail || 'visitante@modelgatbrasil.com.br',
            first_name: firstName.slice(0, 40),
            last_name: lastName.slice(0, 40),
          },
        }),
      }),
      createMercadoPagoCheckoutPreference({
        amount,
        description: params.description,
        payerEmail: params.payerEmail || 'visitante@modelgatbrasil.com.br',
        payerName: params.payerName || 'Participante',
        externalReference: params.externalReference,
        preferredPaymentMethod: 'pix',
        publicOrigin: params.publicOrigin,
        token,
      }),
    ]);

    if (!paymentRes.ok) {
      const errText = await paymentRes.text().catch(() => '');
      console.warn(
        'Mercado Pago PIX fallback to BACEN BR Code:',
        paymentRes.status,
        errText.slice(0, 200)
      );
      return null;
    }

    const data = (await paymentRes.json()) as {
      id?: string | number;
      point_of_interaction?: {
        transaction_data?: {
          qr_code?: string;
          qr_code_base64?: string;
        };
      };
    };

    const brCode = data.point_of_interaction?.transaction_data?.qr_code;
    if (!data.id || !brCode) {
      return null;
    }

    return {
      paymentId: String(data.id),
      brCode,
      qrCodeBase64: data.point_of_interaction?.transaction_data?.qr_code_base64,
      checkoutUrl: prefRes.checkoutUrl,
    };
  } catch (err) {
    console.warn(
      'Mercado Pago PIX API timeout/network fallback to BACEN BR Code:',
      err instanceof Error ? err.message : 'unknown'
    );
    return null;
  }
}

export interface MercadoPagoPaymentDetails {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'unknown';
  rawStatus?: string;
  statusDetail?: string;
  externalReference?: string;
  transactionAmount?: number;
  currencyId?: string;
  paymentMethodId?: string;
  dateApproved?: string;
}

export interface MercadoPagoMerchantOrderDetails {
  id: string;
  status?: string;
  orderStatus?: string;
  externalReference?: string;
  paidAmount?: number;
  totalAmount?: number;
  payments: Array<{
    id: string;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'unknown';
    rawStatus?: string;
    transactionAmount?: number;
    currencyId?: string;
  }>;
}

function mapMpStatus(
  rawStatus?: string
): 'pending' | 'approved' | 'rejected' | 'cancelled' | 'unknown' {
  const status = (rawStatus || '').toLowerCase();
  if (status === 'approved') return 'approved';
  if (status === 'cancelled' || status === 'expired') return 'cancelled';
  if (status === 'rejected' || status === 'refunded' || status === 'charged_back') {
    return 'rejected';
  }
  if (status === 'pending' || status === 'in_process' || status === 'authorized') {
    return 'pending';
  }
  return 'unknown';
}

export async function fetchMercadoPagoPaymentById(
  paymentId: string
): Promise<MercadoPagoPaymentDetails | null> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  const cleanId = paymentId.replace(/[^0-9a-zA-Z_-]/g, '');
  if (!token || !cleanId) return null;

  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(cleanId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(7000),
      }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      id?: string | number;
      status?: string;
      status_detail?: string;
      external_reference?: string;
      transaction_amount?: number;
      currency_id?: string;
      payment_method_id?: string;
      date_approved?: string;
    };
    const rawStatus = data.status ? String(data.status).toLowerCase() : undefined;
    return {
      id: String(data.id || cleanId),
      status: mapMpStatus(rawStatus),
      rawStatus,
      statusDetail: data.status_detail,
      externalReference: data.external_reference,
      transactionAmount:
        typeof data.transaction_amount === 'number'
          ? data.transaction_amount
          : undefined,
      currencyId: data.currency_id,
      paymentMethodId: data.payment_method_id,
      dateApproved: data.date_approved,
    };
  } catch {
    return null;
  }
}

export async function fetchMercadoPagoMerchantOrderById(
  orderId: string
): Promise<MercadoPagoMerchantOrderDetails | null> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  const cleanId = orderId.replace(/[^0-9a-zA-Z_-]/g, '');
  if (!token || !cleanId) return null;

  try {
    const response = await fetch(
      `https://api.mercadopago.com/merchant_orders/${encodeURIComponent(cleanId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(7000),
      }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      id?: string | number;
      status?: string;
      order_status?: string;
      external_reference?: string;
      paid_amount?: number;
      total_amount?: number;
      payments?: Array<{
        id?: string | number;
        status?: string;
        transaction_amount?: number;
        currency_id?: string;
      }>;
    };

    const payments = Array.isArray(data.payments)
      ? data.payments
          .filter((p) => p && (p.id !== undefined && p.id !== null))
          .map((p) => {
            const rawStatus = p.status ? String(p.status).toLowerCase() : undefined;
            return {
              id: String(p.id),
              status: mapMpStatus(rawStatus),
              rawStatus,
              transactionAmount:
                typeof p.transaction_amount === 'number'
                  ? p.transaction_amount
                  : undefined,
              currencyId: p.currency_id,
            };
          })
      : [];

    return {
      id: String(data.id || cleanId),
      status: data.status,
      orderStatus: data.order_status,
      externalReference: data.external_reference,
      paidAmount:
        typeof data.paid_amount === 'number' ? data.paid_amount : undefined,
      totalAmount:
        typeof data.total_amount === 'number' ? data.total_amount : undefined,
      payments,
    };
  } catch {
    return null;
  }
}

export async function verifyMercadoPagoChargeByReferenceOrId(params: {
  paymentId?: string;
  externalReference?: string;
}): Promise<{
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'unknown';
  rawStatus?: string;
  verifiedPaymentId?: string;
  paymentMethodId?: string;
  transactionAmount?: number;
  currencyId?: string;
}> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) return { status: 'unknown' };

  if (params.paymentId) {
    const direct = await fetchMercadoPagoPaymentById(params.paymentId);
    if (direct && direct.status === 'approved') {
      return {
        status: 'approved',
        rawStatus: direct.rawStatus,
        verifiedPaymentId: direct.id,
        paymentMethodId: direct.paymentMethodId,
        transactionAmount: direct.transactionAmount,
        currencyId: direct.currencyId,
      };
    }
    if (direct && (direct.status === 'cancelled' || direct.status === 'rejected')) {
      return {
        status: direct.status,
        rawStatus: direct.rawStatus,
        verifiedPaymentId: direct.id,
        paymentMethodId: direct.paymentMethodId,
        transactionAmount: direct.transactionAmount,
        currencyId: direct.currencyId,
      };
    }
  }

  // Also check Mercado Pago Payments Search by external_reference in case visitor completed Checkout Pro (Cartão/Saldo/Boleto/PIX)
  if (params.externalReference) {
    try {
      const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(
        params.externalReference
      )}&sort=date_created&criteria=desc&limit=5`;
      const response = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(7000),
      });
      if (response.ok) {
        const json = (await response.json()) as {
          results?: Array<{
            id?: string | number;
            status?: string;
            payment_method_id?: string;
            transaction_amount?: number;
            currency_id?: string;
          }>;
        };
        const approved = (json.results || []).find(
          (item) => mapMpStatus(item.status) === 'approved'
        );
        if (approved) {
          return {
            status: 'approved',
            rawStatus: approved.status?.toLowerCase(),
            verifiedPaymentId: approved.id ? String(approved.id) : undefined,
            paymentMethodId: approved.payment_method_id,
            transactionAmount:
              typeof approved.transaction_amount === 'number'
                ? approved.transaction_amount
                : undefined,
            currencyId: approved.currency_id,
          };
        }
      }
    } catch {
      // Ignore transient search failures
    }
  }

  return { status: 'pending' };
}

export function verifyMercadoPagoWebhookSignature(params: {
  xSignatureHeader?: string;
  xRequestIdHeader?: string;
  dataId?: string;
}): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    // If no webhook secret configured, rely on mandatory server-to-server lookup via Mercado Pago API
    return true;
  }
  const sigHeader = params.xSignatureHeader?.trim() || '';
  const reqId = params.xRequestIdHeader?.trim() || '';
  const dataId = params.dataId?.trim() || '';
  if (!sigHeader || !dataId) return false;

  const parts: Record<string, string> = {};
  for (const segment of sigHeader.split(',')) {
    const eqIdx = segment.indexOf('=');
    if (eqIdx <= 0) continue;
    const k = segment.slice(0, eqIdx).trim();
    const v = segment.slice(eqIdx + 1).trim();
    if (k && v) parts[k] = v;
  }
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !/^\d+$/.test(ts) || !v1 || !/^[0-9a-fA-F]{64}$/.test(v1)) {
    return false;
  }

  const normalizedIds = Array.from(
    new Set([dataId.toLowerCase(), dataId])
  );
  const sigBuf = Buffer.from(v1.toLowerCase(), 'hex');
  for (const idCandidate of normalizedIds) {
    const manifest = reqId
      ? `id:${idCandidate};request-id:${reqId};ts:${ts};`
      : `id:${idCandidate};ts:${ts};`;
    const computed = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest();
    if (computed.length === sigBuf.length && crypto.timingSafeEqual(computed, sigBuf)) {
      return true;
    }
  }
  return false;
}

export async function generatePixChargeAssets(params: {
  modelId: string;
  configuredPixKey?: string;
  configuredPixKeyType?: PixKeyType;
  merchantName: string;
  merchantCity: string;
  amountCents: number;
  txid: string;
  description: string;
  payerEmail?: string;
  payerName?: string;
  preferredPaymentMethod?: MercadoPagoPreferredMethod;
  publicOrigin?: string;
}): Promise<GeneratedPixPayload> {
  const preferredMethod: MercadoPagoPreferredMethod =
    params.preferredPaymentMethod || 'pix';
  const hasCustomKey = Boolean(
    params.configuredPixKey &&
      isValidPixKey(params.configuredPixKey, params.configuredPixKeyType)
  );
  const rawKey = hasCustomKey
    ? params.configuredPixKey!
    : DEFAULT_STUDIO_EVP_PIX_KEY;
  const { key, keyType } = normalizePixKey(
    rawKey,
    hasCustomKey ? params.configuredPixKeyType : 'evp'
  );

  const formattedMerchant = formatEmvMerchantName(params.merchantName);
  const formattedCity = formatEmvMerchantCity(params.merchantCity);
  const cleanTxid = sanitizePixTxid(params.txid);

  // When visitor picks Credit Card, Debit Card, Saldo MP or Boleto via Mercado Pago Checkout Pro
  if (preferredMethod !== 'pix') {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
    if (!token) {
      throw new Error(
        'MERCADOPAGO_TOKEN_REQUIRED: Pagamentos por Cartão, Débito, Saldo ou Boleto via Mercado Pago exigem MERCADOPAGO_ACCESS_TOKEN configurado nos Secrets do servidor.'
      );
    }

    const amount = Number((Math.max(100, params.amountCents) / 100).toFixed(2));
    const prefRes = await createMercadoPagoCheckoutPreference({
      amount,
      description: params.description,
      payerEmail: params.payerEmail || 'visitante@modelgatbrasil.com.br',
      payerName: params.payerName || 'Participante',
      externalReference: cleanTxid,
      preferredPaymentMethod: preferredMethod,
      publicOrigin: params.publicOrigin,
      token,
    });

    if (!prefRes.checkoutUrl) {
      throw new Error(
        `MERCADOPAGO_PREFERENCE_FAILED: Não foi possível iniciar o Checkout Mercado Pago (${prefRes.errorReason || 'erro na API'}). Você pode concluir imediatamente via PIX.`
      );
    }

    const checkoutQrUrl = await renderPixQrDataUrl(prefRes.checkoutUrl);
    return {
      provider: 'mercadopago',
      preferredPaymentMethod: preferredMethod,
      brCode: prefRes.checkoutUrl,
      qrCodeDataUrl: checkoutQrUrl,
      pixKeyUsed: key,
      pixKeyTypeUsed: keyType,
      merchantName: formattedMerchant,
      merchantCity: formattedCity,
      txid: cleanTxid,
      checkoutUrl: prefRes.checkoutUrl,
      usingDemoKey: false,
    };
  }

  const mpCharge = await createMercadoPagoPixCharge({
    amountCents: params.amountCents,
    description: params.description,
    payerEmail: params.payerEmail || 'visitante@modelgatbrasil.com.br',
    payerName: params.payerName || 'Participante',
    externalReference: cleanTxid,
    publicOrigin: params.publicOrigin,
  });

  if (mpCharge) {
    const qrCodeDataUrl = mpCharge.qrCodeBase64
      ? `data:image/png;base64,${mpCharge.qrCodeBase64}`
      : await renderPixQrDataUrl(mpCharge.brCode);

    return {
      provider: 'mercadopago',
      preferredPaymentMethod: 'pix',
      brCode: mpCharge.brCode,
      qrCodeDataUrl,
      pixKeyUsed: key,
      pixKeyTypeUsed: keyType,
      merchantName: formattedMerchant,
      merchantCity: formattedCity,
      txid: cleanTxid,
      externalPaymentId: mpCharge.paymentId,
      checkoutUrl: mpCharge.checkoutUrl,
      usingDemoKey: false,
    };
  }

  const brCode = buildPixBrCode({
    pixKey: key,
    pixKeyType: keyType,
    merchantName: formattedMerchant,
    merchantCity: formattedCity,
    amountCents: params.amountCents,
    txid: cleanTxid,
    description: params.description,
  });
  const qrCodeDataUrl = await renderPixQrDataUrl(brCode);

  return {
    provider: 'bacen',
    preferredPaymentMethod: 'pix',
    brCode,
    qrCodeDataUrl,
    pixKeyUsed: key,
    pixKeyTypeUsed: keyType,
    merchantName: formattedMerchant,
    merchantCity: formattedCity,
    txid: cleanTxid,
    usingDemoKey: false,
  };
}
