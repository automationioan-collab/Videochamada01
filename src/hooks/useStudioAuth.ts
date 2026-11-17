import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  OperationType,
  STUDIO_ADMIN_EMAIL,
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
} from '../lib/firebase';
import type {
  AccessStatus,
  CallHistoryRecord,
  CallHistoryStatus,
  CallMessage,
  CallPaymentStatus,
  CallPlan,
  CallRequest,
  CallStatus,
  InterestMessage,
  InterestMessageStatus,
  StudioCallMode,
  StudioProfile,
  StudioRole,
  StudioState,
} from '../types/studio';

const DEFAULT_PREDEFINED_PLANS: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  sortOrder: number;
}> = [
  {
    id: 'plan_express_10',
    name: 'Sessão Express · 10 min',
    description:
      'Conversa privada rápida em vídeo e áudio HD com Lorena Noir.',
    durationMinutes: 10,
    priceCents: 8900,
    sortOrder: 1,
  },
  {
    id: 'plan_private_20',
    name: 'Sessão Privada · 20 min',
    description:
      'Atendimento individual completo para conversar com calma em tempo real.',
    durationMinutes: 20,
    priceCents: 15900,
    sortOrder: 2,
  },
  {
    id: 'plan_vip_45',
    name: 'Experiência VIP · 45 min',
    description:
      'Sessão estendida exclusiva com prioridade na fila e atendimento personalizado.',
    durationMinutes: 45,
    priceCents: 29900,
    sortOrder: 3,
  },
];

