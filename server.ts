import 'dotenv/config';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import {
  PRIMARY_MODEL_ID,
  UPLOADS_DIR,
  buildDefaultGallery,
  buildDefaultWorkspace,
  buildPrivateAlbumSummary,
  ensureUploadsDir,
  findModelByLogin,
  getConfiguredPrimaryPassword,
  getModelActorUid,
  getModelAndWorkspace,
  getModelRoomId,
  getStore,
  hashPassword,
  hasVisitorPaidPrivateAlbum,
  isPrimaryClaimNeeded,
  pickNextDistinctThemeColor,
  rescalePlansForRate,
  sanitizeAdminThemeColor,
  sanitizeId,
  sanitizeLoginUsername,
  sanitizeMediaUrl,
  sanitizeModelBasicInfo,
  sanitizeSlug,
  sanitizeWhatsappPhone,
  saveStore,
  serializeModelSummary,
  signModelSessionToken,
  signPrivateAlbumToken,
  verifyModelAccountPassword,
  verifyModelSessionToken,
  verifyPassword,
  verifyPrivateAlbumToken,
  type DefaultPlanPricesInput,
  type ModelSessionPayload,
  type ModelWorkspaceData,
  type PixKeyType,
  type StoredModelAccount,
  type StoredPixCharge,
  type StoredPrivateAlbumItem,
  type StoredStudioConfig,
  type StoredWhatsappInvite,
} from './server/modelStore.js';
import {
  calculatePixChargeWithFees,
  formatEmvMerchantCity,
  formatEmvMerchantName,
  generatePixChargeAssets,
  isMercadoPagoConfigured,
  isValidPixKey,
  maskPixKeyForDisplay,
  normalizeDueDateString,
  normalizePixKey,
  sanitizePixTxid,
  verifyMercadoPagoChargeByReferenceOrId,
  type MercadoPagoPreferredMethod,
} from './server/pix.js';
import {
  isMercadoPagoPaymentAmountValid,
  processMercadoPagoWebhookEvent,
} from './server/mercadopagoWebhook.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const adminAuth = getAuth();

interface ConnectedPeer {
  ws: WebSocket;
  uid: string;
  modelId: string;
  displayName: string;
  photoUrl: string;
  role: 'model' | 'viewer';
  accessStatus: 'active' | 'vip' | 'muted' | 'blocked';
  isAdmin: boolean;
  inCallWith: string | null;
  connectedAt: string;
}

interface RoomParticipantRecord {
  uid: string;
  displayName: string;
  photoUrl: string;
  role: string;
  accessStatus: string;
  isAdmin: boolean;
  joinedAt: string;
  callId?: string;
  planId?: string;
  planName?: string;
  planDurationMinutes?: number;
  planPriceCents?: number;
}

interface QueueEntryRecord {
  callId: string;
  uid: string;
  planDurationMinutes: number;
  createdAtMs: number;
  isVip?: boolean;
}

interface ActiveCallEstimate {
  callId: string;
  startedAtMs: number;
  durationMinutes: number;
}

const connectedPeers = new Map<string, ConnectedPeer>();
const roomParticipantsByModel = new Map<
  string,
  Map<string, RoomParticipantRecord>
>();
const visitorQueueByModel = new Map<string, Map<string, QueueEntryRecord>>();
const authoritativeQueueByModel = new Map<string, QueueEntryRecord[]>();
const hasAuthoritativeQueueByModel = new Map<string, boolean>();
const activeCallEstimateByModel = new Map<string, ActiveCallEstimate | null>();

function getRoomMap(modelId: string): Map<string, RoomParticipantRecord> {
  let map = roomParticipantsByModel.get(modelId);
  if (!map) {
    map = new Map();
    roomParticipantsByModel.set(modelId, map);
  }
  return map;
}

function getVisitorQueueMap(modelId: string): Map<string, QueueEntryRecord> {
  let map = visitorQueueByModel.get(modelId);
  if (!map) {
    map = new Map();
    visitorQueueByModel.set(modelId, map);
  }
  return map;
}

function isQueueEntryVip(modelId: string, entry: QueueEntryRecord): boolean {
  if (entry.isVip) return true;
  const ctx = getModelAndWorkspace(modelId);
  if (ctx?.workspace.visitorProfiles[entry.uid]?.accessStatus === 'vip') {
    return true;
  }
  const peer = connectedPeers.get(entry.uid);
  return Boolean(peer && peer.modelId === modelId && peer.accessStatus === 'vip');
}

function getOrderedWaitingEntries(modelId: string): QueueEntryRecord[] {
  const hasAuth = hasAuthoritativeQueueByModel.get(modelId) || false;
  const source = hasAuth
    ? authoritativeQueueByModel.get(modelId) || []
    : Array.from(getVisitorQueueMap(modelId).values());
  return [...source].sort((a, b) => {
    const aVip = isQueueEntryVip(modelId, a);
    const bVip = isQueueEntryVip(modelId, b);
    if (aVip !== bVip) return aVip ? -1 : 1;
    return a.createdAtMs - b.createdAtMs;
  });
}

function getActiveCallRemainingSeconds(
  modelId: string,
  nowMs: number
): number {
  const activeCallEstimate = activeCallEstimateByModel.get(modelId) || null;
  if (!activeCallEstimate) return 0;
  const durationSec = Math.max(60, activeCallEstimate.durationMinutes * 60);
  const elapsedSec = Math.max(
    0,
    Math.round((nowMs - activeCallEstimate.startedAtMs) / 1000)
  );
  return Math.max(45, durationSec - elapsedSec);
}

function buildQueueSummaryForUser(modelId: string, uid: string | null) {
  const nowMs = Date.now();
  const ordered = getOrderedWaitingEntries(modelId);
  const totalWaiting = ordered.length;
  const activeCallRemainingSeconds = getActiveCallRemainingSeconds(
    modelId,
    nowMs
  );

  const myIndex = uid ? ordered.findIndex((entry) => entry.uid === uid) : -1;
  const myPosition = myIndex >= 0 ? myIndex + 1 : 0;
  const aheadSlice = myIndex >= 0 ? ordered.slice(0, myIndex) : ordered;
  const aheadCount = aheadSlice.length;

  const aheadQueueSeconds = aheadSlice.reduce((sum, entry) => {
    const mins = Math.max(1, Math.min(240, entry.planDurationMinutes || 10));
    return sum + mins * 60 + 30;
  }, 0);

  let totalEstimatedWaitSeconds =
    activeCallRemainingSeconds + aheadQueueSeconds;
  if (myIndex >= 0 && totalEstimatedWaitSeconds === 0) {
    const entry = ordered[myIndex];
    const waitedSec = Math.max(
      0,
      Math.round((nowMs - entry.createdAtMs) / 1000)
    );
    totalEstimatedWaitSeconds = Math.max(15, 45 - waitedSec);
  }

  return {
    totalWaiting,
    myPosition,
    aheadCount,
    activeCallRemainingSeconds,
    aheadQueueSeconds,
    totalEstimatedWaitSeconds,
    updatedAtMs: nowMs,
  };
}

function sendQueueSyncToPeer(peer: ConnectedPeer) {
  if (peer.ws.readyState !== WebSocket.OPEN) return;
  peer.ws.send(
    JSON.stringify({
      type: 'queue:sync',
      modelId: peer.modelId,
      summary: buildQueueSummaryForUser(peer.modelId, peer.uid),
    })
  );
}

function broadcastQueueSyncForModel(modelId: string) {
  for (const peer of connectedPeers.values()) {
    if (peer.modelId === modelId) {
      sendQueueSyncToPeer(peer);
    }
  }
}

function serializePeersForModel(modelId: string) {
  return Array.from(connectedPeers.values())
    .filter((peer) => peer.modelId === modelId)
    .map((peer) => ({
      uid: peer.uid,
      displayName: peer.displayName,
      photoUrl: peer.photoUrl,
      role: peer.role,
      accessStatus: peer.accessStatus,
      inCallWith: peer.inCallWith,
      connectedAt: peer.connectedAt,
    }));
}

function serializeRoomParticipantsForModel(modelId: string) {
  return Array.from(getRoomMap(modelId).values());
}

function broadcastPresenceForModel(modelId: string) {
  const payload = JSON.stringify({
    type: 'presence:sync',
    modelId,
    peers: serializePeersForModel(modelId),
  });
  for (const peer of connectedPeers.values()) {
    if (peer.modelId === modelId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(payload);
    }
  }
}

function broadcastRoomSyncForModel(modelId: string) {
  const roomId = getModelRoomId(modelId);
  const payload = JSON.stringify({
    type: 'room:sync',
    modelId,
    roomId,
    participants: serializeRoomParticipantsForModel(modelId),
  });
  for (const peer of connectedPeers.values()) {
    if (peer.modelId === modelId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(payload);
    }
  }
}

function notifyRoomParticipantsAndAdminsForModel(
  modelId: string,
  excludeUid: string | null,
  message: Record<string, unknown>
) {
  const roomMap = getRoomMap(modelId);
  const serialized = JSON.stringify(message);
  for (const peer of connectedPeers.values()) {
    if (peer.modelId !== modelId || peer.uid === excludeUid) continue;
    if (
      (roomMap.has(peer.uid) || peer.isAdmin) &&
      peer.ws.readyState === WebSocket.OPEN
    ) {
      peer.ws.send(serialized);
    }
  }
}

function emitWorkspaceRefresh(modelId: string, includeDirectory = false) {
  const refreshPayload = JSON.stringify({
    type: 'studio:refresh',
    modelId,
    ts: Date.now(),
  });
  const directoryPayload = includeDirectory
    ? JSON.stringify({ type: 'models:refresh', ts: Date.now() })
    : null;

  for (const peer of connectedPeers.values()) {
    if (peer.ws.readyState !== WebSocket.OPEN) continue;
    if (peer.modelId === modelId) {
      peer.ws.send(refreshPayload);
    }
    if (directoryPayload) {
      peer.ws.send(directoryPayload);
    }
  }
}

function sendToUserInModel(
  modelId: string,
  targetUid: string,
  message: Record<string, unknown>
) {
  const target = connectedPeers.get(targetUid);
  if (
    target &&
    target.modelId === modelId &&
    target.ws.readyState === WebSocket.OPEN
  ) {
    target.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

function extractBearerToken(req: Request): string {
  const header = req.header('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return '';
}

interface AuthenticatedRequest extends Request {
  firebaseUser?: DecodedIdToken;
  modelSession?: ModelSessionPayload;
  resolvedModelId?: string;
}

async function requireModelOperator(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Autenticação privativa da modelo obrigatória.' });
    return;
  }

  // Strictly require a valid HMAC-SHA256 model session token tied to a single model account.
  // Google/visitor accounts and cross-model headers/params are never accepted here.
  const modelSession = verifyModelSessionToken(token);
  if (!modelSession) {
    res.status(403).json({
      ok: false,
      error: 'Acesso restrito. Entre exclusivamente com o login e senha próprios da modelo.',
    });
    return;
  }

  const store = getStore();
  const account = store.models[modelSession.modelId];
  if (
    !account ||
    !account.active ||
    account.tokenVersion !== modelSession.tokenVersion
  ) {
    res.status(401).json({
      ok: false,
      error: 'Sessão da modelo expirada ou desativada. Faça login novamente.',
    });
    return;
  }

  req.modelSession = modelSession;
  req.resolvedModelId = account.id; // STRICTLY locked to the authenticated model's own ID
  next();
}

async function requireVisitor(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Faça login com Google para continuar.' });
    return;
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.firebaseUser = decoded;
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'Sessão Google expirada ou inválida.' });
  }
}

async function resolveOptionalFirebaseUser(
  req: Request
): Promise<DecodedIdToken | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    return null;
  }
}

function getDefaultActiveModelId(): string {
  const store = getStore();
  const models = Object.values(store.models);
  const primary = models.find((m) => m.id === PRIMARY_MODEL_ID && m.active);
  if (primary) return primary.id;
  const firstActive = models.find((m) => m.active);
  return firstActive?.id || PRIMARY_MODEL_ID;
}

function hasVisitorPaidActiveCallAccess(
  workspace: ModelWorkspaceData,
  visitorUid: string
): boolean {
  return workspace.callQueue.some(
    (q) =>
      q.userId === visitorUid &&
      (q.status === 'waiting' ||
        q.status === 'accepted' ||
        q.status === 'in_call') &&
      (q.paymentStatus === 'captured' || q.paymentStatus === 'authorized') &&
      (Boolean(q.planId) ||
        (typeof q.planPriceCents === 'number' && q.planPriceCents > 0))
  );
}

function getBusyVisitorUidInPrivateCall(
  modelId: string,
  workspace: ModelWorkspaceData,
  excludeVisitorUid?: string
): string | null {
  const activeUserId = workspace.studioState.activeCallUserId?.trim();
  if (
    workspace.studioState.activeCallId &&
    activeUserId &&
    activeUserId !== excludeVisitorUid
  ) {
    return activeUserId;
  }

  const activeQueueEntry = workspace.callQueue.find(
    (q) =>
      (q.status === 'in_call' || q.status === 'accepted') &&
      q.userId !== excludeVisitorUid
  );
  if (activeQueueEntry) {
    return activeQueueEntry.userId;
  }

  const actorUid = getModelActorUid(modelId);
  const modelPeer = Array.from(connectedPeers.values()).find(
    (p) => p.modelId === modelId && (p.isAdmin || p.uid === actorUid)
  );
  if (
    modelPeer?.inCallWith &&
    modelPeer.inCallWith !== excludeVisitorUid &&
    connectedPeers.has(modelPeer.inCallWith)
  ) {
    return modelPeer.inCallWith;
  }

  return null;
}

function buildPublicModelSummary(model: StoredModelAccount) {
  const ctx = getModelAndWorkspace(model.id);
  if (!ctx) return null;
  const { workspace } = ctx;
  const actorUid = getModelActorUid(model.id);
  const modelOnline = Array.from(connectedPeers.values()).some(
    (p) => p.modelId === model.id && (p.isAdmin || p.uid === actorUid)
  );
  const roomCount = getBusyVisitorUidInPrivateCall(model.id, workspace) ? 1 : 0;
  const activePlans = workspace.callPlans
    .filter((p) => p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const minPlanPriceCents =
    activePlans.length > 0
      ? Math.min(...activePlans.map((p) => p.priceCents))
      : workspace.studioConfig.ratePerMinuteCents * 10;
  const approvedPublicCount = workspace.galleryItems.filter(
    (g) => g.active && (g.approvalStatus || 'approved') === 'approved'
  ).length;
  const ratedCalls = workspace.callHistory.filter(
    (h) => typeof h.rating === 'number' && Number.isFinite(h.rating) && h.rating >= 1 && h.rating <= 5
  );
  const ratingCount = ratedCalls.length;
  const ratingAverage =
    ratingCount > 0
      ? Number(
          (
            ratedCalls.reduce((sum, r) => sum + Number(r.rating || 0), 0) /
            ratingCount
          ).toFixed(1)
        )
      : undefined;
  return {
    id: model.id,
    slug: model.slug,
    displayName: model.displayName,
    studioBrand: workspace.studioConfig.studioBrand,
    avatarUrl: workspace.studioConfig.modelAvatarUrl || '',
    heroImageUrl: workspace.studioConfig.heroImageUrl || '',
    bio: workspace.studioConfig.modelBio || '',
    basicInfo: workspace.studioConfig.basicInfo || {},
    privateAlbumSummary: buildPrivateAlbumSummary(workspace),
    publicGalleryCount: approvedPublicCount,
    ratingAverage,
    ratingCount,
    headline:
      workspace.studioConfig.headline || workspace.studioState.headline,
    isLive: workspace.studioState.isLive,
    callMode: workspace.studioState.callMode,
    dndActive: Boolean(workspace.studioState.dndActive),
    modelOnline,
    roomParticipantCount: roomCount,
    ratePerMinuteCents: workspace.studioConfig.ratePerMinuteCents,
    activePlansCount: activePlans.length,
    minPlanPriceCents,
    plansPreview: activePlans.slice(0, 4).map((p) => ({
      id: p.id,
      name: p.name,
      durationMinutes: p.durationMinutes,
      priceCents: p.priceCents,
    })),
    tipGoal: {
      enabled: Boolean(workspace.studioState.tipGoalEnabled),
      title:
        workspace.studioState.tipGoalTitle || 'Meta Especial do Estúdio',
      description: workspace.studioState.tipGoalDescription || '',
      targetCents: workspace.studioState.tipGoalTargetCents || 30000,
      currentCents: workspace.studioState.tipGoalCurrentCents || 0,
      rewardText: workspace.studioState.tipGoalRewardText || '',
      contributorsCount: workspace.studioState.tipGoalContributorsCount || 0,
    },
  };
}

function detectImageTypeFromBuffer(
  buf: Buffer
): 'png' | 'jpg' | 'webp' | 'gif' | null {
  if (buf.length < 12) return null;
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'png';
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpg';
  }
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  const gifHeader = buf.toString('ascii', 0, 6);
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return 'gif';
  }
  return null;
}

function detectVideoTypeFromBuffer(
  buf: Buffer
): 'mp4' | 'mov' | 'webm' | null {
  if (buf.length < 12) return null;
  if (
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  ) {
    return 'webm';
  }
  const ftyp = buf.toString('ascii', 4, 8);
  if (ftyp === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12).toLowerCase();
    if (brand === 'qt  ') return 'mov';
    return 'mp4';
  }
  return null;
}

const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_VIDEO_BYTES = 40 * 1024 * 1024;

function sanitizePublicStudioConfig(cfg: StoredStudioConfig) {
  const { pixKey: _hiddenPixKey, ...rest } = cfg;
  return {
    ...rest,
    pixConfigured: Boolean(cfg.pixKey && isValidPixKey(cfg.pixKey, cfg.pixKeyType)),
    mercadoPagoConfigured: isMercadoPagoConfigured(),
  };
}

function serializePixChargeForClient(charge: StoredPixCharge) {
  return {
    id: charge.id,
    txid: charge.txid,
    modelId: charge.modelId,
    userId: charge.userId,
    userName: charge.userName,
    kind: charge.kind,
    amountCents: charge.amountCents,
    ...(charge.originalAmountCents !== undefined
      ? { originalAmountCents: charge.originalAmountCents }
      : {}),
    ...(charge.dueDate ? { dueDate: charge.dueDate } : {}),
    ...(charge.dueAtMs !== undefined ? { dueAtMs: charge.dueAtMs } : {}),
    ...(charge.finePercent !== undefined
      ? { finePercent: charge.finePercent }
      : {}),
    ...(charge.interestMonthlyPercent !== undefined
      ? { interestMonthlyPercent: charge.interestMonthlyPercent }
      : {}),
    ...(charge.fineCents !== undefined ? { fineCents: charge.fineCents } : {}),
    ...(charge.interestCents !== undefined
      ? { interestCents: charge.interestCents }
      : {}),
    ...(charge.daysOverdue !== undefined
      ? { daysOverdue: charge.daysOverdue }
      : {}),
    ...(charge.createdByModel ? { createdByModel: true } : {}),
    description: charge.description,
    ...(charge.planId ? { planId: charge.planId } : {}),
    ...(charge.planName ? { planName: charge.planName } : {}),
    ...(charge.planDurationMinutes !== undefined
      ? { planDurationMinutes: charge.planDurationMinutes }
      : {}),
    ...(charge.topic ? { topic: charge.topic } : {}),
    ...(charge.callMode ? { callMode: charge.callMode } : {}),
    ...(charge.note ? { note: charge.note } : {}),
    status: charge.status,
    approvalStatus:
      charge.approvalStatus ||
      (charge.status === 'paid'
        ? 'aprovado'
        : charge.status === 'expired'
          ? 'expirado'
          : charge.status === 'cancelled'
            ? 'cancelado'
            : 'pendente'),
    ...(charge.mercadoPagoStatus
      ? { mercadoPagoStatus: charge.mercadoPagoStatus }
      : {}),
    ...(charge.webhookVerifiedAt
      ? { webhookVerifiedAt: charge.webhookVerifiedAt }
      : {}),
    provider: charge.provider,
    preferredPaymentMethod: charge.preferredPaymentMethod || 'pix',
    ...(charge.checkoutUrl && charge.checkoutUrl.startsWith('https://')
      ? { checkoutUrl: charge.checkoutUrl }
      : {}),
    ...(charge.paymentMethodUsed
      ? { paymentMethodUsed: charge.paymentMethodUsed }
      : {}),
    brCode: charge.brCode,
    qrCodeDataUrl: charge.qrCodeDataUrl,
    pixKeyMasked: maskPixKeyForDisplay(charge.pixKeyUsed, charge.pixKeyTypeUsed),
    pixKeyTypeUsed: charge.pixKeyTypeUsed,
    merchantName: charge.merchantName,
    merchantCity: charge.merchantCity,
    usingDemoKey: Boolean(charge.usingDemoKey),
    ...(charge.callRequestId ? { callRequestId: charge.callRequestId } : {}),
    ...(charge.inviteId ? { inviteId: charge.inviteId } : {}),
    createdAt: charge.createdAt,
    expiresAt: charge.expiresAt,
    ...(charge.paidAt ? { paidAt: charge.paidAt } : {}),
    ...(charge.visitorReportedPaidAt
      ? { visitorReportedPaidAt: charge.visitorReportedPaidAt }
      : {}),
  };
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function findWhatsappInviteById(inviteId: string): {
  model: StoredModelAccount;
  workspace: ModelWorkspaceData;
  invite: StoredWhatsappInvite;
} | null {
  const cleanId = sanitizeId(inviteId);
  if (!cleanId) return null;
  const store = getStore();
  for (const model of Object.values(store.models)) {
    if (!model.active) continue;
    const workspace = store.workspaces[model.id];
    if (!workspace || !Array.isArray(workspace.whatsappInvites)) continue;
    const invite = workspace.whatsappInvites.find((inv) => inv.id === cleanId);
    if (invite) {
      return { model, workspace, invite };
    }
  }
  return null;
}

function injectInviteMetaIntoHtml(
  html: string,
  req: Request,
  inviteId: string
): string {
  const found = findWhatsappInviteById(inviteId);
  if (!found) return html;
  const { model, workspace, invite } = found;
  const displayName = workspace.studioConfig.modelName || model.displayName;
  const brand = workspace.studioConfig.studioBrand || 'Model Gat Brasil';
  const titleText = invite.planName
    ? `Convite Exclusivo de ${displayName} · ${invite.planName} | ${brand}`
    : `Convite Exclusivo de ${displayName} | ${brand}`;
  const descText =
    invite.message.trim().slice(0, 220) ||
    `Faça o pagamento e contrate sua videochamada ao vivo com ${displayName}.`;

  const rawPhoto = sanitizeMediaUrl(
    invite.photoUrl ||
      workspace.studioConfig.heroImageUrl ||
      workspace.studioConfig.modelAvatarUrl ||
      ''
  );
  const envOrigin = (() => {
    const raw = process.env.APP_URL?.trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // Ignore invalid APP_URL
    }
    return '';
  })();
  const protoHeader = req.headers['x-forwarded-proto'];
  const rawProto =
    typeof protoHeader === 'string' && protoHeader.trim()
      ? protoHeader.split(',')[0].trim().toLowerCase()
      : (req.protocol || 'https').toLowerCase();
  const proto = rawProto === 'http' || rawProto === 'https' ? rawProto : 'https';
  const rawHost = (req.get('host') || '').trim();
  const safeHost = /^[a-zA-Z0-9.:-]+$/.test(rawHost)
    ? rawHost
    : 'localhost:3000';
  const baseOrigin = envOrigin || `${proto}://${safeHost}`;
  const resolvedPhotoUrl = rawPhoto
    ? rawPhoto.startsWith('http://') || rawPhoto.startsWith('https://')
      ? rawPhoto
      : `${baseOrigin}${rawPhoto.startsWith('/') ? '' : '/'}${rawPhoto}`
    : '';

  const safeTitle = escapeHtmlAttr(titleText);
  const safeDesc = escapeHtmlAttr(descText);
  const safePhoto = resolvedPhotoUrl ? escapeHtmlAttr(resolvedPhotoUrl) : '';

  let nextHtml = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${safeDesc}" />`
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${safeTitle}" />`
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${safeDesc}" />`
    );

  if (safePhoto) {
    const ogImageTags =
      `\n    <meta property="og:image" content="${safePhoto}" />` +
      `\n    <meta property="og:image:secure_url" content="${safePhoto}" />` +
      `\n    <meta name="twitter:image" content="${safePhoto}" />`;
    nextHtml = nextHtml.replace('</head>', `${ogImageTags}\n  </head>`);
  }
  return nextHtml;
}

