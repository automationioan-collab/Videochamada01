import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const STORE_PATH = path.join(DATA_DIR, 'studio-store.json');

export const PRIMARY_MODEL_ID = 'lorena_noir';

export const ADMIN_THEME_IDS = [
  'rose_velvet',
  'sapphire_cobalt',
  'emerald_jade',
  'amber_gold',
  'violet_amethyst',
  'crimson_ruby',
  'cyan_teal',
  'coral_sunset',
] as const;

export type AdminThemeColorId = (typeof ADMIN_THEME_IDS)[number];

export function sanitizeAdminThemeColor(
  input: unknown
): AdminThemeColorId | undefined {
  if (typeof input !== 'string') return undefined;
  const clean = input.trim() as AdminThemeColorId;
  return (ADMIN_THEME_IDS as readonly string[]).includes(clean)
    ? clean
    : undefined;
}

export function pickNextDistinctThemeColor(
  models: Iterable<StoredModelAccount>
): AdminThemeColorId {
  const used = new Set<string>();
  let count = 0;
  for (const m of models) {
    count += 1;
    if (m.adminThemeColor) used.add(m.adminThemeColor);
  }
  const unused = ADMIN_THEME_IDS.find((id) => !used.has(id));
  if (unused) return unused;
  return ADMIN_THEME_IDS[count % ADMIN_THEME_IDS.length];
}

export function getModelActorUid(modelId: string): string {
  return `model_${modelId}`;
}

export function getModelRoomId(modelId: string): string {
  return `room_${modelId}`;
}

export function sanitizeId(input: unknown, fallback = ''): string {
  if (typeof input !== 'string') return fallback;
  const clean = input.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  return clean || fallback;
}

export function sanitizeSlug(input: unknown, fallback = 'modelo'): string {
  if (typeof input !== 'string') return fallback;
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || fallback;
}

export function sanitizeLoginUsername(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.trim().toLowerCase().replace(/\s+/g, '').slice(0, 120);
}

export function sanitizeMediaUrl(input: unknown, maxLen = 500): string {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim().slice(0, maxLen);
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    (trimmed.startsWith('/') && !trimmed.startsWith('//'))
  ) {
    return trimmed;
  }
  return '';
}

export function sanitizeWhatsappPhone(input: unknown): string {
  if (typeof input !== 'string') return '';
  let digits = input.replace(/\D+/g, '');
  if (!digits) return '';
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    digits = `55${digits}`;
  }
  if (digits.length < 10 || digits.length > 15) {
    return '';
  }
  return digits;
}

export interface StoredSchedulePeriod {
  id: string;
  label?: string;
  startTime: string;
  endTime: string;
  days: string;
  enabled: boolean;
}

export interface StoredHolidayDate {
  date: string;
  label?: string;
}

export interface StoredDailyPausePeriod {
  id: string;
  label?: string;
  startTime: string;
  endTime: string;
  days: string;
  enabled: boolean;
}

export interface StoredStudioState {
  modelUid: string;
  modelName: string;
  isLive: boolean;
  callMode: 'open' | 'queue_only' | 'paused';
  headline: string;
  activeCallId?: string;
  activeCallUserId?: string;
  activeCallUserName?: string;
  autoScheduleEnabled?: boolean;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  scheduleDays?: string;
  scheduleTimezone?: string;
  schedulePeriods?: StoredSchedulePeriod[];
  holidayDates?: StoredHolidayDate[];
  dailyPausePeriods?: StoredDailyPausePeriod[];
  weeklyBlockedDays?: number[];
  pauseWarningEnabled?: boolean;
  pauseWarningMinutes?: number;
  pauseWarningMessage?: string;
  dndActive?: boolean;
  dndUntilMs?: number;
  dndScheduleEnabled?: boolean;
  dndStartTime?: string;
  dndEndTime?: string;
  tipGoalEnabled?: boolean;
  tipGoalTitle?: string;
  tipGoalDescription?: string;
  tipGoalTargetCents?: number;
  tipGoalCurrentCents?: number;
  tipGoalRewardText?: string;
  tipGoalContributorsCount?: number;
  tipGoalLastTipName?: string;
  tipGoalLastTipAmountCents?: number;
  updatedAt: number;
}

export interface StoredModelBasicInfo {
  age?: string;
  location?: string;
  languages?: string;
  height?: string;
  appearance?: string;
  specialty?: string;
  availabilityNote?: string;
}

export function sanitizeModelBasicInfo(
  input: unknown
): StoredModelBasicInfo {
  if (!input || typeof input !== 'object') return {};
  const obj = input as Record<string, unknown>;
  const pick = (key: string, maxLen = 80) => {
    const val = obj[key];
    return typeof val === 'string' && val.trim()
      ? val.trim().slice(0, maxLen)
      : undefined;
  };
  const out: StoredModelBasicInfo = {};
  const age = pick('age', 30);
  const location = pick('location', 80);
  const languages = pick('languages', 80);
  const height = pick('height', 30);
  const appearance = pick('appearance', 100);
  const specialty = pick('specialty', 120);
  const availabilityNote = pick('availabilityNote', 120);
  if (age) out.age = age;
  if (location) out.location = location;
  if (languages) out.languages = languages;
  if (height) out.height = height;
  if (appearance) out.appearance = appearance;
  if (specialty) out.specialty = specialty;
  if (availabilityNote) out.availabilityNote = availabilityNote;
  return out;
}

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp';
export type PixChargeKind = 'private_album' | 'tip' | 'call_plan' | 'custom_charge';
export type PixChargeStatus = 'pending' | 'paid' | 'expired' | 'cancelled';
export type PixApprovalStatus =
  | 'pendente'
  | 'aprovado'
  | 'rejeitado'
  | 'cancelado'
  | 'expirado'
  | 'estornado';
