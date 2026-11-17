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
  dndActive?: boolean;
  dndUntilMs?: number;
  dndScheduleEnabled?: boolean;
  dndStartTime?: string;
  dndEndTime?: string;
  updatedAt: Timestamp;
}

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