export function useStudioAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<StudioProfile | null>(null);
  const [modelProfile, setModelProfile] = useState<StudioProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<StudioProfile[]>([]);
  const [studioState, setStudioState] = useState<StudioState | null>(null);
  const [callQueue, setCallQueue] = useState<CallRequest[]>([]);
  const [callMessages, setCallMessages] = useState<CallMessage[]>([]);
  const [callHistory, setCallHistory] = useState<CallHistoryRecord[]>([]);
  const [interestMessages, setInterestMessages] = useState<InterestMessage[]>(
    []
  );
  const [callPlans, setCallPlans] = useState<CallPlan[]>([]);

  const isAdmin = useMemo(() => {
    return Boolean(
      user?.email === STUDIO_ADMIN_EMAIL && user?.emailVerified === true
    );
  }, [user]);

  // Ensure user profile, private PII, admin record, and studioState exist
  const syncUserDocuments = useCallback(async (firebaseUser: User) => {
    const isAdminUser =
      firebaseUser.email === STUDIO_ADMIN_EMAIL &&
      firebaseUser.emailVerified === true;

    const cleanName = isAdminUser
      ? 'Lorena Noir'
      : (firebaseUser.displayName || 'Participante').trim().slice(0, 80);
    const cleanPhoto = (firebaseUser.photoURL || '').slice(0, 500);

    if (isAdminUser) {
      const adminRef = doc(db, 'admins', firebaseUser.uid);
      try {
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          await setDoc(adminRef, {
            uid: firebaseUser.uid,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `admins/${firebaseUser.uid}`);
      }
    }

    const profileRef = doc(db, 'studioProfiles', firebaseUser.uid);
    try {
      const snap = await getDoc(profileRef);
      if (!snap.exists()) {
        await setDoc(profileRef, {
          uid: firebaseUser.uid,
          displayName: cleanName,
          photoUrl: cleanPhoto,
          role: isAdminUser ? 'model' : 'viewer',
          accessStatus: isAdminUser ? 'vip' : 'active',
          isOnline: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(profileRef, {
          displayName: cleanName,
          photoUrl: cleanPhoto,
          isOnline: true,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `studioProfiles/${firebaseUser.uid}`
      );
    }

    const privateRef = doc(db, 'users', firebaseUser.uid, 'private', 'info');
    try {
      const privSnap = await getDoc(privateRef);
      if (!privSnap.exists()) {
        await setDoc(privateRef, {
          uid: firebaseUser.uid,
          email: (firebaseUser.email || 'no-email@local').slice(0, 160),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(privateRef, {
          email: (firebaseUser.email || 'no-email@local').slice(0, 160),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `users/${firebaseUser.uid}/private/info`
      );
    }

    if (isAdminUser) {
      const stateRef = doc(db, 'studioState', 'main');
      try {
        const stateSnap = await getDoc(stateRef);
        if (!stateSnap.exists()) {
          await setDoc(stateRef, {
            modelUid: firebaseUser.uid,
            modelName: 'Lorena Noir',
            isLive: true,
            callMode: 'open',
            headline: 'Atendimento privado por videochamada ao vivo com Lorena Noir.',
            activeCallId: '',
            activeCallUserId: '',
            activeCallUserName: '',
            autoScheduleEnabled: false,
            scheduleStartTime: '14:00',
            scheduleEndTime: '23:00',
            scheduleDays: '1,2,3,4,5,6',
            scheduleTimezone:
              Intl.DateTimeFormat().resolvedOptions().timeZone ||
              'America/Sao_Paulo',
            dndActive: false,
            dndUntilMs: 0,
            dndScheduleEnabled: false,
            dndStartTime: '00:00',
            dndEndTime: '09:00',
            updatedAt: serverTimestamp(),
          });
        } else {
          const currentData = stateSnap.data() as { modelName?: string };
          if (!currentData.modelName || currentData.modelName === 'Camila Laurent') {
            await updateDoc(stateRef, {
              modelName: 'Lorena Noir',
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'studioState/main');
      }

      // Seed predefined call plans on first admin login if empty
      try {
        const plansSnap = await getDocs(collection(db, 'callPlans'));
        if (plansSnap.empty) {
          await Promise.all(
            DEFAULT_PREDEFINED_PLANS.map((plan) =>
              setDoc(doc(db, 'callPlans', plan.id), {
                ...plan,
                currency: 'BRL',
                active: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            )
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'callPlans');
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          await syncUserDocuments(firebaseUser);
        } catch (err) {
          console.error('Erro ao sincronizar perfil:', err);
        }
      } else {
        setMyProfile(null);
        setModelProfile(null);
        setAllProfiles([]);
        setStudioState(null);
        setCallQueue([]);
        setCallMessages([]);
        setCallHistory([]);
        setInterestMessages([]);
        setCallPlans([]);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [syncUserDocuments]);

  // Attach Firestore real-time listeners strictly after authentication
  useEffect(() => {
    if (!user) return;

    const unsubscribers: Array<() => void> = [];

    // 1. Own profile
    unsubscribers.push(
      onSnapshot(
        doc(db, 'studioProfiles', user.uid),
        (snap) => {
          if (snap.exists()) {
            setMyProfile(snap.data() as StudioProfile);
          }
        },
        (err) =>
          handleFirestoreError(
            err,
            OperationType.GET,
            `studioProfiles/${user.uid}`
          )
      )
    );

    // 2. Studio live state
    unsubscribers.push(
      onSnapshot(
        doc(db, 'studioState', 'main'),
        (snap) => {
          if (snap.exists()) {
            setStudioState(snap.data() as StudioState);
          } else {
            setStudioState(null);
          }
        },
        (err) =>
          handleFirestoreError(err, OperationType.GET, 'studioState/main')
      )
    );

    // 3. Model profile
    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'studioProfiles'), where('role', '==', 'model')),
        (snap) => {
          if (!snap.empty) {
            setModelProfile(snap.docs[0].data() as StudioProfile);
          } else {
            setModelProfile(null);
          }
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, 'studioProfiles(model)')
      )
    );

    // 4. All studio profiles & plans (admin) or active plans (visitor)
    if (isAdmin) {
      unsubscribers.push(
        onSnapshot(
          collection(db, 'callPlans'),
          (snap) => {
            const plans = snap.docs.map((d) => d.data() as CallPlan);
            plans.sort((a, b) => a.sortOrder - b.sortOrder);
            setCallPlans(plans);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'callPlans')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'studioProfiles'),
          (snap) => {
            const list = snap.docs.map((d) => d.data() as StudioProfile);
            setAllProfiles(list);
          },
          (err) =>
            handleFirestoreError(err, OperationType.LIST, 'studioProfiles')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'callQueue'),
          (snap) => {
            const items = snap.docs.map((d) => d.data() as CallRequest);
            items.sort((a, b) => {
              const ta = a.createdAt?.toMillis?.() ?? 0;
              const tb = b.createdAt?.toMillis?.() ?? 0;
              return tb - ta;
            });
            setCallQueue(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'callQueue')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'callMessages'),
          (snap) => {
            const msgs = snap.docs.map((d) => d.data() as CallMessage);
            msgs.sort((a, b) => {
              const ta = a.createdAt?.toMillis?.() ?? 0;
              const tb = b.createdAt?.toMillis?.() ?? 0;
              return ta - tb;
            });
            setCallMessages(msgs);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'callMessages')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'callHistory'),
          (snap) => {
            const records = snap.docs.map((d) => d.data() as CallHistoryRecord);
            records.sort((a, b) => {
              const ta = a.endedAt?.toMillis?.() ?? 0;
              const tb = b.endedAt?.toMillis?.() ?? 0;
              return tb - ta;
            });
            setCallHistory(records);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'callHistory')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'interestMessages'),
          (snap) => {
            const msgs = snap.docs.map((d) => d.data() as InterestMessage);
            msgs.sort((a, b) => {
              const ta = a.createdAt?.toMillis?.() ?? 0;
              const tb = b.createdAt?.toMillis?.() ?? 0;
              return tb - ta;
            });
            setInterestMessages(msgs);
          },
          (err) =>
            handleFirestoreError(err, OperationType.LIST, 'interestMessages')
        )
      );
    } else {
      unsubscribers.push(
        onSnapshot(
          query(collection(db, 'callPlans'), where('active', '==', true)),
          (snap) => {
            const plans = snap.docs.map((d) => d.data() as CallPlan);
            plans.sort((a, b) => a.sortOrder - b.sortOrder);
            setCallPlans(plans);
          },
          (err) =>
            handleFirestoreError(err, OperationType.LIST, 'callPlans(active)')
        )
      );

      unsubscribers.push(
        onSnapshot(
          query(
            collection(db, 'interestMessages'),
            where('userId', '==', user.uid)
          ),
          (snap) => {
            const msgs = snap.docs.map((d) => d.data() as InterestMessage);
            msgs.sort((a, b) => {
              const ta = a.createdAt?.toMillis?.() ?? 0;
              const tb = b.createdAt?.toMillis?.() ?? 0;
              return tb - ta;
            });
            setInterestMessages(msgs);
          },
          (err) =>
            handleFirestoreError(
              err,
              OperationType.LIST,
              `interestMessages(userId=${user.uid})`
            )
        )
      );

      // Viewer sees only own call requests
      unsubscribers.push(
        onSnapshot(
          query(collection(db, 'callQueue'), where('userId', '==', user.uid)),
          (snap) => {
            const items = snap.docs.map((d) => d.data() as CallRequest);
            items.sort((a, b) => {
              const ta = a.createdAt?.toMillis?.() ?? 0;
              const tb = b.createdAt?.toMillis?.() ?? 0;
              return tb - ta;
            });
            setCallQueue(items);
          },
          (err) =>
            handleFirestoreError(
              err,
              OperationType.LIST,
              `callQueue(userId=${user.uid})`
            )
        )
      );

      // Viewer sees own completed call history for post-call quality rating
      unsubscribers.push(
        onSnapshot(
          query(collection(db, 'callHistory'), where('userId', '==', user.uid)),
          (snap) => {
            const records = snap.docs.map((d) => d.data() as CallHistoryRecord);
            records.sort((a, b) => {
              const ta = a.endedAt?.toMillis?.() ?? 0;
              const tb = b.endedAt?.toMillis?.() ?? 0;
              return tb - ta;
            });
            setCallHistory(records);
          },
          (err) =>
            handleFirestoreError(
              err,
              OperationType.LIST,
              `callHistory(userId=${user.uid})`
            )
        )
      );

      // Viewer sees messages where they are sender, recipient, or shared studio room
      let sentMsgs: CallMessage[] = [];
      let recvMsgs: CallMessage[] = [];
      let roomMsgs: CallMessage[] = [];
      const mergeMessages = () => {
        const map = new Map<string, CallMessage>();
        for (const m of [...sentMsgs, ...recvMsgs, ...roomMsgs]) {
          map.set(m.id, m);
        }
        const merged = Array.from(map.values()).sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          return ta - tb;
        });
        setCallMessages(merged);
      };

      unsubscribers.push(
        onSnapshot(
          query(
            collection(db, 'callMessages'),
            where('senderUid', '==', user.uid)
          ),
          (snap) => {
            sentMsgs = snap.docs.map((d) => d.data() as CallMessage);
            mergeMessages();
          },
          (err) =>
            handleFirestoreError(
              err,
              OperationType.LIST,
              `callMessages(sender=${user.uid})`
            )
        )
      );

      unsubscribers.push(
        onSnapshot(
          query(
            collection(db, 'callMessages'),
            where('recipientUid', '==', user.uid)
          ),
          (snap) => {
            recvMsgs = snap.docs.map((d) => d.data() as CallMessage);
            mergeMessages();
          },
          (err) =>
            handleFirestoreError(
              err,
              OperationType.LIST,
              `callMessages(recipient=${user.uid})`
            )
        )
      );

      unsubscribers.push(
        onSnapshot(
          query(
            collection(db, 'callMessages'),
            where('recipientUid', '==', 'main_studio_room')
          ),
          (snap) => {
            roomMsgs = snap.docs.map((d) => d.data() as CallMessage);
            mergeMessages();
          },
          (err) =>
            handleFirestoreError(
              err,
              OperationType.LIST,
              'callMessages(recipient=main_studio_room)'
            )
        )
      );
    }

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [user, isAdmin]);

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir o login com Google.';
      setAuthError(msg);
    }
  }, []);

  const logout = useCallback(async () => {
    if (user) {
      try {
        await updateDoc(doc(db, 'studioProfiles', user.uid), {
          isOnline: false,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore offline cleanup error on logout
      }
    }
    await signOut(auth);
  }, [user]);

  const updateStudioState = useCallback(
    async (
      patch: Partial<{
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
        dndActive: boolean;
        dndUntilMs: number;
        dndScheduleEnabled: boolean;
        dndStartTime: string;
        dndEndTime: string;
      }>
    ) => {
      if (!user || !isAdmin) return;
      try {
        await updateDoc(doc(db, 'studioState', 'main'), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'studioState/main');
      }
    },
    [user, isAdmin]
  );

  const updateUserControl = useCallback(
    async (
      targetUid: string,
      patch: Partial<{
        accessStatus: AccessStatus;
        role: StudioRole;
        notes: string;
      }>
    ) => {
      if (!user || !isAdmin) return;
      try {
        await updateDoc(doc(db, 'studioProfiles', targetUid), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `studioProfiles/${targetUid}`
        );
      }
    },
    [user, isAdmin]
  );

  const requestVideoCall = useCallback(
    async (topic: string, plan: CallPlan) => {
      if (!user || !myProfile || !plan || !plan.active) return null;
      if (
        studioState?.dndActive ||
        (studioState?.dndUntilMs && studioState.dndUntilMs > Date.now())
      ) {
        return null;
      }
      const cleanTopic =
        topic.trim().slice(0, 160) || `Videochamada · ${plan.name}`;
      const id = `call_${Date.now()}_${user.uid.slice(0, 8)}`;
      try {
        await setDoc(doc(db, 'callQueue', id), {
          id,
          userId: user.uid,
          userName: myProfile.displayName,
          userPhotoUrl: myProfile.photoUrl || '',
          topic: cleanTopic,
          status: 'waiting',
          planId: plan.id,
          planName: plan.name,
          planDurationMinutes: plan.durationMinutes,
          planPriceCents: plan.priceCents,
          paymentStatus: 'authorized',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return id;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `callQueue/${id}`);
      }
    },
    [user, myProfile, studioState?.dndActive, studioState?.dndUntilMs]
  );

  const updateCallStatus = useCallback(
    async (
      requestId: string,
      status: CallStatus,
      paymentStatus?: CallPaymentStatus
    ) => {
      if (!user) return;
      try {
        await updateDoc(doc(db, 'callQueue', requestId), {
          status,
          ...(isAdmin && paymentStatus ? { paymentStatus } : {}),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `callQueue/${requestId}`
        );
      }
    },
    [isAdmin, user]
  );

  const saveCallPlan = useCallback(
    async (input: {
      id?: string;
      name: string;
      description: string;
      durationMinutes: number;
      priceCents: number;
      active: boolean;
      sortOrder: number;
    }) => {
      if (!user || !isAdmin) return;
      const cleanName = input.name.trim().slice(0, 60);
      const cleanDesc = input.description.trim().slice(0, 200);
      if (!cleanName || !cleanDesc) return;
      const safeDuration = Math.max(
        1,
        Math.min(240, Math.round(input.durationMinutes))
      );
      const safePrice = Math.max(
        100,
        Math.min(100000000, Math.round(input.priceCents))
      );
      const safeOrder = Math.max(0, Math.min(100, Math.round(input.sortOrder)));

      if (input.id) {
        try {
          await updateDoc(doc(db, 'callPlans', input.id), {
            name: cleanName,
            description: cleanDesc,
            durationMinutes: safeDuration,
            priceCents: safePrice,
            active: input.active,
            sortOrder: safeOrder,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.UPDATE,
            `callPlans/${input.id}`
          );
        }
      } else {
        const newId = `plan_${Date.now()}`;
        try {
          await setDoc(doc(db, 'callPlans', newId), {
            id: newId,
            name: cleanName,
            description: cleanDesc,
            durationMinutes: safeDuration,
            priceCents: safePrice,
            currency: 'BRL',
            active: input.active,
            sortOrder: safeOrder,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.CREATE,
            `callPlans/${newId}`
          );
        }
      }
    },
    [isAdmin, user]
  );

  const deleteCallPlan = useCallback(
    async (planId: string) => {
      if (!user || !isAdmin) return;
      try {
        await deleteDoc(doc(db, 'callPlans', planId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `callPlans/${planId}`);
      }
    },
    [isAdmin, user]
  );

  const sendCallMessage = useCallback(
    async (callId: string, recipientUid: string, text: string) => {
      if (!user || !myProfile) return;
      const cleanText = text.trim().slice(0, 500);
      if (!cleanText) return;
      const id = `msg_${Date.now()}_${user.uid.slice(0, 6)}`;
      try {
        await setDoc(doc(db, 'callMessages', id), {
          id,
          callId,
          senderUid: user.uid,
          senderName: myProfile.displayName,
          senderRole: myProfile.role,
          recipientUid,
          text: cleanText,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `callMessages/${id}`);
      }
    },
    [user, myProfile]
  );

  const recordCallHistory = useCallback(
    async (input: {
      callId: string;
      userId: string;
      userName: string;
      durationSeconds: number;
      amountCents: number;
      planId?: string;
      planName?: string;
      planDurationMinutes?: number;
    }) => {
      if (!user || !isAdmin) return;
      const safeId = `hist_${Date.now()}_${input.userId.slice(0, 6)}`;
      const safeDuration = Math.max(
        0,
        Math.min(86400, Math.round(input.durationSeconds))
      );
      const safeAmount = Math.max(
        0,
        Math.min(100000000, Math.round(input.amountCents))
      );
      try {
        await setDoc(doc(db, 'callHistory', safeId), {
          id: safeId,
          callId: input.callId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128),
          userId: input.userId,
          userName: input.userName.trim().slice(0, 80) || 'Participante',
          modelUid: user.uid,
          durationSeconds: safeDuration,
          amountCents: safeAmount,
          currency: 'BRL',
          status: 'completed',
          ...(input.planId ? { planId: input.planId.slice(0, 128) } : {}),
          ...(input.planName ? { planName: input.planName.slice(0, 60) } : {}),
          ...(input.planDurationMinutes
            ? {
                planDurationMinutes: Math.max(
                  1,
                  Math.min(240, Math.round(input.planDurationMinutes))
                ),
              }
            : {}),
          endedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `callHistory/${safeId}`);
      }
    },
    [user, isAdmin]
  );

  const updateCallHistoryStatus = useCallback(
    async (recordId: string, status: CallHistoryStatus) => {
      if (!user || !isAdmin) return;
      try {
        await updateDoc(doc(db, 'callHistory', recordId), {
          status,
        });
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `callHistory/${recordId}`
        );
      }
    },
    [user, isAdmin]
  );

  const submitCallRating = useCallback(
    async (recordId: string, rating: number, comment?: string) => {
      if (!user) return;
      const safeRating = Math.max(1, Math.min(5, Math.round(rating)));
      const cleanComment = (comment || '').trim().slice(0, 300);
      try {
        await updateDoc(doc(db, 'callHistory', recordId), {
          rating: safeRating,
          ...(cleanComment ? { ratingComment: cleanComment } : {}),
          ratedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `callHistory/${recordId}`
        );
      }
    },
    [user]
  );

  const sendInterestMessage = useCallback(
    async (input: { preferredTime: string; message: string }) => {
      if (!user || !myProfile) return null;
      const cleanMessage = input.message.trim().slice(0, 500);
      if (!cleanMessage) return null;
      const cleanPreferredTime =
        input.preferredTime.trim().slice(0, 80) || 'Qualquer horário';
      const id = `int_${Date.now()}_${user.uid.slice(0, 8)}`.replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
      );
      try {
        await setDoc(doc(db, 'interestMessages', id), {
          id,
          userId: user.uid,
          userName: myProfile.displayName.trim().slice(0, 80) || 'Participante',
          userPhotoUrl: (myProfile.photoUrl || '').slice(0, 500),
          preferredTime: cleanPreferredTime,
          message: cleanMessage,
          status: 'unread',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return id;
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.CREATE,
          `interestMessages/${id}`
        );
      }
    },
    [user, myProfile]
  );

  const updateInterestMessageStatus = useCallback(
    async (messageId: string, status: InterestMessageStatus) => {
      if (!user || !isAdmin) return;
      try {
        await updateDoc(doc(db, 'interestMessages', messageId), {
          status,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `interestMessages/${messageId}`
        );
      }
    },
    [user, isAdmin]
  );

  const deleteInterestMessage = useCallback(
    async (messageId: string) => {
      if (!user || !isAdmin) return;
      try {
        await deleteDoc(doc(db, 'interestMessages', messageId));
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.DELETE,
          `interestMessages/${messageId}`
        );
      }
    },
    [user, isAdmin]
  );

  return {
    user,
    authLoading,
    authError,
    isAdmin,
    myProfile,
    modelProfile,
    allProfiles,
    studioState,
    callQueue,
    callMessages,
    callHistory,
    interestMessages,
    callPlans,
    loginWithGoogle,
    logout,
    updateStudioState,
    updateUserControl,
    requestVideoCall,
    updateCallStatus,
    saveCallPlan,
    deleteCallPlan,
    sendCallMessage,
    recordCallHistory,
    updateCallHistoryStatus,
    submitCallRating,
    sendInterestMessage,
    updateInterestMessageStatus,
    deleteInterestMessage,
  };
}