export type MercadoPagoPaymentMethod =
  | 'pix'
  | 'credit_card'
  | 'debit_card'
  | 'account_money'
  | 'ticket';

export interface StoredPixCharge {
  id: string;
  txid: string;
  modelId: string;
  userId: string;
  userName: string;
  kind: PixChargeKind;
  amountCents: number;
  originalAmountCents?: number;
  dueDate?: string;
  dueAtMs?: number;
  finePercent?: number;
  interestMonthlyPercent?: number;
  fineCents?: number;
  interestCents?: number;
  daysOverdue?: number;
  createdByModel?: boolean;
  description: string;
  planId?: string;
  planName?: string;
  planDurationMinutes?: number;
  topic?: string;
  callMode?: 'group' | 'private';
  note?: string;
  status: PixChargeStatus;
  approvalStatus?: PixApprovalStatus;
  mercadoPagoStatus?: string;
  provider: 'bacen' | 'mercadopago';
  preferredPaymentMethod?: MercadoPagoPaymentMethod;
  externalPaymentId?: string;
  checkoutUrl?: string;
  paymentMethodUsed?: string;
  verifiedAmountCents?: number;
  webhookVerifiedAt?: number;
  webhookNotificationId?: string;
  brCode: string;
  qrCodeDataUrl: string;
  pixKeyUsed: string;
  pixKeyTypeUsed: PixKeyType;
  merchantName: string;
  merchantCity: string;
  usingDemoKey?: boolean;
  callRequestId?: string;
  inviteId?: string;
  createdAt: number;
  expiresAt: number;
  paidAt?: number;
  visitorReportedPaidAt?: number;
  fulfilledAt?: number;
}

export interface StoredWhatsappInvite {
  id: string;
  modelId: string;
  recipientName?: string;
  recipientPhone?: string;
  photoUrl: string;
  message: string;
  planId?: string;
  planName?: string;
  planDurationMinutes?: number;
  planPriceCents?: number;
  callMode: 'group' | 'private';
  status: 'pending' | 'viewed' | 'paid';
  clickCount: number;
  createdAt: number;
  viewedAt?: number;
  paidAt?: number;
  paidByUid?: string;
  paidByName?: string;
  callRequestId?: string;
  pixChargeId?: string;
}

export interface StoredStudioConfig {
  modelUid: string;
  studioBrand: string;
  modelName: string;
  modelAvatarUrl?: string;
  heroImageUrl?: string;
  loungeImageUrl?: string;
  modelBio?: string;
  basicInfo?: StoredModelBasicInfo;
  heroTitle: string;
  heroSubtitle: string;
  headline: string;
  groupButtonLabel: string;
  privateButtonLabel: string;
  ratePerMinuteCents: number;
  privateAlbumPriceCents?: number;
  pixKey?: string;
  pixKeyType?: PixKeyType;
  pixMerchantName?: string;
  pixMerchantCity?: string;
  pixFinePercent?: number;
  pixInterestMonthlyPercent?: number;
  pixDefaultDueDays?: number;
  whatsappInvitePhotoUrl?: string;
  whatsappInviteMessage?: string;
  whatsappInvitePlanId?: string;
  whatsappInviteCallMode?: 'group' | 'private';
  updatedAt: number;
}

