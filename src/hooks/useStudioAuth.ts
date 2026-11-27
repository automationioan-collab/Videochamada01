import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
} from '../lib/firebase';
import {
  sanitizeDailyPausePeriods,
  sanitizeHolidayDates,
  sanitizeSchedulePeriods,
  sanitizeWeeklyBlockedDays,
} from '../lib/schedule';
import { hydrateTimestampFields } from '../lib/timestampAdapter';
import type {
  AccessStatus,
  CallEntryIntent,
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
  MediaAssetType,
  MediaVisibility,
  MercadoPagoPaymentMethod,
  ModelAccountSummary,
  PixChargeKind,
  PixChargeRecord,
  PrivateAlbumItemRecord,
  PrivateAlbumSummary,
  PublicApprovalStatus,
  PublicModelSummary,
  PublicRatingRecord,
  StudioConfig,
  StudioProfile,
  StudioRole,
  StudioState,
  StudioStateUpdatePatch,
  WhatsappInviteRecord,
} from '../types/studio';

export const DEFAULT_PRIMARY_MODEL_ID = 'lorena_noir';
const PUBLIC_MODEL_STORAGE_KEY = 'model_gat_selected_public_model';
const LEGACY_MODEL_SESSION_STORAGE_KEY = 'model_gat_model_session_token';

function resolveInitialPublicModelId(): string {
  if (typeof window === 'undefined') return DEFAULT_PRIMARY_MODEL_ID;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('modelo')?.trim();
    if (fromQuery) return fromQuery;
    const saved = window.sessionStorage.getItem(PUBLIC_MODEL_STORAGE_KEY);
    if (saved) return saved;
  } catch {
    // Ignore storage/URL access failures
  }
  return DEFAULT_PRIMARY_MODEL_ID;
}

interface ModelSessionState {
  token: string;
  model: ModelAccountSummary;
}

