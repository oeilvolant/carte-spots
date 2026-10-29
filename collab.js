// Œil Volant — synchronisation privée (Firebase Authentication + Cloud Firestore).
// La configuration publique est dans firebase-config.js. Les droits réels sont dans firestore.rules.
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
  let user = null, role = null, off = [], cache = {routes: null, spots: null}, editors = [];
  const resetListeners = () => { off.forEach(f => f()); off = []; cache = {routes:null, spots:null}; editors = []; };
  const notifyError = err => onError(err?.message || String(err));
    // Conversion des coordonnées pour Firebase
  const encodeRoute = r => ({
    ...r,
    points: r.points.map(([lat, lng]) => ({lat, lng})),
    geometry: r.geometry.map(([lat, lng]) => ({lat, lng}))
  });

  // Conversion pour afficher les parcours sur la carte
  const decodeRoute = r => ({
    ...r,
    points: r.points.map(p =>
      Array.isArray(p) ? p : [p.lat, p.lng]),
    geometry: r.geometry.map(p =>
      Array.isArray(p) ? p : [p.lat, p.lng])
  });
  const emitData = () => {
    if (cache.routes !== null && cache.spots !== null)
      onData({
  routes: cache.routes.map(r => ({
    ...r,
    points: r.points.map(p =>
      Array.isArray(p) ? p : [p.lat, p.lng]),
    geometry: r.geometry.map(p =>
      Array.isArray(p) ? p : [p.lat, p.lng])
  })),
  spots: cache.spots
});
  };
  const isAdmin = () => role === 'admin';
  const canEdit = () => role === 'admin' || role === 'editor';
  const assertAdmin = () => {if (!user || !isAdmin()) throw Error('Accès administrateur requis.');};
  const assertEdit = () => {if (!user || !canEdit()) throw Error('Connexion avec droit de modification requise.');};
  onAuthStateChanged(auth, async nextUser => {
    resetListeners(); user=nextUser; role=null; onMembers([]); onData({routes:[],spots:[]});
    if (!user) {onAuth({user:null,role:null}); return;}
    try {
      const email = String(user.email||'').toLowerCase();
      if (email === ownerEmail && user.emailVerified) role='admin';
      else {
        const member = await getDoc(refOf('members', email));
        if (member.exists() && ['editor','reader'].includes(member.data().role) && user.emailVerified)
          role=member.data().role;
      }
      // Le contrôle côté client sert à l'interface. Les règles Firestore sécurisent chaque lecture/écriture.
      onAuth({user:{uid:user.uid,email:user.email,displayName:user.displayName}, role});
      if (!role) return;
      for (const kind of ['routes','spots']) {
        off.push(onSnapshot(groupOf(kind), snapshot => {
          cache[kind] = snapshot.docs.map(entry => {
  const r = {...entry.data(), id: entry.id};
  return kind === 'routes' ? decodeRoute(r) : r;
});
          emitData();
        }, notifyError));
      }
      if (isAdmin()) {
        off.push(onSnapshot(groupOf('members'), snapshot => {
          editors = snapshot.docs.map(entry=>({...entry.data(),email:entry.id})); onMembers(editors);
        }, notifyError));
      }
    } catch(err) {role=null; onAuth({user:{uid:user.uid,email:user.email},role:null}); notifyError(err);}
  });

  async function save(kind, item) {
    assertEdit(); if (!['routes','spots'].includes(kind)) throw Error('Catégorie invalide.');
    const existing = cache[kind]?.find(x=>x.id === item.id);
    if (existing && !isAdmin() && existing.createdBy !== user.uid)
      throw Error('Tu ne peux modifier que tes propres créations.');
    const payload = {
      ...item,
      name: String(item.name||'').trim().slice(0,100),
      notes: String(item.notes||'').slice(0,4000),
      createdBy: existing?.createdBy || user.uid,
      createdByEmail: existing?.createdByEmail || user.email,
      updatedBy: user.email,
      updatedAt: serverTimestamp(),
    };
    delete payload.hidden; delete payload.id; delete payload.createdAt;
    if (!existing) payload.createdAt=serverTimestamp();
    else if (existing.createdAt) payload.createdAt=existing.createdAt;
    if (kind==='spots') {
      if (!['photo','video','fpv','auto','paysage','autre'].includes(payload.category) ||
          !Array.isArray(payload.point) || payload.point.length!==2) throw Error('Spot invalide.');
    } else if (!Array.isArray(payload.geometry) || payload.geometry.length<2 || payload.geometry.length>15000)
      throw Error('Parcours trop long ou invalide.');
    await setDoc(
  refOf(kind,item.id),
  kind === 'routes' ? {
    ...payload,
    points: payload.points.map(p => ({
      lat: p[0] ?? p.lat,
      lng: p[1] ?? p.lng
    })),
    geometry: payload.geometry.map(p => ({
      lat: p[0] ?? p.lat,
      lng: p[1] ?? p.lng
    }))
  } : payload
);, kind === 'routes' ? encodeRoute(payload) : payload);
  }
  async function remove(kind, item) {
    assertEdit(); if (!['spots','routes'].includes(kind)) throw Error('Type inconnu.');
    if (!isAdmin() && item.createdBy !== user.uid) throw Error('Suppression non autorisée.');
    await deleteDoc(refOf(kind,item.id));
  }
  async function upsertMember(email, memberRole) {
    assertAdmin();
    const address=String(email||'').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw Error('Adresse e-mail invalide.');
    if (!['editor','reader'].includes(memberRole)) throw Error('Rôle invalide.');
    if (address===ownerEmail) throw Error('Le propriétaire est déjà administrateur.');
    await setDoc(refOf('members',address), {email:address,role:memberRole,updatedAt:serverTimestamp()});
  }
  async function removeMember(email) {assertAdmin(); await deleteDoc(refOf('members', String(email).toLowerCase()));}
  async function importData(entries) {
    assertEdit();
    const existingIds = new Set([...(cache.spots||[]).map(x=>'spots/'+x.id),...(cache.routes||[]).map(x=>'routes/'+x.id)]);
    const toCreate=[];
    for (const kind of ['spots','routes']) for (const item of entries[kind]||[]) {
      if (existingIds.has(kind+'/'+item.id)) continue;
      const record = {
        ...item,
        name:String(item.name||'').slice(0,100), notes:String(item.notes||'').slice(0,4000),
        createdBy:user.uid, createdByEmail:user.email, updatedBy:user.email,
        createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
      };
      delete record.id; delete record.hidden;
      toCreate.push({kind,id:item.id,record: kind === 'routes' ? encodeRoute(record) : record});
      existingIds.add(kind+'/'+item.id);
    }
    // Écritures groupées. Les sauvegardes déjà présentes ne sont jamais effacées.
    for (let i=0;i<toCreate.length;i+=200) {
      const batch=writeBatch(db);
      for (const item of toCreate.slice(i,i+200)) batch.set(refOf(item.kind,item.id),item.record);
      await batch.commit();
    }
    return toCreate.length;
  }
  return {
    signIn: () => signInWithPopup(auth, new GoogleAuthProvider()),
    signOut: () => signOut(auth),
    save, remove, importData, upsertMember, removeMember,
  };
}