export interface StoredGalleryItem {
  id: string;
  title: string;
  caption: string;
  category: 'editorial' | 'portraits' | 'studio';
  mediaType?: 'photo' | 'video';
  specs: string;
  src: string;
  alt: string;
  sortOrder: number;
  active: boolean;
  approvalStatus?: 'approved' | 'pending' | 'rejected';
  moderationNote?: string;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface StoredPrivateAlbumItem {
  id: string;
  title: string;
  caption: string;
  mediaType: 'photo' | 'video';
  src: string;
  thumbnailUrl?: string;
  sortOrder: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StoredCallPlan {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  currency: 'BRL';
  active: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface StoredCallRequest {
  id: string;
  userId: string;
  userName: string;
  userPhotoUrl?: string;
  topic: string;
  status: 'waiting' | 'accepted' | 'in_call' | 'ended' | 'rejected' | 'cancelled';
  planId?: string;
  planName?: string;
  planDurationMinutes?: number;
  planPriceCents?: number;
  paymentStatus?: 'authorized' | 'captured' | 'refunded';
  createdAt: number;
  updatedAt: number;
}

export interface StoredCallMessage {
  id: string;
  callId: string;
  senderUid: string;
  senderName: string;
  senderRole: 'model' | 'moderator' | 'viewer';
  recipientUid: string;
  text: string;
  createdAt: number;
}

export interface StoredCallHistoryRecord {
  id: string;
  callId: string;
  userId: string;
  userName: string;
  modelUid: string;
  durationSeconds: number;
  amountCents: number;
  currency: 'BRL';
  status: 'completed' | 'refunded';
  planId?: string;
  planName?: string;
  planDurationMinutes?: number;
  rating?: number;
  ratingComment?: string;
  ratedAt?: number;
  endedAt: number;
  createdAt: number;
}

export interface StoredInterestMessage {
  id: string;
  userId: string;
  userName: string;
  userPhotoUrl?: string;
  preferredTime: string;
  message: string;
  status: 'unread' | 'reviewed' | 'contacted';
  createdAt: number;
  updatedAt: number;
}

export interface StoredVisitorProfile {
  uid: string;
  displayName: string;
  photoUrl?: string;
  role: 'model' | 'moderator' | 'viewer';
  accessStatus: 'active' | 'vip' | 'muted' | 'blocked';
  isOnline: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredPrivateAlbumPurchase {
  id: string;
  userId: string;
  userName: string;
  amountCents: number;
  paymentMethod: 'pix' | 'card';
  purchasedAt: number;
}

export interface ModelWorkspaceData {
  studioState: StoredStudioState;
  studioConfig: StoredStudioConfig;
  galleryItems: StoredGalleryItem[];
  privateAlbumEnabled?: boolean;
  privateAlbumPasswordSalt?: string;
  privateAlbumPasswordHash?: string;
  privateAlbumPasswordHint?: string;
  privateAlbumTokenVersion?: number;
  privateAlbumPriceCents?: number;
  privateAlbumPurchases?: StoredPrivateAlbumPurchase[];
  privateAlbumItems?: StoredPrivateAlbumItem[];
  pixCharges?: StoredPixCharge[];
  whatsappInvites?: StoredWhatsappInvite[];
  callPlans: StoredCallPlan[];
  callQueue: StoredCallRequest[];
  callMessages: StoredCallMessage[];
  callHistory: StoredCallHistoryRecord[];
  interestMessages: StoredInterestMessage[];
  visitorProfiles: Record<string, StoredVisitorProfile>;
}

export interface StoredModelAccount {
  id: string;
  slug: string;
  displayName: string;
  loginUsername: string;
  passwordSalt: string;
  passwordHash: string;
  tokenVersion: number;
  isPrimary: boolean;
  active: boolean;
  adminThemeColor?: AdminThemeColorId;
  createdAt: string;
  updatedAt: string;
}

interface StudioStoreData {
  models: Record<string, StoredModelAccount>;
  workspaces: Record<string, ModelWorkspaceData>;
}

export interface ModelSessionPayload {
  typ: 'model_session';
  modelId: string;
  loginUsername: string;
  displayName: string;
  tokenVersion: number;
  iat: number;
  exp: number;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

export function ensureUploadsDir() {
  ensureDataDir();
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true, mode: 0o755 });
  }
}

const IN_MEMORY_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const fromEnv = process.env.MODEL_SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 24) {
    return fromEnv;
  }
  const legacySecretPath = path.join(DATA_DIR, 'session.secret');
  try {
    if (fs.existsSync(legacySecretPath)) {
      fs.unlinkSync(legacySecretPath);
    }
  } catch {
    // Ignore cleanup errors
  }
  return IN_MEMORY_SESSION_SECRET;
}

const SESSION_SECRET = getSessionSecret();

export function getConfiguredPrimaryPassword(): string {
  const val = process.env.PRIMARY_MODEL_INITIAL_PASSWORD?.trim() || '';
  return val.length >= 6 ? val : '';
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): boolean {
  if (!password || !salt || !expectedHash) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

export function verifyTimingSafeString(a: string, b: string): boolean {
  if (!a || !b) return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function verifyModelAccountPassword(
  account: StoredModelAccount,
  password: string
): boolean {
  if (!password) return false;
  if (account.isPrimary) {
    const envPass = getConfiguredPrimaryPassword();
    if (envPass) {
      return verifyTimingSafeString(password, envPass);
    }
  }
  return Boolean(
    account.passwordHash &&
      account.passwordSalt &&
      verifyPassword(password, account.passwordSalt, account.passwordHash)
  );
}

export function isPrimaryClaimNeeded(): boolean {
  if (getConfiguredPrimaryPassword()) return false;
  const store = getStore();
  const primary = store.models[PRIMARY_MODEL_ID];
  if (!primary) return false;
  return !(primary.passwordHash && primary.passwordSalt);
}

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(normalized, 'base64');
}

export function signModelSessionToken(account: StoredModelAccount): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: ModelSessionPayload = {
    typ: 'model_session',
    modelId: account.id,
    loginUsername: account.loginUsername,
    displayName: account.displayName,
    tokenVersion: account.tokenVersion,
    iat: nowSec,
    exp: nowSec + 60 * 60 * 12,
  };
  const headerB64 = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const unsigned = `${headerB64}.${payloadB64}`;
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(unsigned)
    .digest();
  return `${unsigned}.${toBase64Url(signature)}`;
}