export function useStudioAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [modelSession, setModelSession] = useState<ModelSessionState | null>(
    null
  );
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [modelAuthError, setModelAuthError] = useState<string | null>(null);
  const [modelAuthSubmitting, setModelAuthSubmitting] = useState(false);
  const [primaryNeedsClaim, setPrimaryNeedsClaim] = useState(false);
  const [primaryClaimInfo, setPrimaryClaimInfo] = useState<{
    displayName: string;
    loginUsername: string;
  } | null>(null);

  const [publicModels, setPublicModels] = useState<PublicModelSummary[]>([]);
  const [selectedPublicModelId, setSelectedPublicModelIdState] = useState<string>(
    () => resolveInitialPublicModelId()
  );
  const [publicRatings, setPublicRatings] = useState<PublicRatingRecord[]>([]);
  const [publicShowcaseLoading, setPublicShowcaseLoading] = useState<boolean>(false);

  const [myProfile, setMyProfile] = useState<StudioProfile | null>(null);
  const [modelProfile, setModelProfile] = useState<StudioProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<StudioProfile[]>([]);
  const [studioState, setStudioState] = useState<StudioState | null>(null);
  const [studioConfig, setStudioConfig] = useState<StudioConfig | null>(null);
  const [galleryItems, setGalleryItems] = useState<GalleryItemRecord[]>([]);
  const [privateAlbumSummary, setPrivateAlbumSummary] =
    useState<PrivateAlbumSummary | null>(null);
  const [privateAlbumItems, setPrivateAlbumItems] = useState<
    PrivateAlbumItemRecord[]
  >([]);
  const [visitorUnlockedPrivateItems, setVisitorUnlockedPrivateItems] =
    useState<PrivateAlbumItemRecord[]>([]);
  const [callQueue, setCallQueue] = useState<CallRequest[]>([]);
  const [callMessages, setCallMessages] = useState<CallMessage[]>([]);
  const [callHistory, setCallHistory] = useState<CallHistoryRecord[]>([]);
  const [interestMessages, setInterestMessages] = useState<InterestMessage[]>(
    []
  );
  const [callPlans, setCallPlans] = useState<CallPlan[]>([]);
  const [pixCharges, setPixCharges] = useState<PixChargeRecord[]>([]);
  const [whatsappInvites, setWhatsappInvites] = useState<WhatsappInviteRecord[]>(
    []
  );

  const setSelectedPublicModelId = useCallback((modelId: string) => {
    const cleanId = modelId.trim() || DEFAULT_PRIMARY_MODEL_ID;
    setSelectedPublicModelIdState((prev) => {
      if (prev !== cleanId) {
        setPublicShowcaseLoading(true);
      }
      return cleanId;
    });
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(PUBLIC_MODEL_STORAGE_KEY, cleanId);
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  const isAdmin = useMemo(() => Boolean(modelSession), [modelSession]);

  const activeModelId = useMemo(() => {
    if (modelSession) return modelSession.model.id;
    return selectedPublicModelId;
  }, [modelSession, selectedPublicModelId]);

  const effectiveActorUid = useMemo(() => {
    if (modelSession) return `model_${modelSession.model.id}`;
    return user?.uid || '';
  }, [modelSession, user?.uid]);

  const activeAdminThemeId = useMemo(() => {
    if (modelSession?.model.adminThemeColor) {
      return modelSession.model.adminThemeColor;
    }
    return 'rose_velvet';
  }, [modelSession]);

  const authHeaderRef = useRef<() => Promise<Record<string, string>>>(
    async () => ({})
  );

  const getOperatorHeaders = useCallback(async (): Promise<
    Record<string, string>
  > => {
    if (modelSession) {
      return {
        Authorization: `Bearer ${modelSession.token}`,
      };
    }
    return {};
  }, [modelSession]);

  authHeaderRef.current = getOperatorHeaders;

  const getVisitorHeaders = useCallback(async (): Promise<
    Record<string, string>
  > => {
    if (!user) return {};
    const token = await user.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
    };
  }, [user]);

  const syncUserDocuments = useCallback(async (firebaseUser: User) => {
    const cleanName = (firebaseUser.displayName || 'Participante')
      .trim()
      .slice(0, 80);
    const cleanPhoto = (firebaseUser.photoURL || '').slice(0, 500);

    const profileRef = doc(db, 'studioProfiles', firebaseUser.uid);
    try {
      const snap = await getDoc(profileRef);
      if (!snap.exists()) {
        await setDoc(profileRef, {
          uid: firebaseUser.uid,
          displayName: cleanName,
          photoUrl: cleanPhoto,
          role: 'viewer',
          accessStatus: 'active',
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
  }, []);

  const refreshBootstrapStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/model-auth/bootstrap-status');
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok?: boolean;
        primaryNeedsClaim?: boolean;
        primaryDisplayName?: string;
        primaryLoginUsername?: string;
      };
      if (json.ok && json.primaryNeedsClaim) {
        setPrimaryNeedsClaim(true);
        setPrimaryClaimInfo({
          displayName: json.primaryDisplayName || 'Lorena Noir',
          loginUsername: json.primaryLoginUsername || 'lorena@modelgat.local',
        });
      } else {
        setPrimaryNeedsClaim(false);
        setPrimaryClaimInfo(null);
      }
    } catch {
      // Ignore transient bootstrap status check failure
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let firebaseSettled = false;

    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(LEGACY_MODEL_SESSION_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
    }

    void refreshBootstrapStatus();

    const finishIfReady = () => {
      if (firebaseSettled && !disposed) {
        setAuthLoading(false);
      }
    };

    const bootTimer = window.setTimeout(() => {
      if (!disposed) setAuthLoading(false);
    }, 3500);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      firebaseSettled = true;
      window.clearTimeout(bootTimer);
      setUser(firebaseUser);
      finishIfReady();

      if (firebaseUser) {
        void syncUserDocuments(firebaseUser).catch((err) => {
          console.error('Erro ao sincronizar perfil:', err);
        });
      }
    });

    return () => {
      disposed = true;
      window.clearTimeout(bootTimer);
      unsubscribe();
    };
  }, [refreshBootstrapStatus, syncUserDocuments]);

  const applyWorkspaceSnapshot = useCallback(
    (json: Record<string, unknown>) => {
      if (json.myProfile && typeof json.myProfile === 'object') {
        setMyProfile(
          hydrateTimestampFields(json.myProfile as Record<string, unknown>) as unknown as StudioProfile
        );
      } else {
        setMyProfile(null);
      }

      if (json.modelProfile && typeof json.modelProfile === 'object') {
        setModelProfile(
          hydrateTimestampFields(json.modelProfile as Record<string, unknown>) as unknown as StudioProfile
        );
      } else {
        setModelProfile(null);
      }

      if (Array.isArray(json.allProfiles)) {
        setAllProfiles(
          json.allProfiles.map((p) =>
            hydrateTimestampFields(p as Record<string, unknown>)
          ) as unknown as StudioProfile[]
        );
      } else {
        setAllProfiles([]);
      }

      if (json.studioState && typeof json.studioState === 'object') {
        setStudioState(
          hydrateTimestampFields(
            json.studioState as Record<string, unknown>
          ) as unknown as StudioState
        );
      } else {
        setStudioState(null);
      }

      if (json.studioConfig && typeof json.studioConfig === 'object') {
        setStudioConfig(
          hydrateTimestampFields(
            json.studioConfig as Record<string, unknown>
          ) as unknown as StudioConfig
        );
      } else {
        setStudioConfig(null);
      }

      if (Array.isArray(json.galleryItems)) {
        setGalleryItems(
          json.galleryItems.map((g) =>
            hydrateTimestampFields(g as Record<string, unknown>)
          ) as unknown as GalleryItemRecord[]
        );
      } else {
        setGalleryItems([]);
      }

      if (json.privateAlbumSummary && typeof json.privateAlbumSummary === 'object') {
        setPrivateAlbumSummary(
          json.privateAlbumSummary as PrivateAlbumSummary
        );
      } else {
        setPrivateAlbumSummary(null);
      }

      if (Array.isArray(json.privateAlbumItems)) {
        setPrivateAlbumItems(
          json.privateAlbumItems.map((item) =>
            hydrateTimestampFields(item as Record<string, unknown>)
          ) as unknown as PrivateAlbumItemRecord[]
        );
      } else {
        setPrivateAlbumItems([]);
      }

      if (Array.isArray(json.unlockedPrivateItems)) {
        setVisitorUnlockedPrivateItems(
          json.unlockedPrivateItems.map((item) =>
            hydrateTimestampFields(item as Record<string, unknown>)
          ) as unknown as PrivateAlbumItemRecord[]
        );
      } else {
        setVisitorUnlockedPrivateItems([]);
      }

      if (Array.isArray(json.callPlans)) {
        setCallPlans(
          json.callPlans.map((p) =>
            hydrateTimestampFields(p as Record<string, unknown>)
          ) as unknown as CallPlan[]
        );
      } else {
        setCallPlans([]);
      }

      if (Array.isArray(json.callQueue)) {
        setCallQueue(
          json.callQueue.map((q) =>
            hydrateTimestampFields(q as Record<string, unknown>)
          ) as unknown as CallRequest[]
        );
      } else {
        setCallQueue([]);
      }

      if (Array.isArray(json.callMessages)) {
        setCallMessages(
          json.callMessages.map((m) =>
            hydrateTimestampFields(m as Record<string, unknown>)
          ) as unknown as CallMessage[]
        );
      } else {
        setCallMessages([]);
      }

      if (Array.isArray(json.callHistory)) {
        setCallHistory(
          json.callHistory.map((h) =>
            hydrateTimestampFields(h as Record<string, unknown>)
          ) as unknown as CallHistoryRecord[]
        );
      } else {
        setCallHistory([]);
      }

      if (Array.isArray(json.interestMessages)) {
        setInterestMessages(
          json.interestMessages.map((m) =>
            hydrateTimestampFields(m as Record<string, unknown>)
          ) as unknown as InterestMessage[]
        );
      } else {
        setInterestMessages([]);
      }

      if (Array.isArray(json.pixCharges)) {
        setPixCharges(json.pixCharges as PixChargeRecord[]);
      } else {
        setPixCharges([]);
      }

      if (Array.isArray(json.whatsappInvites)) {
        setWhatsappInvites(json.whatsappInvites as WhatsappInviteRecord[]);
      } else {
        setWhatsappInvites([]);
      }
    },
    []
  );

  const refreshPublicModels = useCallback(async () => {
    try {
      const res = await fetch('/api/models/public');
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok?: boolean;
        models?: PublicModelSummary[];
      };
      if (json.ok && Array.isArray(json.models)) {
        setPublicModels(json.models);
        if (
          json.models.length > 0 &&
          !json.models.some((m) => m.id === selectedPublicModelId)
        ) {
          setSelectedPublicModelId(json.models[0].id);
        }
      }
    } catch {
      // Ignore transient public catalog fetch error
    }
  }, [selectedPublicModelId, setSelectedPublicModelId]);

  const refreshPublicShowcase = useCallback(async (modelId: string) => {
    setPublicShowcaseLoading(true);
    try {
      const headers = user ? await getVisitorHeaders() : {};
      const res = await fetch(
        `/api/models/public/${encodeURIComponent(modelId)}`,
        { headers }
      );
      if (!res.ok) return;
      const json = (await res.json()) as Record<string, unknown>;
      if (json.ok) {
        if (json.studioConfig && typeof json.studioConfig === 'object') {
          setStudioConfig(
            hydrateTimestampFields(
              json.studioConfig as Record<string, unknown>
            ) as unknown as StudioConfig
          );
        }
        if (json.studioState && typeof json.studioState === 'object') {
          setStudioState(
            hydrateTimestampFields(
              json.studioState as Record<string, unknown>
            ) as unknown as StudioState
          );
        }
        if (Array.isArray(json.galleryItems)) {
          setGalleryItems(
            json.galleryItems.map((g) =>
              hydrateTimestampFields(g as Record<string, unknown>)
            ) as unknown as GalleryItemRecord[]
          );
        } else {
          setGalleryItems([]);
        }
        if (Array.isArray(json.callPlans)) {
          setCallPlans(
            json.callPlans.map((p) =>
              hydrateTimestampFields(p as Record<string, unknown>)
            ) as unknown as CallPlan[]
          );
        } else {
          setCallPlans([]);
        }
        if (
          json.privateAlbumSummary &&
          typeof json.privateAlbumSummary === 'object'
        ) {
          setPrivateAlbumSummary(
            json.privateAlbumSummary as PrivateAlbumSummary
          );
        } else {
          setPrivateAlbumSummary(null);
        }
        if (Array.isArray(json.publicRatings)) {
          setPublicRatings(json.publicRatings as PublicRatingRecord[]);
        } else {
          setPublicRatings([]);
        }
        if (!user) {
          setVisitorUnlockedPrivateItems([]);
        }
      }
    } catch {
      // Ignore transient error
    } finally {
      setPublicShowcaseLoading(false);
    }
  }, [getVisitorHeaders, user]);

  const refreshWorkspace = useCallback(async () => {
    if (modelSession) {
      try {
        const headers = await authHeaderRef.current();
        const res = await fetch('/api/model/workspace', { headers });
        if (res.status === 401 || res.status === 403) {
          setModelSession(null);
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as Record<string, unknown>;
        if (json.ok) {
          applyWorkspaceSnapshot(json);
        }
      } catch {
        // Ignore transient network error
      }
      return;
    }

    if (user) {
      try {
        const headers = await getVisitorHeaders();
        const res = await fetch(
          `/api/visitor/workspace?modelId=${encodeURIComponent(
            selectedPublicModelId
          )}`,
          { headers }
        );
        if (!res.ok) return;
        const json = (await res.json()) as Record<string, unknown>;
        if (json.ok) {
          applyWorkspaceSnapshot(json);
        }
      } catch {
        // Ignore transient network error
      }
      return;
    }

    void refreshPublicShowcase(selectedPublicModelId);
  }, [
    applyWorkspaceSnapshot,
    getVisitorHeaders,
    modelSession,
    refreshPublicShowcase,
    selectedPublicModelId,
    user,
  ]);

  useEffect(() => {
    void refreshPublicModels();
  }, [refreshPublicModels]);

  useEffect(() => {
    void refreshWorkspace();
  }, [
    refreshWorkspace,
    activeModelId,
    modelSession,
    user,
    selectedPublicModelId,
  ]);

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    setModelSession(null);
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
        msg =
          'Falha de conexão com a autenticação Google. Verifique sua rede.';
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
      setAuthError(msg);
    }
  }, []);

  const loginAsModel = useCallback(async (login: string, password: string) => {
    setModelAuthError(null);
    setModelAuthSubmitting(true);
    try {
      const res = await fetch('/api/model-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), password }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        token?: string;
        model?: ModelAccountSummary;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.token || !json.model) {
        setModelAuthError(json.error || 'Login ou senha inválidos.');
        return false;
      }
      // Sign out any visitor Google session so only this model's private session is active
      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch {
          // Ignore secondary cleanup error
        }
      }
      setModelSession({ token: json.token, model: json.model });
      setVisitorUnlockedPrivateItems([]);
      setAuthError(null);
      return true;
    } catch {
      setModelAuthError(
        'Não foi possível conectar ao servidor de autenticação.'
      );
      return false;
    } finally {
      setModelAuthSubmitting(false);
    }
  }, []);

  const claimPrimaryModelPassword = useCallback(
    async (input: {
      password: string;
      loginUsername?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      setModelAuthError(null);
      setModelAuthSubmitting(true);
      try {
        const res = await fetch('/api/model-auth/claim-primary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          token?: string;
          model?: ModelAccountSummary;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.token || !json.model) {
          const errMsg =
            json.error ||
            'Não foi possível definir a senha inicial do painel principal.';
          setModelAuthError(errMsg);
          await refreshBootstrapStatus();
          return { ok: false, error: errMsg };
        }
        if (auth.currentUser) {
          try {
            await signOut(auth);
          } catch {
            // Ignore secondary cleanup error
          }
        }
        setModelSession({ token: json.token, model: json.model });
        setPrimaryNeedsClaim(false);
        setPrimaryClaimInfo(null);
        setVisitorUnlockedPrivateItems([]);
        setAuthError(null);
        void refreshPublicModels();
        return { ok: true };
      } catch {
        const errMsg =
          'Não foi possível conectar ao servidor para concluir a configuração inicial.';
        setModelAuthError(errMsg);
        return { ok: false, error: errMsg };
      } finally {
        setModelAuthSubmitting(false);
      }
    },
    [refreshBootstrapStatus, refreshPublicModels]
  );

  const registerAsModel = useCallback(
    async (input: {
      displayName: string;
      loginUsername: string;
      password: string;
      studioBrand?: string;
      adminThemeColor?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      setModelAuthError(null);
      setModelAuthSubmitting(true);
      try {
        const res = await fetch('/api/model-auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          token?: string;
          model?: ModelAccountSummary;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.token || !json.model) {
          const errMsg = json.error || 'Não foi possível criar o painel da modelo.';
          setModelAuthError(errMsg);
          return { ok: false, error: errMsg };
        }
        if (auth.currentUser) {
          try {
            await signOut(auth);
          } catch {
            // Ignore secondary cleanup error
          }
        }
        setModelSession({ token: json.token, model: json.model });
        setVisitorUnlockedPrivateItems([]);
        setAuthError(null);
        void refreshPublicModels();
        return { ok: true };
      } catch {
        const errMsg = 'Não foi possível conectar ao servidor para criar sua conta.';
        setModelAuthError(errMsg);
        return { ok: false, error: errMsg };
      } finally {
        setModelAuthSubmitting(false);
      }
    },
    [refreshPublicModels]
  );

  const logout = useCallback(async () => {
    if (modelSession) {
      setModelSession(null);
      setMyProfile(null);
      setModelProfile(null);
      setAllProfiles([]);
      setPrivateAlbumItems([]);
      setVisitorUnlockedPrivateItems([]);
      setCallQueue([]);
      setCallHistory([]);
      setInterestMessages([]);
      setCallMessages([]);
      setPixCharges([]);
      setWhatsappInvites([]);
      return;
    }
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
  }, [modelSession, user]);

  // ============================================================================
  // OWN PRIVATE MODEL ACCOUNT CREDENTIALS / THEME UPDATE
  // ============================================================================
  const updateMyModelAccount = useCallback(
    async (patch: {
      loginUsername?: string;
      currentPassword?: string;
      newPassword?: string;
      adminThemeColor?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      if (!modelSession) {
        return { ok: false, error: 'Sessão privativa da modelo obrigatória.' };
      }
      try {
        const headers = await authHeaderRef.current();
        const res = await fetch('/api/model/account', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(patch),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          token?: string;
          model?: ModelAccountSummary;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.model) {
          return {
            ok: false,
            error: json.error || 'Não foi possível atualizar suas credenciais.',
          };
        }
        const nextToken = json.token || modelSession.token;
        setModelSession({ token: nextToken, model: json.model });
        await refreshWorkspace();
        await refreshPublicModels();
        return { ok: true };
      } catch {
        return {
          ok: false,
          error: 'Falha de conexão ao atualizar dados privativos.',
        };
      }
    },
    [modelSession, refreshPublicModels, refreshWorkspace]
  );

  // ============================================================================
  // MODEL-SCOPED WORKSPACE MUTATIONS
  // ============================================================================
  const updateStudioState = useCallback(
    async (patch: StudioStateUpdatePatch) => {
      if (!isAdmin) return;
      const sanitizedPatch: Record<string, unknown> = { ...patch };
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
        } else if (patch.scheduleDays === undefined) {
          sanitizedPatch.scheduleDays = '';
        }
      }
      if (patch.holidayDates !== undefined) {
        sanitizedPatch.holidayDates = sanitizeHolidayDates(patch.holidayDates);
      }
      if (patch.dailyPausePeriods !== undefined) {
        sanitizedPatch.dailyPausePeriods = sanitizeDailyPausePeriods(
          patch.dailyPausePeriods
        );
      }
      if (patch.weeklyBlockedDays !== undefined) {
        sanitizedPatch.weeklyBlockedDays = sanitizeWeeklyBlockedDays(
          patch.weeklyBlockedDays
        );
      }
      if (patch.pauseWarningMinutes !== undefined) {
        const mins = Number(patch.pauseWarningMinutes);
        sanitizedPatch.pauseWarningMinutes = Number.isFinite(mins)
          ? Math.max(1, Math.min(30, Math.round(mins)))
          : 5;
      }
      if (patch.pauseWarningMessage !== undefined) {
        sanitizedPatch.pauseWarningMessage = patch.pauseWarningMessage
          .trim()
          .slice(0, 160);
      }
      const headers = await authHeaderRef.current();
      await fetch('/api/model/studio-state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(sanitizedPatch),
      });
      await refreshWorkspace();
    },
    [isAdmin, refreshWorkspace]
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
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch(`/api/model/visitors/${encodeURIComponent(targetUid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(patch),
      });
      await refreshWorkspace();
    },
    [isAdmin, refreshWorkspace]
  );

  const deleteUserProfile = useCallback(
    async (targetUid: string) => {
      if (!isAdmin || targetUid === effectiveActorUid) return;
      const headers = await authHeaderRef.current();
      await fetch(`/api/model/visitors/${encodeURIComponent(targetUid)}`, {
        method: 'DELETE',
        headers,
      });
      await refreshWorkspace();
    },
    [effectiveActorUid, isAdmin, refreshWorkspace]
  );

  const uploadStudioMedia = useCallback(
    async (
      file: File,
      _targetModelId?: string,
      allowVideo = true
    ): Promise<{
      ok: boolean;
      url?: string;
      mediaType?: MediaAssetType;
      error?: string;
    }> => {
      if (!isAdmin) {
        return { ok: false, error: 'Permissão administrativa necessária.' };
      }
      const isImage = /^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type || '');
      const isVideo =
        allowVideo && /^video\/(mp4|webm|quicktime)$/i.test(file.type || '');

      if (!isImage && !isVideo) {
        return {
          ok: false,
          error: allowVideo
            ? 'Selecione uma imagem (PNG, JPG, WEBP, GIF) ou vídeo (MP4, MOV, WEBM).'
            : 'Selecione uma imagem PNG, JPG, WEBP ou GIF.',
        };
      }
      if (isImage && file.size > 5 * 1024 * 1024) {
        return { ok: false, error: 'A imagem deve ter no máximo 5 MB.' };
      }
      if (isVideo && file.size > 40 * 1024 * 1024) {
        return { ok: false, error: 'O vídeo deve ter no máximo 40 MB.' };
      }
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') resolve(reader.result);
            else reject(new Error('Falha ao ler arquivo.'));
          };
          reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
          reader.readAsDataURL(file);
        });

        const baseHeaders = await authHeaderRef.current();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...baseHeaders,
        };
        const res = await fetch('/api/media/upload', {
          method: 'POST',
          headers,
          body: JSON.stringify({ dataUrl }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          url?: string;
          mediaType?: MediaAssetType;
          error?: string;
        };
        if (res.ok && json.ok && json.url) {
          return {
            ok: true,
            url: json.url,
            mediaType: json.mediaType || (isVideo ? 'video' : 'photo'),
          };
        }
        return { ok: false, error: json.error || 'Erro ao enviar arquivo.' };
      } catch {
        return { ok: false, error: 'Não foi possível enviar o arquivo.' };
      }
    },
    [isAdmin]
  );

  const uploadStudioImage = useCallback(
    async (
      file: File,
      targetModelId?: string
    ): Promise<{ ok: boolean; url?: string; error?: string }> => {
      const res = await uploadStudioMedia(file, targetModelId, false);
      return { ok: res.ok, url: res.url, error: res.error };
    },
    [uploadStudioMedia]
  );

  const saveStudioConfig = useCallback(
    async (
      patch: Partial<Omit<StudioConfig, 'modelUid' | 'updatedAt'>> & {
        recalculatePlans?: boolean;
      }
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!isAdmin) return { ok: false, error: 'Permissão administrativa necessária.' };
      const headers = await authHeaderRef.current();
      const res = await fetch('/api/model/studio-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(patch),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        return {
          ok: false,
          error: json.error || 'Não foi possível salvar as configurações do estúdio.',
        };
      }
      await refreshWorkspace();
      await refreshPublicModels();
      return { ok: true };
    },
    [isAdmin, refreshPublicModels, refreshWorkspace]
  );

  const saveGalleryItem = useCallback(
    async (input: {
      id?: string;
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
    }): Promise<{ ok: boolean; approvalStatus?: PublicApprovalStatus; error?: string }> => {
      if (!isAdmin) return { ok: false, error: 'Sem permissão.' };
      const headers = await authHeaderRef.current();
      const res = await fetch('/api/model/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        approvalStatus?: PublicApprovalStatus;
        error?: string;
      };
      await refreshWorkspace();
      await refreshPublicModels();
      return {
        ok: Boolean(res.ok && json.ok),
        approvalStatus: json.approvalStatus,
        error: json.error,
      };
    },
    [isAdmin, refreshPublicModels, refreshWorkspace]
  );

  const deleteGalleryItem = useCallback(
    async (itemId: string) => {
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch(`/api/model/gallery/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        headers,
      });
      await refreshWorkspace();
      await refreshPublicModels();
    },
    [isAdmin, refreshPublicModels, refreshWorkspace]
  );

  const restoreDefaultGallery = useCallback(async () => {
    if (!isAdmin) return;
    const headers = await authHeaderRef.current();
    await fetch('/api/model/gallery/restore', {
      method: 'POST',
      headers,
    });
    await refreshWorkspace();
    await refreshPublicModels();
  }, [isAdmin, refreshPublicModels, refreshWorkspace]);

  const savePrivateAlbumSettings = useCallback(
    async (input: {
      enabled?: boolean;
      password?: string;
      hint?: string;
      priceCents?: number;
    }): Promise<{ ok: boolean; error?: string }> => {
      if (!isAdmin) return { ok: false, error: 'Sem permissão.' };
      const headers = await authHeaderRef.current();
      const res = await fetch('/api/model/private-album/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        await refreshWorkspace();
        await refreshPublicModels();
        return { ok: true };
      }
      return { ok: false, error: json.error || 'Erro ao salvar configurações do álbum privativo.' };
    },
    [isAdmin, refreshPublicModels, refreshWorkspace]
  );

  const toggleMediaVisibility = useCallback(
    async (input: {
      itemId: string;
      fromVisibility: MediaVisibility;
      toVisibility: MediaVisibility;
      category?: GalleryCategoryType;
    }): Promise<{
      ok: boolean;
      visibility?: MediaVisibility;
      approvalStatus?: PublicApprovalStatus;
      error?: string;
    }> => {
      if (!isAdmin) return { ok: false, error: 'Sem permissão.' };
      const headers = await authHeaderRef.current();
      const res = await fetch('/api/model/media/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        visibility?: MediaVisibility;
        approvalStatus?: PublicApprovalStatus;
        error?: string;
      };
      if (res.ok && json.ok) {
        await refreshWorkspace();
        await refreshPublicModels();
        return {
          ok: true,
          visibility: json.visibility,
          approvalStatus: json.approvalStatus,
        };
      }
      return {
        ok: false,
        error: json.error || 'Erro ao alterar visibilidade da mídia.',
      };
    },
    [isAdmin, refreshPublicModels, refreshWorkspace]
  );

  const savePrivateAlbumItem = useCallback(
    async (input: {
      id?: string;
      title: string;
      caption: string;
      mediaType: MediaAssetType;
      src: string;
      thumbnailUrl?: string;
      sortOrder: number;
      active: boolean;
    }): Promise<{ ok: boolean; error?: string }> => {
      if (!isAdmin) return { ok: false, error: 'Sem permissão.' };
      const headers = await authHeaderRef.current();
      const res = await fetch('/api/model/private-album/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        await refreshWorkspace();
        await refreshPublicModels();
        return { ok: true };
      }
      return { ok: false, error: json.error || 'Erro ao salvar item no álbum privativo.' };
    },
    [isAdmin, refreshPublicModels, refreshWorkspace]
  );

  const deletePrivateAlbumItem = useCallback(
    async (itemId: string) => {
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch(`/api/model/private-album/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        headers,
      });
      await refreshWorkspace();
      await refreshPublicModels();
    },
    [isAdmin, refreshPublicModels, refreshWorkspace]
  );

  const unlockPrivateAlbum = useCallback(
    async (
      modelId: string,
      password: string
    ): Promise<{
      ok: boolean;
      albumToken?: string;
      items?: PrivateAlbumItemRecord[];
      summary?: PrivateAlbumSummary;
      error?: string;
    }> => {
      try {
        const res = await fetch(
          `/api/public/models/${encodeURIComponent(modelId)}/private-album/unlock`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          }
        );
        const json = (await res.json()) as {
          ok?: boolean;
          albumToken?: string;
          items?: PrivateAlbumItemRecord[];
          summary?: PrivateAlbumSummary;
          error?: string;
        };
        if (res.ok && json.ok && json.albumToken) {
          return {
            ok: true,
            albumToken: json.albumToken,
            items: json.items || [],
            summary: json.summary,
          };
        }
        return {
          ok: false,
          error: json.error || 'Não foi possível desbloquear o álbum.',
        };
      } catch {
        return {
          ok: false,
          error: 'Falha de conexão ao verificar a senha do álbum.',
        };
      }
    },
    []
  );

  const fetchPrivateAlbumItems = useCallback(
    async (
      modelId: string,
      albumToken: string
    ): Promise<{
      ok: boolean;
      items?: PrivateAlbumItemRecord[];
      summary?: PrivateAlbumSummary;
      error?: string;
    }> => {
      try {
        const res = await fetch(
          `/api/public/models/${encodeURIComponent(modelId)}/private-album`,
          {
            headers: { 'x-album-token': albumToken },
          }
        );
        const json = (await res.json()) as {
          ok?: boolean;
          items?: PrivateAlbumItemRecord[];
          summary?: PrivateAlbumSummary;
          error?: string;
        };
        if (res.ok && json.ok) {
          return { ok: true, items: json.items || [], summary: json.summary };
        }
        return { ok: false, error: json.error || 'Sessão do álbum expirada.' };
      } catch {
        return { ok: false, error: 'Falha ao carregar itens do álbum.' };
      }
    },
    []
  );

  const purchasePrivateAlbum = useCallback(
    async (
      modelId: string,
      paymentMethod: 'pix' | 'card' = 'pix'
    ): Promise<{
      ok: boolean;
      albumToken?: string;
      items?: PrivateAlbumItemRecord[];
      summary?: PrivateAlbumSummary;
      error?: string;
    }> => {
      if (!user) {
        return {
          ok: false,
          error: 'Faça login com Google para realizar o pagamento e desbloquear o álbum.',
        };
      }
      try {
        const headers = await getVisitorHeaders();
        const res = await fetch(
          `/api/visitor/models/${encodeURIComponent(modelId)}/private-album/purchase`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ paymentMethod }),
          }
        );
        const json = (await res.json()) as {
          ok?: boolean;
          albumToken?: string;
          items?: PrivateAlbumItemRecord[];
          summary?: PrivateAlbumSummary;
          error?: string;
        };
        if (res.ok && json.ok) {
          const items = json.items || [];
          setVisitorUnlockedPrivateItems(items);
          if (json.summary) {
            setPrivateAlbumSummary(json.summary);
          }
          await refreshWorkspace();
          await refreshPublicModels();
          return {
            ok: true,
            albumToken: json.albumToken,
            items,
            summary: json.summary,
          };
        }
        return {
          ok: false,
          error: json.error || 'Não foi possível concluir o pagamento do álbum.',
        };
      } catch {
        return {
          ok: false,
          error: 'Falha de conexão ao processar o pagamento do álbum privativo.',
        };
      }
    },
    [getVisitorHeaders, refreshPublicModels, refreshWorkspace, user]
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
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch('/api/model/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(input),
      });
      await refreshWorkspace();
      await refreshPublicModels();
    },
    [isAdmin, refreshPublicModels, refreshWorkspace]
  );

  const deleteCallPlan = useCallback(
    async (planId: string) => {
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch(`/api/model/plans/${encodeURIComponent(planId)}`, {
        method: 'DELETE',
        headers,
      });
      await refreshWorkspace();
      await refreshPublicModels();
    },
    [isAdmin, refreshPublicModels, refreshWorkspace]
  );

  const requestVideoCall = useCallback(
    async (topic: string, plan: CallPlan, inviteId?: string) => {
      if (!user || !plan || !plan.active) return null;
      const headers = await getVisitorHeaders();
      const res = await fetch('/api/visitor/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          modelId: selectedPublicModelId,
          topic,
          planId: plan.id,
          ...(inviteId ? { inviteId } : {}),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; id?: string };
      if (!res.ok || !json.ok || !json.id) return null;
      await refreshWorkspace();
      return json.id;
    },
    [getVisitorHeaders, refreshWorkspace, selectedPublicModelId, user]
  );

  const updateCallStatus = useCallback(
    async (
      requestId: string,
      status: CallStatus,
      paymentStatus?: CallPaymentStatus
    ) => {
      if (isAdmin) {
        const headers = await authHeaderRef.current();
        await fetch(`/api/model/queue/${encodeURIComponent(requestId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ status, paymentStatus }),
        });
      } else if (user) {
        const headers = await getVisitorHeaders();
        await fetch(`/api/visitor/queue/${encodeURIComponent(requestId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ modelId: selectedPublicModelId, status }),
        });
      }
      await refreshWorkspace();
    },
    [
      getVisitorHeaders,
      isAdmin,
      refreshWorkspace,
      selectedPublicModelId,
      user,
    ]
  );

  const deleteCallRequest = useCallback(
    async (requestId: string) => {
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch(`/api/model/queue/${encodeURIComponent(requestId)}`, {
        method: 'DELETE',
        headers,
      });
      await refreshWorkspace();
    },
    [isAdmin, refreshWorkspace]
  );

  const sendCallMessage = useCallback(
    async (callId: string, recipientUid: string, text: string) => {
      const cleanText = text.trim().slice(0, 500);
      if (!cleanText) return;
      if (isAdmin) {
        const headers = await authHeaderRef.current();
        await fetch('/api/model/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ callId, recipientUid, text: cleanText }),
        });
      } else if (user) {
        const headers = await getVisitorHeaders();
        await fetch('/api/visitor/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            modelId: selectedPublicModelId,
            callId,
            recipientUid,
            text: cleanText,
          }),
        });
      }
      await refreshWorkspace();
    },
    [
      getVisitorHeaders,
      isAdmin,
      refreshWorkspace,
      selectedPublicModelId,
      user,
    ]
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
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch('/api/model/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(input),
      });
      await refreshWorkspace();
    },
    [isAdmin, refreshWorkspace]
  );

  const updateCallHistoryStatus = useCallback(
    async (recordId: string, status: CallHistoryStatus) => {
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch(`/api/model/history/${encodeURIComponent(recordId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ status }),
      });
      await refreshWorkspace();
    },
    [isAdmin, refreshWorkspace]
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
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch(`/api/model/history/${encodeURIComponent(recordId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(patch),
      });
      await refreshWorkspace();
    },
    [isAdmin, refreshWorkspace]
  );

  const deleteCallHistoryRecord = useCallback(
    async (recordId: string) => {
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch(`/api/model/history/${encodeURIComponent(recordId)}`, {
        method: 'DELETE',
        headers,
      });
      await refreshWorkspace();
    },
    [isAdmin, refreshWorkspace]
  );

  const submitCallRating = useCallback(
    async (recordId: string, rating: number, comment?: string) => {
      if (!user) return;
      const headers = await getVisitorHeaders();
      await fetch(
        `/api/visitor/history/${encodeURIComponent(recordId)}/rating`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            modelId: selectedPublicModelId,
            rating,
            comment,
          }),
        }
      );
      await refreshWorkspace();
    },
    [getVisitorHeaders, refreshWorkspace, selectedPublicModelId, user]
  );

  const sendTipContribution = useCallback(
    async (
      modelId: string,
      input: {
        amountCents: number;
        paymentMethod: 'pix' | 'card';
        message?: string;
      }
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!user) {
        return {
          ok: false,
          error: 'Entre com sua conta Google para enviar uma gorjeta.',
        };
      }
      try {
        const headers = await getVisitorHeaders();
        const res = await fetch(
          `/api/visitor/models/${encodeURIComponent(modelId)}/tip`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(input),
          }
        );
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          return {
            ok: false,
            error: json.error || 'Não foi possível enviar a gorjeta.',
          };
        }
        await refreshWorkspace();
        return { ok: true };
      } catch {
        return {
          ok: false,
          error: 'Falha de conexão ao enviar gorjeta.',
        };
      }
    },
    [getVisitorHeaders, refreshWorkspace, user]
  );

  const sendInterestMessage = useCallback(
    async (input: { preferredTime: string; message: string }) => {
      if (!user) return null;
      const headers = await getVisitorHeaders();
      const res = await fetch('/api/visitor/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          modelId: selectedPublicModelId,
          ...input,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; id?: string };
      if (!res.ok || !json.ok || !json.id) return null;
      await refreshWorkspace();
      return json.id;
    },
    [getVisitorHeaders, refreshWorkspace, selectedPublicModelId, user]
  );

  const updateInterestMessageStatus = useCallback(
    async (messageId: string, status: InterestMessageStatus) => {
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch(`/api/model/interest/${encodeURIComponent(messageId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ status }),
      });
      await refreshWorkspace();
    },
    [isAdmin, refreshWorkspace]
  );

  const deleteInterestMessage = useCallback(
    async (messageId: string) => {
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch(`/api/model/interest/${encodeURIComponent(messageId)}`, {
        method: 'DELETE',
        headers,
      });
      await refreshWorkspace();
    },
    [isAdmin, refreshWorkspace]
  );

  // ============================================================================
  // PIX CHARGES, QR CODE & CONFIRMATION
  // ============================================================================
  const createPixCharge = useCallback(
    async (input: {
      modelId: string;
      kind: PixChargeKind;
      amountCents?: number;
      planId?: string;
      topic?: string;
      callMode?: 'group' | 'private';
      note?: string;
      inviteId?: string;
      preferredPaymentMethod?: MercadoPagoPaymentMethod;
    }): Promise<{
      ok: boolean;
      charge?: PixChargeRecord;
      error?: string;
      requiresMercadoPagoToken?: boolean;
    }> => {
      if (!user) {
        return {
          ok: false,
          error: 'Entre com sua conta Google para concluir o pagamento via Mercado Pago.',
        };
      }

      let headers: Record<string, string>;
      try {
        headers = await getVisitorHeaders();
      } catch {
        return {
          ok: false,
          error:
            'Sua sessão Google precisa ser atualizada. Clique em Sair e entre novamente com o Google.',
        };
      }

      const payloadText = JSON.stringify(input);

      const postViaXhr = (reqHeaders: Record<string, string>) =>
        new Promise<{ status: number; ok: boolean; text: string }>(
          (resolve, reject) => {
            try {
              const xhr = new XMLHttpRequest();
              xhr.open('POST', '/api/visitor/pix/charges', true);
              xhr.timeout = 20000;
              xhr.setRequestHeader('Content-Type', 'application/json');
              xhr.setRequestHeader('Accept', 'application/json');
              Object.entries(reqHeaders).forEach(([k, v]) => {
                if (v) xhr.setRequestHeader(k, v);
              });
              xhr.onload = () => {
                resolve({
                  status: xhr.status,
                  ok: xhr.status >= 200 && xhr.status < 300,
                  text: xhr.responseText || '',
                });
              };
              xhr.onerror = () => reject(new Error('XHR network error'));
              xhr.ontimeout = () => reject(new Error('XHR timeout'));
              xhr.send(payloadText);
            } catch (err) {
              reject(err);
            }
          }
        );

      const requestCharge = async (
        reqHeaders: Record<string, string>
      ): Promise<{
        status: number;
        ok: boolean;
        text: string;
      }> => {
        try {
          const res = await fetch('/api/visitor/pix/charges', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...reqHeaders,
            },
            body: payloadText,
          });
          const text = await res.text();
          return { status: res.status, ok: res.ok, text };
        } catch {
          await new Promise((r) => window.setTimeout(r, 400));
          return await postViaXhr(reqHeaders);
        }
      };

      try {
        let result = await requestCharge(headers);
        if (result.status === 401) {
          try {
            const freshToken = await user.getIdToken(true);
            result = await requestCharge({
              Authorization: `Bearer ${freshToken}`,
            });
          } catch {
            // Keep original 401 result if token refresh fails
          }
        }
        let json: {
          ok?: boolean;
          charge?: PixChargeRecord;
          error?: string;
          requiresMercadoPagoToken?: boolean;
        } = {};
        if (result.text) {
          try {
            json = JSON.parse(result.text) as typeof json;
          } catch {
            return {
              ok: false,
              error: `Resposta inesperada do servidor de pagamentos (HTTP ${result.status || 502}). Tente novamente em instantes.`,
            };
          }
        }
        if (result.ok && json.ok && json.charge) {
          return { ok: true, charge: json.charge };
        }
        return {
          ok: false,
          requiresMercadoPagoToken: Boolean(json.requiresMercadoPagoToken),
          error:
            json.error ||
            `Não foi possível gerar a cobrança no Mercado Pago (HTTP ${result.status || 500}).`,
        };
      } catch {
        return {
          ok: false,
          error:
            'Falha de conexão com o servidor de pagamentos. Recarregue a página e tente novamente.',
        };
      }
    },
    [getVisitorHeaders, user]
  );

  const reconcileMercadoPagoReturn = useCallback(
    async (ref?: string): Promise<number> => {
      if (!user) return 0;
      try {
        const headers = await getVisitorHeaders();
        const res = await fetch('/api/visitor/pix/reconcile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ ref: ref || '' }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          reconciledCount?: number;
        };
        const count = Number(json.reconciledCount || 0);
        if (count > 0) {
          await refreshWorkspace();
          await refreshPublicModels();
        }
        return count;
      } catch {
        return 0;
      }
    },
    [getVisitorHeaders, refreshPublicModels, refreshWorkspace, user]
  );

  const applyPixFulfillmentSideEffects = useCallback(
    async (json: {
      items?: PrivateAlbumItemRecord[];
      summary?: PrivateAlbumSummary;
      studioState?: StudioState;
      charge?: PixChargeRecord;
    }) => {
      if (json.charge?.status === 'paid') {
        if (json.items) {
          setVisitorUnlockedPrivateItems(json.items);
        }
        if (json.summary) {
          setPrivateAlbumSummary(json.summary);
        }
        if (json.studioState) {
          setStudioState(json.studioState);
        }
        await refreshWorkspace();
        await refreshPublicModels();
      }
    },
    [refreshPublicModels, refreshWorkspace]
  );

  const checkPixChargeStatus = useCallback(
    async (modelId: string, chargeId: string) => {
      if (!user) {
        return { ok: false, error: 'Autenticação necessária.' };
      }
      const url = `/api/visitor/pix/charges/${encodeURIComponent(
        chargeId
      )}?modelId=${encodeURIComponent(modelId)}`;
      try {
        const headers = await getVisitorHeaders();
        let status = 0;
        let ok = false;
        let text = '';
        try {
          const res = await fetch(url, {
            headers: { Accept: 'application/json', ...headers },
          });
          status = res.status;
          ok = res.ok;
          text = await res.text();
        } catch {
          const xhrRes = await new Promise<{
            status: number;
            ok: boolean;
            text: string;
          }>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = 15000;
            xhr.setRequestHeader('Accept', 'application/json');
            Object.entries(headers).forEach(([k, v]) => {
              if (v) xhr.setRequestHeader(k, v);
            });
            xhr.onload = () =>
              resolve({
                status: xhr.status,
                ok: xhr.status >= 200 && xhr.status < 300,
                text: xhr.responseText || '',
              });
            xhr.onerror = () => reject(new Error('XHR error'));
            xhr.ontimeout = () => reject(new Error('XHR timeout'));
            xhr.send();
          });
          status = xhrRes.status;
          ok = xhrRes.ok;
          text = xhrRes.text;
        }
        const json = (text ? JSON.parse(text) : {}) as {
          ok?: boolean;
          charge?: PixChargeRecord;
          albumToken?: string;
          items?: PrivateAlbumItemRecord[];
          summary?: PrivateAlbumSummary;
          studioState?: StudioState;
          callRequestId?: string;
          error?: string;
        };
        if (json.charge?.status === 'paid') {
          await applyPixFulfillmentSideEffects(json);
        }
        return {
          ok: Boolean(ok && json.ok),
          charge: json.charge,
          albumToken: json.albumToken,
          items: json.items,
          summary: json.summary,
          studioState: json.studioState,
          callRequestId: json.callRequestId,
          error:
            json.error || (!ok ? `HTTP ${status} ao consultar pagamento.` : undefined),
        };
      } catch {
        return { ok: false, error: 'Falha ao consultar status do pagamento.' };
      }
    },
    [applyPixFulfillmentSideEffects, getVisitorHeaders, user]
  );

  const confirmPixCharge = useCallback(
    async (modelId: string, chargeId: string) => {
      if (!user) {
        return { ok: false, error: 'Autenticação necessária.' };
      }
      const url = `/api/visitor/pix/charges/${encodeURIComponent(
        chargeId
      )}/confirm`;
      const payloadText = JSON.stringify({ modelId });
      try {
        let headers = await getVisitorHeaders();
        const sendConfirm = async (reqHeaders: Record<string, string>) => {
          try {
            const res = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...reqHeaders,
              },
              body: payloadText,
            });
            return { status: res.status, ok: res.ok, text: await res.text() };
          } catch {
            return await new Promise<{
              status: number;
              ok: boolean;
              text: string;
            }>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('POST', url, true);
              xhr.timeout = 18000;
              xhr.setRequestHeader('Content-Type', 'application/json');
              xhr.setRequestHeader('Accept', 'application/json');
              Object.entries(reqHeaders).forEach(([k, v]) => {
                if (v) xhr.setRequestHeader(k, v);
              });
              xhr.onload = () =>
                resolve({
                  status: xhr.status,
                  ok: xhr.status >= 200 && xhr.status < 300,
                  text: xhr.responseText || '',
                });
              xhr.onerror = () => reject(new Error('XHR error'));
              xhr.ontimeout = () => reject(new Error('XHR timeout'));
              xhr.send(payloadText);
            });
          }
        };

        let result = await sendConfirm(headers);
        if (result.status === 401) {
          try {
            const freshToken = await user.getIdToken(true);
            headers = { Authorization: `Bearer ${freshToken}` };
            result = await sendConfirm(headers);
          } catch {
            // Keep 401 result
          }
        }

        const json = (result.text ? JSON.parse(result.text) : {}) as {
          ok?: boolean;
          pending?: boolean;
          charge?: PixChargeRecord;
          albumToken?: string;
          items?: PrivateAlbumItemRecord[];
          summary?: PrivateAlbumSummary;
          studioState?: StudioState;
          callRequestId?: string;
          error?: string;
        };
        if (result.ok && json.ok) {
          await applyPixFulfillmentSideEffects(json);
          return {
            ok: true,
            charge: json.charge,
            albumToken: json.albumToken,
            items: json.items,
            summary: json.summary,
            studioState: json.studioState,
            callRequestId: json.callRequestId,
          };
        }
        return {
          ok: false,
          pending: Boolean(json.pending),
          charge: json.charge,
          error: json.error || 'Pagamento ainda não confirmado.',
        };
      } catch {
        return {
          ok: false,
          error: 'Falha de conexão ao confirmar o pagamento.',
        };
      }
    },
    [applyPixFulfillmentSideEffects, getVisitorHeaders, user]
  );

  const cancelPixCharge = useCallback(
    async (modelId: string, chargeId: string) => {
      if (!user) return;
      try {
        const headers = await getVisitorHeaders();
        await fetch(
          `/api/visitor/pix/charges/${encodeURIComponent(chargeId)}/cancel`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ modelId }),
          }
        );
      } catch {
        // Ignore cleanup failure
      }
    },
    [getVisitorHeaders, user]
  );

  const confirmModelPixCharge = useCallback(
    async (chargeId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!isAdmin) return { ok: false, error: 'Sem permissão.' };
      try {
        const headers = await authHeaderRef.current();
        const res = await fetch(
          `/api/model/pix/charges/${encodeURIComponent(chargeId)}/confirm`,
          { method: 'POST', headers }
        );
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (res.ok && json.ok) {
          await refreshWorkspace();
          await refreshPublicModels();
          return { ok: true };
        }
        return { ok: false, error: json.error || 'Erro ao confirmar PIX.' };
      } catch {
        return { ok: false, error: 'Falha de conexão ao confirmar PIX.' };
      }
    },
    [isAdmin, refreshPublicModels, refreshWorkspace]
  );

  const cancelModelPixCharge = useCallback(
    async (chargeId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!isAdmin) return { ok: false, error: 'Sem permissão.' };
      try {
        const headers = await authHeaderRef.current();
        const res = await fetch(
          `/api/model/pix/charges/${encodeURIComponent(chargeId)}/cancel`,
          { method: 'POST', headers }
        );
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (res.ok && json.ok) {
          await refreshWorkspace();
          return { ok: true };
        }
        return { ok: false, error: json.error || 'Erro ao cancelar PIX.' };
      } catch {
        return { ok: false, error: 'Falha de conexão ao cancelar PIX.' };
      }
    },
    [isAdmin, refreshWorkspace]
  );

  const createWhatsappInvite = useCallback(
    async (input: {
      recipientName?: string;
      recipientPhone?: string;
      photoUrl: string;
      message: string;
      planId?: string;
      callMode?: CallEntryIntent;
      saveAsDefault?: boolean;
    }): Promise<{
      ok: boolean;
      invite?: WhatsappInviteRecord;
      invitePath?: string;
      error?: string;
    }> => {
      if (!isAdmin) {
        return { ok: false, error: 'Permissão administrativa necessária.' };
      }
      try {
        const headers = await authHeaderRef.current();
        const res = await fetch('/api/model/whatsapp-invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(input),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          invite?: WhatsappInviteRecord;
          invitePath?: string;
          error?: string;
        };
        if (res.ok && json.ok && json.invite) {
          await refreshWorkspace();
          return {
            ok: true,
            invite: json.invite,
            invitePath: json.invitePath || `/convite/${json.invite.id}`,
          };
        }
        return {
          ok: false,
          error: json.error || 'Não foi possível gerar o convite do WhatsApp.',
        };
      } catch {
        return {
          ok: false,
          error: 'Falha de conexão ao gerar o convite.',
        };
      }
    },
    [isAdmin, refreshWorkspace]
  );

  const deleteWhatsappInvite = useCallback(
    async (inviteId: string) => {
      if (!isAdmin) return;
      const headers = await authHeaderRef.current();
      await fetch(
        `/api/model/whatsapp-invites/${encodeURIComponent(inviteId)}`,
        {
          method: 'DELETE',
          headers,
        }
      );
      await refreshWorkspace();
    },
    [isAdmin, refreshWorkspace]
  );

  return {
    user,
    modelSession,
    modelAccount: modelSession?.model || null,
    modelToken: modelSession?.token || null,
    modelAuthId: modelSession?.model.id || null,
    authLoading,
    authError,
    modelAuthError,
    modelAuthSubmitting,
    primaryNeedsClaim,
    primaryClaimInfo,
    isAdmin,
    activeModelId,
    activeAdminThemeId,
    effectiveActorUid,
    publicModels,
    selectedPublicModelId,
    setSelectedPublicModelId,
    publicRatings,
    publicShowcaseLoading,
    myProfile,
    modelProfile,
    allProfiles,
    studioState,
    studioConfig,
    galleryItems,
    privateAlbumSummary,
    privateAlbumItems,
    visitorUnlockedPrivateItems,
    callQueue,
    callMessages,
    callHistory,
    interestMessages,
    callPlans,
    pixCharges,
    whatsappInvites,
    refreshWorkspace,
    refreshPublicModels,
    refreshPublicShowcase,
    refreshBootstrapStatus,
    loginWithGoogle,
    loginAsModel,
    claimPrimaryModelPassword,
    registerAsModel,
    logout,
    updateMyModelAccount,
    updateStudioState,
    saveStudioConfig,
    uploadStudioImage,
    uploadStudioMedia,
    saveGalleryItem,
    deleteGalleryItem,
    restoreDefaultGallery,
    savePrivateAlbumSettings,
    savePrivateAlbumItem,
    deletePrivateAlbumItem,
    toggleMediaVisibility,
    unlockPrivateAlbum,
    fetchPrivateAlbumItems,
    purchasePrivateAlbum,
    createPixCharge,
    reconcileMercadoPagoReturn,
    checkPixChargeStatus,
    confirmPixCharge,
    cancelPixCharge,
    confirmModelPixCharge,
    cancelModelPixCharge,
    createWhatsappInvite,
    deleteWhatsappInvite,
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
    sendTipContribution,
    sendInterestMessage,
    updateInterestMessageStatus,
    deleteInterestMessage,
  };
}
