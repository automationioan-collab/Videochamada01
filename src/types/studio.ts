import type { Timestamp } from 'firebase/firestore';

export type StudioRole = 'model' | 'moderator' | 'viewer';
export type AccessStatus = 'active' | 'vip' | 'muted' | 'blocked';
export type StudioCallMode = 'open' | 'queue_only' | 'paused';
export type CallStatus =
  | 'waiting'
  | 'accepted'
  | 'in_call'
  | 'ended'
  | 'rejected'
  | 'cancelled';

export interface StudioProfile {
  uid: string;
  displayName: string;
  photoUrl?: string;
  role: StudioRole;
  accessStatus: AccessStatus;
  isOnline: boolean;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SchedulePeriod {
  id: string;
  label?: string;
  startTime: string;
  endTime: string;
  days: string;
  enabled: boolean;
}

export interface ScheduleHolidayDate {
  date: string;
  label?: string;
}

export interface DailyPausePeriod {
  id: string;
  label?: string;
  startTime: string;
  endTime: string;
  days: string;
  enabled: boolean;
}

export interface StudioState {
  modelUid: string;
  modelName: string;
  isLive: boolean;
  callMode: StudioCallMode;
  headline: string;
  activeCallId?: string;
  activeCallUserId?: string;
  activeCallUserName?: string;
  autoScheduleEnabled?: boolean;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  scheduleDays?: string;
  scheduleTimezone?: string;
  schedulePeriods?: SchedulePeriod[];
  holidayDates?: ScheduleHolidayDate[];
  dailyPausePeriods?: DailyPausePeriod[];
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
  updatedAt: Timestamp;
}

export type StudioStateUpdatePatch = Partial<{
  modelName: string;
  isLive: boolean;
  callMode: StudioCallMode;
  headline: string;
  activeCallId: string;
  activeCallUserId: string;
  activeCallUserName: string;
  autoScheduleEnabled: boolean;
  scheduleStartTime: string;
  scheduleEndTime: string;
  scheduleDays: string;
  scheduleTimezone: string;
  schedulePeriods: SchedulePeriod[];
  holidayDates: ScheduleHolidayDate[];
  dailyPausePeriods: DailyPausePeriod[];
  weeklyBlockedDays: number[];
  pauseWarningEnabled: boolean;
  pauseWarningMinutes: number;
  pauseWarningMessage: string;
  dndActive: boolean;
  dndUntilMs: number;
  dndScheduleEnabled: boolean;
  dndStartTime: string;
  dndEndTime: string;
  tipGoalEnabled: boolean;
  tipGoalTitle: string;
  tipGoalDescription: string;
  tipGoalTargetCents: number;
  tipGoalCurrentCents: number;
  tipGoalRewardText: string;
  tipGoalContributorsCount: number;
  tipGoalLastTipName: string;
  tipGoalLastTipAmountCents: number;
}>;

export type CallPaymentStatus = 'authorized' | 'captured' | 'refunded';

export interface CallPlan {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  currency: 'BRL';
  active: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CallRequest {
  id: string;
  userId: string;
  userName: string;
  userPhotoUrl?: string;
  topic: string;
  status: CallStatus;
  planId?: string;
  planName?: string;
  planDurationMinutes?: number;
  planPriceCents?: number;
  paymentStatus?: CallPaymentStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CallMessage {
  id: string;
  callId: string;
  senderUid: string;
  senderName: string;
  senderRole: StudioRole;
  recipientUid: string;
  text: string;
  createdAt: Timestamp;
}

export interface PresencePeer {
  uid: string;
  displayName: string;
  photoUrl: string;
  role: StudioRole;
  accessStatus: AccessStatus;
  inCallWith: string | null;
  connectedAt: string;
}

export interface RoomParticipant {
  uid: string;
  displayName: string;
  photoUrl: string;
  role: StudioRole;
  accessStatus: AccessStatus;
  isAdmin: boolean;
  joinedAt: string;
  callId?: string;
  planId?: string;
  planName?: string;
  planDurationMinutes?: number;
  planPriceCents?: number;
}

export type CallHistoryStatus = 'completed' | 'refunded';

export interface CallHistoryRecord {
  id: string;
  callId: string;
  userId: string;
  userName: string;
  modelUid: string;
  durationSeconds: number;
  amountCents: number;
  currency: 'BRL';
  status: CallHistoryStatus;
  planId?: string;
  planName?: string;
  planDurationMinutes?: number;
  rating?: number;
  ratingComment?: string;
  ratedAt?: Timestamp;
  endedAt: Timestamp;
  createdAt: Timestamp;
}

export type InterestMessageStatus = 'unread' | 'reviewed' | 'contacted';

export interface InterestMessage {
  id: string;
  userId: string;
  userName: string;
  userPhotoUrl?: string;
  preferredTime: string;
  message: string;
  status: InterestMessageStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type GalleryCategoryType = 'editorial' | 'portraits' | 'studio';
export type MediaAssetType = 'photo' | 'video';
export type MediaVisibility = 'public' | 'private';
export type PublicApprovalStatus = 'approved' | 'pending' | 'rejected';

export interface ModelBasicInfo {
  age?: string;
  location?: string;
  languages?: string;
  height?: string;
  appearance?: string;
  specialty?: string;
  availabilityNote?: string;
}

export interface GalleryItemRecord {
  id: string;
  title: string;
  caption: string;
  category: GalleryCategoryType;
  mediaType?: MediaAssetType;
  specs: string;
  src: string;
  alt: string;
  sortOrder: number;
  active: boolean;
  approvalStatus?: PublicApprovalStatus;
  moderationNote?: string;
  reviewedAt?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PrivateAlbumItemRecord {
  id: string;
  title: string;
  caption: string;
  mediaType: MediaAssetType;
  src: string;
  thumbnailUrl?: string;
  sortOrder: number;
  active: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface PrivateAlbumSummary {
  enabled: boolean;
  hasPassword: boolean;
  itemCount: number;
  photoCount: number;
  videoCount: number;
  hint?: string;
  priceCents?: number;
  hasPaidAccess?: boolean;
}

export interface PendingGalleryReviewItem {
  modelId: string;
  modelName: string;
  studioBrand: string;
  item: GalleryItemRecord;
}

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp';
export type PixChargeKind = 'private_album' | 'tip' | 'call_plan';
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

export interface PixChargeRecord {
  id: string;
  txid: string;
  modelId: string;
  userId: string;
  userName: string;
  kind: PixChargeKind;
  amountCents: number;
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
  webhookVerifiedAt?: number;
  provider: 'bacen' | 'mercadopago';
  preferredPaymentMethod?: MercadoPagoPaymentMethod;
  checkoutUrl?: string;
  paymentMethodUsed?: string;
  brCode: string;
  qrCodeDataUrl: string;
  pixKeyMasked: string;
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
}

export type WhatsappInviteStatus = 'pending' | 'viewed' | 'paid';

export interface WhatsappInviteRecord {
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
  callMode: CallEntryIntent;
  status: WhatsappInviteStatus;
  clickCount: number;
  createdAt: number;
  viewedAt?: number;
  paidAt?: number;
  paidByName?: string;
  callRequestId?: string;
  pixChargeId?: string;
}

export interface PublicWhatsappInviteData {
  invite: Omit<WhatsappInviteRecord, 'recipientPhone' | 'pixChargeId'>;
  model: PublicModelSummary;
  studioConfig: StudioConfig;
  studioState: StudioState;
  callPlans: CallPlan[];
}

export interface StudioConfig {
  modelUid: string;
  studioBrand: string;
  modelName: string;
  modelAvatarUrl?: string;
  heroImageUrl?: string;
  loungeImageUrl?: string;
  modelBio?: string;
  basicInfo?: ModelBasicInfo;
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
  pixConfigured?: boolean;
  mercadoPagoConfigured?: boolean;
  whatsappInvitePhotoUrl?: string;
  whatsappInviteMessage?: string;
  whatsappInvitePlanId?: string;
  whatsappInviteCallMode?: CallEntryIntent;
  updatedAt?: Timestamp;
}

export type CallEntryIntent = 'group' | 'private';

export interface QueueWaitSummary {
  totalWaiting: number;
  myPosition: number;
  aheadCount: number;
  activeCallRemainingSeconds: number;
  aheadQueueSeconds: number;
  totalEstimatedWaitSeconds: number;
  updatedAtMs: number;
}

export interface ModelPlanPreview {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface ModelAccountSummary {
  id: string;
  slug: string;
  displayName: string;
  loginUsername: string;
  hasPassword: boolean;
  isPrimary: boolean;
  active: boolean;
  adminThemeColor?: string;
  studioBrand: string;
  avatarUrl?: string;
  heroImageUrl?: string;
  loungeImageUrl?: string;
  modelBio?: string;
  basicInfo?: ModelBasicInfo;
  heroTitle?: string;
  heroSubtitle?: string;
  headline?: string;
  groupButtonLabel?: string;
  privateButtonLabel?: string;
  pendingGalleryCount?: number;
  privateAlbumSummary?: PrivateAlbumSummary;
  privateAlbumPriceCents?: number;
  ratePerMinuteCents?: number;
  minPlanPriceCents?: number;
  activePlansCount?: number;
  plansPreview?: ModelPlanPreview[];
  createdAt: string;
  updatedAt: string;
  metrics?: {
    totalCalls: number;
    totalRevenueCents: number;
    waitingCount: number;
    unreadMessagesCount: number;
    onlineNow: boolean;
    roomParticipantsCount: number;
    pendingGalleryCount?: number;
    privateAlbumCount?: number;
  };
}

export interface PublicRatingRecord {
  id: string;
  rating: number;
  comment?: string;
  planName?: string;
  createdAtMs: number;
}

export interface PublicModelSummary {
  id: string;
  slug: string;
  displayName: string;
  studioBrand: string;
  avatarUrl: string;
  heroImageUrl: string;
  bio: string;
  basicInfo?: ModelBasicInfo;
  headline: string;
  isLive: boolean;
  callMode: StudioCallMode;
  dndActive: boolean;
  modelOnline: boolean;
  roomParticipantCount: number;
  ratePerMinuteCents: number;
  activePlansCount: number;
  minPlanPriceCents?: number;
  plansPreview?: ModelPlanPreview[];
  privateAlbumSummary?: PrivateAlbumSummary;
  publicGalleryCount?: number;
  ratingAverage?: number;
  ratingCount?: number;
  tipGoal?: {
    enabled: boolean;
    title: string;
    description?: string;
    targetCents: number;
    currentCents: number;
    rewardText?: string;
    contributorsCount?: number;
  };
}

