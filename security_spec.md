# Security Specification & Dirty Dozen Audit

## Data Invariants
1. **PII Isolation**: User email addresses exist exclusively in `/users/{userId}/private/info`, never in `/studioProfiles/{userId}`. Only the owner or verified studio admin can read `/users/{userId}/private/info`.
2. **No Self-Assigned Roles**: Regular users cannot register with `role: 'model'` or `role: 'moderator'`, nor `accessStatus: 'vip'`, nor escalate their own `role`/`accessStatus`/`notes` via updates.
3. **Blocked User Enforcement**: Users whose `/studioProfiles/{uid}.accessStatus == 'blocked'` are denied from creating new `/callQueue` requests or `/callMessages`.
4. **Muted User Enforcement**: Users whose `/studioProfiles/{uid}.accessStatus == 'muted'` are denied from sending `/callMessages`.
5. **Terminal State Locking**: Once a `/callQueue/{requestId}` reaches `'ended'`, `'rejected'`, or `'cancelled'`, non-admin users cannot re-open or mutate it.
6. **Strict Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must match `request.time`.
7. **Zero Query Trust**: Every `allow list` validates `resource.data` directly against `request.auth.uid` or `isTokenAdmin()` with zero `get()`/`exists()` calls.

## Dirty Dozen Payloads (Must All Return PERMISSION_DENIED)
1. **Self-Privilege Escalation on Create**: Viewer sends `{ uid: callerUid, role: 'model', accessStatus: 'vip', ... }` to `/studioProfiles/{callerUid}`.
2. **Shadow Field Injection**: Viewer sends `{ ..., isVerified: true }` on `/studioProfiles/{callerUid}` create/update.
3. **Role Tampering on Update**: Viewer attempts `update` on `/studioProfiles/{callerUid}` changing `role` to `'moderator'` or `accessStatus` to `'active'` from `'blocked'`.
4. **Cross-User PII Read**: Viewer A tries `get` on `/users/{viewerB}/private/info`.
5. **Blanket Profile Listing**: Non-admin viewer runs `getDocs(collection(db, 'studioProfiles'))` without filtering to `uid == callerUid` or `role == 'model'`.
6. **Spoofed Admin Email**: Unverified token (`email_verified: false`) with `email: 'automation.ioan@gmail.com'` attempts admin write to `/studioState/main`.
7. **ID Poisoning**: Caller attempts write to `/callQueue/{2000-char-invalid-id}` or ID with spaces/slashes.
8. **Blocked User Queue Bypass**: User with `accessStatus == 'blocked'` attempts `create` on `/callQueue/{id}`.
9. **Muted User Chat Bypass**: User with `accessStatus == 'muted'` attempts `create` on `/callMessages/{id}`.
10. **Terminal Call Re-Activation**: Viewer attempts `update` on `/callQueue/{id}` where `existing.status == 'rejected'` to set `status: 'in_call'`.
11. **Backdated Timestamp Forgery**: Caller passes client `Date` for `createdAt` instead of `request.time`.
12. **Orphaned Message Injection**: Caller creates a `/callMessages/{id}` referencing a non-existent `callId`.
