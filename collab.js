
// Œil Volant — synchronisation Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot, getDoc, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export function connectCloud(config, { onAuth, onData, onMembers, onError }) {
  const app = initializeApp(config);
  const auth = getAuth(app), db = getFirestore(app);
  const ownerEmail = String(config.ownerEmail || '').trim().toLowerCase();
  const teamRoot = ['teams', 'oeil-volant'];
  const refOf = (kind, id) => doc(db, ...teamRoot, kind, id);
  const groupOf = kind => collection(db, ...teamRoot, kind);

  let user = null, role = null, off = [];
  let cache = { routes: null, spots: null };

  const resetListeners = () => {
    off.forEach(f => f());
    off = [];
    cache = { routes: null, spots: null };
  };

  const notifyError = err => onError(err?.message || String(err));

  // Convertir les coordonnées pour Firestore
  const encodeRoute = route => ({
    ...route,
    points: route.points.map(p =>
      Array.isArray(p) ? { lat: p[0], lng: p[1] } : p),
    geometry: route.geometry.map(p =>
      Array.isArray(p) ? { lat: p[0], lng: p[1] } : p)
  });

  // Restaurer les coordonnées pour Leaflet
  const decodeRoute = route => ({
    ...route,
    points: route.points.map(p =>
      Array.isArray(p) ? p : [p.lat, p.lng]),
    geometry: route.geometry.map(p =>
      Array.isArray(p) ? p : [p.lat, p.lng])
  });

  const emitData = () => {
    if (cache.routes !== null && cache.spots !== null) {
      onData({ routes: cache.routes, spots: cache.spots });
    }
  };

  const isAdmin = () => role === 'admin';
  const canEdit = () => role === 'admin' || role === 'editor';

  const assertAdmin = () => {
    if (!user || !isAdmin()) throw Error('Accès administrateur requis.');
  };

  const assertEdit = () => {
    if (!user || !canEdit()) throw Error('Droit de modification requis.');
  };

  onAuthStateChanged(auth, async nextUser => {
    resetListeners();
    user = nextUser;
    role = null;
    onMembers([]);
    onData({ routes: [], spots: [] });

    if (!user) {
      onAuth({ user: null, role: null });
      return;
    }

    try {
      const email = String(user.email || '').toLowerCase();

      if (email === ownerEmail && user.emailVerified) {
        role = 'admin';
      } else {
        const member = await getDoc(refOf('members', email));
        if (member.exists() &&
            ['editor', 'reader'].includes(member.data().role) &&
            user.emailVerified) {
          role = member.data().role;
        }
      }

      onAuth({
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName
        },
        role
      });

      if (!role) return;

      for (const kind of ['routes', 'spots']) {
        off.push(onSnapshot(groupOf(kind), snapshot => {
          cache[kind] = snapshot.docs.map(entry => {
            const item = { ...entry.data(), id: entry.id };
            return kind === 'routes' ? decodeRoute(item) : item;
          });
          emitData();
        }, notifyError));
      }

      if (isAdmin()) {
        off.push(onSnapshot(groupOf('members'), snapshot => {
          const members = snapshot.docs.map(entry => ({
            ...entry.data(),
            email: entry.id
          }));
          onMembers(members);
        }, notifyError));
      }

    } catch (err) {
      role = null;
      onAuth({ user: { uid: user.uid, email: user.email }, role: null });
      notifyError(err);
    }
  });

  async function save(kind, item) {
    assertEdit();
    if (!['routes', 'spots'].includes(kind)) {
      throw Error('Catégorie invalide.');
    }

    const existing = cache[kind]?.find(x => x.id === item.id);
    if (existing && !isAdmin() && existing.createdBy !== user.uid) {
      throw Error('Tu ne peux modifier que tes propres créations.');
    }

    const payload = {
      ...item,
      name: String(item.name || '').trim().slice(0, 100),
      notes: String(item.notes || '').slice(0, 4000),
      createdBy: existing?.createdBy || user.uid,
      createdByEmail: existing?.createdByEmail || user.email,
      updatedBy: user.email,
      updatedAt: serverTimestamp()
    };

    delete payload.hidden;
    delete payload.id;
    delete payload.createdAt;

    if (!existing) payload.createdAt = serverTimestamp();
    else if (existing.createdAt) payload.createdAt = existing.createdAt;

    if (kind === 'spots') {
      if (!['photo','video','fpv','auto','paysage','autre','nightkid'].includes(payload.category) ||
          !Array.isArray(payload.point) || payload.point.length !== 2) {
        throw Error('Spot invalide.');
      }
    } else {
      if (!Array.isArray(payload.points) || payload.points.length < 2 ||
          !Array.isArray(payload.geometry) || payload.geometry.length < 2 ||
          payload.geometry.length > 15000) {
        throw Error('Parcours invalide.');
      }
    }

    const record = kind === 'routes' ? encodeRoute(payload) : payload;
    await setDoc(refOf(kind, item.id), record);
  }

  async function remove(kind, item) {
    assertEdit();
    if (!['spots', 'routes'].includes(kind)) throw Error('Type inconnu.');
    if (!isAdmin() && item.createdBy !== user.uid) {
      throw Error('Suppression non autorisée.');
    }
    await deleteDoc(refOf(kind, item.id));
  }

  async function upsertMember(email, memberRole) {
    assertAdmin();
    const address = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      throw Error('Adresse e-mail invalide.');
    }
    if (!['editor', 'reader'].includes(memberRole)) {
      throw Error('Rôle invalide.');
    }
    if (address === ownerEmail) {
      throw Error('Le propriétaire est déjà administrateur.');
    }

    await setDoc(refOf('members', address), {
      email: address,
      role: memberRole,
      updatedAt: serverTimestamp()
    });
  }

  async function removeMember(email) {
    assertAdmin();
    await deleteDoc(refOf('members', String(email).toLowerCase()));
  }

  async function importData(entries) {
    assertEdit();

    const existingIds = new Set([
      ...(cache.spots || []).map(x => 'spots/' + x.id),
      ...(cache.routes || []).map(x => 'routes/' + x.id)
    ]);

    const toCreate = [];

    for (const kind of ['spots', 'routes']) {
      for (const item of entries[kind] || []) {
        if (existingIds.has(kind + '/' + item.id)) continue;

        const record = {
          ...item,
          name: String(item.name || '').slice(0, 100),
          notes: String(item.notes || '').slice(0, 4000),
          createdBy: user.uid,
          createdByEmail: user.email,
          updatedBy: user.email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        delete record.id;
        delete record.hidden;

        toCreate.push({
          kind,
          id: item.id,
          record: kind === 'routes' ? encodeRoute(record) : record
        });

        existingIds.add(kind + '/' + item.id);
      }
    }

    for (let i = 0; i < toCreate.length; i += 200) {
      const batch = writeBatch(db);
      for (const item of toCreate.slice(i, i + 200)) {
        batch.set(refOf(item.kind, item.id), item.record);
      }
      await batch.commit();
    }

    return toCreate.length;
  }

  return {
    signIn: () => signInWithPopup(auth, new GoogleAuthProvider()),
    signOut: () => signOut(auth),
    save,
    remove,
    importData,
    upsertMember,
    removeMember
  };
}
