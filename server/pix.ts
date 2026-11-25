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

export interface GeneratedPixPayload {
  provider: 'bacen' | 'mercadopago';
  brCode: string;
  qrCodeDataUrl: string;
  pixKeyUsed: string;
  pixKeyTypeUsed: PixKeyType;
  merchantName: string;
  merchantCity: string;
  txid: string;
  externalPaymentId?: string;
  usingDemoKey: boolean;
}

function stripDiacritics(input: string): string {
  return input
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
  return clean || 'MAISON AURA STUDIO';
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

export function generateDeterministicStudioPixKey(modelId: string): string {
  // Valid RFC-4122 style UUID derived deterministically from modelId for sandbox preview
  const hash = crypto
    .createHash('sha256')
    .update(`maison_aura_pix_evp:${modelId}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function createMercadoPagoPixCharge(params: {
  amountCents: number;
  description: string;
  payerEmail: string;
  payerName: string;
  externalReference: string;
}): Promise<{
  paymentId: string;
  brCode: string;
  qrCodeBase64?: string;
} | null> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) return null;

  const amount = Number((Math.max(100, params.amountCents) / 100).toFixed(2));
  const [firstName, ...restName] = (params.payerName || 'Visitante Studio')
    .trim()
    .split(/\s+/);
  const lastName = restName.join(' ') || 'Cliente';

  const response = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': params.externalReference,
    },
    body: JSON.stringify({
      transaction_amount: amount,
      description: params.description.slice(0, 120),
      payment_method_id: 'pix',
      external_reference: params.externalReference,
      payer: {
        email: params.payerEmail || 'cliente@studio-preview.local',
        first_name: firstName.slice(0, 40),
        last_name: lastName.slice(0, 40),
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.warn('Mercado Pago PIX fallback to BACEN BR Code:', response.status, errText.slice(0, 200));
    return null;
  }

  const data = (await response.json()) as {
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
  };
}

export async function checkMercadoPagoPaymentStatus(
  paymentId: string
): Promise<'pending' | 'approved' | 'rejected' | 'cancelled' | 'unknown'> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token || !paymentId) return 'unknown';

  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (!response.ok) return 'unknown';
    const data = (await response.json()) as { status?: string };
    const status = (data.status || '').toLowerCase();
    if (status === 'approved') return 'approved';
    if (status === 'cancelled' || status === 'expired') return 'cancelled';
    if (status === 'rejected' || status === 'refunded' || status === 'charged_back') {
      return 'rejected';
    }
    return 'pending';
  } catch {
    return 'unknown';
  }
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
}): Promise<GeneratedPixPayload> {
  const hasCustomKey = Boolean(
    params.configuredPixKey &&
      isValidPixKey(params.configuredPixKey, params.configuredPixKeyType)
  );
  const rawKey = hasCustomKey
    ? params.configuredPixKey!
    : generateDeterministicStudioPixKey(params.modelId);
  const { key, keyType } = normalizePixKey(
    rawKey,
    hasCustomKey ? params.configuredPixKeyType : 'evp'
  );

  const formattedMerchant = formatEmvMerchantName(params.merchantName);
  const formattedCity = formatEmvMerchantCity(params.merchantCity);
  const cleanTxid = sanitizePixTxid(params.txid);

  const mpCharge = await createMercadoPagoPixCharge({
    amountCents: params.amountCents,
    description: params.description,
    payerEmail: params.payerEmail || 'cliente@studio-preview.local',
    payerName: params.payerName || 'Participante',
    externalReference: cleanTxid,
  });

  if (mpCharge) {
    const qrCodeDataUrl = mpCharge.qrCodeBase64
      ? `data:image/png;base64,${mpCharge.qrCodeBase64}`
      : await renderPixQrDataUrl(mpCharge.brCode);

    return {
      provider: 'mercadopago',
      brCode: mpCharge.brCode,
      qrCodeDataUrl,
      pixKeyUsed: key,
      pixKeyTypeUsed: keyType,
      merchantName: formattedMerchant,
      merchantCity: formattedCity,
      txid: cleanTxid,
      externalPaymentId: mpCharge.paymentId,
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
    brCode,
    qrCodeDataUrl,
    pixKeyUsed: key,
    pixKeyTypeUsed: keyType,
    merchantName: formattedMerchant,
    merchantCity: formattedCity,
    txid: cleanTxid,
    usingDemoKey: !hasCustomKey,
  };
}
