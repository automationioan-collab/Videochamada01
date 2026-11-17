import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
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
  CallRequest,
  CallStatus,
  StudioCallMode,
  StudioProfile,
  StudioRole,
  StudioState,
} from '../types/studio';

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

    // 4. All studio profiles (admin only)
    if (isAdmin) {
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
    } else {
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

      // Viewer sees messages where they are sender or recipient
      let sentMsgs: CallMessage[] = [];
      let recvMsgs: CallMessage[] = [];
      const mergeMessages = () => {
        const map = new Map<string, CallMessage>();
        for (const m of [...sentMsgs, ...recvMsgs]) {
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
    async (topic: string) => {
      if (!user || !myProfile) return null;
      const cleanTopic = topic.trim().slice(0, 160) || 'Chamada privada com a modelo';
      const id = `call_${Date.now()}_${user.uid.slice(0, 8)}`;
      try {
        await setDoc(doc(db, 'callQueue', id), {
          id,
          userId: user.uid,
          userName: myProfile.displayName,
          userPhotoUrl: myProfile.photoUrl || '',
          topic: cleanTopic,
          status: 'waiting',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return id;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `callQueue/${id}`);
      }
    },
    [user, myProfile]
  );

  const updateCallStatus = useCallback(
    async (requestId: string, status: CallStatus) => {
      if (!user) return;
      try {
        await updateDoc(doc(db, 'callQueue', requestId), {
          status,
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
    [user]
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
    loginWithGoogle,
    logout,
    updateStudioState,
    updateUserControl,
    requestVideoCall,
    updateCallStatus,
    sendCallMessage,
    recordCallHistory,
    updateCallHistoryStatus,
  };
}