export function verifyModelSessionToken(
  token: string
): ModelSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  const unsigned = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(unsigned)
    .digest();

  let actualSig: Buffer;
  try {
    actualSig = fromBase64Url(sigB64);
  } catch {
    return null;
  }

  if (actualSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(actualSig, expectedSig)) return null;

  try {
    const payload = JSON.parse(
      fromBase64Url(payloadB64).toString('utf8')
    ) as ModelSessionPayload;
    if (
      payload.typ !== 'model_session' ||
      !payload.modelId ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export interface PrivateAlbumTokenPayload {
  typ: 'private_album_access';
  modelId: string;
  version: number;
  iat: number;
  exp: number;
}

export function signPrivateAlbumToken(modelId: string, version = 1): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: PrivateAlbumTokenPayload = {
    typ: 'private_album_access',
    modelId,
    version,
    iat: nowSec,
    exp: nowSec + 60 * 60 * 2,
  };
  const headerB64 = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const unsigned = `${headerB64}.${payloadB64}`;
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(unsigned)
    .digest();
  return `${unsigned}.${toBase64Url(signature)}`;
}

export function verifyPrivateAlbumToken(
  token: string
): PrivateAlbumTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  const unsigned = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(unsigned)
    .digest();

  let actualSig: Buffer;
  try {
    actualSig = fromBase64Url(sigB64);
  } catch {
    return null;
  }

  if (actualSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(actualSig, expectedSig)) return null;

  try {
    const payload = JSON.parse(
      fromBase64Url(payloadB64).toString('utf8')
    ) as PrivateAlbumTokenPayload;
    if (
      payload.typ !== 'private_album_access' ||
      !payload.modelId ||
      typeof payload.version !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function hasVisitorPaidPrivateAlbum(
  workspace: ModelWorkspaceData,
  viewerUid?: string | null
): boolean {
  if (!viewerUid) return false;
  return (workspace.privateAlbumPurchases || []).some(
    (purchase) => purchase.userId === viewerUid
  );
}

export function buildPrivateAlbumSummary(
  workspace: ModelWorkspaceData,
  viewerUid?: string | null
) {
  const activeItems = (workspace.privateAlbumItems || []).filter(
    (item) => item.active
  );
  const photoCount = activeItems.filter((i) => i.mediaType !== 'video').length;
  const videoCount = activeItems.filter((i) => i.mediaType === 'video').length;
  const priceCents =
    typeof workspace.privateAlbumPriceCents === 'number' &&
    workspace.privateAlbumPriceCents >= 500
      ? workspace.privateAlbumPriceCents
      : 3900;
  return {
    enabled: workspace.privateAlbumEnabled !== false,
    hasPassword: Boolean(
      workspace.privateAlbumPasswordHash && workspace.privateAlbumPasswordSalt
    ),
    itemCount: activeItems.length,
    photoCount,
    videoCount,
    priceCents,
    hasPaidAccess: hasVisitorPaidPrivateAlbum(workspace, viewerUid),
    ...(workspace.privateAlbumPasswordHint
      ? { hint: workspace.privateAlbumPasswordHint }
      : {}),
  };
}

export interface DefaultPlanPricesInput {
  express10Cents?: number;
  private20Cents?: number;
  vip45Cents?: number;
}

export function computeDefaultPlanPricesForRate(ratePerMinuteCents: number): {
  express10Cents: number;
  private20Cents: number;
  vip45Cents: number;
} {
  const safeRate = Math.max(100, Math.min(1000000, Math.round(ratePerMinuteCents || 1500)));
  if (safeRate === 1500) {
    return {
      express10Cents: 8900,
      private20Cents: 15900,
      vip45Cents: 29900,
    };
  }
  const scale = safeRate / 1500;
  const clampRoundReais = (baseCents: number) =>
    Math.max(500, Math.min(10000000, Math.round((baseCents * scale) / 100) * 100));
  return {
    express10Cents: clampRoundReais(8900),
    private20Cents: clampRoundReais(15900),
    vip45Cents: clampRoundReais(29900),
  };
}

export function rescalePlansForRate(
  plans: StoredCallPlan[],
  prevRateCents: number,
  nextRateCents: number
): StoredCallPlan[] {
  const safePrev = Math.max(100, Math.round(prevRateCents || 1500));
  const safeNext = Math.max(100, Math.min(1000000, Math.round(nextRateCents || 1500)));
  const factor = safeNext / safePrev;
  const nowMs = Date.now();
  return plans.map((plan) => {
    const rawScaled = Math.round((plan.priceCents * factor) / 100) * 100;
    const clamped = Math.max(100, Math.min(100000000, rawScaled));
    return {
      ...plan,
      priceCents: clamped,
      updatedAt: nowMs,
    };
  });
}

function buildDefaultPlans(
  modelName: string,
  nowMs: number,
  ratePerMinuteCents = 1500,
  customPrices?: DefaultPlanPricesInput
): StoredCallPlan[] {
  const defaults = computeDefaultPlanPricesForRate(ratePerMinuteCents);
  const clampPrice = (val: unknown, fallback: number) => {
    if (typeof val === 'number' && Number.isFinite(val) && val >= 100) {
      return Math.min(100000000, Math.round(val));
    }
    return fallback;
  };
  const expressPrice = clampPrice(customPrices?.express10Cents, defaults.express10Cents);
  const privatePrice = clampPrice(customPrices?.private20Cents, defaults.private20Cents);
  const vipPrice = clampPrice(customPrices?.vip45Cents, defaults.vip45Cents);

  return [
    {
      id: 'plan_express_10',
      name: 'Sessão Express · 10 min',
      description: `Conversa privada rápida em vídeo e áudio HD com ${modelName}.`,
      durationMinutes: 10,
      priceCents: expressPrice,
      currency: 'BRL',
      active: true,
      sortOrder: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    },
    {
      id: 'plan_private_20',
      name: 'Sessão Privada · 20 min',
      description: `Atendimento individual completo para conversar com ${modelName} em tempo real.`,
      durationMinutes: 20,
      priceCents: privatePrice,
      currency: 'BRL',
      active: true,
      sortOrder: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    },
    {
      id: 'plan_vip_45',
      name: 'Experiência VIP · 45 min',
      description: `Sessão estendida exclusiva com prioridade na fila e atendimento com ${modelName}.`,
      durationMinutes: 45,
      priceCents: vipPrice,
      currency: 'BRL',
      active: true,
      sortOrder: 3,
      createdAt: nowMs,
      updatedAt: nowMs,
    },
  ];
}

export function buildDefaultGallery(
  modelName: string,
  nowMs: number
): StoredGalleryItem[] {
  return [
    {
      id: 'editorial_noir',
      title: 'Série Atelier Noir',
      caption:
        'Produção principal em alfaiataria de seda preta sob iluminação arquitetônica âmbar.',
      category: 'editorial',
      mediaType: 'photo',
      specs: 'Leica 50mm · f/1.4 · Luz Quente',
      src: '/src/assets/images/gallery_editorial_noir_1794948582472.jpg',
      alt: `${modelName} em retrato editorial no estúdio`,
      sortOrder: 1,
      active: true,
      approvalStatus: 'approved',
      createdAt: nowMs,
      updatedAt: nowMs,
    },
    {
      id: 'atelier_vertical',
      title: 'Luz Natural e Veludo',
      caption:
        'Composição vertical junto às cortinas de veludo escuro em iluminação suave de fim de tarde.',
      category: 'editorial',
      mediaType: 'photo',
      specs: 'Formato 3:4 · Luz Difusa de Janela',
      src: '/src/assets/images/gallery_atelier_candle_1794948583357.jpg',
      alt: `${modelName} em vestido longo preto junto a cortina de veludo no estúdio`,
      sortOrder: 2,
      active: true,
      approvalStatus: 'approved',
      createdAt: nowMs,
      updatedAt: nowMs,
    },
    {
      id: 'close_portrait',
      title: 'Retrato Aproximado',
      caption:
        'Enquadramento íntimo de câmera com foco nítido e textura cinematográfica 35mm.',
      category: 'portraits',
      mediaType: 'photo',
      specs: '35mm · Grão Natural · Rim Âmbar',
      src: '/src/assets/images/gallery_close_portrait_1794948582088.jpg',
      alt: `Retrato em close-up editorial de ${modelName} com iluminação âmbar`,
      sortOrder: 3,
      active: true,
      approvalStatus: 'approved',
      createdAt: nowMs,
      updatedAt: nowMs,
    },
    {
      id: 'studio_hero',
      title: 'Transmissão ao Vivo 1-para-1',
      caption:
        'Enquadramento real da bancada de videochamadas com áudio tratado e vídeo em alta definição.',
      category: 'portraits',
      mediaType: 'photo',
      specs: 'Câmera Principal · Áudio Studio HD',
      src: '/src/assets/images/model_studio_hero_1794946401293.jpg',
      alt: `${modelName} pronta para atendimento por videochamada ao vivo no estúdio`,
      sortOrder: 4,
      active: true,
      approvalStatus: 'approved',
      createdAt: nowMs,
      updatedAt: nowMs,
    },
    {
      id: 'private_suite',
      title: 'Cabine de Transmissão 4K',
      caption:
        'Óptica mirrorless dedicada e mesa em nogueira escura preparados para sessões privadas.',
      category: 'studio',
      mediaType: 'photo',
      specs: 'Sensor Full-Frame · Lente Prime',
      src: '/src/assets/images/gallery_private_suite_1794948582898.jpg',
      alt: 'Cabine privada de transmissão com câmera cinema e luminária âmbar do estúdio',
      sortOrder: 5,
      active: true,
      approvalStatus: 'approved',
      createdAt: nowMs,
      updatedAt: nowMs,
    },
    {
      id: 'lounge_backdrop',
      title: 'Salão Model Gat Brasil',
      caption:
        'Ambiente reservado do estúdio com acústica tratada e atmosfera acolhedora para conversas exclusivas.',
      category: 'studio',
      mediaType: 'photo',
      specs: 'Sala Privada · Acústica Tratada',
      src: '/src/assets/images/studio_backdrop_lounge_1794946401840.jpg',
      alt: 'Ambiente interno do salão privado Model Gat Brasil',
      sortOrder: 6,
      active: true,
      approvalStatus: 'approved',
      createdAt: nowMs,
      updatedAt: nowMs,
    },
  ];
}

export function buildDefaultWorkspace(
  account: StoredModelAccount,
  overrides?: {
    studioBrand?: string;
    modelBio?: string;
    basicInfo?: StoredModelBasicInfo;
    headline?: string;
    heroTitle?: string;
    heroSubtitle?: string;
    groupButtonLabel?: string;
    privateButtonLabel?: string;
    avatarUrl?: string;
    heroImageUrl?: string;
    loungeImageUrl?: string;
    ratePerMinuteCents?: number;
    planPrices?: DefaultPlanPricesInput;
  }
): ModelWorkspaceData {
  const nowMs = Date.now();
  const modelUid = getModelActorUid(account.id);
  const name = account.displayName;
  const studioBrand = overrides?.studioBrand?.trim() || 'Model Gat Brasil';
  const headline =
    overrides?.headline?.trim() ||
    `Atendimento privativo 1-para-1 e sala ao vivo em videochamada com ${name}.`;
  const avatarUrl =
    sanitizeMediaUrl(overrides?.avatarUrl) ||
    '/src/assets/images/model_avatar_camila_1794946401641.jpg';
  const heroImageUrl =
    sanitizeMediaUrl(overrides?.heroImageUrl) ||
    '/src/assets/images/model_studio_hero_1794946401293.jpg';
  const loungeImageUrl =
    sanitizeMediaUrl(overrides?.loungeImageUrl) ||
    '/src/assets/images/studio_backdrop_lounge_1794946401840.jpg';
  const rate = Math.max(
    100,
    Math.min(1000000, Math.round(overrides?.ratePerMinuteCents || 1500))
  );

  return {
    studioState: {
      modelUid,
      modelName: name,
      isLive: true,
      callMode: 'open',
      headline: headline.slice(0, 140),
      activeCallId: '',
      activeCallUserId: '',
      activeCallUserName: '',
      autoScheduleEnabled: false,
      scheduleStartTime: '14:00',
      scheduleEndTime: '23:00',
      scheduleDays: '1,2,3,4,5,6',
      scheduleTimezone: 'America/Sao_Paulo',
      schedulePeriods: [
        {
          id: 'period_tarde',
          label: 'Período Tarde',
          startTime: '14:00',
          endTime: '18:00',
          days: '1,2,3,4,5',
          enabled: true,
        },
        {
          id: 'period_noite',
          label: 'Período Noite',
          startTime: '20:00',
          endTime: '23:30',
          days: '1,2,3,4,5,6',
          enabled: true,
        },
      ],
      holidayDates: [],
      dailyPausePeriods: [],
      weeklyBlockedDays: [],
      pauseWarningEnabled: true,
      pauseWarningMinutes: 5,
      pauseWarningMessage: '',
      dndActive: false,
      dndUntilMs: 0,
      dndScheduleEnabled: false,
      dndStartTime: '00:00',
      dndEndTime: '09:00',
      tipGoalEnabled: false,
      tipGoalTitle: 'Meta Especial do Estúdio',
      tipGoalDescription: '',
      tipGoalTargetCents: 30000,
      tipGoalCurrentCents: 0,
      tipGoalRewardText: '',
      tipGoalContributorsCount: 0,
      updatedAt: nowMs,
    },
    studioConfig: {
      modelUid,
      studioBrand,
      modelName: name,
      modelAvatarUrl: avatarUrl,
      heroImageUrl,
      loungeImageUrl,
      modelBio:
        overrides?.modelBio?.trim() ||
        'Atendimento ao vivo exclusivo, sala multi-participantes e chamadas privativas 1-para-1 em vídeo HD.',
      basicInfo:
        overrides?.basicInfo && Object.keys(overrides.basicInfo).length > 0
          ? sanitizeModelBasicInfo(overrides.basicInfo)
          : {
              languages: 'Português',
              specialty: 'Videochamadas ao vivo e sessões privativas 1-para-1',
            },
      heroTitle:
        overrides?.heroTitle?.trim() || `Videochamada ao vivo com ${name}.`,
      heroSubtitle:
        overrides?.heroSubtitle?.trim() ||
        'Entre na sala ao vivo compartilhada com vários internautas conectados simultaneamente, ou inicie uma videochamada privativa exclusiva 1-para-1 somente com a modelo.',
      headline: headline.slice(0, 160),
      groupButtonLabel:
        overrides?.groupButtonLabel?.trim() || 'Entrar na Videochamada ao Vivo',
      privateButtonLabel:
        overrides?.privateButtonLabel?.trim() ||
        'Chamada Privativa (Só com a Modelo)',
      ratePerMinuteCents: rate,
      privateAlbumPriceCents: 3900,
      pixKey: 'eb2663cc-50a4-47d2-b6ae-1bcc86bdae6c',
      pixKeyType: 'evp',
      pixMerchantName: name.slice(0, 25),
      pixMerchantCity: 'SAO PAULO',
      pixFinePercent: 2,
      pixInterestMonthlyPercent: 1,
      pixDefaultDueDays: 0,
      whatsappInvitePhotoUrl: heroImageUrl,
      whatsappInviteMessage: `Oi! Separei um momento exclusivo para nós dois em videochamada ao vivo. Clique no link abaixo para fazer o pagamento com segurança (PIX ou cartão) e entrar comigo agora!`,
      whatsappInviteCallMode: 'private',
      updatedAt: nowMs,
    },
    galleryItems: buildDefaultGallery(name, nowMs),
    privateAlbumEnabled: true,
    privateAlbumPasswordSalt: '',
    privateAlbumPasswordHash: '',
    privateAlbumPasswordHint: '',
    privateAlbumTokenVersion: 1,
    privateAlbumPriceCents: 3900,
    privateAlbumPurchases: [],
    privateAlbumItems: [],
    pixCharges: [],
    whatsappInvites: [],
    callPlans: buildDefaultPlans(name, nowMs, rate, overrides?.planPrices),
    callQueue: [],
    callMessages: [],
    callHistory: [],
    interestMessages: [],
    visitorProfiles: {},
  };
}

function createInitialStore(): StudioStoreData {
  const nowIso = new Date().toISOString();
  const initialPrimaryPassword =
    process.env.PRIMARY_MODEL_INITIAL_PASSWORD?.trim() || '';
  const initialCreds =
    initialPrimaryPassword.length >= 6
      ? hashPassword(initialPrimaryPassword)
      : { salt: '', hash: '' };
  const lorena: StoredModelAccount = {
    id: PRIMARY_MODEL_ID,
    slug: 'lorena-noir',
    displayName: 'Lorena Noir',
    loginUsername: 'lorena@modelgat.local',
    passwordSalt: initialCreds.salt,
    passwordHash: initialCreds.hash,
    tokenVersion: 1,
    isPrimary: true,
    active: true,
    adminThemeColor: 'rose_velvet',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return {
    models: {
      [lorena.id]: lorena,
    },
    workspaces: {
      [lorena.id]: buildDefaultWorkspace(lorena),
    },
  };
}

let cachedStore: StudioStoreData | null = null;

export function getStore(): StudioStoreData {
  if (cachedStore) return cachedStore;
  ensureDataDir();
  if (fs.existsSync(STORE_PATH)) {
    try {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as StudioStoreData;
      if (parsed && parsed.models && parsed.workspaces) {
        let mutated = false;
        const ordered = Object.values(parsed.models).sort(
          (a, b) => Number(b.isPrimary) - Number(a.isPrimary)
        );
        const envPrimaryPass =
          process.env.PRIMARY_MODEL_INITIAL_PASSWORD?.trim() || '';
        for (const account of ordered) {
          if (
            account.isPrimary &&
            !account.passwordHash &&
            envPrimaryPass.length >= 6
          ) {
            const { salt, hash } = hashPassword(envPrimaryPass);
            account.passwordSalt = salt;
            account.passwordHash = hash;
            mutated = true;
          }
          if (!sanitizeAdminThemeColor(account.adminThemeColor)) {
            account.adminThemeColor = account.isPrimary
              ? 'rose_velvet'
              : pickNextDistinctThemeColor(ordered);
            mutated = true;
          }
          const ws = parsed.workspaces[account.id];
          if (ws) {
            if (!Array.isArray(ws.privateAlbumItems)) {
              ws.privateAlbumItems = [];
              ws.privateAlbumEnabled = true;
              ws.privateAlbumTokenVersion = 1;
              mutated = true;
            }
            if (typeof ws.privateAlbumTokenVersion !== 'number') {
              ws.privateAlbumTokenVersion = 1;
              mutated = true;
            }
            if (
              typeof ws.privateAlbumPriceCents !== 'number' ||
              ws.privateAlbumPriceCents < 500
            ) {
              ws.privateAlbumPriceCents = 3900;
              mutated = true;
            }
            if (
              typeof ws.studioConfig.privateAlbumPriceCents !== 'number' ||
              ws.studioConfig.privateAlbumPriceCents < 500
            ) {
              ws.studioConfig.privateAlbumPriceCents = ws.privateAlbumPriceCents;
              mutated = true;
            }
            if (!Array.isArray(ws.privateAlbumPurchases)) {
              ws.privateAlbumPurchases = [];
              mutated = true;
            }
            if (typeof ws.studioConfig.pixFinePercent !== 'number') {
              ws.studioConfig.pixFinePercent = 2;
              mutated = true;
            }
            if (typeof ws.studioConfig.pixInterestMonthlyPercent !== 'number') {
              ws.studioConfig.pixInterestMonthlyPercent = 1;
              mutated = true;
            }
            if (typeof ws.studioConfig.pixDefaultDueDays !== 'number') {
              ws.studioConfig.pixDefaultDueDays = 0;
              mutated = true;
            }
            if (!Array.isArray(ws.pixCharges)) {
              ws.pixCharges = [];
              mutated = true;
            } else {
              for (const charge of ws.pixCharges) {
                if (!charge.approvalStatus) {
                  charge.approvalStatus =
                    charge.status === 'paid'
                      ? 'aprovado'
                      : charge.status === 'expired'
                        ? 'expirado'
                        : charge.status === 'cancelled'
                          ? 'cancelado'
                          : 'pendente';
                  mutated = true;
                }
              }
            }
            if (!Array.isArray(ws.whatsappInvites)) {
              ws.whatsappInvites = [];
              mutated = true;
            }
            if (typeof ws.studioConfig.whatsappInviteMessage !== 'string') {
              ws.studioConfig.whatsappInviteMessage =
                'Oi! Separei um momento exclusivo para nós dois em videochamada ao vivo. Clique no link abaixo para fazer o pagamento com segurança (PIX ou cartão) e entrar comigo agora!';
              ws.studioConfig.whatsappInvitePhotoUrl =
                ws.studioConfig.whatsappInvitePhotoUrl ||
                ws.studioConfig.heroImageUrl ||
                ws.studioConfig.modelAvatarUrl ||
                '';
              ws.studioConfig.whatsappInviteCallMode =
                ws.studioConfig.whatsappInviteCallMode === 'group'
                  ? 'group'
                  : 'private';
              mutated = true;
            }
            if (typeof ws.studioState.tipGoalEnabled !== 'boolean') {
              ws.studioState.tipGoalEnabled = false;
              ws.studioState.tipGoalTitle =
                ws.studioState.tipGoalTitle || 'Meta Especial do Estúdio';
              ws.studioState.tipGoalDescription =
                ws.studioState.tipGoalDescription || '';
              ws.studioState.tipGoalTargetCents =
                typeof ws.studioState.tipGoalTargetCents === 'number' &&
                ws.studioState.tipGoalTargetCents >= 500
                  ? ws.studioState.tipGoalTargetCents
                  : 30000;
              ws.studioState.tipGoalCurrentCents =
                typeof ws.studioState.tipGoalCurrentCents === 'number' &&
                ws.studioState.tipGoalCurrentCents >= 0
                  ? ws.studioState.tipGoalCurrentCents
                  : 0;
              ws.studioState.tipGoalContributorsCount =
                typeof ws.studioState.tipGoalContributorsCount === 'number'
                  ? ws.studioState.tipGoalContributorsCount
                  : 0;
              mutated = true;
            } else if (typeof ws.studioState.tipGoalDescription !== 'string') {
              ws.studioState.tipGoalDescription = '';
              mutated = true;
            }
            if (ws.studioConfig.studioBrand === 'Maison Aura') {
              ws.studioConfig.studioBrand = 'Model Gat Brasil';
              mutated = true;
            }
            for (const g of ws.galleryItems || []) {
              if (!g.approvalStatus) {
                g.approvalStatus = 'approved';
                mutated = true;
              }
              if (!g.mediaType) {
                g.mediaType = 'photo';
                mutated = true;
              }
              if (g.title === 'Salão Maison Aura') {
                g.title = 'Salão Model Gat Brasil';
                mutated = true;
              }
              if (g.alt === 'Ambiente interno do salão privado Maison Aura') {
                g.alt = 'Ambiente interno do salão privado Model Gat Brasil';
                mutated = true;
              }
            }
          }
        }
        cachedStore = parsed;
        if (mutated) {
          saveStore();
        }
        return cachedStore;
      }
    } catch (err) {
      console.error('Failed to read model store, initializing defaults:', err);
    }
  }
  cachedStore = createInitialStore();
  saveStore();
  return cachedStore;
}

export function saveStore() {
  if (!cachedStore) return;
  ensureDataDir();
  const tmpPath = `${STORE_PATH}.tmp_${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(cachedStore, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.renameSync(tmpPath, STORE_PATH);
}

export function findModelByLogin(loginInput: string): StoredModelAccount | null {
  const clean = sanitizeLoginUsername(loginInput);
  if (!clean) return null;
  const store = getStore();
  for (const model of Object.values(store.models)) {
    if (
      model.loginUsername.toLowerCase() === clean ||
      model.slug.toLowerCase() === clean
    ) {
      return model;
    }
  }
  return null;
}

export function getModelAndWorkspace(modelId: string): {
  model: StoredModelAccount;
  workspace: ModelWorkspaceData;
} | null {
  const store = getStore();
  const model = store.models[modelId];
  if (!model) return null;
  let workspace = store.workspaces[modelId];
  if (!workspace) {
    workspace = buildDefaultWorkspace(model);
    store.workspaces[modelId] = workspace;
    saveStore();
  }
  return { model, workspace };
}

export function serializeModelSummary(model: StoredModelAccount) {
  const { workspace } = getModelAndWorkspace(model.id)!;
  const activePlans = workspace.callPlans
    .filter((p) => p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const minPlanPriceCents =
    activePlans.length > 0
      ? Math.min(...activePlans.map((p) => p.priceCents))
      : workspace.studioConfig.ratePerMinuteCents * 10;
  const pendingGalleryCount = workspace.galleryItems.filter(
    (g) => (g.approvalStatus || 'approved') === 'pending'
  ).length;
  return {
    id: model.id,
    slug: model.slug,
    displayName: model.displayName,
    loginUsername: model.loginUsername,
    hasPassword: Boolean(model.passwordHash && model.passwordSalt),
    isPrimary: model.isPrimary,
    active: model.active,
    adminThemeColor: sanitizeAdminThemeColor(model.adminThemeColor) || 'rose_velvet',
    studioBrand: workspace.studioConfig.studioBrand,
    avatarUrl: workspace.studioConfig.modelAvatarUrl || '',
    heroImageUrl: workspace.studioConfig.heroImageUrl || '',
    loungeImageUrl: workspace.studioConfig.loungeImageUrl || '',
    modelBio: workspace.studioConfig.modelBio || '',
    basicInfo: workspace.studioConfig.basicInfo || {},
    heroTitle: workspace.studioConfig.heroTitle || '',
    heroSubtitle: workspace.studioConfig.heroSubtitle || '',
    headline: workspace.studioConfig.headline || workspace.studioState.headline,
    groupButtonLabel: workspace.studioConfig.groupButtonLabel || '',
    privateButtonLabel: workspace.studioConfig.privateButtonLabel || '',
    pendingGalleryCount,
    privateAlbumSummary: buildPrivateAlbumSummary(workspace),
    privateAlbumPriceCents: workspace.privateAlbumPriceCents ?? 3900,
    ratePerMinuteCents: workspace.studioConfig.ratePerMinuteCents,
    minPlanPriceCents,
    activePlansCount: activePlans.length,
    plansPreview: activePlans.slice(0, 4).map((p) => ({
      id: p.id,
      name: p.name,
      durationMinutes: p.durationMinutes,
      priceCents: p.priceCents,
    })),
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}