function serializeWhatsappInviteForVisitor(invite: StoredWhatsappInvite) {
  const { recipientPhone: _hiddenPhone, pixChargeId: _hiddenPix, ...rest } = invite;
  return rest;
}

function fulfillPixCharge(
  modelId: string,
  workspace: ModelWorkspaceData,
  charge: StoredPixCharge
): {
  albumToken?: string;
  items?: StoredPrivateAlbumItem[];
  summary?: ReturnType<typeof buildPrivateAlbumSummary>;
  studioState?: ModelWorkspaceData['studioState'];
  callRequestId?: string;
} {
  const nowMs = Date.now();
  charge.status = 'paid';
  charge.approvalStatus = 'aprovado';
  if (!charge.paidAt) {
    charge.paidAt = nowMs;
  }

  if (charge.kind === 'private_album') {
    if (!Array.isArray(workspace.privateAlbumPurchases)) {
      workspace.privateAlbumPurchases = [];
    }
    const alreadyFulfilled = Boolean(charge.fulfilledAt);
    const alreadyPurchased = hasVisitorPaidPrivateAlbum(workspace, charge.userId);
    if (!alreadyFulfilled && !alreadyPurchased) {
      workspace.privateAlbumPurchases.push({
        id: `albpay_pix_${nowMs}_${charge.userId.slice(0, 6)}`,
        userId: charge.userId,
        userName: charge.userName,
        amountCents: charge.amountCents,
        paymentMethod: 'pix',
        purchasedAt: nowMs,
      });
      workspace.callHistory.push({
        id: `hist_album_${nowMs}_${charge.userId.slice(0, 6)}`,
        callId: `album_pix_${charge.txid}`,
        userId: charge.userId,
        userName: charge.userName,
        modelUid: workspace.studioConfig.modelUid || getModelActorUid(modelId),
        durationSeconds: 0,
        amountCents: charge.amountCents,
        currency: 'BRL',
        status: 'completed',
        planId: 'private_album_unlock',
        planName: 'Álbum Privado · PIX',
        planDurationMinutes: 0,
        endedAt: nowMs,
        createdAt: nowMs,
      });
    }
    charge.fulfilledAt = charge.fulfilledAt || nowMs;
    const version = workspace.privateAlbumTokenVersion || 1;
    const albumToken = signPrivateAlbumToken(modelId, version);
    const items = (workspace.privateAlbumItems || [])
      .filter((item) => item.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      albumToken,
      items,
      summary: buildPrivateAlbumSummary(workspace, charge.userId),
    };
  }

  if (charge.kind === 'tip') {
    if (!charge.fulfilledAt) {
      const nextCurrent =
        (typeof workspace.studioState.tipGoalCurrentCents === 'number'
          ? workspace.studioState.tipGoalCurrentCents
          : 0) + charge.amountCents;
      const nextCount =
        (typeof workspace.studioState.tipGoalContributorsCount === 'number'
          ? workspace.studioState.tipGoalContributorsCount
          : 0) + 1;
      workspace.studioState.tipGoalCurrentCents = Math.min(100000000, nextCurrent);
      workspace.studioState.tipGoalContributorsCount = nextCount;
      workspace.studioState.tipGoalLastTipName = charge.userName.slice(0, 60);
      workspace.studioState.tipGoalLastTipAmountCents = charge.amountCents;
      workspace.studioState.updatedAt = nowMs;

      workspace.callHistory.push({
        id: `hist_tip_${nowMs}_${charge.userId.slice(0, 6)}`,
        callId: `tip_pix_${charge.txid}`,
        userId: charge.userId,
        userName: charge.userName,
        modelUid: workspace.studioConfig.modelUid || getModelActorUid(modelId),
        durationSeconds: 0,
        amountCents: charge.amountCents,
        currency: 'BRL',
        status: 'completed',
        planId: 'tip_goal_contribution',
        planName: `Gorjeta (PIX)${charge.note ? ` · ${charge.note}` : ''}`,
        planDurationMinutes: 0,
        endedAt: nowMs,
        createdAt: nowMs,
      });
      charge.fulfilledAt = nowMs;
    }
    return {
      studioState: workspace.studioState,
    };
  }

  if (charge.kind === 'custom_charge') {
    if (!charge.fulfilledAt) {
      workspace.callHistory.push({
        id: `hist_pix_${nowMs}_${charge.userId.slice(0, 6)}`,
        callId: `custom_pix_${charge.txid}`,
        userId: charge.userId,
        userName: charge.userName,
        modelUid: workspace.studioConfig.modelUid || getModelActorUid(modelId),
        durationSeconds: 0,
        amountCents: charge.amountCents,
        currency: 'BRL',
        status: 'completed',
        planId: 'custom_pix_charge',
        planName: `PIX Dinâmico · ${(charge.description || 'Cobrança').slice(0, 40)}`,
        planDurationMinutes: 0,
        endedAt: nowMs,
        createdAt: nowMs,
      });
      charge.fulfilledAt = nowMs;
    }
    return {};
  }

  // call_plan
  if (!charge.fulfilledAt || !charge.callRequestId) {
    const reqId = `call_${nowMs}_${charge.userId.slice(0, 8)}`;
    const visitor = workspace.visitorProfiles[charge.userId];
    const cleanTopic =
      charge.topic?.trim() ||
      `Videochamada · ${charge.planName || 'Plano Selecionado'} · PIX Pago`;
    workspace.callQueue.push({
      id: reqId,
      userId: charge.userId,
      userName: visitor?.displayName || charge.userName || 'Participante',
      ...(visitor?.photoUrl ? { userPhotoUrl: visitor.photoUrl } : {}),
      topic: cleanTopic.slice(0, 160),
      status: 'waiting',
      planId: charge.planId,
      planName: charge.planName,
      planDurationMinutes: charge.planDurationMinutes,
      planPriceCents: charge.amountCents,
      paymentStatus: 'captured',
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    charge.callRequestId = reqId;
    charge.fulfilledAt = nowMs;
  }

  if (charge.inviteId && Array.isArray(workspace.whatsappInvites)) {
    const inv = workspace.whatsappInvites.find((i) => i.id === charge.inviteId);
    if (inv) {
      inv.status = 'paid';
      inv.paidAt = inv.paidAt || nowMs;
      inv.paidByUid = charge.userId;
      inv.paidByName = charge.userName;
      inv.callRequestId = charge.callRequestId;
      inv.pixChargeId = charge.id;
    }
  }

  return {
    callRequestId: charge.callRequestId,
  };
}

function getTodayBrtDateString(offsetDays = 0, referenceNowMs = Date.now()): string {
  const brtMs = referenceNowMs - 3 * 60 * 60 * 1000 + offsetDays * 86400000;
  const d = new Date(brtMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function refreshOverduePixChargeIfNeeded(
  modelId: string,
  workspace: ModelWorkspaceData,
  charge: StoredPixCharge,
  publicOrigin?: string
): Promise<boolean> {
  const nowMs = Date.now();
  if (
    charge.status !== 'pending' ||
    !charge.dueDate ||
    !charge.dueAtMs ||
    nowMs <= charge.dueAtMs ||
    charge.expiresAt <= nowMs ||
    (charge.preferredPaymentMethod && charge.preferredPaymentMethod !== 'pix')
  ) {
    return false;
  }

  const calc = calculatePixChargeWithFees({
    originalAmountCents: charge.originalAmountCents ?? charge.amountCents,
    dueDate: charge.dueDate,
    finePercent:
      typeof charge.finePercent === 'number'
        ? charge.finePercent
        : workspace.studioConfig.pixFinePercent ?? 2,
    interestMonthlyPercent:
      typeof charge.interestMonthlyPercent === 'number'
        ? charge.interestMonthlyPercent
        : workspace.studioConfig.pixInterestMonthlyPercent ?? 1,
    referenceNowMs: nowMs,
  });

  if (
    calc.totalAmountCents === charge.amountCents &&
    calc.daysOverdue === (charge.daysOverdue ?? 0)
  ) {
    return false;
  }

  const nextTxid = sanitizePixTxid(
    `MA${nowMs.toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`
  );
  const assets = await generatePixChargeAssets({
    modelId,
    configuredPixKey: workspace.studioConfig.pixKey,
    configuredPixKeyType: workspace.studioConfig.pixKeyType,
    merchantName:
      workspace.studioConfig.pixMerchantName ||
      workspace.studioConfig.modelName ||
      charge.merchantName,
    merchantCity: workspace.studioConfig.pixMerchantCity || charge.merchantCity,
    amountCents: calc.totalAmountCents,
    txid: nextTxid,
    description: `${charge.description} (Atraso ${calc.daysOverdue}d)`,
    payerName: charge.userName,
    preferredPaymentMethod: 'pix',
    publicOrigin,
    expiresAtMs: charge.expiresAt,
  });

  charge.originalAmountCents = calc.originalAmountCents;
  charge.amountCents = calc.totalAmountCents;
  charge.finePercent = calc.finePercent;
  charge.interestMonthlyPercent = calc.interestMonthlyPercent;
  charge.fineCents = calc.fineCents;
  charge.interestCents = calc.interestCents;
  charge.daysOverdue = calc.daysOverdue;
  charge.txid = assets.txid;
  charge.provider = assets.provider;
  charge.brCode = assets.brCode;
  charge.qrCodeDataUrl = assets.qrCodeDataUrl;
  charge.externalPaymentId = assets.externalPaymentId;
  charge.checkoutUrl = assets.checkoutUrl;
  saveStore();
  emitWorkspaceRefresh(modelId, false);
  return true;
}

const inFlightPaymentVerifications = new Map<string, Promise<unknown>>();

async function withPaymentVerificationLock<T>(
  lockKey: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = inFlightPaymentVerifications.get(lockKey);
  const run = (prev ? prev.catch(() => undefined) : Promise.resolve()).then(fn);
  inFlightPaymentVerifications.set(lockKey, run);
  try {
    return await run;
  } finally {
    if (inFlightPaymentVerifications.get(lockKey) === run) {
      inFlightPaymentVerifications.delete(lockKey);
    }
  }
}

function resolvePublicOriginFromRequest(req: Request): string | undefined {
  const envOrigin = process.env.APP_URL?.trim();
  if (envOrigin) {
    try {
      const parsed = new URL(envOrigin);
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
      // Fallback to request headers
    }
  }

  const forwardedProto = String(req.header('x-forwarded-proto') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const isHttps = req.secure || forwardedProto === 'https';
  if (!isHttps) return undefined;

  const rawHost = String(
    req.header('x-forwarded-host') || req.header('host') || ''
  )
    .split(',')[0]
    .trim()
    .toLowerCase();

  if (
    !rawHost ||
    !/^[a-z0-9.-]+(?::\d+)?$/.test(rawHost) ||
    rawHost.startsWith('localhost') ||
    rawHost.startsWith('127.0.0.1') ||
    rawHost.startsWith('0.0.0.0')
  ) {
    return undefined;
  }

  return `https://${rawHost}`;
}

function findPixChargeAcrossModels(params: {
  externalReference?: string;
  externalPaymentId?: string;
}): {
  model: StoredModelAccount;
  workspace: ModelWorkspaceData;
  charge: StoredPixCharge;
} | null {
  const store = getStore();
  const extRef = params.externalReference?.trim();
  const payId = params.externalPaymentId?.trim();
  if (!extRef && !payId) return null;

  const orderedModels = Object.values(store.models).sort(
    (a, b) => Number(b.active) - Number(a.active)
  );
  for (const model of orderedModels) {
    const workspace = store.workspaces[model.id];
    if (!workspace || !Array.isArray(workspace.pixCharges)) continue;
    const matchByRef = extRef
      ? workspace.pixCharges.find((c) => c.txid === extRef)
      : undefined;
    if (matchByRef) {
      return { model, workspace, charge: matchByRef };
    }
    const matchByPayment = payId
      ? workspace.pixCharges.find((c) => c.externalPaymentId === payId)
      : undefined;
    if (matchByPayment) {
      return { model, workspace, charge: matchByPayment };
    }
  }
  return null;
}

function applyApprovedMercadoPagoVerification(params: {
  modelId: string;
  workspace: ModelWorkspaceData;
  charge: StoredPixCharge;
  verifiedPaymentId?: string;
  paymentMethodId?: string;
  transactionAmount?: number;
  currencyId?: string;
  mercadoPagoStatus?: string;
  webhookNotificationId?: string;
}): {
  ok: boolean;
  newlyPaid: boolean;
  amountMismatch: boolean;
  fulfillment: ReturnType<typeof fulfillPixCharge> | null;
} {
  const { modelId, workspace, charge } = params;
  if (charge.status === 'cancelled') {
    return {
      ok: false,
      newlyPaid: false,
      amountMismatch: false,
      fulfillment: null,
    };
  }

  if (
    !isMercadoPagoPaymentAmountValid(
      charge,
      params.transactionAmount,
      params.currencyId
    )
  ) {
    return {
      ok: false,
      newlyPaid: false,
      amountMismatch: true,
      fulfillment: null,
    };
  }

  const wasAlreadyFulfilled =
    charge.status === 'paid' &&
    charge.approvalStatus === 'aprovado' &&
    Boolean(charge.fulfilledAt);

  if (params.verifiedPaymentId) {
    charge.externalPaymentId = params.verifiedPaymentId;
  }
  if (params.paymentMethodId) {
    charge.paymentMethodUsed = params.paymentMethodId;
  }
  if (typeof params.transactionAmount === 'number') {
    charge.verifiedAmountCents = Math.round(params.transactionAmount * 100);
  }
  charge.mercadoPagoStatus = params.mercadoPagoStatus || 'approved';
  charge.approvalStatus = 'aprovado';
  charge.webhookVerifiedAt = charge.webhookVerifiedAt || Date.now();
  if (params.webhookNotificationId) {
    charge.webhookNotificationId = params.webhookNotificationId;
  }

  const fulfillment = fulfillPixCharge(modelId, workspace, charge);

  if (!wasAlreadyFulfilled) {
    saveStore();
    emitWorkspaceRefresh(modelId, charge.kind === 'tip');
    if (charge.kind === 'call_plan') {
      broadcastQueueSyncForModel(modelId);
    }
    sendToUserInModel(modelId, charge.userId, {
      type: 'pix:charge_paid',
      modelId,
      chargeId: charge.id,
      kind: charge.kind,
      approvalStatus: charge.approvalStatus,
      ...(fulfillment.callRequestId
        ? { callRequestId: fulfillment.callRequestId }
        : {}),
    });
  }

  return {
    ok: true,
    newlyPaid: !wasAlreadyFulfilled,
    amountMismatch: false,
    fulfillment,
  };
}

function revokeRefundedMercadoPagoCharge(params: {
  modelId: string;
  workspace: ModelWorkspaceData;
  charge: StoredPixCharge;
  mercadoPagoStatus?: string;
  webhookNotificationId?: string;
}): boolean {
  const { modelId, workspace, charge } = params;
  if (charge.status === 'cancelled' && charge.approvalStatus === 'estornado') {
    return false;
  }

  const wasPaid = charge.status === 'paid';
  charge.status = 'cancelled';
  charge.approvalStatus = 'estornado';
  charge.mercadoPagoStatus = params.mercadoPagoStatus || 'refunded';
  charge.webhookVerifiedAt = Date.now();
  if (params.webhookNotificationId) {
    charge.webhookNotificationId = params.webhookNotificationId;
  }

  if (wasPaid) {
    if (charge.kind === 'call_plan' && charge.callRequestId) {
      const qEntry = workspace.callQueue.find(
        (q) => q.id === charge.callRequestId
      );
      if (qEntry && (qEntry.status === 'waiting' || qEntry.status === 'accepted')) {
        qEntry.status = 'cancelled';
        qEntry.paymentStatus = 'refunded';
        qEntry.updatedAt = Date.now();
      }
      if (charge.inviteId && Array.isArray(workspace.whatsappInvites)) {
        const inv = workspace.whatsappInvites.find(
          (i) => i.id === charge.inviteId && i.pixChargeId === charge.id
        );
        if (inv && inv.status === 'paid') {
          inv.status = 'viewed';
        }
      }
    } else if (
      charge.kind === 'private_album' &&
      Array.isArray(workspace.privateAlbumPurchases)
    ) {
      workspace.privateAlbumPurchases = workspace.privateAlbumPurchases.filter(
        (p) =>
          !(
            p.userId === charge.userId &&
            charge.paidAt &&
            Math.abs(p.purchasedAt - charge.paidAt) < 15000
          )
      );
    }
  }

  saveStore();
  emitWorkspaceRefresh(modelId, charge.kind === 'tip');
  if (charge.kind === 'call_plan') {
    broadcastQueueSyncForModel(modelId);
  }
  return true;
}

function createSlidingWindowRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message: string;
}) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const xff = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof xff === 'string' ? xff.split(',')[0]?.trim() : '') ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${clientIp}:${req.path}`;
    const prev = (hits.get(key) || []).filter(
      (ts) => now - ts < options.windowMs
    );
    if (prev.length >= options.maxRequests) {
      const oldest = prev[0] || now;
      const retryAfterSec = Math.max(
        1,
        Math.ceil((options.windowMs - (now - oldest)) / 1000)
      );
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ ok: false, error: options.message });
      return;
    }
    prev.push(now);
    hits.set(key, prev);
    if (hits.size > 2000) {
      for (const [k, list] of hits.entries()) {
        if (!list.some((ts) => now - ts < options.windowMs)) {
          hits.delete(k);
        }
      }
    }
    next();
  };
}

const authRateLimiter = createSlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 25,
  message: 'Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.',
});

const albumUnlockRateLimiter = createSlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'Muitas tentativas de desbloqueio. Aguarde um minuto antes de tentar novamente.',
});

const webhookRateLimiter = createSlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  message: 'Muitas notificações de webhook em sequência.',
});

async function startServer() {
  // Ensure initial store and uploads directory exist at startup
  getStore();
  ensureUploadsDir();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(self), geolocation=()'
    );
    if (
      req.secure ||
      req.headers['x-forwarded-proto'] === 'https'
    ) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
      );
    }
    next();
  });

  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    },
    express.static(UPLOADS_DIR, {
      maxAge: '7d',
      index: false,
      dotfiles: 'deny',
    })
  );

  // Authenticated studio image/video upload (registered before global 1mb JSON parser)
  app.post(
    '/api/media/upload',
    express.json({ limit: '60mb' }),
    requireModelOperator,
    (req: AuthenticatedRequest, res) => {
      const body = (req.body || {}) as { dataUrl?: unknown };
      if (typeof body.dataUrl !== 'string') {
        res.status(400).json({ ok: false, error: 'Mídia inválida.' });
        return;
      }

      const trimmed = body.dataUrl.trim();
      const imageMatch =
        /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
          trimmed
        );
      const videoMatch =
        /^data:video\/(mp4|webm|quicktime);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
          trimmed
        );

      if (!imageMatch && !videoMatch) {
        res.status(400).json({
          ok: false,
          error:
            'Formato não suportado. Envie imagem (PNG, JPG, WEBP, GIF) ou vídeo (MP4, MOV, WEBM).',
        });
        return;
      }

      const isVideo = Boolean(videoMatch);
      const b64Payload = (videoMatch ? videoMatch[2] : imageMatch![2]).replace(
        /\s+/g,
        ''
      );
      const buf = Buffer.from(b64Payload, 'base64');

      if (isVideo) {
        if (buf.length === 0 || buf.length > MAX_UPLOAD_VIDEO_BYTES) {
          res.status(400).json({
            ok: false,
            error: 'O vídeo deve ter até 40 MB.',
          });
          return;
        }
        const detectedExt = detectVideoTypeFromBuffer(buf);
        if (!detectedExt) {
          res.status(400).json({
            ok: false,
            error: 'Arquivo de vídeo inválido ou corrompido.',
          });
          return;
        }

        ensureUploadsDir();
        const baseDir = path.resolve(UPLOADS_DIR);
        const modelPrefix = sanitizeId(
          req.resolvedModelId || 'studio',
          'studio'
        ).slice(0, 32);
        const safeName = `${modelPrefix}_vid_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${detectedExt}`;
        const targetPath = path.resolve(baseDir, safeName);
        if (!targetPath.startsWith(baseDir + path.sep)) {
          res.status(400).json({ ok: false, error: 'Caminho de destino inválido.' });
          return;
        }

        fs.writeFileSync(targetPath, buf, { mode: 0o644 });
        res.status(201).json({
          ok: true,
          url: `/uploads/${safeName}`,
          mediaType: 'video',
        });
        return;
      }

      if (buf.length === 0 || buf.length > MAX_UPLOAD_IMAGE_BYTES) {
        res.status(400).json({
          ok: false,
          error: 'A imagem deve ter até 5 MB.',
        });
        return;
      }

      const detectedExt = detectImageTypeFromBuffer(buf);
      if (!detectedExt) {
        res.status(400).json({
          ok: false,
          error: 'Arquivo de imagem inválido ou corrompido.',
        });
        return;
      }

      ensureUploadsDir();
      const baseDir = path.resolve(UPLOADS_DIR);
      const modelPrefix = sanitizeId(req.resolvedModelId || 'studio', 'studio').slice(0, 32);
      const safeName = `${modelPrefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${detectedExt}`;
      const targetPath = path.resolve(baseDir, safeName);
      if (!targetPath.startsWith(baseDir + path.sep)) {
        res.status(400).json({ ok: false, error: 'Caminho de destino inválido.' });
        return;
      }

      fs.writeFileSync(targetPath, buf, { mode: 0o644 });
      res.status(201).json({
        ok: true,
        url: `/uploads/${safeName}`,
        mediaType: 'photo',
      });
    }
  );

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const totalRoomCount = Array.from(roomParticipantsByModel.values()).reduce(
      (sum, m) => sum + m.size,
      0
    );
    res.json({
      ok: true,
      activePeers: connectedPeers.size,
      roomParticipantCount: totalRoomCount,
    });
  });

  // Public list of active models for Visitor selector
  app.get('/api/models/public', (_req, res) => {
    const store = getStore();
    const activeModels = Object.values(store.models)
      .filter((m) => m.active)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
      .map(buildPublicModelSummary)
      .filter(Boolean);

    res.json({ ok: true, models: activeModels });
  });

  // Public showcase details for a chosen active model
  app.get('/api/models/public/:modelId', async (req, res) => {
    const requestedId = sanitizeId(req.params.modelId, getDefaultActiveModelId());
    const store = getStore();
    const targetId =
      store.models[requestedId]?.active
        ? requestedId
        : getDefaultActiveModelId();
    const ctx = getModelAndWorkspace(targetId);
    if (!ctx) {
      res.status(404).json({ ok: false, error: 'Modelo não encontrada.' });
      return;
    }
    const viewer = await resolveOptionalFirebaseUser(req);
    const { model, workspace } = ctx;
    const activeGallery = workspace.galleryItems
      .filter((g) => g.active && (g.approvalStatus || 'approved') === 'approved')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const activePlans = workspace.callPlans
      .filter((p) => p.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const publicRatings = workspace.callHistory
      .filter(
        (h) =>
          typeof h.rating === 'number' &&
          Number.isFinite(h.rating) &&
          h.rating >= 1 &&
          h.rating <= 5
      )
      .sort((a, b) => (b.ratedAt || b.endedAt || 0) - (a.ratedAt || a.endedAt || 0))
      .slice(0, 20)
      .map((h) => ({
        id: h.id,
        rating: Number(h.rating),
        ...(h.ratingComment ? { comment: h.ratingComment } : {}),
        ...(h.planName ? { planName: h.planName } : {}),
        createdAtMs: Number(h.ratedAt || h.endedAt || h.createdAt || Date.now()),
      }));

    res.json({
      ok: true,
      model: buildPublicModelSummary(model),
      studioConfig: sanitizePublicStudioConfig(workspace.studioConfig),
      studioState: workspace.studioState,
      galleryItems: activeGallery,
      callPlans: activePlans,
      privateAlbumSummary: buildPrivateAlbumSummary(workspace, viewer?.uid),
      publicRatings,
    });
  });

  app.get('/api/public/invites/:inviteId', (req, res) => {
    const found = findWhatsappInviteById(req.params.inviteId);
    if (!found) {
      res.status(404).json({
        ok: false,
        error: 'Convite não encontrado ou modelo indisponível no momento.',
      });
      return;
    }
    const { model, workspace, invite } = found;
    const nowMs = Date.now();
    invite.clickCount = (invite.clickCount || 0) + 1;
    if (invite.status === 'pending') {
      invite.status = 'viewed';
      invite.viewedAt = nowMs;
    } else if (!invite.viewedAt) {
      invite.viewedAt = nowMs;
    }
    saveStore();
    emitWorkspaceRefresh(model.id, false);

    const activePlans = workspace.callPlans
      .filter((p) => p.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    res.json({
      ok: true,
      invite: serializeWhatsappInviteForVisitor(invite),
      model: buildPublicModelSummary(model),
      studioConfig: sanitizePublicStudioConfig(workspace.studioConfig),
      studioState: workspace.studioState,
      callPlans: activePlans,
    });
  });

  app.get('/api/studio/public-status', (req, res) => {
    const requestedId = sanitizeId(req.query.modelId, getDefaultActiveModelId());
    const store = getStore();
    const modelId = store.models[requestedId]
      ? requestedId
      : getDefaultActiveModelId();
    const actorUid = getModelActorUid(modelId);
    const modelPeers = Array.from(connectedPeers.values()).filter(
      (p) => p.modelId === modelId
    );
    const modelRoom = getRoomMap(modelId);
    const modelOnline = modelPeers.some(
      (p) => p.isAdmin || p.uid === actorUid
    );
    const modelInRoom = Array.from(modelRoom.values()).some(
      (p) => p.isAdmin || p.uid === actorUid
    );
    const publicQueue = buildQueueSummaryForUser(modelId, null);
    const ws = getModelAndWorkspace(modelId)?.workspace;
    const tipGoal = ws
      ? {
          enabled: Boolean(ws.studioState.tipGoalEnabled),
          title: ws.studioState.tipGoalTitle || 'Meta Especial do Estúdio',
          description: ws.studioState.tipGoalDescription || '',
          targetCents: ws.studioState.tipGoalTargetCents || 30000,
          currentCents: ws.studioState.tipGoalCurrentCents || 0,
          rewardText: ws.studioState.tipGoalRewardText || '',
          contributorsCount: ws.studioState.tipGoalContributorsCount || 0,
          lastTipName: ws.studioState.tipGoalLastTipName || '',
          lastTipAmountCents: ws.studioState.tipGoalLastTipAmountCents || 0,
          updatedAt: ws.studioState.updatedAt || 0,
        }
      : null;
    res.json({
      ok: true,
      modelId,
      roomId: getModelRoomId(modelId),
      modelOnline,
      modelInRoom,
      roomParticipantCount: modelRoom.size,
      activePeersCount: modelPeers.length,
      totalWaiting: publicQueue.totalWaiting,
      estimatedWaitSeconds: publicQueue.totalEstimatedWaitSeconds,
      tipGoal,
    });
  });

  // First-Run Primary Studio Setup Status & One-Time Atomic Claim
  app.get('/api/model-auth/bootstrap-status', (_req, res) => {
    const primaryNeedsClaim = isPrimaryClaimNeeded();
    if (!primaryNeedsClaim) {
      res.json({ ok: true, primaryNeedsClaim: false });
      return;
    }
    const store = getStore();
    const primary = store.models[PRIMARY_MODEL_ID];
    res.json({
      ok: true,
      primaryNeedsClaim: true,
      primaryDisplayName: primary?.displayName || 'Lorena Noir',
      primaryLoginUsername: primary?.loginUsername || 'lorena@modelgat.local',
    });
  });

  app.post('/api/model-auth/claim-primary', authRateLimiter, (req, res) => {
    if (!isPrimaryClaimNeeded()) {
      res.status(403).json({
        ok: false,
        error: 'A senha inicial do painel principal já foi configurada.',
      });
      return;
    }
    const store = getStore();
    const primary = store.models[PRIMARY_MODEL_ID];
    if (!primary) {
      res.status(404).json({ ok: false, error: 'Conta principal não encontrada.' });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || password.length < 6 || password.length > 80) {
      res.status(400).json({
        ok: false,
        error: 'Defina uma senha inicial entre 6 e 80 caracteres.',
      });
      return;
    }

    if (typeof body.loginUsername === 'string' && body.loginUsername.trim()) {
      const nextLogin = sanitizeLoginUsername(body.loginUsername);
      if (nextLogin.length < 3) {
        res.status(400).json({
          ok: false,
          error: 'O login deve ter pelo menos 3 caracteres.',
        });
        return;
      }
      const conflict = Object.values(store.models).find(
        (m) =>
          m.id !== primary.id &&
          (m.loginUsername.toLowerCase() === nextLogin ||
            m.slug.toLowerCase() === nextLogin)
      );
      if (conflict) {
        res.status(409).json({
          ok: false,
          error: `O login "${nextLogin}" já está em uso.`,
        });
        return;
      }
      primary.loginUsername = nextLogin;
    }

    const { salt, hash } = hashPassword(password);
    primary.passwordSalt = salt;
    primary.passwordHash = hash;
    primary.tokenVersion += 1;
    primary.updatedAt = new Date().toISOString();
    saveStore();

    const token = signModelSessionToken(primary);
    res.status(201).json({
      ok: true,
      token,
      model: serializeModelSummary(primary),
    });
  });

  // Model Authentication with Separate Password
  app.post('/api/model-auth/login', authRateLimiter, (req, res) => {
    const body = req.body as { login?: unknown; password?: unknown };
    const loginInput =
      typeof body.login === 'string' ? body.login.trim() : '';
    const password =
      typeof body.password === 'string' ? body.password : '';

    if (!loginInput || !password) {
      res.status(400).json({
        ok: false,
        error: 'Informe seu login/e-mail e sua senha de acesso.',
      });
      return;
    }

    const account = findModelByLogin(loginInput);
    if (!account) {
      res.status(401).json({
        ok: false,
        error: 'Login ou senha inválidos.',
      });
      return;
    }

    if (!account.active) {
      res.status(403).json({
        ok: false,
        error:
          'Esta conta de modelo está desativada pela administração geral.',
      });
      return;
    }

    if (!verifyModelAccountPassword(account, password)) {
      res.status(401).json({
        ok: false,
        error: 'Login ou senha inválidos.',
      });
      return;
    }

    const token = signModelSessionToken(account);
    res.json({
      ok: true,
      token,
      model: serializeModelSummary(account),
    });
  });

  // Self-service Private Model Account Registration (creates an isolated workspace accessible only by this model)
  app.post('/api/model-auth/register', authRateLimiter, (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const displayName =
      typeof body.displayName === 'string'
        ? body.displayName.trim().slice(0, 80)
        : '';
    const loginUsername = sanitizeLoginUsername(body.loginUsername);
    const password = typeof body.password === 'string' ? body.password : '';
    const rawSlug =
      typeof body.slug === 'string' && body.slug.trim()
        ? body.slug
        : displayName;
    const baseSlug = sanitizeSlug(rawSlug, 'modelo');

    if (!displayName || displayName.length < 2) {
      res.status(400).json({
        ok: false,
        error: 'Informe seu nome artístico (mínimo 2 caracteres).',
      });
      return;
    }
    if (!loginUsername || loginUsername.length < 3) {
      res.status(400).json({
        ok: false,
        error: 'Informe um login ou e-mail exclusivo (mínimo 3 caracteres).',
      });
      return;
    }
    if (!password || password.length < 6 || password.length > 80) {
      res.status(400).json({
        ok: false,
        error: 'Defina uma senha privativa entre 6 e 80 caracteres.',
      });
      return;
    }

    const store = getStore();
    const existingLogin = Object.values(store.models).find(
      (m) =>
        m.loginUsername.toLowerCase() === loginUsername ||
        m.slug.toLowerCase() === loginUsername
    );
    if (existingLogin) {
      res.status(409).json({
        ok: false,
        error: `O login "${loginUsername}" já está em uso. Escolha outro login exclusivo.`,
      });
      return;
    }

    let finalSlug = baseSlug;
    let suffix = 2;
    while (
      Object.values(store.models).some((m) => m.slug === finalSlug)
    ) {
      finalSlug = `${baseSlug}-${suffix++}`;
    }

    const id = sanitizeId(
      `model_${finalSlug.replace(/-/g, '_')}_${Date.now().toString(36)}`
    );
    const { salt, hash } = hashPassword(password);
    const nowIso = new Date().toISOString();
    const explicitThemeColor = sanitizeAdminThemeColor(body.adminThemeColor);
    const adminThemeColor =
      explicitThemeColor || pickNextDistinctThemeColor(Object.values(store.models));

    const account: StoredModelAccount = {
      id,
      slug: finalSlug,
      displayName,
      loginUsername,
      passwordSalt: salt,
      passwordHash: hash,
      tokenVersion: 1,
      isPrimary: false,
      active: true,
      adminThemeColor,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.models[id] = account;
    store.workspaces[id] = buildDefaultWorkspace(account, {
      studioBrand:
        typeof body.studioBrand === 'string' && body.studioBrand.trim()
          ? body.studioBrand.trim().slice(0, 60)
          : undefined,
      ratePerMinuteCents:
        typeof body.ratePerMinuteCents === 'number'
          ? body.ratePerMinuteCents
          : undefined,
    });

    saveStore();
    emitWorkspaceRefresh(id, true);

    const token = signModelSessionToken(account);
    res.status(201).json({
      ok: true,
      token,
      model: serializeModelSummary(account),
    });
  });

  app.get('/api/model-auth/session', (req, res) => {
    const token = extractBearerToken(req);
    const payload = verifyModelSessionToken(token);
    if (!payload) {
      res.status(401).json({ ok: false, error: 'Sessão inválida.' });
      return;
    }
    const store = getStore();
    const account = store.models[payload.modelId];
    if (
      !account ||
      !account.active ||
      account.tokenVersion !== payload.tokenVersion
    ) {
      res.status(401).json({ ok: false, error: 'Sessão expirada.' });
      return;
    }
    res.json({
      ok: true,
      model: serializeModelSummary(account),
    });
  });

  // Legacy cross-model super-admin routes are permanently disabled for strict per-model privacy
  app.all('/api/super-admin/*', (_req, res) => {
    res.status(403).json({
      ok: false,
      error:
        'Cada modelo possui seu próprio painel privativo. Ninguém além da própria modelo tem acesso.',
    });
  });

  // Authenticated model updates ONLY her own private login/password/theme
  app.patch('/api/model/account', authRateLimiter, requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) {
      res.status(404).json({ ok: false, error: 'Conta da modelo não encontrada.' });
      return;
    }

    const store = getStore();
    const { model } = ctx;
    const body = (req.body || {}) as Record<string, unknown>;
    let rotatedToken: string | undefined;

    const changingLogin =
      typeof body.loginUsername === 'string' &&
      body.loginUsername.trim().length > 0 &&
      sanitizeLoginUsername(body.loginUsername) !== model.loginUsername.toLowerCase();
    const changingPassword =
      typeof body.newPassword === 'string' && body.newPassword.length > 0;

    if (changingLogin || changingPassword) {
      const hasExistingPassword =
        Boolean(model.passwordHash && model.passwordSalt) ||
        (model.isPrimary && Boolean(getConfiguredPrimaryPassword()));
      if (hasExistingPassword) {
        const currentPassword =
          typeof body.currentPassword === 'string' ? body.currentPassword : '';
        if (!verifyModelAccountPassword(model, currentPassword)) {
          res.status(403).json({
            ok: false,
            error: 'Senha atual incorreta.',
          });
          return;
        }
      }
    }

    if (typeof body.loginUsername === 'string' && body.loginUsername.trim()) {
      const nextLogin = sanitizeLoginUsername(body.loginUsername);
      if (nextLogin.length < 3) {
        res.status(400).json({
          ok: false,
          error: 'O login deve ter pelo menos 3 caracteres.',
        });
        return;
      }
      const conflict = Object.values(store.models).find(
        (m) =>
          m.id !== model.id &&
          (m.loginUsername.toLowerCase() === nextLogin ||
            m.slug.toLowerCase() === nextLogin)
      );
      if (conflict) {
        res.status(409).json({
          ok: false,
          error: `O login "${nextLogin}" já está em uso.`,
        });
        return;
      }
      model.loginUsername = nextLogin;
    }

    if (changingPassword) {
      if (model.isPrimary && getConfiguredPrimaryPassword()) {
        res.status(409).json({
          ok: false,
          error:
            'A senha principal está definida pelas variáveis de ambiente do servidor. Atualize PRIMARY_MODEL_INITIAL_PASSWORD nos Secrets para alterá-la.',
        });
        return;
      }
      const nextPass = String(body.newPassword);
      if (nextPass.length < 6 || nextPass.length > 80) {
        res.status(400).json({
          ok: false,
          error: 'A nova senha deve ter entre 6 e 80 caracteres.',
        });
        return;
      }
      const { salt, hash } = hashPassword(nextPass);
      model.passwordSalt = salt;
      model.passwordHash = hash;
      model.tokenVersion += 1;
      rotatedToken = signModelSessionToken(model);
    }

    const updatedTheme = sanitizeAdminThemeColor(body.adminThemeColor);
    if (updatedTheme) {
      model.adminThemeColor = updatedTheme;
    }

    model.updatedAt = new Date().toISOString();
    saveStore();
    emitWorkspaceRefresh(model.id, false);

    res.json({
      ok: true,
      model: serializeModelSummary(model),
      ...(rotatedToken ? { token: rotatedToken } : {}),
    });
  });

  // ============================================================================
  // MODEL-SCOPED WORKSPACE ROUTES (Strictly isolated per modelId)
  // ============================================================================
  app.get('/api/model/workspace', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) {
      res.status(404).json({ ok: false, error: 'Estúdio da modelo não encontrado.' });
      return;
    }
    const { model, workspace } = ctx;
    const actorUid = getModelActorUid(modelId);

    const modelSelfProfile = {
      uid: actorUid,
      displayName: workspace.studioConfig.modelName || model.displayName,
      photoUrl: workspace.studioConfig.modelAvatarUrl || '',
      role: 'model' as const,
      accessStatus: 'vip' as const,
      isOnline: true,
      notes: workspace.studioConfig.modelBio || '',
      createdAt: Date.parse(model.createdAt) || Date.now(),
      updatedAt: Date.now(),
    };

    const visitorProfiles = Object.values(workspace.visitorProfiles);

    res.json({
      ok: true,
      modelId,
      model: serializeModelSummary(model),
      myProfile: modelSelfProfile,
      modelProfile: modelSelfProfile,
      allProfiles: [modelSelfProfile, ...visitorProfiles],
      studioState: workspace.studioState,
      studioConfig: {
        ...workspace.studioConfig,
        mercadoPagoConfigured: isMercadoPagoConfigured(),
      },
      galleryItems: [...workspace.galleryItems].sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
      privateAlbumSummary: buildPrivateAlbumSummary(workspace),
      privateAlbumItems: [...(workspace.privateAlbumItems || [])].sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
      callPlans: [...workspace.callPlans].sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
      callQueue: [...workspace.callQueue].sort(
        (a, b) => b.createdAt - a.createdAt
      ),
      callMessages: [...workspace.callMessages].sort(
        (a, b) => a.createdAt - b.createdAt
      ),
      callHistory: [...workspace.callHistory].sort(
        (a, b) => b.endedAt - a.endedAt
      ),
      interestMessages: [...workspace.interestMessages].sort(
        (a, b) => b.createdAt - a.createdAt
      ),
      pixCharges: [...(workspace.pixCharges || [])]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 250)
        .map(serializePixChargeForClient),
      whatsappInvites: [...(workspace.whatsappInvites || [])]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 60),
    });
  });

  app.patch('/api/model/studio-state', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) {
      res.status(404).json({ ok: false, error: 'Estúdio não encontrado.' });
      return;
    }
    const { workspace } = ctx;
    const patch = (req.body || {}) as Record<string, unknown>;
    const next = workspace.studioState;

    if (typeof patch.modelName === 'string' && patch.modelName.trim()) {
      next.modelName = patch.modelName.trim().slice(0, 80);
    }
    if (typeof patch.isLive === 'boolean') next.isLive = patch.isLive;
    if (
      typeof patch.callMode === 'string' &&
      ['open', 'queue_only', 'paused'].includes(patch.callMode)
    ) {
      next.callMode = patch.callMode as 'open' | 'queue_only' | 'paused';
    }
    if (typeof patch.headline === 'string' && patch.headline.trim()) {
      next.headline = patch.headline.trim().slice(0, 140);
    }
    if (typeof patch.activeCallId === 'string') {
      next.activeCallId = patch.activeCallId.slice(0, 128);
    }
    if (typeof patch.activeCallUserId === 'string') {
      next.activeCallUserId = patch.activeCallUserId.slice(0, 128);
    }
    if (typeof patch.activeCallUserName === 'string') {
      next.activeCallUserName = patch.activeCallUserName.slice(0, 80);
    }
    if (typeof patch.autoScheduleEnabled === 'boolean') {
      next.autoScheduleEnabled = patch.autoScheduleEnabled;
    }
    if (typeof patch.scheduleStartTime === 'string') {
      next.scheduleStartTime = patch.scheduleStartTime.slice(0, 5);
    }
    if (typeof patch.scheduleEndTime === 'string') {
      next.scheduleEndTime = patch.scheduleEndTime.slice(0, 5);
    }
    if (typeof patch.scheduleDays === 'string') {
      next.scheduleDays = patch.scheduleDays.slice(0, 20);
    }
    if (typeof patch.scheduleTimezone === 'string') {
      next.scheduleTimezone = patch.scheduleTimezone.slice(0, 60);
    }
    if (Array.isArray(patch.schedulePeriods)) {
      next.schedulePeriods = patch.schedulePeriods.slice(0, 14);
    }
    if (Array.isArray(patch.holidayDates)) {
      next.holidayDates = patch.holidayDates.slice(0, 60);
    }
    if (Array.isArray(patch.dailyPausePeriods)) {
      next.dailyPausePeriods = patch.dailyPausePeriods
        .slice(0, 14)
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object')
        )
        .map((item, idx) => ({
          id:
            typeof item.id === 'string' && item.id.trim()
              ? item.id.trim().slice(0, 64)
              : `pausa_${idx + 1}`,
          ...(typeof item.label === 'string' && item.label.trim()
            ? { label: item.label.trim().slice(0, 40) }
            : {}),
          startTime:
            typeof item.startTime === 'string'
              ? item.startTime.slice(0, 5)
              : '12:00',
          endTime:
            typeof item.endTime === 'string'
              ? item.endTime.slice(0, 5)
              : '13:00',
          days:
            typeof item.days === 'string'
              ? item.days.slice(0, 20)
              : '0,1,2,3,4,5,6',
          enabled: item.enabled !== false,
        }));
    }
    if (Array.isArray(patch.weeklyBlockedDays)) {
      next.weeklyBlockedDays = Array.from(
        new Set(
          patch.weeklyBlockedDays
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
        )
      ).sort((a, b) => a - b);
    }
    if (typeof patch.pauseWarningEnabled === 'boolean') {
      next.pauseWarningEnabled = patch.pauseWarningEnabled;
    }
    if (
      typeof patch.pauseWarningMinutes === 'number' &&
      Number.isFinite(patch.pauseWarningMinutes)
    ) {
      next.pauseWarningMinutes = Math.max(
        1,
        Math.min(30, Math.round(patch.pauseWarningMinutes))
      );
    }
    if (typeof patch.pauseWarningMessage === 'string') {
      next.pauseWarningMessage = patch.pauseWarningMessage.trim().slice(0, 160);
    }
    if (typeof patch.dndActive === 'boolean') next.dndActive = patch.dndActive;
    if (typeof patch.dndUntilMs === 'number') {
      next.dndUntilMs = Math.max(0, Math.round(patch.dndUntilMs));
    }
    if (typeof patch.dndScheduleEnabled === 'boolean') {
      next.dndScheduleEnabled = patch.dndScheduleEnabled;
    }
    if (typeof patch.dndStartTime === 'string') {
      next.dndStartTime = patch.dndStartTime.slice(0, 5);
    }
    if (typeof patch.dndEndTime === 'string') {
      next.dndEndTime = patch.dndEndTime.slice(0, 5);
    }
    if (typeof patch.tipGoalEnabled === 'boolean') {
      next.tipGoalEnabled = patch.tipGoalEnabled;
    }
    if (typeof patch.tipGoalTitle === 'string') {
      next.tipGoalTitle =
        patch.tipGoalTitle.trim().slice(0, 80) || 'Meta Especial do Estúdio';
    }
    if (typeof patch.tipGoalDescription === 'string') {
      next.tipGoalDescription = patch.tipGoalDescription.trim().slice(0, 300);
    }
    if (
      typeof patch.tipGoalTargetCents === 'number' &&
      Number.isFinite(patch.tipGoalTargetCents)
    ) {
      next.tipGoalTargetCents = Math.max(
        500,
        Math.min(100000000, Math.round(patch.tipGoalTargetCents))
      );
    }
    if (
      typeof patch.tipGoalCurrentCents === 'number' &&
      Number.isFinite(patch.tipGoalCurrentCents)
    ) {
      next.tipGoalCurrentCents = Math.max(
        0,
        Math.min(100000000, Math.round(patch.tipGoalCurrentCents))
      );
    }
    if (typeof patch.tipGoalRewardText === 'string') {
      next.tipGoalRewardText = patch.tipGoalRewardText.trim().slice(0, 140);
    }
    if (
      typeof patch.tipGoalContributorsCount === 'number' &&
      Number.isFinite(patch.tipGoalContributorsCount)
    ) {
      next.tipGoalContributorsCount = Math.max(
        0,
        Math.min(1000000, Math.round(patch.tipGoalContributorsCount))
      );
    }
    if (typeof patch.tipGoalLastTipName === 'string') {
      next.tipGoalLastTipName = patch.tipGoalLastTipName.trim().slice(0, 60);
    }
    if (
      typeof patch.tipGoalLastTipAmountCents === 'number' &&
      Number.isFinite(patch.tipGoalLastTipAmountCents)
    ) {
      next.tipGoalLastTipAmountCents = Math.max(
        0,
        Math.min(100000000, Math.round(patch.tipGoalLastTipAmountCents))
      );
    }

    next.updatedAt = Date.now();
    saveStore();
    emitWorkspaceRefresh(modelId, true);
    res.json({ ok: true, studioState: next });
  });

  app.put('/api/model/studio-config', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) {
      res.status(404).json({ ok: false, error: 'Estúdio não encontrado.' });
      return;
    }
    const { model, workspace } = ctx;
    const patch = (req.body || {}) as Record<string, unknown>;
    const cfg = workspace.studioConfig;

    if (typeof patch.studioBrand === 'string' && patch.studioBrand.trim()) {
      cfg.studioBrand = patch.studioBrand.trim().slice(0, 60);
    }
    if (typeof patch.modelName === 'string' && patch.modelName.trim()) {
      cfg.modelName = patch.modelName.trim().slice(0, 80);
      model.displayName = cfg.modelName;
      workspace.studioState.modelName = cfg.modelName;
    }
    if (typeof patch.modelAvatarUrl === 'string') {
      cfg.modelAvatarUrl = sanitizeMediaUrl(patch.modelAvatarUrl);
    }
    if (typeof patch.heroImageUrl === 'string') {
      cfg.heroImageUrl = sanitizeMediaUrl(patch.heroImageUrl);
    }
    if (typeof patch.loungeImageUrl === 'string') {
      cfg.loungeImageUrl = sanitizeMediaUrl(patch.loungeImageUrl);
    }
    if (typeof patch.modelBio === 'string') {
      cfg.modelBio = patch.modelBio.trim().slice(0, 300);
    }
    if (patch.basicInfo && typeof patch.basicInfo === 'object') {
      cfg.basicInfo = sanitizeModelBasicInfo(patch.basicInfo);
    }
    if (typeof patch.heroTitle === 'string' && patch.heroTitle.trim()) {
      cfg.heroTitle = patch.heroTitle.trim().slice(0, 120);
    }
    if (typeof patch.heroSubtitle === 'string' && patch.heroSubtitle.trim()) {
      cfg.heroSubtitle = patch.heroSubtitle.trim().slice(0, 300);
    }
    if (typeof patch.headline === 'string' && patch.headline.trim()) {
      cfg.headline = patch.headline.trim().slice(0, 160);
      workspace.studioState.headline = cfg.headline.slice(0, 140);
    }
    if (
      typeof patch.groupButtonLabel === 'string' &&
      patch.groupButtonLabel.trim()
    ) {
      cfg.groupButtonLabel = patch.groupButtonLabel.trim().slice(0, 60);
    }
    if (
      typeof patch.privateButtonLabel === 'string' &&
      patch.privateButtonLabel.trim()
    ) {
      cfg.privateButtonLabel = patch.privateButtonLabel.trim().slice(0, 60);
    }
    if (
      typeof patch.ratePerMinuteCents === 'number' &&
      Number.isFinite(patch.ratePerMinuteCents)
    ) {
      const prevRate = cfg.ratePerMinuteCents || 1500;
      const nextRate = Math.max(
        100,
        Math.min(1000000, Math.round(patch.ratePerMinuteCents))
      );
      cfg.ratePerMinuteCents = nextRate;
      if (patch.recalculatePlans === true && prevRate !== nextRate) {
        workspace.callPlans = rescalePlansForRate(
          workspace.callPlans,
          prevRate,
          nextRate
        );
      }
    }

    if (
      typeof patch.privateAlbumPriceCents === 'number' &&
      Number.isFinite(patch.privateAlbumPriceCents)
    ) {
      const nextAlbumPrice = Math.max(
        500,
        Math.min(500000, Math.round(patch.privateAlbumPriceCents))
      );
      workspace.privateAlbumPriceCents = nextAlbumPrice;
      cfg.privateAlbumPriceCents = nextAlbumPrice;
    }

    const requestedKeyType =
      typeof patch.pixKeyType === 'string' &&
      ['cpf', 'cnpj', 'email', 'phone', 'evp'].includes(patch.pixKeyType)
        ? (patch.pixKeyType as PixKeyType)
        : cfg.pixKeyType;
    if (requestedKeyType) {
      cfg.pixKeyType = requestedKeyType;
    }
    if (typeof patch.pixKey === 'string') {
      const rawPixKey = patch.pixKey.trim();
      if (!rawPixKey) {
        cfg.pixKey = '';
      } else {
        if (!isValidPixKey(rawPixKey, cfg.pixKeyType)) {
          res.status(400).json({
            ok: false,
            error:
              'Chave PIX inválida para o tipo selecionado. Verifique CPF (11 dígitos), CNPJ (14 dígitos), E-mail, Telefone com DDD ou Chave Aleatória (EVP).',
          });
          return;
        }
        const normalized = normalizePixKey(rawPixKey, cfg.pixKeyType);
        cfg.pixKey = normalized.key;
        cfg.pixKeyType = normalized.keyType;
      }
    }
    if (typeof patch.pixMerchantName === 'string') {
      cfg.pixMerchantName = formatEmvMerchantName(
        patch.pixMerchantName || cfg.modelName
      );
    }
    if (typeof patch.pixMerchantCity === 'string') {
      cfg.pixMerchantCity = formatEmvMerchantCity(
        patch.pixMerchantCity || 'SAO PAULO'
      );
    }
    if (
      typeof patch.pixFinePercent === 'number' &&
      Number.isFinite(patch.pixFinePercent)
    ) {
      cfg.pixFinePercent = Math.max(
        0,
        Math.min(10, Number(patch.pixFinePercent.toFixed(2)))
      );
    }
    if (
      typeof patch.pixInterestMonthlyPercent === 'number' &&
      Number.isFinite(patch.pixInterestMonthlyPercent)
    ) {
      cfg.pixInterestMonthlyPercent = Math.max(
        0,
        Math.min(10, Number(patch.pixInterestMonthlyPercent.toFixed(2)))
      );
    }
    if (
      typeof patch.pixDefaultDueDays === 'number' &&
      Number.isFinite(patch.pixDefaultDueDays)
    ) {
      cfg.pixDefaultDueDays = Math.max(
        0,
        Math.min(90, Math.round(patch.pixDefaultDueDays))
      );
    }
    if (typeof patch.whatsappInvitePhotoUrl === 'string') {
      cfg.whatsappInvitePhotoUrl = sanitizeMediaUrl(patch.whatsappInvitePhotoUrl);
    }
    if (typeof patch.whatsappInviteMessage === 'string') {
      cfg.whatsappInviteMessage = patch.whatsappInviteMessage.trim().slice(0, 600);
    }
    if (typeof patch.whatsappInvitePlanId === 'string') {
      cfg.whatsappInvitePlanId = sanitizeId(patch.whatsappInvitePlanId);
    }
    if (
      patch.whatsappInviteCallMode === 'private' ||
      patch.whatsappInviteCallMode === 'group'
    ) {
      cfg.whatsappInviteCallMode = 'private';
    }

    cfg.updatedAt = Date.now();
    workspace.studioState.updatedAt = Date.now();
    model.updatedAt = new Date().toISOString();
    saveStore();
    emitWorkspaceRefresh(modelId, true);
    res.json({
      ok: true,
      studioConfig: {
        ...cfg,
        mercadoPagoConfigured: isMercadoPagoConfigured(),
      },
    });
  });

  app.post(
    '/api/model/whatsapp-invites',
    requireModelOperator,
    (req: AuthenticatedRequest, res) => {
      const modelId = req.resolvedModelId!;
      const ctx = getModelAndWorkspace(modelId);
      if (!ctx) {
        res.status(404).json({ ok: false, error: 'Estúdio não encontrado.' });
        return;
      }
      const { model, workspace } = ctx;
      const body = (req.body || {}) as Record<string, unknown>;

      const hasExplicitPhoto =
        typeof body.photoUrl === 'string' && body.photoUrl.trim().length > 0;
      const sanitizedExplicitPhoto = hasExplicitPhoto
        ? sanitizeMediaUrl(body.photoUrl)
        : '';
      if (hasExplicitPhoto && !sanitizedExplicitPhoto) {
        res.status(400).json({
          ok: false,
          error:
            'URL de foto do convite inválida. Utilize uma URL https:// ou envie uma imagem válida.',
        });
        return;
      }

      const photoUrl =
        sanitizedExplicitPhoto ||
        workspace.studioConfig.whatsappInvitePhotoUrl ||
        workspace.studioConfig.heroImageUrl ||
        workspace.studioConfig.modelAvatarUrl ||
        '';
      if (!photoUrl) {
        res.status(400).json({
          ok: false,
          error: 'Selecione ou envie uma foto para o convite do WhatsApp.',
        });
        return;
      }

      const message =
        typeof body.message === 'string' ? body.message.trim().slice(0, 600) : '';
      if (!message) {
        res.status(400).json({
          ok: false,
          error: 'Escreva a mensagem personalizada do convite antes de gerar.',
        });
        return;
      }

      const recipientName =
        typeof body.recipientName === 'string'
          ? body.recipientName.trim().slice(0, 80)
          : '';
      const rawPhone =
        typeof body.recipientPhone === 'string' ? body.recipientPhone.trim() : '';
      const recipientPhone = rawPhone ? sanitizeWhatsappPhone(rawPhone) : '';
      if (rawPhone && !recipientPhone) {
        res.status(400).json({
          ok: false,
          error:
            'Número de WhatsApp inválido. Informe DDD + número (ex.: 11999998888) ou deixe vazio para escolher na agenda do WhatsApp.',
        });
        return;
      }

      const requestedPlanId = sanitizeId(body.planId);
      const selectedPlan = requestedPlanId
        ? workspace.callPlans.find((p) => p.id === requestedPlanId && p.active)
        : undefined;
      const callMode: 'private' = 'private';

      const nowMs = Date.now();
      const inviteId = `conv_${nowMs.toString(36)}_${crypto
        .randomBytes(3)
        .toString('hex')}`;

      const invite: StoredWhatsappInvite = {
        id: inviteId,
        modelId,
        ...(recipientName ? { recipientName } : {}),
        ...(recipientPhone ? { recipientPhone } : {}),
        photoUrl,
        message,
        ...(selectedPlan
          ? {
              planId: selectedPlan.id,
              planName: selectedPlan.name,
              planDurationMinutes: selectedPlan.durationMinutes,
              planPriceCents: selectedPlan.priceCents,
            }
          : {}),
        callMode,
        status: 'pending',
        clickCount: 0,
        createdAt: nowMs,
      };

      if (!Array.isArray(workspace.whatsappInvites)) {
        workspace.whatsappInvites = [];
      }
      workspace.whatsappInvites.unshift(invite);
      if (workspace.whatsappInvites.length > 100) {
        workspace.whatsappInvites = workspace.whatsappInvites.slice(0, 100);
      }

      if (body.saveAsDefault !== false) {
        workspace.studioConfig.whatsappInvitePhotoUrl = photoUrl;
        workspace.studioConfig.whatsappInviteMessage = message;
        workspace.studioConfig.whatsappInvitePlanId = selectedPlan?.id || '';
        workspace.studioConfig.whatsappInviteCallMode = callMode;
        workspace.studioConfig.updatedAt = nowMs;
      }

      model.updatedAt = new Date().toISOString();
      saveStore();
      emitWorkspaceRefresh(modelId, false);

      res.status(201).json({
        ok: true,
        invite,
        invitePath: `/convite/${invite.id}`,
      });
    }
  );

  app.delete(
    '/api/model/whatsapp-invites/:inviteId',
    requireModelOperator,
    (req: AuthenticatedRequest, res) => {
      const modelId = req.resolvedModelId!;
      const ctx = getModelAndWorkspace(modelId);
      if (!ctx) {
        res.status(404).json({ ok: false });
        return;
      }
      const inviteId = sanitizeId(req.params.inviteId);
      const list = ctx.workspace.whatsappInvites || [];
      ctx.workspace.whatsappInvites = list.filter((i) => i.id !== inviteId);
      saveStore();
      emitWorkspaceRefresh(modelId, false);
      res.json({ ok: true });
    }
  );

  app.post('/api/model/gallery', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const { workspace } = ctx;
    const body = (req.body || {}) as Record<string, unknown>;
    const title =
      typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '';
    const caption =
      typeof body.caption === 'string' ? body.caption.trim().slice(0, 240) : '';
    const src = sanitizeMediaUrl(body.src);
    if (!title || !caption || !src) {
      res.status(400).json({ ok: false, error: 'Campos obrigatórios inválidos.' });
      return;
    }
    const category =
      typeof body.category === 'string' &&
      ['editorial', 'portraits', 'studio'].includes(body.category)
        ? (body.category as 'editorial' | 'portraits' | 'studio')
        : 'editorial';
    const mediaType = body.mediaType === 'video' ? 'video' : 'photo';
    const specs =
      typeof body.specs === 'string' && body.specs.trim()
        ? body.specs.trim().slice(0, 80)
        : 'Estúdio Oficial';
    const alt =
      typeof body.alt === 'string' && body.alt.trim()
        ? body.alt.trim().slice(0, 160)
        : `${title} · Galeria do Estúdio`;
    const sortOrder = Math.max(
      0,
      Math.min(100, Math.round(Number(body.sortOrder) || 1))
    );
    const active = body.active !== false;
    const nowMs = Date.now();

    const itemId =
      typeof body.id === 'string' && body.id.trim()
        ? sanitizeId(body.id)
        : `gal_${nowMs}`;
    const existingIdx = workspace.galleryItems.findIndex((g) => g.id === itemId);

    if (existingIdx >= 0) {
      const prev = workspace.galleryItems[existingIdx];
      workspace.galleryItems[existingIdx] = {
        ...prev,
        title,
        caption,
        category,
        mediaType,
        specs,
        src,
        alt,
        sortOrder,
        active,
        approvalStatus: 'approved',
        reviewedAt: nowMs,
        updatedAt: nowMs,
      };
      delete workspace.galleryItems[existingIdx].moderationNote;
    } else {
      workspace.galleryItems.push({
        id: itemId,
        title,
        caption,
        category,
        mediaType,
        specs,
        src,
        alt,
        sortOrder,
        active,
        approvalStatus: 'approved',
        reviewedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }

    saveStore();
    emitWorkspaceRefresh(modelId, true);
    res.json({
      ok: true,
      id: itemId,
      approvalStatus: 'approved',
    });
  });

  app.delete('/api/model/gallery/:itemId', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const itemId = sanitizeId(req.params.itemId);
    ctx.workspace.galleryItems = ctx.workspace.galleryItems.filter(
      (g) => g.id !== itemId
    );
    saveStore();
    emitWorkspaceRefresh(modelId, true);
    res.json({ ok: true });
  });

  app.post('/api/model/gallery/restore', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    ctx.workspace.galleryItems = buildDefaultGallery(
      ctx.workspace.studioConfig.modelName,
      Date.now()
    );
    saveStore();
    emitWorkspaceRefresh(modelId, true);
    res.json({ ok: true });
  });

  // ============================================================================
  // PRIVATE ALBUM (PASSWORD-PROTECTED PHOTOS & VIDEOS PER MODEL)
  // ============================================================================
  app.put('/api/model/private-album/settings', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const { workspace } = ctx;
    const body = (req.body || {}) as {
      enabled?: unknown;
      password?: unknown;
      hint?: unknown;
      priceCents?: unknown;
    };

    if (typeof body.enabled === 'boolean') {
      workspace.privateAlbumEnabled = body.enabled;
    }
    if (typeof body.hint === 'string') {
      workspace.privateAlbumPasswordHint = body.hint.trim().slice(0, 120);
    }
    if (typeof body.priceCents === 'number' && Number.isFinite(body.priceCents)) {
      const nextAlbumPrice = Math.max(
        500,
        Math.min(500000, Math.round(body.priceCents))
      );
      workspace.privateAlbumPriceCents = nextAlbumPrice;
      workspace.studioConfig.privateAlbumPriceCents = nextAlbumPrice;
    }
    if (typeof body.password === 'string' && body.password.trim().length > 0) {
      const cleanPass = body.password.trim();
      if (cleanPass.length < 4 || cleanPass.length > 64) {
        res.status(400).json({
          ok: false,
          error: 'A senha do álbum privativo deve ter entre 4 e 64 caracteres.',
        });
        return;
      }
      const { salt, hash } = hashPassword(cleanPass);
      workspace.privateAlbumPasswordSalt = salt;
      workspace.privateAlbumPasswordHash = hash;
      workspace.privateAlbumTokenVersion =
        (workspace.privateAlbumTokenVersion || 1) + 1;
    }

    saveStore();
    emitWorkspaceRefresh(modelId, true);
    res.json({
      ok: true,
      privateAlbumSummary: buildPrivateAlbumSummary(workspace),
    });
  });

  app.post('/api/model/private-album/items', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const { workspace } = ctx;
    const body = (req.body || {}) as Record<string, unknown>;

    const title =
      typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '';
    const caption =
      typeof body.caption === 'string' ? body.caption.trim().slice(0, 240) : '';
    const src = sanitizeMediaUrl(body.src);
    const thumbnailUrl = sanitizeMediaUrl(body.thumbnailUrl);
    const mediaType = body.mediaType === 'video' ? 'video' : 'photo';

    if (!title || !src) {
      res.status(400).json({
        ok: false,
        error: 'Informe um título e envie o arquivo ou link válido.',
      });
      return;
    }

    const sortOrder = Math.max(
      0,
      Math.min(100, Math.round(Number(body.sortOrder) || 1))
    );
    const active = body.active !== false;
    const nowMs = Date.now();
    const itemId =
      typeof body.id === 'string' && body.id.trim()
        ? sanitizeId(body.id)
        : `priv_${nowMs}`;

    if (!workspace.privateAlbumItems) {
      workspace.privateAlbumItems = [];
    }

    const idx = workspace.privateAlbumItems.findIndex((i) => i.id === itemId);
    const nextItem: StoredPrivateAlbumItem = {
      id: itemId,
      title,
      caption,
      mediaType,
      src,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      sortOrder,
      active,
      createdAt: idx >= 0 ? workspace.privateAlbumItems[idx].createdAt : nowMs,
      updatedAt: nowMs,
    };

    if (idx >= 0) {
      workspace.privateAlbumItems[idx] = nextItem;
    } else {
      workspace.privateAlbumItems.push(nextItem);
    }

    saveStore();
    emitWorkspaceRefresh(modelId, true);
    res.json({
      ok: true,
      id: itemId,
      item: nextItem,
      privateAlbumSummary: buildPrivateAlbumSummary(workspace),
    });
  });

  app.delete('/api/model/private-album/items/:itemId', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const itemId = sanitizeId(req.params.itemId);
    ctx.workspace.privateAlbumItems = (
      ctx.workspace.privateAlbumItems || []
    ).filter((i) => i.id !== itemId);
    saveStore();
    emitWorkspaceRefresh(modelId, true);
    res.json({
      ok: true,
      privateAlbumSummary: buildPrivateAlbumSummary(ctx.workspace),
    });
  });

  // Real-time visibility switcher: move item between Public Gallery and Private Album
  app.post('/api/model/media/visibility', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false, error: 'Estúdio não encontrado.' });
    const { workspace } = ctx;
    const body = (req.body || {}) as {
      itemId?: unknown;
      fromVisibility?: unknown;
      toVisibility?: unknown;
      category?: unknown;
    };
    const itemId = sanitizeId(body.itemId);
    const fromVisibility =
      body.fromVisibility === 'public' || body.fromVisibility === 'private'
        ? body.fromVisibility
        : null;
    const toVisibility =
      body.toVisibility === 'public' || body.toVisibility === 'private'
        ? body.toVisibility
        : null;

    if (!itemId || !fromVisibility || !toVisibility) {
      res.status(400).json({
        ok: false,
        error: 'Informe itemId, fromVisibility e toVisibility válidos (public ou private).',
      });
      return;
    }

    if (!workspace.privateAlbumItems) {
      workspace.privateAlbumItems = [];
    }

    if (fromVisibility === toVisibility) {
      res.json({ ok: true, visibility: toVisibility, unchanged: true });
      return;
    }

    const nowMs = Date.now();

    if (fromVisibility === 'public' && toVisibility === 'private') {
      const idx = workspace.galleryItems.findIndex((g) => g.id === itemId);
      if (idx < 0) {
        res.status(404).json({ ok: false, error: 'Mídia pública não encontrada.' });
        return;
      }
      const [removed] = workspace.galleryItems.splice(idx, 1);
      const existingPrivIdx = workspace.privateAlbumItems.findIndex(
        (p) => p.id === removed.id
      );
      const nextPrivate: StoredPrivateAlbumItem = {
        id: removed.id,
        title: removed.title,
        caption: removed.caption || '',
        mediaType: removed.mediaType === 'video' ? 'video' : 'photo',
        src: removed.src,
        sortOrder: removed.sortOrder,
        active: removed.active,
        createdAt: removed.createdAt || nowMs,
        updatedAt: nowMs,
      };
      if (existingPrivIdx >= 0) {
        workspace.privateAlbumItems[existingPrivIdx] = nextPrivate;
      } else {
        workspace.privateAlbumItems.push(nextPrivate);
      }

      saveStore();
      emitWorkspaceRefresh(modelId, true);
      res.json({
        ok: true,
        visibility: 'private',
        item: nextPrivate,
        privateAlbumSummary: buildPrivateAlbumSummary(workspace),
      });
      return;
    }

    // private -> public
    const privIdx = workspace.privateAlbumItems.findIndex((p) => p.id === itemId);
    if (privIdx < 0) {
      res.status(404).json({ ok: false, error: 'Mídia privativa não encontrada.' });
      return;
    }
    const [removedPriv] = workspace.privateAlbumItems.splice(privIdx, 1);
    const approvalStatus: 'approved' = 'approved';
    const category =
      typeof body.category === 'string' &&
      ['editorial', 'portraits', 'studio'].includes(body.category)
        ? (body.category as 'editorial' | 'portraits' | 'studio')
        : 'editorial';

    const existingPubIdx = workspace.galleryItems.findIndex(
      (g) => g.id === removedPriv.id
    );
    const nextPublic = {
      id: removedPriv.id,
      title: removedPriv.title,
      caption: removedPriv.caption || removedPriv.title,
      category,
      mediaType: (removedPriv.mediaType === 'video' ? 'video' : 'photo') as
        | 'photo'
        | 'video',
      specs: 'Estúdio Oficial',
      src: removedPriv.src,
      alt: removedPriv.title,
      sortOrder: removedPriv.sortOrder,
      active: removedPriv.active,
      approvalStatus,
      reviewedAt: nowMs,
      createdAt: removedPriv.createdAt || nowMs,
      updatedAt: nowMs,
    };

    if (existingPubIdx >= 0) {
      workspace.galleryItems[existingPubIdx] = nextPublic;
    } else {
      workspace.galleryItems.push(nextPublic);
    }

    saveStore();
    emitWorkspaceRefresh(modelId, true);
    res.json({
      ok: true,
      visibility: 'public',
      approvalStatus,
      item: nextPublic,
      privateAlbumSummary: buildPrivateAlbumSummary(workspace),
    });
  });

  app.post('/api/public/models/:modelId/private-album/unlock', albumUnlockRateLimiter, async (req, res) => {
    const requestedId = sanitizeId(req.params.modelId, getDefaultActiveModelId());
    const ctx = getModelAndWorkspace(requestedId);
    if (!ctx || !ctx.model.active) {
      res.status(404).json({ ok: false, error: 'Modelo não encontrada.' });
      return;
    }
    const { workspace } = ctx;
    if (workspace.privateAlbumEnabled === false) {
      res.status(403).json({
        ok: false,
        error: 'O álbum privativo desta modelo está temporariamente desativado.',
      });
      return;
    }

    const viewer = await resolveOptionalFirebaseUser(req);
    const alreadyPaid = hasVisitorPaidPrivateAlbum(workspace, viewer?.uid);

    if (!alreadyPaid) {
      if (
        !workspace.privateAlbumPasswordHash ||
        !workspace.privateAlbumPasswordSalt
      ) {
        res.status(402).json({
          ok: false,
          error:
            'Realize o pagamento para liberar fotos e vídeos privados desta modelo.',
        });
        return;
      }

      const body = (req.body || {}) as { password?: unknown };
      const password =
        typeof body.password === 'string' ? body.password.trim() : '';
      if (!password) {
        res.status(400).json({
          ok: false,
          error: 'Realize o pagamento ou digite a senha VIP do álbum privativo.',
        });
        return;
      }

      const valid = verifyPassword(
        password,
        workspace.privateAlbumPasswordSalt,
        workspace.privateAlbumPasswordHash
      );
      if (!valid) {
        res.status(401).json({
          ok: false,
          error: 'Senha incorreta para o álbum privativo.',
        });
        return;
      }
    }

    const version = workspace.privateAlbumTokenVersion || 1;
    const albumToken = signPrivateAlbumToken(ctx.model.id, version);
    const items = (workspace.privateAlbumItems || [])
      .filter((item) => item.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    res.json({
      ok: true,
      albumToken,
      summary: buildPrivateAlbumSummary(workspace, viewer?.uid),
      items,
    });
  });

  app.get('/api/public/models/:modelId/private-album', async (req, res) => {
    const requestedId = sanitizeId(req.params.modelId, getDefaultActiveModelId());
    const ctx = getModelAndWorkspace(requestedId);
    if (!ctx || !ctx.model.active) {
      res.status(404).json({ ok: false, error: 'Modelo não encontrada.' });
      return;
    }
    const { workspace } = ctx;
    if (workspace.privateAlbumEnabled === false) {
      res.status(403).json({
        ok: false,
        error: 'O álbum privativo está desativado.',
      });
      return;
    }

    const viewer = await resolveOptionalFirebaseUser(req);
    const hasPaid = hasVisitorPaidPrivateAlbum(workspace, viewer?.uid);

    const token =
      (req.header('x-album-token') || extractBearerToken(req) || '').trim();
    const payload = verifyPrivateAlbumToken(token);
    const currentVersion = workspace.privateAlbumTokenVersion || 1;
    const hasValidAlbumToken = Boolean(
      payload &&
        payload.modelId === ctx.model.id &&
        payload.version === currentVersion
    );

    if (!hasPaid && !hasValidAlbumToken) {
      res.status(401).json({
        ok: false,
        error:
          'Álbum bloqueado. Pagamento necessário para visualizar fotos e vídeos privados.',
      });
      return;
    }

    const items = (workspace.privateAlbumItems || [])
      .filter((item) => item.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    res.json({
      ok: true,
      summary: buildPrivateAlbumSummary(workspace, viewer?.uid),
      items,
    });
  });

  app.post('/api/model/plans', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const body = (req.body || {}) as Record<string, unknown>;
    const name =
      typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
    const description =
      typeof body.description === 'string'
        ? body.description.trim().slice(0, 200)
        : '';
    if (!name || !description) {
      res.status(400).json({ ok: false, error: 'Nome e descrição obrigatórios.' });
      return;
    }
    const durationMinutes = Math.max(
      1,
      Math.min(240, Math.round(Number(body.durationMinutes) || 10))
    );
    const priceCents = Math.max(
      100,
      Math.min(100000000, Math.round(Number(body.priceCents) || 1000))
    );
    const sortOrder = Math.max(
      0,
      Math.min(100, Math.round(Number(body.sortOrder) || 1))
    );
    const active = body.active !== false;
    const nowMs = Date.now();
    const planId =
      typeof body.id === 'string' && body.id.trim()
        ? sanitizeId(body.id)
        : `plan_${nowMs}`;

    const idx = ctx.workspace.callPlans.findIndex((p) => p.id === planId);
    if (idx >= 0) {
      ctx.workspace.callPlans[idx] = {
        ...ctx.workspace.callPlans[idx],
        name,
        description,
        durationMinutes,
        priceCents,
        active,
        sortOrder,
        updatedAt: nowMs,
      };
    } else {
      ctx.workspace.callPlans.push({
        id: planId,
        name,
        description,
        durationMinutes,
        priceCents,
        currency: 'BRL',
        active,
        sortOrder,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }

    saveStore();
    emitWorkspaceRefresh(modelId, true);
    res.json({ ok: true, id: planId });
  });

  app.delete('/api/model/plans/:planId', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const planId = sanitizeId(req.params.planId);
    ctx.workspace.callPlans = ctx.workspace.callPlans.filter(
      (p) => p.id !== planId
    );
    saveStore();
    emitWorkspaceRefresh(modelId, true);
    res.json({ ok: true });
  });

  app.patch('/api/model/queue/:requestId', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const requestId = sanitizeId(req.params.requestId);
    const entry = ctx.workspace.callQueue.find((q) => q.id === requestId);
    if (!entry) return void res.status(404).json({ ok: false });

    const body = (req.body || {}) as Record<string, unknown>;
    if (
      typeof body.status === 'string' &&
      ['waiting', 'accepted', 'in_call', 'ended', 'rejected', 'cancelled'].includes(
        body.status
      )
    ) {
      if (body.status === 'accepted' || body.status === 'in_call') {
        const busyUid = getBusyVisitorUidInPrivateCall(
          modelId,
          ctx.workspace,
          entry.userId
        );
        if (busyUid) {
          res.status(409).json({
            ok: false,
            error:
              'Já existe um internauta em atendimento privativo. Encerre a chamada atual antes de conectar o próximo.',
          });
          return;
        }
      }
      entry.status = body.status as typeof entry.status;
      if (
        (body.status === 'ended' ||
          body.status === 'rejected' ||
          body.status === 'cancelled') &&
        (ctx.workspace.studioState.activeCallId === entry.id ||
          ctx.workspace.studioState.activeCallUserId === entry.userId)
      ) {
        ctx.workspace.studioState.activeCallId = '';
        ctx.workspace.studioState.activeCallUserId = '';
        ctx.workspace.studioState.activeCallUserName = '';
        ctx.workspace.studioState.updatedAt = Date.now();
      }
    }
    if (
      typeof body.paymentStatus === 'string' &&
      ['authorized', 'captured', 'refunded'].includes(body.paymentStatus)
    ) {
      entry.paymentStatus = body.paymentStatus as typeof entry.paymentStatus;
    }
    entry.updatedAt = Date.now();
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true });
  });

  app.delete('/api/model/queue/:requestId', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const requestId = sanitizeId(req.params.requestId);
    ctx.workspace.callQueue = ctx.workspace.callQueue.filter(
      (q) => q.id !== requestId
    );
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true });
  });

  app.post('/api/model/history', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const body = (req.body || {}) as Record<string, unknown>;
    const userId = sanitizeId(body.userId);
    const callId = sanitizeId(body.callId, `call_${Date.now()}`);
    if (!userId) return void res.status(400).json({ ok: false });

    const nowMs = Date.now();
    const id = `hist_${nowMs}_${userId.slice(0, 6)}`;
    ctx.workspace.callHistory.push({
      id,
      callId,
      userId,
      userName:
        typeof body.userName === 'string' && body.userName.trim()
          ? body.userName.trim().slice(0, 80)
          : 'Participante',
      modelUid: getModelActorUid(modelId),
      durationSeconds: Math.max(
        0,
        Math.min(86400, Math.round(Number(body.durationSeconds) || 0))
      ),
      amountCents: Math.max(
        0,
        Math.min(100000000, Math.round(Number(body.amountCents) || 0))
      ),
      currency: 'BRL',
      status: 'completed',
      ...(typeof body.planId === 'string' && body.planId
        ? { planId: body.planId.slice(0, 128) }
        : {}),
      ...(typeof body.planName === 'string' && body.planName
        ? { planName: body.planName.slice(0, 60) }
        : {}),
      ...(typeof body.planDurationMinutes === 'number'
        ? {
            planDurationMinutes: Math.max(
              1,
              Math.min(240, Math.round(body.planDurationMinutes))
            ),
          }
        : {}),
      endedAt: nowMs,
      createdAt: nowMs,
    });
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true, id });
  });

  app.patch('/api/model/history/:recordId', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const recordId = sanitizeId(req.params.recordId);
    const rec = ctx.workspace.callHistory.find((r) => r.id === recordId);
    if (!rec) return void res.status(404).json({ ok: false });

    const body = (req.body || {}) as Record<string, unknown>;
    if (typeof body.durationSeconds === 'number') {
      rec.durationSeconds = Math.max(
        0,
        Math.min(86400, Math.round(body.durationSeconds))
      );
    }
    if (typeof body.amountCents === 'number') {
      rec.amountCents = Math.max(
        0,
        Math.min(100000000, Math.round(body.amountCents))
      );
    }
    if (
      typeof body.status === 'string' &&
      ['completed', 'refunded'].includes(body.status)
    ) {
      rec.status = body.status as 'completed' | 'refunded';
    }
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true });
  });

  app.delete('/api/model/history/:recordId', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const recordId = sanitizeId(req.params.recordId);
    ctx.workspace.callHistory = ctx.workspace.callHistory.filter(
      (r) => r.id !== recordId
    );
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true });
  });

  app.patch('/api/model/interest/:messageId', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const messageId = sanitizeId(req.params.messageId);
    const msg = ctx.workspace.interestMessages.find((m) => m.id === messageId);
    if (!msg) return void res.status(404).json({ ok: false });
    const body = (req.body || {}) as Record<string, unknown>;
    if (
      typeof body.status === 'string' &&
      ['unread', 'reviewed', 'contacted'].includes(body.status)
    ) {
      msg.status = body.status as typeof msg.status;
      msg.updatedAt = Date.now();
    }
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true });
  });

  app.delete('/api/model/interest/:messageId', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const messageId = sanitizeId(req.params.messageId);
    ctx.workspace.interestMessages = ctx.workspace.interestMessages.filter(
      (m) => m.id !== messageId
    );
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true });
  });

  app.patch('/api/model/visitors/:visitorUid', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const visitorUid = sanitizeId(req.params.visitorUid);
    if (!visitorUid) return void res.status(400).json({ ok: false });
    const existing = ctx.workspace.visitorProfiles[visitorUid] || {
      uid: visitorUid,
      displayName: 'Participante',
      photoUrl: '',
      role: 'viewer' as const,
      accessStatus: 'active' as const,
      isOnline: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const body = (req.body || {}) as Record<string, unknown>;
    if (typeof body.displayName === 'string' && body.displayName.trim()) {
      existing.displayName = body.displayName.trim().slice(0, 80);
    }
    if (typeof body.photoUrl === 'string') {
      existing.photoUrl = sanitizeMediaUrl(body.photoUrl);
    }
    if (
      typeof body.accessStatus === 'string' &&
      ['active', 'vip', 'muted', 'blocked'].includes(body.accessStatus)
    ) {
      existing.accessStatus = body.accessStatus as typeof existing.accessStatus;
    }
    if (typeof body.notes === 'string') {
      existing.notes = body.notes.trim().slice(0, 300);
    }
    existing.updatedAt = Date.now();
    ctx.workspace.visitorProfiles[visitorUid] = existing;
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true });
  });

  app.delete('/api/model/visitors/:visitorUid', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const visitorUid = sanitizeId(req.params.visitorUid);
    delete ctx.workspace.visitorProfiles[visitorUid];
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true });
  });

  app.post('/api/model/messages', requireModelOperator, (req: AuthenticatedRequest, res) => {
    const modelId = req.resolvedModelId!;
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });
    const body = (req.body || {}) as Record<string, unknown>;
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : '';
    const callId = sanitizeId(body.callId, getModelRoomId(modelId));
    const recipientUid = sanitizeId(body.recipientUid, getModelRoomId(modelId));
    if (!text) return void res.status(400).json({ ok: false });

    const nowMs = Date.now();
    const id = `msg_${nowMs}_${modelId.slice(0, 6)}`;
    ctx.workspace.callMessages.push({
      id,
      callId,
      senderUid: getModelActorUid(modelId),
      senderName: ctx.workspace.studioConfig.modelName || ctx.model.displayName,
      senderRole: 'model',
      recipientUid,
      text,
      createdAt: nowMs,
    });
    if (ctx.workspace.callMessages.length > 500) {
      ctx.workspace.callMessages = ctx.workspace.callMessages.slice(-500);
    }
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true, id });
  });

  // ============================================================================
  // VISITOR-SCOPED ROUTES (Authenticated via Google Firebase ID Token)
  // ============================================================================
  app.get('/api/visitor/workspace', requireVisitor, (req: AuthenticatedRequest, res) => {
    const firebaseUser = req.firebaseUser!;
    const requestedModelId = sanitizeId(
      req.query.modelId,
      getDefaultActiveModelId()
    );
    const store = getStore();
    const modelId = store.models[requestedModelId]?.active
      ? requestedModelId
      : getDefaultActiveModelId();
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) {
      res.status(404).json({ ok: false, error: 'Estúdio indisponível.' });
      return;
    }

    const { model, workspace } = ctx;
    const nowMs = Date.now();
    const existingVisitor = workspace.visitorProfiles[firebaseUser.uid];
    const cleanName =
      (firebaseUser.name || 'Participante').trim().slice(0, 80) ||
      'Participante';
    const cleanPhoto = sanitizeMediaUrl(firebaseUser.picture || '');

    const visitorProfile = existingVisitor
      ? {
          ...existingVisitor,
          displayName: existingVisitor.displayName || cleanName,
          photoUrl: existingVisitor.photoUrl || cleanPhoto,
          isOnline: true,
          updatedAt: nowMs,
        }
      : {
          uid: firebaseUser.uid,
          displayName: cleanName,
          photoUrl: cleanPhoto,
          role: 'viewer' as const,
          accessStatus: 'active' as const,
          isOnline: true,
          createdAt: nowMs,
          updatedAt: nowMs,
        };
    workspace.visitorProfiles[firebaseUser.uid] = visitorProfile;
    saveStore();

    const actorUid = getModelActorUid(modelId);
    const roomId = getModelRoomId(modelId);
    const modelProfile = {
      uid: actorUid,
      displayName: workspace.studioConfig.modelName || model.displayName,
      photoUrl: workspace.studioConfig.modelAvatarUrl || '',
      role: 'model' as const,
      accessStatus: 'vip' as const,
      isOnline: Array.from(connectedPeers.values()).some(
        (p) => p.modelId === modelId && (p.isAdmin || p.uid === actorUid)
      ),
      notes: workspace.studioConfig.modelBio || '',
      createdAt: Date.parse(model.createdAt) || nowMs,
      updatedAt: nowMs,
    };

    const hasPaidPrivateAlbum = hasVisitorPaidPrivateAlbum(
      workspace,
      firebaseUser.uid
    );
    const unlockedPrivateItems =
      hasPaidPrivateAlbum && workspace.privateAlbumEnabled !== false
        ? [...(workspace.privateAlbumItems || [])]
            .filter((item) => item.active)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [];

    res.json({
      ok: true,
      modelId,
      myProfile: visitorProfile,
      modelProfile,
      studioState: workspace.studioState,
      studioConfig: sanitizePublicStudioConfig(workspace.studioConfig),
      galleryItems: workspace.galleryItems
        .filter((g) => g.active && (g.approvalStatus || 'approved') === 'approved')
        .sort((a, b) => a.sortOrder - b.sortOrder),
      privateAlbumSummary: buildPrivateAlbumSummary(workspace, firebaseUser.uid),
      unlockedPrivateItems,
      callPlans: workspace.callPlans
        .filter((p) => p.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      callQueue: workspace.callQueue
        .filter((q) => q.userId === firebaseUser.uid)
        .sort((a, b) => b.createdAt - a.createdAt),
      callHistory: workspace.callHistory
        .filter((h) => h.userId === firebaseUser.uid)
        .sort((a, b) => b.endedAt - a.endedAt),
      interestMessages: workspace.interestMessages
        .filter((m) => m.userId === firebaseUser.uid)
        .sort((a, b) => b.createdAt - a.createdAt),
      callMessages: workspace.callMessages
        .filter(
          (m) =>
            m.senderUid === firebaseUser.uid ||
            m.recipientUid === firebaseUser.uid ||
            m.recipientUid === roomId ||
            m.recipientUid === 'main_studio_room'
        )
        .sort((a, b) => a.createdAt - b.createdAt),
    });
  });

  app.post(
    '/api/visitor/models/:modelId/private-album/purchase',
    requireVisitor,
    (req: AuthenticatedRequest, res) => {
      const firebaseUser = req.firebaseUser!;
      const modelId = sanitizeId(req.params.modelId, getDefaultActiveModelId());
      const ctx = getModelAndWorkspace(modelId);
      if (!ctx || !ctx.model.active) {
        res.status(404).json({ ok: false, error: 'Modelo indisponível.' });
        return;
      }
      const { workspace } = ctx;
      if (workspace.privateAlbumEnabled === false) {
        res.status(403).json({
          ok: false,
          error: 'O álbum privativo desta modelo está temporariamente desativado.',
        });
        return;
      }

      const visitor = workspace.visitorProfiles[firebaseUser.uid];
      if (visitor?.accessStatus === 'blocked') {
        res.status(403).json({
          ok: false,
          error: 'Seu acesso a esta modelo está bloqueado.',
        });
        return;
      }

      const body = (req.body || {}) as { pixChargeId?: unknown };
      const alreadyPaid = hasVisitorPaidPrivateAlbum(workspace, firebaseUser.uid);
      if (!alreadyPaid) {
        const pixChargeId = sanitizeId(body.pixChargeId);
        const verifiedCharge = pixChargeId
          ? (workspace.pixCharges || []).find(
              (c) =>
                c.id === pixChargeId &&
                c.userId === firebaseUser.uid &&
                c.kind === 'private_album' &&
                c.status === 'paid'
            )
          : undefined;
        if (!verifiedCharge) {
          res.status(402).json({
            ok: false,
            error:
              'Pagamento verificado via PIX obrigatório antes de liberar o álbum privativo.',
          });
          return;
        }
        fulfillPixCharge(modelId, workspace, verifiedCharge);
        saveStore();
        emitWorkspaceRefresh(modelId, false);
      }

      const version = workspace.privateAlbumTokenVersion || 1;
      const albumToken = signPrivateAlbumToken(ctx.model.id, version);
      const items = (workspace.privateAlbumItems || [])
        .filter((item) => item.active)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      res.json({
        ok: true,
        albumToken,
        summary: buildPrivateAlbumSummary(workspace, firebaseUser.uid),
        items,
      });
    }
  );

  app.post(
    '/api/visitor/models/:modelId/tip',
    requireVisitor,
    (req: AuthenticatedRequest, res) => {
      const firebaseUser = req.firebaseUser!;
      const modelId = sanitizeId(req.params.modelId, getDefaultActiveModelId());
      const ctx = getModelAndWorkspace(modelId);
      if (!ctx || !ctx.model.active) {
        res.status(404).json({ ok: false, error: 'Profissional indisponível.' });
        return;
      }
      const { workspace } = ctx;
      const visitor = workspace.visitorProfiles[firebaseUser.uid];
      if (visitor?.accessStatus === 'blocked') {
        res.status(403).json({
          ok: false,
          error: 'Seu acesso a este perfil está bloqueado.',
        });
        return;
      }
      if (!workspace.studioState.tipGoalEnabled) {
        res.status(400).json({
          ok: false,
          error: 'A Meta de Gorjeta não está ativa no momento para este perfil.',
        });
        return;
      }

      const body = (req.body || {}) as { pixChargeId?: unknown };
      const pixChargeId = sanitizeId(body.pixChargeId);
      const verifiedCharge = pixChargeId
        ? (workspace.pixCharges || []).find(
            (c) =>
              c.id === pixChargeId &&
              c.userId === firebaseUser.uid &&
              c.kind === 'tip' &&
              c.status === 'paid'
          )
        : undefined;
      if (!verifiedCharge) {
        res.status(402).json({
          ok: false,
          error:
            'Envie a gorjeta gerando e confirmando um pagamento PIX verificado.',
        });
        return;
      }

      fulfillPixCharge(modelId, workspace, verifiedCharge);
      saveStore();
      emitWorkspaceRefresh(modelId, true);

      res.json({
        ok: true,
        studioState: workspace.studioState,
      });
    }
  );

  app.post('/api/visitor/queue', requireVisitor, (req: AuthenticatedRequest, res) => {
    const firebaseUser = req.firebaseUser!;
    const body = (req.body || {}) as Record<string, unknown>;
    const modelId = sanitizeId(body.modelId, getDefaultActiveModelId());
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx || !ctx.model.active) {
      res.status(404).json({ ok: false, error: 'Modelo indisponível.' });
      return;
    }
    const { workspace } = ctx;
    const visitor = workspace.visitorProfiles[firebaseUser.uid];
    if (visitor?.accessStatus === 'blocked') {
      res.status(403).json({
        ok: false,
        error: 'Seu acesso a esta modelo está bloqueado pela moderação.',
      });
      return;
    }
    if (
      workspace.studioState.dndActive ||
      (workspace.studioState.dndUntilMs &&
        workspace.studioState.dndUntilMs > Date.now())
    ) {
      res.status(409).json({
        ok: false,
        error: 'A modelo está em Modo Não Perturbe.',
      });
      return;
    }
    const planId = sanitizeId(body.planId);
    const plan = workspace.callPlans.find((p) => p.id === planId && p.active);
    if (!plan) {
      res.status(400).json({ ok: false, error: 'Plano selecionado inválido.' });
      return;
    }

    const pixChargeId = sanitizeId(body.pixChargeId);
    const verifiedCharge = pixChargeId
      ? (workspace.pixCharges || []).find(
          (c) =>
            c.id === pixChargeId &&
            c.userId === firebaseUser.uid &&
            c.kind === 'call_plan' &&
            c.planId === plan.id &&
            c.status === 'paid'
        )
      : undefined;
    if (!verifiedCharge) {
      res.status(402).json({
        ok: false,
        error:
          'Pagamento verificado via PIX obrigatório antes de entrar na fila da sala privativa.',
      });
      return;
    }

    const fulfilled = fulfillPixCharge(modelId, workspace, verifiedCharge);
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.status(201).json({ ok: true, id: fulfilled.callRequestId });
  });

  app.patch('/api/visitor/queue/:requestId', requireVisitor, (req: AuthenticatedRequest, res) => {
    const firebaseUser = req.firebaseUser!;
    const body = (req.body || {}) as Record<string, unknown>;
    const modelId = sanitizeId(body.modelId, getDefaultActiveModelId());
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });

    const requestId = sanitizeId(req.params.requestId);
    const entry = ctx.workspace.callQueue.find(
      (q) => q.id === requestId && q.userId === firebaseUser.uid
    );
    if (!entry) return void res.status(404).json({ ok: false });

    const nextStatus = typeof body.status === 'string' ? body.status : '';
    const allowed =
      (entry.status === 'waiting' && nextStatus === 'cancelled') ||
      (entry.status === 'accepted' && nextStatus === 'in_call') ||
      (entry.status === 'in_call' && nextStatus === 'ended');
    if (!allowed) {
      res.status(403).json({
        ok: false,
        error:
          'Aguarde a modelo liberar sua entrada privativa antes de iniciar o vídeo.',
      });
      return;
    }

    if (nextStatus === 'in_call') {
      const busyUid = getBusyVisitorUidInPrivateCall(
        modelId,
        ctx.workspace,
        firebaseUser.uid
      );
      if (busyUid) {
        res.status(409).json({
          ok: false,
          error:
            'A modelo já está em sala privativa com outro internauta. Aguarde sua vez na fila.',
        });
        return;
      }
    }

    entry.status = nextStatus as typeof entry.status;
    entry.updatedAt = Date.now();
    if (
      (nextStatus === 'ended' || nextStatus === 'cancelled') &&
      (ctx.workspace.studioState.activeCallId === entry.id ||
        ctx.workspace.studioState.activeCallUserId === firebaseUser.uid)
    ) {
      ctx.workspace.studioState.activeCallId = '';
      ctx.workspace.studioState.activeCallUserId = '';
      ctx.workspace.studioState.activeCallUserName = '';
      ctx.workspace.studioState.updatedAt = Date.now();
    }
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true });
  });

  app.post('/api/visitor/interest', requireVisitor, (req: AuthenticatedRequest, res) => {
    const firebaseUser = req.firebaseUser!;
    const body = (req.body || {}) as Record<string, unknown>;
    const modelId = sanitizeId(body.modelId, getDefaultActiveModelId());
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx || !ctx.model.active) return void res.status(404).json({ ok: false });

    const visitor = ctx.workspace.visitorProfiles[firebaseUser.uid];
    if (visitor?.accessStatus === 'blocked') {
      res.status(403).json({ ok: false, error: 'Acesso bloqueado.' });
      return;
    }
    const message =
      typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
    if (!message) return void res.status(400).json({ ok: false });
    const preferredTime =
      typeof body.preferredTime === 'string' && body.preferredTime.trim()
        ? body.preferredTime.trim().slice(0, 80)
        : 'Qualquer horário';

    const nowMs = Date.now();
    const id = `int_${nowMs}_${firebaseUser.uid.slice(0, 8)}`;
    ctx.workspace.interestMessages.push({
      id,
      userId: firebaseUser.uid,
      userName: visitor?.displayName || firebaseUser.name || 'Participante',
      userPhotoUrl: visitor?.photoUrl || sanitizeMediaUrl(firebaseUser.picture),
      preferredTime,
      message,
      status: 'unread',
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.status(201).json({ ok: true, id });
  });

  app.post('/api/visitor/history/:recordId/rating', requireVisitor, (req: AuthenticatedRequest, res) => {
    const firebaseUser = req.firebaseUser!;
    const body = (req.body || {}) as Record<string, unknown>;
    const modelId = sanitizeId(body.modelId, getDefaultActiveModelId());
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx) return void res.status(404).json({ ok: false });

    const recordId = sanitizeId(req.params.recordId);
    const rec = ctx.workspace.callHistory.find(
      (r) => r.id === recordId && r.userId === firebaseUser.uid
    );
    if (!rec) return void res.status(404).json({ ok: false });
    if (rec.rating !== undefined) {
      res.status(409).json({ ok: false, error: 'Chamada já avaliada.' });
      return;
    }

    const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating) || 5)));
    const ratingComment =
      typeof body.comment === 'string'
        ? body.comment.trim().slice(0, 300)
        : undefined;
    rec.rating = rating;
    if (ratingComment) rec.ratingComment = ratingComment;
    rec.ratedAt = Date.now();

    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true });
  });

  app.post('/api/visitor/messages', requireVisitor, (req: AuthenticatedRequest, res) => {
    const firebaseUser = req.firebaseUser!;
    const body = (req.body || {}) as Record<string, unknown>;
    const modelId = sanitizeId(body.modelId, getDefaultActiveModelId());
    const ctx = getModelAndWorkspace(modelId);
    if (!ctx || !ctx.model.active) return void res.status(404).json({ ok: false });

    const visitor = ctx.workspace.visitorProfiles[firebaseUser.uid];
    if (
      visitor?.accessStatus === 'blocked' ||
      visitor?.accessStatus === 'muted'
    ) {
      res.status(403).json({ ok: false, error: 'Chat silenciado pela moderação.' });
      return;
    }

    const text =
      typeof body.text === 'string' ? body.text.trim().slice(0, 500) : '';
    if (!text) return void res.status(400).json({ ok: false });

    const roomId = getModelRoomId(modelId);
    const callId = sanitizeId(body.callId, roomId);
    const recipientUid = sanitizeId(body.recipientUid, roomId);
    const nowMs = Date.now();
    const id = `msg_${nowMs}_${firebaseUser.uid.slice(0, 6)}`;

    ctx.workspace.callMessages.push({
      id,
      callId,
      senderUid: firebaseUser.uid,
      senderName: visitor?.displayName || firebaseUser.name || 'Participante',
      senderRole: 'viewer',
      recipientUid,
      text,
      createdAt: nowMs,
    });
    if (ctx.workspace.callMessages.length > 500) {
      ctx.workspace.callMessages = ctx.workspace.callMessages.slice(-500);
    }
    saveStore();
    emitWorkspaceRefresh(modelId, false);
    res.json({ ok: true, id });
  });

  // ============================================================================
  // PIX PAYMENT CHARGES, QR CODE & BR CODE ROUTES
  // ============================================================================
  app.post(
    '/api/visitor/pix/charges',
    requireVisitor,
    async (req: AuthenticatedRequest, res) => {
      const firebaseUser = req.firebaseUser!;
      const body = (req.body || {}) as Record<string, unknown>;
      const modelId = sanitizeId(body.modelId, getDefaultActiveModelId());
      const ctx = getModelAndWorkspace(modelId);
      if (!ctx || !ctx.model.active) {
        res.status(404).json({ ok: false, error: 'Profissional indisponível.' });
        return;
      }

      const { workspace } = ctx;
      const visitor = workspace.visitorProfiles[firebaseUser.uid];
      if (visitor?.accessStatus === 'blocked') {
        res.status(403).json({
          ok: false,
          error: 'Seu acesso a esta modelo está bloqueado.',
        });
        return;
      }

      const kind =
        body.kind === 'private_album' ||
        body.kind === 'tip' ||
        body.kind === 'call_plan'
          ? body.kind
          : null;
      if (!kind) {
        res.status(400).json({ ok: false, error: 'Tipo de cobrança PIX inválido.' });
        return;
      }

      let amountCents = 0;
      let description = '';
      let planId: string | undefined;
      let planName: string | undefined;
      let planDurationMinutes: number | undefined;
      let topic: string | undefined;
      let callMode: 'group' | 'private' | undefined;
      let note: string | undefined;

      if (kind === 'private_album') {
        if (workspace.privateAlbumEnabled === false) {
          res.status(403).json({
            ok: false,
            error: 'O álbum privativo desta modelo está temporariamente desativado.',
          });
          return;
        }
        amountCents =
          typeof workspace.privateAlbumPriceCents === 'number' &&
          workspace.privateAlbumPriceCents >= 500
            ? workspace.privateAlbumPriceCents
            : 3900;
        description = `Album Privado ${workspace.studioConfig.modelName}`;
      } else if (kind === 'tip') {
        if (!workspace.studioState.tipGoalEnabled) {
          res.status(400).json({
            ok: false,
            error: 'A Meta de Gorjeta não está ativa para este perfil.',
          });
          return;
        }
        const rawTip = Number(body.amountCents);
        if (!Number.isFinite(rawTip) || rawTip < 500 || rawTip > 10000000) {
          res.status(400).json({
            ok: false,
            error: 'Informe uma gorjeta entre R$ 5,00 e R$ 100.000,00.',
          });
          return;
        }
        amountCents = Math.round(rawTip);
        note =
          typeof body.note === 'string'
            ? body.note.trim().slice(0, 120)
            : typeof body.message === 'string'
              ? body.message.trim().slice(0, 120)
              : undefined;
        description = `Gorjeta ${workspace.studioConfig.modelName}`;
      } else {
        if (
          workspace.studioState.dndActive ||
          (workspace.studioState.dndUntilMs &&
            workspace.studioState.dndUntilMs > Date.now())
        ) {
          res.status(409).json({
            ok: false,
            error: 'A modelo está em Modo Não Perturbe.',
          });
          return;
        }
        if (workspace.studioState.callMode === 'paused') {
          res.status(409).json({
            ok: false,
            error: 'A sala de videochamada está temporariamente pausada.',
          });
          return;
        }
        planId = sanitizeId(body.planId);
        const plan = workspace.callPlans.find((p) => p.id === planId && p.active);
        if (!plan) {
          res.status(400).json({ ok: false, error: 'Plano selecionado inválido.' });
          return;
        }
        amountCents = plan.priceCents;
        planName = plan.name;
        planDurationMinutes = plan.durationMinutes;
        callMode = 'private';
        topic =
          typeof body.topic === 'string' && body.topic.trim()
            ? body.topic.trim().slice(0, 160)
            : `${plan.name} · PIX`;
        description = `${plan.name} ${workspace.studioConfig.modelName}`;
      }

      const inviteId = sanitizeId(body.inviteId);
      const nowMs = Date.now();
      const buyerName =
        visitor?.displayName ||
        firebaseUser.name ||
        firebaseUser.email?.split('@')[0] ||
        'Internauta';

      const rawPreferred =
        typeof body.preferredPaymentMethod === 'string'
          ? body.preferredPaymentMethod.trim()
          : 'pix';
      const preferredPaymentMethod: MercadoPagoPreferredMethod =
        rawPreferred === 'credit_card' ||
        rawPreferred === 'debit_card' ||
        rawPreferred === 'account_money' ||
        rawPreferred === 'ticket'
          ? rawPreferred
          : 'pix';

      const defaultDueDays =
        typeof workspace.studioConfig.pixDefaultDueDays === 'number' &&
        Number.isFinite(workspace.studioConfig.pixDefaultDueDays)
          ? Math.max(0, Math.min(90, Math.round(workspace.studioConfig.pixDefaultDueDays)))
          : 0;
      const defaultFinePercent =
        typeof workspace.studioConfig.pixFinePercent === 'number' &&
        Number.isFinite(workspace.studioConfig.pixFinePercent)
          ? workspace.studioConfig.pixFinePercent
          : 2;
      const defaultInterestPercent =
        typeof workspace.studioConfig.pixInterestMonthlyPercent === 'number' &&
        Number.isFinite(workspace.studioConfig.pixInterestMonthlyPercent)
          ? workspace.studioConfig.pixInterestMonthlyPercent
          : 1;

      const resolvedDueDate =
        defaultDueDays > 0
          ? getTodayBrtDateString(defaultDueDays, nowMs)
          : undefined;
      const feeCalc = calculatePixChargeWithFees({
        originalAmountCents: amountCents,
        dueDate: resolvedDueDate,
        finePercent: defaultFinePercent,
        interestMonthlyPercent: defaultInterestPercent,
        referenceNowMs: nowMs,
      });

      const chargeExpiresAtMs = feeCalc.dueAtMs
        ? Math.min(
            nowMs + 29 * 24 * 60 * 60 * 1000,
            Math.max(nowMs + 30 * 60 * 1000, feeCalc.dueAtMs + 5 * 24 * 60 * 60 * 1000)
          )
        : nowMs + 30 * 60 * 1000;

      const id = `pix_${nowMs}_${crypto.randomBytes(3).toString('hex')}`;
      const txid = sanitizePixTxid(`MA${nowMs.toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`);

      try {
        const assets = await generatePixChargeAssets({
          modelId,
          configuredPixKey: workspace.studioConfig.pixKey,
          configuredPixKeyType: workspace.studioConfig.pixKeyType,
          merchantName:
            workspace.studioConfig.pixMerchantName ||
            workspace.studioConfig.modelName ||
            ctx.model.displayName,
          merchantCity: workspace.studioConfig.pixMerchantCity || 'SAO PAULO',
          amountCents: feeCalc.totalAmountCents,
          txid,
          description,
          payerEmail: firebaseUser.email,
          payerName: buyerName,
          preferredPaymentMethod,
          publicOrigin: resolvePublicOriginFromRequest(req),
          expiresAtMs: chargeExpiresAtMs,
        });

        const charge: StoredPixCharge = {
          id,
          txid: assets.txid,
          modelId,
          userId: firebaseUser.uid,
          userName: buyerName,
          kind,
          amountCents: feeCalc.totalAmountCents,
          originalAmountCents: feeCalc.originalAmountCents,
          ...(feeCalc.dueDate ? { dueDate: feeCalc.dueDate } : {}),
          ...(feeCalc.dueAtMs !== undefined ? { dueAtMs: feeCalc.dueAtMs } : {}),
          finePercent: feeCalc.finePercent,
          interestMonthlyPercent: feeCalc.interestMonthlyPercent,
          fineCents: feeCalc.fineCents,
          interestCents: feeCalc.interestCents,
          daysOverdue: feeCalc.daysOverdue,
          description,
          ...(planId ? { planId } : {}),
          ...(planName ? { planName } : {}),
          ...(planDurationMinutes !== undefined ? { planDurationMinutes } : {}),
          ...(topic ? { topic } : {}),
          ...(callMode ? { callMode } : {}),
          ...(note ? { note } : {}),
          ...(inviteId ? { inviteId } : {}),
          status: 'pending',
          approvalStatus: 'pendente',
          provider: assets.provider,
          preferredPaymentMethod: assets.preferredPaymentMethod,
          ...(assets.externalPaymentId
            ? { externalPaymentId: assets.externalPaymentId }
            : {}),
          ...(assets.checkoutUrl ? { checkoutUrl: assets.checkoutUrl } : {}),
          brCode: assets.brCode,
          qrCodeDataUrl: assets.qrCodeDataUrl,
          pixKeyUsed: assets.pixKeyUsed,
          pixKeyTypeUsed: assets.pixKeyTypeUsed,
          merchantName: assets.merchantName,
          merchantCity: assets.merchantCity,
          usingDemoKey: assets.usingDemoKey,
          createdAt: nowMs,
          expiresAt: chargeExpiresAtMs,
        };

        if (!Array.isArray(workspace.pixCharges)) {
          workspace.pixCharges = [];
        }
        workspace.pixCharges.push(charge);
        if (workspace.pixCharges.length > 250) {
          workspace.pixCharges = workspace.pixCharges.slice(-250);
        }
        saveStore();
        emitWorkspaceRefresh(modelId, false);

        res.status(201).json({
          ok: true,
          charge: serializePixChargeForClient(charge),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.startsWith('MERCADOPAGO_TOKEN_REQUIRED:')) {
          res.status(400).json({
            ok: false,
            requiresMercadoPagoToken: true,
            error: msg.replace('MERCADOPAGO_TOKEN_REQUIRED: ', ''),
          });
          return;
        }
        if (msg.startsWith('MERCADOPAGO_PREFERENCE_FAILED:')) {
          res.status(502).json({
            ok: false,
            requiresMercadoPagoToken: true,
            error: msg.replace('MERCADOPAGO_PREFERENCE_FAILED: ', ''),
          });
          return;
        }
        console.error('Erro ao gerar cobrança Mercado Pago / PIX:', err);
        res.status(500).json({
          ok: false,
          error: 'Não foi possível gerar o QR Code PIX neste momento.',
        });
      }
    }
  );

  app.post(
    '/api/visitor/pix/reconcile',
    requireVisitor,
    async (req: AuthenticatedRequest, res) => {
      const firebaseUser = req.firebaseUser!;
      const body = (req.body || {}) as Record<string, unknown>;
      const ref = typeof body.ref === 'string' ? sanitizePixTxid(body.ref) : '';
      if (!isMercadoPagoConfigured()) {
        res.json({ ok: true, reconciledCount: 0 });
        return;
      }

      const store = getStore();
      let reconciledCount = 0;
      for (const model of Object.values(store.models)) {
        if (!model.active) continue;
        const workspace = store.workspaces[model.id];
        if (!workspace || !Array.isArray(workspace.pixCharges)) continue;
        const targets = workspace.pixCharges.filter(
          (c) =>
            c.userId === firebaseUser.uid &&
            c.status === 'pending' &&
            c.expiresAt > Date.now() &&
            (!ref || c.txid === ref)
        );
        for (const charge of targets.slice(-5)) {
          await withPaymentVerificationLock(`charge:${charge.txid}`, async () => {
            if (charge.status !== 'pending') return;
            const verification = await verifyMercadoPagoChargeByReferenceOrId({
              paymentId: charge.externalPaymentId,
              externalReference: charge.txid,
            });
            if (verification.status === 'approved') {
              const applied = applyApprovedMercadoPagoVerification({
                modelId: model.id,
                workspace,
                charge,
                verifiedPaymentId: verification.verifiedPaymentId,
                paymentMethodId: verification.paymentMethodId,
                transactionAmount: verification.transactionAmount,
                currencyId: verification.currencyId,
              });
              if (applied.newlyPaid) {
                reconciledCount += 1;
              }
            }
          });
        }
      }
      res.json({ ok: true, reconciledCount });
    }
  );

  app.get(
    '/api/visitor/pix/charges/:chargeId',
    requireVisitor,
    async (req: AuthenticatedRequest, res) => {
      const firebaseUser = req.firebaseUser!;
      const modelId = sanitizeId(req.query.modelId, getDefaultActiveModelId());
      const chargeId = sanitizeId(req.params.chargeId);
      const ctx = getModelAndWorkspace(modelId);
      if (!ctx) {
        res.status(404).json({ ok: false, error: 'Estúdio não encontrado.' });
        return;
      }
      const { workspace } = ctx;
      const charge = (workspace.pixCharges || []).find(
        (c) => c.id === chargeId && c.userId === firebaseUser.uid
      );
      if (!charge) {
        res.status(404).json({ ok: false, error: 'Cobrança PIX não encontrada.' });
        return;
      }

      let fulfillment: ReturnType<typeof fulfillPixCharge> | null = null;

      await withPaymentVerificationLock(`charge:${charge.txid}`, async () => {
        const nowMs = Date.now();
        if (charge.status === 'pending' && charge.expiresAt <= nowMs) {
          charge.status = 'expired';
          charge.approvalStatus = 'expirado';
          saveStore();
          emitWorkspaceRefresh(modelId, false);
        } else if (
          charge.status === 'pending' &&
          (charge.provider === 'mercadopago' || isMercadoPagoConfigured())
        ) {
          const verification = await verifyMercadoPagoChargeByReferenceOrId({
            paymentId: charge.externalPaymentId,
            externalReference: charge.txid,
          });
          if (verification.status === 'approved') {
            const applied = applyApprovedMercadoPagoVerification({
              modelId,
              workspace,
              charge,
              verifiedPaymentId: verification.verifiedPaymentId,
              paymentMethodId: verification.paymentMethodId,
              transactionAmount: verification.transactionAmount,
              currencyId: verification.currencyId,
              mercadoPagoStatus: verification.rawStatus || 'approved',
            });
            fulfillment = applied.fulfillment;
          } else if (
            (verification.status === 'cancelled' ||
              verification.status === 'rejected') &&
            charge.externalPaymentId &&
            verification.verifiedPaymentId === charge.externalPaymentId
          ) {
            charge.status = 'cancelled';
            charge.approvalStatus =
              verification.status === 'rejected' ? 'rejeitado' : 'cancelado';
            charge.mercadoPagoStatus =
              verification.rawStatus || verification.status;
            saveStore();
            emitWorkspaceRefresh(modelId, false);
          } else {
            await refreshOverduePixChargeIfNeeded(
              modelId,
              workspace,
              charge,
              resolvePublicOriginFromRequest(req)
            ).catch(() => false);
          }
        } else if (charge.status === 'pending') {
          await refreshOverduePixChargeIfNeeded(
            modelId,
            workspace,
            charge,
            resolvePublicOriginFromRequest(req)
          ).catch(() => false);
        } else if (charge.status === 'paid') {
          fulfillment = fulfillPixCharge(modelId, workspace, charge);
        }
      });

      res.json({
        ok: true,
        charge: serializePixChargeForClient(charge),
        ...(fulfillment || {}),
      });
    }
  );

  app.post(
    '/api/visitor/pix/charges/:chargeId/confirm',
    requireVisitor,
    async (req: AuthenticatedRequest, res) => {
      const firebaseUser = req.firebaseUser!;
      const body = (req.body || {}) as Record<string, unknown>;
      const modelId = sanitizeId(
        body.modelId || req.query.modelId,
        getDefaultActiveModelId()
      );
      const chargeId = sanitizeId(req.params.chargeId);
      const ctx = getModelAndWorkspace(modelId);
      if (!ctx) {
        res.status(404).json({ ok: false, error: 'Estúdio não encontrado.' });
        return;
      }
      const { workspace } = ctx;
      const charge = (workspace.pixCharges || []).find(
        (c) => c.id === chargeId && c.userId === firebaseUser.uid
      );
      if (!charge) {
        res.status(404).json({ ok: false, error: 'Cobrança PIX não encontrada.' });
        return;
      }

      if (charge.status === 'cancelled') {
        res.status(409).json({
          ok: false,
          error: 'Esta cobrança PIX foi cancelada.',
        });
        return;
      }
      if (charge.status === 'expired' || charge.expiresAt <= Date.now()) {
        charge.status = 'expired';
        charge.approvalStatus = 'expirado';
        saveStore();
        res.status(410).json({
          ok: false,
          error: 'O QR Code PIX expirou. Gere um novo código para pagar.',
        });
        return;
      }

      const result = await withPaymentVerificationLock(
        `charge:${charge.txid}`,
        async () => {
          if (charge.status !== 'paid') {
            if (charge.provider === 'mercadopago' || isMercadoPagoConfigured()) {
              const verification = await verifyMercadoPagoChargeByReferenceOrId({
                paymentId: charge.externalPaymentId,
                externalReference: charge.txid,
              });
              if (verification.status !== 'approved') {
                await refreshOverduePixChargeIfNeeded(
                  modelId,
                  workspace,
                  charge,
                  resolvePublicOriginFromRequest(req)
                ).catch(() => false);
                return { kind: 'pending_mp' as const };
              }
              const applied = applyApprovedMercadoPagoVerification({
                modelId,
                workspace,
                charge,
                verifiedPaymentId: verification.verifiedPaymentId,
                paymentMethodId: verification.paymentMethodId,
                transactionAmount: verification.transactionAmount,
                currencyId: verification.currencyId,
              });
              if (applied.amountMismatch || !applied.ok) {
                return { kind: 'amount_mismatch' as const };
              }
              return { kind: 'paid' as const, fulfillment: applied.fulfillment };
            }

            // Static BACEN key cannot be self-verified by the payer; notify the model's private panel to confirm receipt
            await refreshOverduePixChargeIfNeeded(
              modelId,
              workspace,
              charge,
              resolvePublicOriginFromRequest(req)
            ).catch(() => false);
            charge.visitorReportedPaidAt = Date.now();
            saveStore();
            emitWorkspaceRefresh(modelId, false);
            return { kind: 'pending_manual' as const };
          }

          return {
            kind: 'paid' as const,
            fulfillment: fulfillPixCharge(modelId, workspace, charge),
          };
        }
      );

      if (result.kind === 'pending_mp') {
        res.status(202).json({
          ok: false,
          pending: true,
          charge: serializePixChargeForClient(charge),
          error:
            'Pagamento ainda aguardando compensação no Mercado Pago. Se já concluiu o PIX ou Checkout, aguarde alguns segundos e tente confirmar novamente.',
        });
        return;
      }
      if (result.kind === 'amount_mismatch') {
        res.status(409).json({
          ok: false,
          charge: serializePixChargeForClient(charge),
          error:
            'Valor ou moeda divergente da cobrança gerada no estúdio. Entre em contato com a modelo.',
        });
        return;
      }
      if (result.kind === 'pending_manual') {
        res.status(202).json({
          ok: false,
          pending: true,
          charge: serializePixChargeForClient(charge),
          error:
            'Pagamento sinalizado! A modelo recebeu seu aviso e liberará seu acesso assim que confirmar o PIX no painel privativo dela.',
        });
        return;
      }

      res.json({
        ok: true,
        charge: serializePixChargeForClient(charge),
        ...(result.fulfillment || {}),
      });
    }
  );

  app.post(
    '/api/visitor/pix/charges/:chargeId/cancel',
    requireVisitor,
    (req: AuthenticatedRequest, res) => {
      const firebaseUser = req.firebaseUser!;
      const body = (req.body || {}) as Record<string, unknown>;
      const modelId = sanitizeId(
        body.modelId || req.query.modelId,
        getDefaultActiveModelId()
      );
      const chargeId = sanitizeId(req.params.chargeId);
      const ctx = getModelAndWorkspace(modelId);
      if (!ctx) return void res.status(404).json({ ok: false });
      const charge = (ctx.workspace.pixCharges || []).find(
        (c) => c.id === chargeId && c.userId === firebaseUser.uid
      );
      if (!charge) return void res.status(404).json({ ok: false });
      if (charge.status === 'pending') {
        charge.status = 'cancelled';
        charge.approvalStatus = 'cancelado';
        saveStore();
        emitWorkspaceRefresh(modelId, false);
      }
      res.json({ ok: true, charge: serializePixChargeForClient(charge) });
    }
  );

  app.post(
    '/api/model/pix/charges/:chargeId/confirm',
    requireModelOperator,
    (req: AuthenticatedRequest, res) => {
      const modelId = req.resolvedModelId!;
      const ctx = getModelAndWorkspace(modelId);
      if (!ctx) return void res.status(404).json({ ok: false });
      const chargeId = sanitizeId(req.params.chargeId);
      const charge = (ctx.workspace.pixCharges || []).find(
        (c) => c.id === chargeId
      );
      if (!charge) {
        res.status(404).json({ ok: false, error: 'Cobrança PIX não encontrada.' });
        return;
      }
      if (charge.status === 'cancelled') {
        res.status(409).json({
          ok: false,
          error: 'Esta cobrança PIX foi cancelada.',
        });
        return;
      }
      if (
        charge.status === 'expired' ||
        (charge.status === 'pending' && charge.expiresAt <= Date.now())
      ) {
        charge.status = 'expired';
        charge.approvalStatus = 'expirado';
        saveStore();
        res.status(410).json({
          ok: false,
          error:
            'Este QR Code PIX já expirou. Solicite um novo pagamento ao internauta.',
        });
        return;
      }
      const fulfillment = fulfillPixCharge(modelId, ctx.workspace, charge);
      saveStore();
      emitWorkspaceRefresh(modelId, charge.kind === 'tip');
      if (charge.kind === 'call_plan') {
        broadcastQueueSyncForModel(modelId);
      }
      sendToUserInModel(modelId, charge.userId, {
        type: 'pix:charge_paid',
        modelId,
        chargeId: charge.id,
        kind: charge.kind,
        approvalStatus: charge.approvalStatus,
        ...(fulfillment.callRequestId
          ? { callRequestId: fulfillment.callRequestId }
          : {}),
      });
      res.json({
        ok: true,
        charge: serializePixChargeForClient(charge),
        ...fulfillment,
      });
    }
  );

  app.post(
    '/api/model/pix/charges/:chargeId/cancel',
    requireModelOperator,
    (req: AuthenticatedRequest, res) => {
      const modelId = req.resolvedModelId!;
      const ctx = getModelAndWorkspace(modelId);
      if (!ctx) return void res.status(404).json({ ok: false });
      const chargeId = sanitizeId(req.params.chargeId);
      const charge = (ctx.workspace.pixCharges || []).find(
        (c) => c.id === chargeId
      );
      if (!charge) {
        res.status(404).json({ ok: false, error: 'Cobrança PIX não encontrada.' });
        return;
      }
      if (charge.status === 'pending') {
        charge.status = 'cancelled';
        charge.approvalStatus = 'cancelado';
        saveStore();
        emitWorkspaceRefresh(modelId, false);
      }
      res.json({ ok: true, charge: serializePixChargeForClient(charge) });
    }
  );

  app.post(
    '/api/model/pix/charges',
    requireModelOperator,
    async (req: AuthenticatedRequest, res) => {
      const modelId = req.resolvedModelId!;
      const ctx = getModelAndWorkspace(modelId);
      if (!ctx) {
        res.status(404).json({ ok: false, error: 'Estúdio não encontrado.' });
        return;
      }

      const { model, workspace } = ctx;
      const body = (req.body || {}) as Record<string, unknown>;
      const rawAmount = Number(body.amountCents);
      if (!Number.isFinite(rawAmount) || rawAmount < 500 || rawAmount > 10000000) {
        res.status(400).json({
          ok: false,
          error: 'Informe um valor entre R$ 5,00 e R$ 100.000,00.',
        });
        return;
      }

      const originalAmountCents = Math.round(rawAmount);
      const description =
        typeof body.description === 'string' && body.description.trim()
          ? body.description.trim().slice(0, 120)
          : `Cobrança PIX · ${workspace.studioConfig.modelName || model.displayName}`;
      const recipientName =
        typeof body.recipientName === 'string' && body.recipientName.trim()
          ? body.recipientName.trim().slice(0, 80)
          : 'Cliente Avulso';

      const defaultFine =
        typeof workspace.studioConfig.pixFinePercent === 'number' &&
        Number.isFinite(workspace.studioConfig.pixFinePercent)
          ? workspace.studioConfig.pixFinePercent
          : 2;
      const defaultInterest =
        typeof workspace.studioConfig.pixInterestMonthlyPercent === 'number' &&
        Number.isFinite(workspace.studioConfig.pixInterestMonthlyPercent)
          ? workspace.studioConfig.pixInterestMonthlyPercent
          : 1;

      const finePercent =
        typeof body.finePercent === 'number' && Number.isFinite(body.finePercent)
          ? Math.max(0, Math.min(10, Number(body.finePercent.toFixed(2))))
          : defaultFine;
      const interestMonthlyPercent =
        typeof body.interestMonthlyPercent === 'number' &&
        Number.isFinite(body.interestMonthlyPercent)
          ? Math.max(0, Math.min(10, Number(body.interestMonthlyPercent.toFixed(2))))
          : defaultInterest;

      const nowMs = Date.now();
      const parsedDue = normalizeDueDateString(body.dueDate);
      if (typeof body.dueDate === 'string' && body.dueDate.trim() && !parsedDue) {
        res.status(400).json({
          ok: false,
          error: 'Data de vencimento inválida. Utilize o formato AAAA-MM-DD.',
        });
        return;
      }

      const defaultDueDays =
        typeof workspace.studioConfig.pixDefaultDueDays === 'number' &&
        Number.isFinite(workspace.studioConfig.pixDefaultDueDays)
          ? workspace.studioConfig.pixDefaultDueDays
          : 0;
      const dueDate = parsedDue || getTodayBrtDateString(defaultDueDays, nowMs);

      const calc = calculatePixChargeWithFees({
        originalAmountCents,
        dueDate,
        finePercent,
        interestMonthlyPercent,
        referenceNowMs: nowMs,
      });

      const rawGraceDays = Number(body.expiresAfterDueDays);
      const graceDays =
        Number.isFinite(rawGraceDays) && rawGraceDays >= 1
          ? Math.min(28, Math.round(rawGraceDays))
          : 7;

      const minValidUntilMs = nowMs + 24 * 60 * 60 * 1000;
      const targetAnchorMs = calc.dueAtMs ? Math.max(nowMs, calc.dueAtMs) : nowMs;
      const maxMpValidMs = nowMs + 29 * 24 * 60 * 60 * 1000;
      const chargeExpiresAtMs = Math.min(
        maxMpValidMs,
        Math.max(minValidUntilMs, targetAnchorMs + graceDays * 24 * 60 * 60 * 1000)
      );

      const id = `pix_${nowMs}_${crypto.randomBytes(3).toString('hex')}`;
      const txid = sanitizePixTxid(
        `MD${nowMs.toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`
      );

      try {
        const assets = await generatePixChargeAssets({
          modelId,
          configuredPixKey: workspace.studioConfig.pixKey,
          configuredPixKeyType: workspace.studioConfig.pixKeyType,
          merchantName:
            workspace.studioConfig.pixMerchantName ||
            workspace.studioConfig.modelName ||
            model.displayName,
          merchantCity: workspace.studioConfig.pixMerchantCity || 'SAO PAULO',
          amountCents: calc.totalAmountCents,
          txid,
          description:
            calc.daysOverdue > 0
              ? `${description} (Atraso ${calc.daysOverdue}d)`
              : description,
          payerName: recipientName,
          preferredPaymentMethod: 'pix',
          publicOrigin: resolvePublicOriginFromRequest(req),
          expiresAtMs: chargeExpiresAtMs,
        });

        const charge: StoredPixCharge = {
          id,
          txid: assets.txid,
          modelId,
          userId: getModelActorUid(modelId),
          userName: recipientName,
          kind: 'custom_charge',
          amountCents: calc.totalAmountCents,
          originalAmountCents: calc.originalAmountCents,
          ...(calc.dueDate ? { dueDate: calc.dueDate } : {}),
          ...(calc.dueAtMs !== undefined ? { dueAtMs: calc.dueAtMs } : {}),
          finePercent: calc.finePercent,
          interestMonthlyPercent: calc.interestMonthlyPercent,
          fineCents: calc.fineCents,
          interestCents: calc.interestCents,
          daysOverdue: calc.daysOverdue,
          createdByModel: true,
          description,
          status: 'pending',
          approvalStatus: 'pendente',
          provider: assets.provider,
          preferredPaymentMethod: 'pix',
          ...(assets.externalPaymentId
            ? { externalPaymentId: assets.externalPaymentId }
            : {}),
          ...(assets.checkoutUrl ? { checkoutUrl: assets.checkoutUrl } : {}),
          brCode: assets.brCode,
          qrCodeDataUrl: assets.qrCodeDataUrl,
          pixKeyUsed: assets.pixKeyUsed,
          pixKeyTypeUsed: assets.pixKeyTypeUsed,
          merchantName: assets.merchantName,
          merchantCity: assets.merchantCity,
          usingDemoKey: assets.usingDemoKey,
          createdAt: nowMs,
          expiresAt: chargeExpiresAtMs,
        };

        if (!Array.isArray(workspace.pixCharges)) {
          workspace.pixCharges = [];
        }
        workspace.pixCharges.push(charge);
        if (workspace.pixCharges.length > 250) {
          workspace.pixCharges = workspace.pixCharges.slice(-250);
        }
        saveStore();
        emitWorkspaceRefresh(modelId, false);

        res.status(201).json({
          ok: true,
          charge: serializePixChargeForClient(charge),
        });
      } catch (err) {
        console.error('Erro ao gerar cobrança PIX dinâmica pela modelo:', err);
        res.status(500).json({
          ok: false,
          error: 'Não foi possível gerar o QR Code PIX dinâmico.',
        });
      }
    }
  );

  app.post(
    '/api/model/pix/charges/:chargeId/recalculate',
    requireModelOperator,
    async (req: AuthenticatedRequest, res) => {
      const modelId = req.resolvedModelId!;
      const ctx = getModelAndWorkspace(modelId);
      if (!ctx) return void res.status(404).json({ ok: false });
      const chargeId = sanitizeId(req.params.chargeId);
      const charge = (ctx.workspace.pixCharges || []).find(
        (c) => c.id === chargeId
      );
      if (!charge) {
        res.status(404).json({ ok: false, error: 'Cobrança PIX não encontrada.' });
        return;
      }
      if (charge.status !== 'pending') {
        res.status(409).json({
          ok: false,
          error: 'Somente cobranças pendentes podem ser recalculadas.',
        });
        return;
      }
      const updated = await refreshOverduePixChargeIfNeeded(
        modelId,
        ctx.workspace,
        charge,
        resolvePublicOriginFromRequest(req)
      );
      res.json({
        ok: true,
        updated,
        charge: serializePixChargeForClient(charge),
      });
    }
  );

  // Mercado Pago Webhook health/verification ping
  app.get('/api/webhooks/mercadopago', webhookRateLimiter, (_req, res) => {
    res.status(200).json({
      ok: true,
      webhook: 'mercadopago',
      configured: isMercadoPagoConfigured(),
      hmacEnforced: Boolean(process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim()),
    });
  });

  // Mercado Pago Webhook & IPN (HMAC verification + authoritative server-to-server lookup + automatic 'aprovado' update)
  app.post(
    '/api/webhooks/mercadopago',
    webhookRateLimiter,
    async (req: Request, res: Response) => {
      try {
        const result = await processMercadoPagoWebhookEvent(req, {
          withVerificationLock: withPaymentVerificationLock,
          findCharge: findPixChargeAcrossModels,
          applyApprovedPayment: applyApprovedMercadoPagoVerification,
          revokeRefundedCharge: revokeRefundedMercadoPagoCharge,
          saveStore,
          emitWorkspaceRefresh,
        });
        const { httpStatus, ...payload } = result;
        res.status(httpStatus).json(payload);
      } catch (err) {
        console.error('Erro ao processar webhook do Mercado Pago:', err);
        res.status(500).json({
          ok: false,
          error: 'Erro temporário ao processar notificação do Mercado Pago.',
        });
      }
    }
  );

  // ============================================================================
  // REAL-TIME WEBSOCKET SERVER (Isolated per modelId)
  // ============================================================================
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let authenticatedUid: string | null = null;

    const authTimeout = setTimeout(() => {
      if (!authenticatedUid && ws.readyState === WebSocket.OPEN) {
        ws.close(4001, 'Authentication timeout');
      }
    }, 12000);

    ws.on('message', async (raw) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const msgType = typeof data.type === 'string' ? data.type : '';

      if (msgType === 'ping') {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
        return;
      }

      if (msgType === 'auth') {
        const token = typeof data.token === 'string' ? data.token : '';
        const authMode =
          typeof data.authMode === 'string' ? data.authMode : 'firebase';
        if (!token) {
          ws.close(4002, 'Missing token');
          return;
        }

        try {
          let uid = '';
          let modelId = PRIMARY_MODEL_ID;
          let isAdmin = false;
          let displayName = 'Participante';
          let photoUrl = '';
          let accessStatus: 'active' | 'vip' | 'muted' | 'blocked' = 'active';
          let role: 'model' | 'viewer' = 'viewer';

          const store = getStore();
          const requestedModelId = sanitizeId(
            data.modelId,
            getDefaultActiveModelId()
          );

          if (authMode === 'model_session') {
            const payload = verifyModelSessionToken(token);
            if (!payload) {
              ws.close(4003, 'Invalid model token');
              return;
            }
            const account = store.models[payload.modelId];
            if (
              !account ||
              !account.active ||
              account.tokenVersion !== payload.tokenVersion
            ) {
              ws.close(4003, 'Model session expired');
              return;
            }
            modelId = account.id;
            uid = getModelActorUid(modelId);
            isAdmin = true;
            role = 'model';
            accessStatus = 'vip';
            const ctx = getModelAndWorkspace(modelId);
            displayName =
              ctx?.workspace.studioConfig.modelName || account.displayName;
            photoUrl = ctx?.workspace.studioConfig.modelAvatarUrl || '';
          } else {
            const decoded = await adminAuth.verifyIdToken(token);
            modelId = store.models[requestedModelId]?.active
              ? requestedModelId
              : getDefaultActiveModelId();
            uid = decoded.uid;
            isAdmin = false;
            role = 'viewer';
            const ctx = getModelAndWorkspace(modelId);
            const visitor = ctx?.workspace.visitorProfiles[uid];
            const profileInput =
              data.profile && typeof data.profile === 'object'
                ? (data.profile as Record<string, unknown>)
                : {};
            displayName =
              visitor?.displayName ||
              (typeof profileInput.displayName === 'string' &&
              profileInput.displayName.trim()
                ? profileInput.displayName.trim().slice(0, 80)
                : typeof decoded.name === 'string' && decoded.name.trim()
                  ? decoded.name.trim().slice(0, 80)
                  : 'Participante');
            photoUrl = sanitizeMediaUrl(
              visitor?.photoUrl ||
                (typeof profileInput.photoUrl === 'string'
                  ? profileInput.photoUrl
                  : typeof decoded.picture === 'string'
                    ? decoded.picture
                    : '')
            );
            accessStatus = visitor?.accessStatus || 'active';
          }

          clearTimeout(authTimeout);

          const existing = connectedPeers.get(uid);
          if (
            existing &&
            existing.ws !== ws &&
            existing.ws.readyState === WebSocket.OPEN
          ) {
            existing.ws.close(4009, 'Replaced by newer session');
          }

          const roomMap = getRoomMap(modelId);
          const roomId = getModelRoomId(modelId);
          authenticatedUid = uid;
          connectedPeers.set(uid, {
            ws,
            uid,
            modelId,
            displayName,
            photoUrl,
            role,
            accessStatus,
            isAdmin,
            inCallWith: roomMap.has(uid) ? `room:${roomId}` : null,
            connectedAt: new Date().toISOString(),
          });

          ws.send(
            JSON.stringify({
              type: 'auth:ok',
              uid,
              modelId,
              isAdmin,
              role,
            })
          );
          ws.send(
            JSON.stringify({
              type: 'room:sync',
              modelId,
              roomId,
              participants: serializeRoomParticipantsForModel(modelId),
            })
          );
          ws.send(
            JSON.stringify({
              type: 'queue:sync',
              modelId,
              summary: buildQueueSummaryForUser(modelId, uid),
            })
          );
          broadcastPresenceForModel(modelId);
        } catch (err) {
          console.error('WebSocket token verification failed:', err);
          ws.close(4003, 'Invalid token');
        }
        return;
      }

      if (!authenticatedUid) return;
      const sender = connectedPeers.get(authenticatedUid);
      if (!sender) return;

      // Visitor switches active model on `/`
      if (msgType === 'model:select') {
        if (sender.isAdmin) return;
        const store = getStore();
        const nextModelId = sanitizeId(data.modelId);
        if (!nextModelId || !store.models[nextModelId]?.active) return;
        if (nextModelId === sender.modelId) return;

        const oldModelId = sender.modelId;
        const oldRoomMap = getRoomMap(oldModelId);
        const departed = oldRoomMap.get(sender.uid);
        if (departed) {
          oldRoomMap.delete(sender.uid);
          broadcastRoomSyncForModel(oldModelId);
          notifyRoomParticipantsAndAdminsForModel(oldModelId, sender.uid, {
            type: 'room:peer_left',
            roomId: getModelRoomId(oldModelId),
            participant: departed,
          });
        }
        getVisitorQueueMap(oldModelId).delete(sender.uid);
        broadcastQueueSyncForModel(oldModelId);

        sender.modelId = nextModelId;
        sender.inCallWith = null;
        const ctx = getModelAndWorkspace(nextModelId);
        sender.accessStatus =
          ctx?.workspace.visitorProfiles[sender.uid]?.accessStatus || 'active';

        broadcastPresenceForModel(oldModelId);
        broadcastPresenceForModel(nextModelId);
        ws.send(
          JSON.stringify({
            type: 'room:sync',
            modelId: nextModelId,
            roomId: getModelRoomId(nextModelId),
            participants: serializeRoomParticipantsForModel(nextModelId),
          })
        );
        sendQueueSyncToPeer(sender);
        return;
      }

      const activeModelId = sender.modelId;
      const roomMap = getRoomMap(activeModelId);
      const roomId = getModelRoomId(activeModelId);

      if (msgType === 'presence:update') {
        if (data.inCallWith === null) {
          sender.inCallWith = null;
        } else if (typeof data.inCallWith === 'string') {
          const cleanPeerId = sanitizeId(data.inCallWith);
          if (cleanPeerId && (sender.isAdmin || cleanPeerId === getModelActorUid(activeModelId))) {
            sender.inCallWith = cleanPeerId;
          }
        }
        // Note: accessStatus changes are strictly reserved for admin moderation commands, never client presence updates
        broadcastPresenceForModel(activeModelId);
        return;
      }

      if (msgType === 'room:join') {
        const ctx = getModelAndWorkspace(activeModelId);
        const modelDisplayName =
          ctx?.workspace.studioConfig.modelName || 'Modelo';
        ws.send(
          JSON.stringify({
            type: 'call:reject',
            callId:
              typeof data.callId === 'string' ? data.callId.slice(0, 128) : '',
            fromUid: getModelActorUid(activeModelId),
            fromName: modelDisplayName,
            reason:
              'Este estúdio opera exclusivamente com salas privativas 1-para-1 mediante pagamento.',
          })
        );
        return;
      }

      if (msgType === 'room:leave') {
        const departed = roomMap.get(sender.uid);
        if (departed) {
          roomMap.delete(sender.uid);
        }
        if (sender.inCallWith === `room:${roomId}`) {
          sender.inCallWith = null;
        }
        broadcastRoomSyncForModel(activeModelId);
        if (departed) {
          notifyRoomParticipantsAndAdminsForModel(activeModelId, sender.uid, {
            type: 'room:peer_left',
            roomId,
            participant: departed,
          });
        }
        broadcastPresenceForModel(activeModelId);
        return;
      }

      if (
        [
          'call:ring',
          'call:accept',
          'call:reject',
          'call:end',
          'webrtc:offer',
          'webrtc:answer',
          'webrtc:ice',
        ].includes(msgType)
      ) {
        const targetUid = typeof data.targetUid === 'string' ? data.targetUid : '';
        if (!targetUid) return;

        if (sender.accessStatus === 'blocked' && !sender.isAdmin) {
          ws.send(
            JSON.stringify({
              type: 'moderation:effect',
              action: 'blocked',
              reason: 'Acesso suspenso pela moderação do estúdio.',
            })
          );
          return;
        }

        const ctx = getModelAndWorkspace(activeModelId);
        const modelActorUid = getModelActorUid(activeModelId);
        const modelDisplayName =
          ctx?.workspace.studioConfig.modelName || 'Modelo';
        const callIdStr =
          typeof data.callId === 'string' ? data.callId.slice(0, 128) : '';

        // Strictly 1-on-1 paid private room gate
        if (
          !sender.isAdmin &&
          ['call:ring', 'call:accept', 'webrtc:offer', 'webrtc:answer', 'webrtc:ice'].includes(
            msgType
          )
        ) {
          const targetPeer = connectedPeers.get(targetUid);
          const targetIsModel =
            targetUid === modelActorUid ||
            Boolean(targetPeer && targetPeer.modelId === activeModelId && targetPeer.isAdmin);
          if (!targetIsModel) {
            ws.send(
              JSON.stringify({
                type: 'call:reject',
                callId: callIdStr,
                fromUid: modelActorUid,
                fromName: modelDisplayName,
                reason:
                  'Somente salas privativas diretamente com a modelo são permitidas.',
              })
            );
            return;
          }

          if (!ctx || !hasVisitorPaidActiveCallAccess(ctx.workspace, sender.uid)) {
            ws.send(
              JSON.stringify({
                type: 'call:reject',
                callId: callIdStr,
                fromUid: modelActorUid,
                fromName: modelDisplayName,
                reason:
                  'Pagamento obrigatório antes de entrar na sala privativa com a modelo.',
              })
            );
            return;
          }

          const busyVisitorUid = getBusyVisitorUidInPrivateCall(
            activeModelId,
            ctx.workspace,
            sender.uid
          );
          if (busyVisitorUid) {
            ws.send(
              JSON.stringify({
                type: 'call:reject',
                callId: callIdStr,
                fromUid: modelActorUid,
                fromName: modelDisplayName,
                reason:
                  'A modelo já está em sala privativa com outro internauta. Aguarde na fila.',
              })
            );
            return;
          }
        }

        if (sender.isAdmin && (msgType === 'call:ring' || msgType === 'call:accept')) {
          const busyVisitorUid = ctx
            ? getBusyVisitorUidInPrivateCall(activeModelId, ctx.workspace, targetUid)
            : null;
          if (busyVisitorUid) {
            ws.send(
              JSON.stringify({
                type: 'call:reject',
                callId: callIdStr,
                fromUid: targetUid,
                fromName:
                  connectedPeers.get(targetUid)?.displayName || 'Internauta',
                reason:
                  'Encerre a sala privativa atual antes de conectar outro internauta.',
              })
            );
            return;
          }
        }

        const queueMap = getVisitorQueueMap(activeModelId);

        if (msgType === 'call:accept') {
          sender.inCallWith = targetUid;
          const target = connectedPeers.get(targetUid);
          if (target && target.modelId === activeModelId) {
            target.inCallWith = sender.uid;
          }
          const callId = callIdStr || `call_${Date.now()}`;
          const durationMinutes =
            typeof data.planDurationMinutes === 'number' &&
            data.planDurationMinutes > 0
              ? data.planDurationMinutes
              : 15;
          activeCallEstimateByModel.set(activeModelId, {
            callId,
            startedAtMs: Date.now(),
            durationMinutes,
          });
          if (ctx) {
            const visitorUid = sender.isAdmin ? targetUid : sender.uid;
            const visitorName = sender.isAdmin
              ? target?.displayName || 'Internauta'
              : sender.displayName;
            ctx.workspace.studioState.activeCallId = callId;
            ctx.workspace.studioState.activeCallUserId = visitorUid;
            ctx.workspace.studioState.activeCallUserName = visitorName;
            ctx.workspace.studioState.updatedAt = Date.now();
            saveStore();
            emitWorkspaceRefresh(activeModelId, true);
          }
          queueMap.delete(sender.uid);
          queueMap.delete(targetUid);
          broadcastPresenceForModel(activeModelId);
          broadcastQueueSyncForModel(activeModelId);
        } else if (msgType === 'call:end' || msgType === 'call:reject') {
          if (sender.inCallWith !== `room:${roomId}`) {
            sender.inCallWith = null;
          }
          const target = connectedPeers.get(targetUid);
          if (
            target &&
            target.modelId === activeModelId &&
            target.inCallWith === sender.uid
          ) {
            target.inCallWith = null;
          }
          const currentEst = activeCallEstimateByModel.get(activeModelId);
          if (
            currentEst &&
            (!callIdStr || currentEst.callId === callIdStr)
          ) {
            activeCallEstimateByModel.set(activeModelId, null);
          }
          if (
            ctx &&
            msgType === 'call:end' &&
            (!ctx.workspace.studioState.activeCallId ||
              !callIdStr ||
              ctx.workspace.studioState.activeCallId === callIdStr ||
              ctx.workspace.studioState.activeCallUserId === sender.uid ||
              ctx.workspace.studioState.activeCallUserId === targetUid)
          ) {
            ctx.workspace.studioState.activeCallId = '';
            ctx.workspace.studioState.activeCallUserId = '';
            ctx.workspace.studioState.activeCallUserName = '';
            ctx.workspace.studioState.updatedAt = Date.now();
            saveStore();
            emitWorkspaceRefresh(activeModelId, true);
          }
          broadcastPresenceForModel(activeModelId);
          broadcastQueueSyncForModel(activeModelId);
        }

        if (
          !sender.isAdmin &&
          targetUid !== modelActorUid &&
          sender.inCallWith !== targetUid
        ) {
          return;
        }

        const safeRelay: Record<string, unknown> = {
          type: msgType,
          callId: callIdStr,
          targetUid,
          fromUid: sender.uid,
          fromName: sender.displayName,
          fromPhotoUrl: sender.photoUrl,
          fromRole: sender.role,
        };
        if (data.offer && typeof data.offer === 'object') {
          safeRelay.offer = data.offer;
        }
        if (data.answer && typeof data.answer === 'object') {
          safeRelay.answer = data.answer;
        }
        if (data.candidate && typeof data.candidate === 'object') {
          safeRelay.candidate = data.candidate;
        }
        if (typeof data.reason === 'string') {
          safeRelay.reason = data.reason.slice(0, 200);
        }
        if (typeof data.planId === 'string') {
          safeRelay.planId = sanitizeId(data.planId);
        }
        if (typeof data.planName === 'string') {
          safeRelay.planName = data.planName.slice(0, 80);
        }
        if (
          typeof data.planDurationMinutes === 'number' &&
          Number.isFinite(data.planDurationMinutes)
        ) {
          safeRelay.planDurationMinutes = Math.max(
            1,
            Math.min(240, Math.round(data.planDurationMinutes))
          );
        }
        sendToUserInModel(activeModelId, targetUid, safeRelay);
        return;
      }

      if (msgType === 'queue:entry') {
        const status = typeof data.status === 'string' ? data.status : 'idle';
        const queueMap = getVisitorQueueMap(activeModelId);
        const authList = authoritativeQueueByModel.get(activeModelId) || [];
        const hasAuth = hasAuthoritativeQueueByModel.get(activeModelId) || false;

        if (status === 'waiting') {
          const ctx = getModelAndWorkspace(activeModelId);
          if (!ctx || !hasVisitorPaidActiveCallAccess(ctx.workspace, sender.uid)) {
            return;
          }
          const callId =
            typeof data.callId === 'string' && data.callId
              ? data.callId.slice(0, 128)
              : `wait_${sender.uid}`;
          const planDurationMinutes =
            typeof data.planDurationMinutes === 'number' &&
            data.planDurationMinutes > 0
              ? Math.min(240, Math.round(data.planDurationMinutes))
              : 10;
          const createdAtMs =
            typeof data.createdAtMs === 'number' && data.createdAtMs > 0
              ? data.createdAtMs
              : Date.now();
          const isVip = sender.accessStatus === 'vip';

          queueMap.set(sender.uid, {
            callId,
            uid: sender.uid,
            planDurationMinutes,
            createdAtMs,
            isVip,
          });
          if (hasAuth) {
            const idx = authList.findIndex((item) => item.uid === sender.uid);
            const nextEntry: QueueEntryRecord = {
              callId,
              uid: sender.uid,
              planDurationMinutes,
              createdAtMs,
              isVip,
            };
            if (idx >= 0) authList[idx] = nextEntry;
            else authList.push(nextEntry);
            authoritativeQueueByModel.set(activeModelId, authList);
          }
        } else {
          queueMap.delete(sender.uid);
          if (hasAuth) {
            authoritativeQueueByModel.set(
              activeModelId,
              authList.filter((item) => item.uid !== sender.uid)
            );
          }
        }
        broadcastQueueSyncForModel(activeModelId);
        return;
      }

      if (msgType === 'queue:authoritative_sync') {
        if (!sender.isAdmin) return;
        const rawEntries = Array.isArray(data.waiting) ? data.waiting : [];
        const nextList = rawEntries
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) &&
              typeof item === 'object' &&
              typeof (item as Record<string, unknown>).uid === 'string' &&
              typeof (item as Record<string, unknown>).callId === 'string'
          )
          .slice(0, 100)
          .map((item) => ({
            callId: String(item.callId).slice(0, 128),
            uid: String(item.uid).slice(0, 128),
            planDurationMinutes:
              typeof item.planDurationMinutes === 'number' &&
              item.planDurationMinutes > 0
                ? Math.min(240, Math.round(item.planDurationMinutes))
                : 10,
            createdAtMs:
              typeof item.createdAtMs === 'number' && item.createdAtMs > 0
                ? item.createdAtMs
                : Date.now(),
            isVip: Boolean(item.isVip),
          }));

        authoritativeQueueByModel.set(activeModelId, nextList);
        hasAuthoritativeQueueByModel.set(activeModelId, true);

        const rawActive =
          data.activeCall && typeof data.activeCall === 'object'
            ? (data.activeCall as Record<string, unknown>)
            : null;
        if (
          rawActive &&
          typeof rawActive.callId === 'string' &&
          rawActive.callId
        ) {
          const callId = rawActive.callId.slice(0, 128);
          const durationMinutes =
            typeof rawActive.durationMinutes === 'number' &&
            rawActive.durationMinutes > 0
              ? Math.min(240, Math.round(rawActive.durationMinutes))
              : 15;
          const prevEst = activeCallEstimateByModel.get(activeModelId);
          const startedAtMs =
            typeof rawActive.startedAtMs === 'number' &&
            rawActive.startedAtMs > 0
              ? rawActive.startedAtMs
              : prevEst?.callId === callId
                ? prevEst.startedAtMs
                : Date.now();
          activeCallEstimateByModel.set(activeModelId, {
            callId,
            durationMinutes,
            startedAtMs,
          });
        } else {
          activeCallEstimateByModel.set(activeModelId, null);
        }

        broadcastQueueSyncForModel(activeModelId);
        return;
      }

      if (msgType === 'moderation:command') {
        if (!sender.isAdmin) return;
        const targetUid = typeof data.targetUid === 'string' ? data.targetUid : '';
        const action = typeof data.action === 'string' ? data.action : '';
        if (!targetUid || !action) return;

        const target = connectedPeers.get(targetUid);
        if (target && target.modelId !== activeModelId) return;

        const departedRoomPeer =
          action === 'block' || action === 'kick_call'
            ? roomMap.get(targetUid)
            : undefined;

        if (target && target.modelId === activeModelId) {
          if (action === 'mute') target.accessStatus = 'muted';
          if (action === 'unmute') target.accessStatus = 'active';
          if (action === 'block') {
            target.accessStatus = 'blocked';
            target.inCallWith = null;
            if (sender.inCallWith === targetUid) sender.inCallWith = null;
          }
          if (action === 'unblock') target.accessStatus = 'active';
          if (action === 'vip') target.accessStatus = 'vip';
          if (action === 'kick_call') {
            target.inCallWith = null;
            if (sender.inCallWith === targetUid) sender.inCallWith = null;
          }
        }

        const roomTarget = roomMap.get(targetUid);
        if (roomTarget) {
          if (action === 'mute') roomTarget.accessStatus = 'muted';
          if (action === 'unmute') roomTarget.accessStatus = 'active';
          if (action === 'vip') roomTarget.accessStatus = 'vip';
        }

        if (departedRoomPeer) {
          roomMap.delete(targetUid);
          notifyRoomParticipantsAndAdminsForModel(activeModelId, targetUid, {
            type: 'room:peer_left',
            roomId,
            participant: departedRoomPeer,
          });
        }

        sendToUserInModel(activeModelId, targetUid, {
          type: 'moderation:effect',
          action,
          byUid: sender.uid,
          byName: sender.displayName,
          reason: typeof data.reason === 'string' ? data.reason : '',
        });
        broadcastRoomSyncForModel(activeModelId);
        broadcastPresenceForModel(activeModelId);
        if (action === 'vip' || action === 'unmute') {
          broadcastQueueSyncForModel(activeModelId);
        }
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (authenticatedUid) {
        const current = connectedPeers.get(authenticatedUid);
        if (current && current.ws === ws) {
          const activeModelId = current.modelId;
          const roomMap = getRoomMap(activeModelId);
          const roomId = getModelRoomId(activeModelId);
          const departedRoomPeer = roomMap.get(authenticatedUid);
          if (departedRoomPeer) {
            roomMap.delete(authenticatedUid);
          }

          if (
            current.inCallWith &&
            current.inCallWith !== `room:${roomId}`
          ) {
            sendToUserInModel(activeModelId, current.inCallWith, {
              type: 'call:end',
              fromUid: authenticatedUid,
              reason: 'peer_disconnected',
            });
            const peer = connectedPeers.get(current.inCallWith);
            if (
              peer &&
              peer.modelId === activeModelId &&
              peer.inCallWith === authenticatedUid
            ) {
              peer.inCallWith = null;
            }
            const closeCtx = getModelAndWorkspace(activeModelId);
            if (
              closeCtx &&
              (closeCtx.workspace.studioState.activeCallUserId === authenticatedUid ||
                current.isAdmin)
            ) {
              closeCtx.workspace.studioState.activeCallId = '';
              closeCtx.workspace.studioState.activeCallUserId = '';
              closeCtx.workspace.studioState.activeCallUserName = '';
              closeCtx.workspace.studioState.updatedAt = Date.now();
              saveStore();
              emitWorkspaceRefresh(activeModelId, true);
            }
            activeCallEstimateByModel.set(activeModelId, null);
          }
          connectedPeers.delete(authenticatedUid);
          getVisitorQueueMap(activeModelId).delete(authenticatedUid);

          const modelPeersLeft = Array.from(connectedPeers.values()).some(
            (p) => p.modelId === activeModelId
          );
          if (current.isAdmin && !modelPeersLeft) {
            hasAuthoritativeQueueByModel.set(activeModelId, false);
            authoritativeQueueByModel.set(activeModelId, []);
            activeCallEstimateByModel.set(activeModelId, null);
          }

          if (departedRoomPeer) {
            broadcastRoomSyncForModel(activeModelId);
            notifyRoomParticipantsAndAdminsForModel(
              activeModelId,
              authenticatedUid,
              {
                type: 'room:peer_left',
                roomId,
                participant: departedRoomPeer,
              }
            );
          }
          broadcastPresenceForModel(activeModelId);
          broadcastQueueSyncForModel(activeModelId);
        }
      }
    });
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ ok: false, error: 'Rota da API não encontrada.' });
  });

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (req.path.startsWith('/api/')) {
      console.error('Erro inesperado na API:', err);
      res.status(500).json({
        ok: false,
        error: 'Erro interno temporário ao processar sua solicitação.',
      });
      return;
    }
    next(err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.get('/convite/:inviteId', async (req, res, next) => {
      try {
        const rawHtml = fs.readFileSync(
          path.resolve(__dirname, 'index.html'),
          'utf8'
        );
        const withOg = injectInviteMetaIntoHtml(
          rawHtml,
          req,
          req.params.inviteId
        );
        const transformed = await vite.transformIndexHtml(
          req.originalUrl,
          withOg
        );
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (err) {
        next(err);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/convite/:inviteId', (req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      try {
        const rawHtml = fs.readFileSync(indexFile, 'utf8');
        const withOg = injectInviteMetaIntoHtml(
          rawHtml,
          req,
          req.params.inviteId
        );
        res.status(200).set({ 'Content-Type': 'text/html' }).end(withOg);
      } catch {
        res.sendFile(indexFile);
      }
    });
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Model Gat Brasil server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
