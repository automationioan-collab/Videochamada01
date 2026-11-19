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
import {
  DEFAULT_SCHEDULE_PERIODS,
  sanitizeHolidayDates,
  sanitizeSchedulePeriods,
} from '../lib/schedule';
import {
  DEFAULT_GALLERY_ITEMS,
  DEFAULT_STUDIO_CONFIG,
} from '../lib/studioDefaults';
import type {
  AccessStatus,
  CallHistoryRecord,
  CallHistoryStatus,
  CallMessage,
  CallPaymentStatus,
  CallPlan,
  CallRequest,
  CallStatus,
  GalleryCategoryType,
  GalleryItemRecord,
  InterestMessage,
  InterestMessageStatus,
  StudioConfig,
  StudioProfile,
  StudioRole,
  StudioState,
  StudioStateUpdatePatch,
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
  const [listenerError, setListenerError] = useState<Error | null>(null);
  const [myProfile, setMyProfile] = useState<StudioProfile | null>(null);
  const [modelProfile, setModelProfile] = useState<StudioProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<StudioProfile[]>([]);
  const [studioState, setStudioState] = useState<StudioState | null>(null);
  const [studioConfig, setStudioConfig] = useState<StudioConfig | null>(null);
  const [galleryItems, setGalleryItems] = useState<GalleryItemRecord[]>([]);
  const [callQueue, setCallQueue] = useState<CallRequest[]>([]);
  const [callMessages, setCallMessages] = useState<CallMessage[]>([]);
  const [callHistory, setCallHistory] = useState<CallHistoryRecord[]>([]);
  const [interestMessages, setInterestMessages] = useState<InterestMessage[]>(
    []
  );
  const [callPlans, setCallPlans] = useState<CallPlan[]>([]);

  const reportListenerError = useCallback(
    (
      err: unknown,
      operationType: OperationType,
      path: string,
      isPublicFallback = false
    ) => {
      try {
        handleFirestoreError(err, operationType, path);
      } catch (caught) {
        if (!isPublicFallback) {
          setListenerError(
            caught instanceof Error ? caught : new Error(String(caught))
          );
        }
      }
    },
    []
  );

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
        const existingData = snap.data() as StudioProfile;
        await updateDoc(profileRef, {
          displayName: existingData.displayName || cleanName,
          photoUrl: existingData.photoUrl || cleanPhoto,
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
            schedulePeriods: DEFAULT_SCHEDULE_PERIODS.map((p) => ({ ...p })),
            holidayDates: [],
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

      // Seed public studioConfig/public on first admin login if empty
      try {
        const configRef = doc(db, 'studioConfig', 'public');
        const configSnap = await getDoc(configRef);
        if (!configSnap.exists()) {
          await setDoc(configRef, {
            modelUid: firebaseUser.uid,
            ...DEFAULT_STUDIO_CONFIG,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'studioConfig/public');
      }

      // Seed editorial gallery items on first admin login if empty
      try {
        const gallerySnap = await getDocs(collection(db, 'galleryItems'));
        if (gallerySnap.empty) {
          await Promise.all(
            DEFAULT_GALLERY_ITEMS.map((item) =>
              setDoc(doc(db, 'galleryItems', item.id), {
                ...item,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            )
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'galleryItems');
      }
    }
  }, []);

  useEffect(() => {
    let settled = false;
    const bootTimer = window.setTimeout(() => {
      if (!settled) {
        setAuthLoading(false);
      }
    }, 3500);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      settled = true;
      window.clearTimeout(bootTimer);
      setUser(firebaseUser);
      setListenerError(null);
      setAuthLoading(false);

      if (firebaseUser) {
        void syncUserDocuments(firebaseUser).catch((err) => {
          console.error('Erro ao sincronizar perfil:', err);
        });
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
    });

    return () => {
      window.clearTimeout(bootTimer);
      unsubscribe();
    };
  }, [syncUserDocuments]);

  // Public non-PII showcase config & gallery listeners (degrade gracefully to defaults on failure)
  useEffect(() => {
    const unsubConfig = onSnapshot(
      doc(db, 'studioConfig', 'public'),
      (snap) => {
        if (snap.exists()) {
          setStudioConfig(snap.data() as StudioConfig);
        } else {
          setStudioConfig(null);
        }
      },
      (err) => {
        setStudioConfig(null);
        reportListenerError(err, OperationType.GET, 'studioConfig/public', true);
      }
    );

    const galleryQuery = isAdmin
      ? collection(db, 'galleryItems')
      : query(collection(db, 'galleryItems'), where('active', '==', true));

    const unsubGallery = onSnapshot(
      galleryQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as GalleryItemRecord);
        list.sort((a, b) => a.sortOrder - b.sortOrder);
        setGalleryItems(list);
      },
      (err) => {
        setGalleryItems([]);
        reportListenerError(err, OperationType.LIST, 'galleryItems', true);
      }
    );

    return () => {
      unsubConfig();
      unsubGallery();
    };
  }, [isAdmin, reportListenerError]);

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
          reportListenerError(
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
          reportListenerError(err, OperationType.GET, 'studioState/main')
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
          reportListenerError(err, OperationType.LIST, 'studioProfiles(model)')
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
          (err) => reportListenerError(err, OperationType.LIST, 'callPlans')
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
            reportListenerError(err, OperationType.LIST, 'studioProfiles')
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
          (err) => reportListenerError(err, OperationType.LIST, 'callQueue')
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
          (err) => reportListenerError(err, OperationType.LIST, 'callMessages')
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
          (err) => reportListenerError(err, OperationType.LIST, 'callHistory')
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
            reportListenerError(err, OperationType.LIST, 'interestMessages')
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
            reportListenerError(err, OperationType.LIST, 'callPlans(active)')
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
            reportListenerError(
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
            reportListenerError(
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
            reportListenerError(
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
            reportListenerError(
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
            reportListenerError(
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
            reportListenerError(
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
  }, [user, isAdmin, reportListenerError]);

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code || '')
          : '';
      let msg = 'Não foi possível concluir o login com Google.';
      if (code === 'auth/popup-blocked') {
        msg =
          'O navegador bloqueou a janela de login do Google. Libere pop-ups para este site e tente novamente.';
      } else if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        msg = 'A janela de login foi fechada antes da conclusão.';
      } else if (code === 'auth/unauthorized-domain') {
        msg =
          'Este domínio ainda não está autorizado para autenticação Google no projeto Firebase.';
      } else if (code === 'auth/operation-not-supported-in-this-environment') {
        msg =
          'Ambiente sem suporte a pop-up/cookies de terceiros. Abra o site em uma nova aba para entrar.';
      } else if (code === 'auth/network-request-failed') {
        msg = 'Falha de conexão com a autenticação Google. Verifique sua rede.';
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
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
    async (patch: StudioStateUpdatePatch) => {
      if (!user || !isAdmin) return;
      const sanitizedPatch: Record<string, unknown> = {
        ...patch,
        updatedAt: serverTimestamp(),
      };
      if (patch.schedulePeriods !== undefined) {
        const cleanPeriods = sanitizeSchedulePeriods(patch.schedulePeriods);
        sanitizedPatch.schedulePeriods = cleanPeriods;
        const primary = cleanPeriods.find((p) => p.enabled) ?? cleanPeriods[0];
        if (primary) {
          if (patch.scheduleStartTime === undefined) {
            sanitizedPatch.scheduleStartTime = primary.startTime;
          }
          if (patch.scheduleEndTime === undefined) {
            sanitizedPatch.scheduleEndTime = primary.endTime;
          }
          if (patch.scheduleDays === undefined) {
            sanitizedPatch.scheduleDays = primary.days;
          }
        } else {
          if (patch.scheduleDays === undefined) {
            sanitizedPatch.scheduleDays = '';
          }
        }
      }
      if (patch.holidayDates !== undefined) {
        sanitizedPatch.holidayDates = sanitizeHolidayDates(patch.holidayDates);
      }
      try {
        await updateDoc(doc(db, 'studioState', 'main'), sanitizedPatch);
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
        displayName: string;
        photoUrl: string;
        accessStatus: AccessStatus;
        role: StudioRole;
        notes: string;
      }>
    ) => {
      if (!user || !isAdmin) return;
      const sanitizedPatch: Record<string, unknown> = {
        ...patch,
        updatedAt: serverTimestamp(),
      };
      if (typeof patch.displayName === 'string') {
        sanitizedPatch.displayName =
          patch.displayName.trim().slice(0, 80) || 'Participante';
      }
      if (typeof patch.photoUrl === 'string') {
        sanitizedPatch.photoUrl = patch.photoUrl.trim().slice(0, 500);
      }
      if (typeof patch.notes === 'string') {
        sanitizedPatch.notes = patch.notes.trim().slice(0, 300);
      }
      try {
        await updateDoc(doc(db, 'studioProfiles', targetUid), sanitizedPatch);
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

  const deleteUserProfile = useCallback(
    async (targetUid: string) => {
      if (!user || !isAdmin || targetUid === user.uid) return;
      try {
        await deleteDoc(doc(db, 'studioProfiles', targetUid));
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.DELETE,
          `studioProfiles/${targetUid}`
        );
      }
    },
    [user, isAdmin]
  );

  const saveStudioConfig = useCallback(
    async (patch: Partial<Omit<StudioConfig, 'modelUid' | 'updatedAt'>>) => {
      if (!user || !isAdmin) return;
      const merged = {
        ...DEFAULT_STUDIO_CONFIG,
        ...(studioConfig || {}),
        ...patch,
      };
      const cleanModelName =
        merged.modelName.trim().slice(0, 80) || DEFAULT_STUDIO_CONFIG.modelName;
      const cleanBrand =
        merged.studioBrand.trim().slice(0, 60) ||
        DEFAULT_STUDIO_CONFIG.studioBrand;
      const cleanHeroTitle =
        merged.heroTitle.trim().slice(0, 120) ||
        DEFAULT_STUDIO_CONFIG.heroTitle;
      const cleanHeroSubtitle =
        merged.heroSubtitle.trim().slice(0, 300) ||
        DEFAULT_STUDIO_CONFIG.heroSubtitle;
      const cleanHeadline =
        merged.headline.trim().slice(0, 160) || DEFAULT_STUDIO_CONFIG.headline;
      const cleanGroupLabel =
        merged.groupButtonLabel.trim().slice(0, 60) ||
        DEFAULT_STUDIO_CONFIG.groupButtonLabel;
      const cleanPrivateLabel =
        merged.privateButtonLabel.trim().slice(0, 60) ||
        DEFAULT_STUDIO_CONFIG.privateButtonLabel;
      const safeRate = Math.max(
        100,
        Math.min(1000000, Math.round(merged.ratePerMinuteCents || 1500))
      );

      const configRef = doc(db, 'studioConfig', 'public');
      try {
        if (studioConfig) {
          await updateDoc(configRef, {
            studioBrand: cleanBrand,
            modelName: cleanModelName,
            modelAvatarUrl: (merged.modelAvatarUrl || '').trim().slice(0, 500),
            heroImageUrl: (merged.heroImageUrl || '').trim().slice(0, 500),
            loungeImageUrl: (merged.loungeImageUrl || '').trim().slice(0, 500),
            modelBio: (merged.modelBio || '').trim().slice(0, 300),
            heroTitle: cleanHeroTitle,
            heroSubtitle: cleanHeroSubtitle,
            headline: cleanHeadline,
            groupButtonLabel: cleanGroupLabel,
            privateButtonLabel: cleanPrivateLabel,
            ratePerMinuteCents: safeRate,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(configRef, {
            modelUid: user.uid,
            studioBrand: cleanBrand,
            modelName: cleanModelName,
            modelAvatarUrl: (merged.modelAvatarUrl || '').trim().slice(0, 500),
            heroImageUrl: (merged.heroImageUrl || '').trim().slice(0, 500),
            loungeImageUrl: (merged.loungeImageUrl || '').trim().slice(0, 500),
            modelBio: (merged.modelBio || '').trim().slice(0, 300),
            heroTitle: cleanHeroTitle,
            heroSubtitle: cleanHeroSubtitle,
            headline: cleanHeadline,
            groupButtonLabel: cleanGroupLabel,
            privateButtonLabel: cleanPrivateLabel,
            ratePerMinuteCents: safeRate,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'studioConfig/public');
      }

      // Synchronize headline & model name into live studioState and model profile
      try {
        await updateDoc(doc(db, 'studioState', 'main'), {
          modelName: cleanModelName,
          headline: cleanHeadline.slice(0, 140),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore if studioState not yet initialized
      }

      try {
        await updateDoc(doc(db, 'studioProfiles', user.uid), {
          displayName: cleanModelName,
          photoUrl: (merged.modelAvatarUrl || '').trim().slice(0, 500),
          notes: (merged.modelBio || '').trim().slice(0, 300),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore transient profile sync error
      }
    },
    [isAdmin, studioConfig, user]
  );

  const saveGalleryItem = useCallback(
    async (input: {
      id?: string;
      title: string;
      caption: string;
      category: GalleryCategoryType;
      specs: string;
      src: string;
      alt: string;
      sortOrder: number;
      active: boolean;
    }) => {
      if (!user || !isAdmin) return;
      const cleanTitle = input.title.trim().slice(0, 80);
      const cleanCaption = input.caption.trim().slice(0, 240);
      const cleanSpecs = input.specs.trim().slice(0, 80) || 'Estúdio Oficial';
      const cleanSrc = input.src.trim().slice(0, 500);
      const cleanAlt =
        input.alt.trim().slice(0, 160) || `${cleanTitle} · Galeria do Estúdio`;
      if (!cleanTitle || !cleanCaption || !cleanSrc) return;

      const safeOrder = Math.max(0, Math.min(100, Math.round(input.sortOrder)));

      if (input.id) {
        try {
          await updateDoc(doc(db, 'galleryItems', input.id), {
            title: cleanTitle,
            caption: cleanCaption,
            category: input.category,
            specs: cleanSpecs,
            src: cleanSrc,
            alt: cleanAlt,
            sortOrder: safeOrder,
            active: input.active,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.UPDATE,
            `galleryItems/${input.id}`
          );
        }
      } else {
        const newId = `gal_${Date.now()}`;
        try {
          await setDoc(doc(db, 'galleryItems', newId), {
            id: newId,
            title: cleanTitle,
            caption: cleanCaption,
            category: input.category,
            specs: cleanSpecs,
            src: cleanSrc,
            alt: cleanAlt,
            sortOrder: safeOrder,
            active: input.active,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.CREATE,
            `galleryItems/${newId}`
          );
        }
      }
    },
    [isAdmin, user]
  );

  const deleteGalleryItem = useCallback(
    async (itemId: string) => {
      if (!user || !isAdmin) return;
      try {
        await deleteDoc(doc(db, 'galleryItems', itemId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `galleryItems/${itemId}`);
      }
    },
    [isAdmin, user]
  );

  const restoreDefaultGallery = useCallback(async () => {
    if (!user || !isAdmin) return;
    try {
      await Promise.all(
        DEFAULT_GALLERY_ITEMS.map((item) =>
          setDoc(doc(db, 'galleryItems', item.id), {
            ...item,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'galleryItems');
    }
  }, [isAdmin, user]);

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

  const deleteCallRequest = useCallback(
    async (requestId: string) => {
      if (!user || !isAdmin) return;
      try {
        await deleteDoc(doc(db, 'callQueue', requestId));
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.DELETE,
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

  const updateCallHistoryRecord = useCallback(
    async (
      recordId: string,
      patch: Partial<{
        durationSeconds: number;
        amountCents: number;
        status: CallHistoryStatus;
      }>
    ) => {
      if (!user || !isAdmin) return;
      const cleanPatch: Record<string, unknown> = {};
      if (typeof patch.durationSeconds === 'number') {
        cleanPatch.durationSeconds = Math.max(
          0,
          Math.min(86400, Math.round(patch.durationSeconds))
        );
      }
      if (typeof patch.amountCents === 'number') {
        cleanPatch.amountCents = Math.max(
          0,
          Math.min(100000000, Math.round(patch.amountCents))
        );
      }
      if (patch.status) {
        cleanPatch.status = patch.status;
      }
      try {
        await updateDoc(doc(db, 'callHistory', recordId), cleanPatch);
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

  const deleteCallHistoryRecord = useCallback(
    async (recordId: string) => {
      if (!user || !isAdmin) return;
      try {
        await deleteDoc(doc(db, 'callHistory', recordId));
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.DELETE,
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
    listenerError,
    isAdmin,
    myProfile,
    modelProfile,
    allProfiles,
    studioState,
    studioConfig,
    galleryItems,
    callQueue,
    callMessages,
    callHistory,
    interestMessages,
    callPlans,
    loginWithGoogle,
    logout,
    updateStudioState,
    saveStudioConfig,
    saveGalleryItem,
    deleteGalleryItem,
    restoreDefaultGallery,
    updateUserControl,
    deleteUserProfile,
    requestVideoCall,
    updateCallStatus,
    deleteCallRequest,
    saveCallPlan,
    deleteCallPlan,
    sendCallMessage,
    recordCallHistory,
    updateCallHistoryStatus,
    updateCallHistoryRecord,
    deleteCallHistoryRecord,
    submitCallRating,
    sendInterestMessage,
    updateInterestMessageStatus,
    deleteInterestMessage,
  };
}
