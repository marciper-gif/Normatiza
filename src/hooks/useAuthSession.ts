import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { onSnapshot, collection, doc, getDoc } from 'firebase/firestore';
import { UserAccount, ProfilePermissions } from '../types';
import { auth, db, ensureAnonymousAuth } from '../lib/firebase';
import { linkGoogleUserCallable } from '../lib/functions';
import { seedDatabaseIfEmpty, dbSaveUserAccount, dbSavePermissions } from '../lib/firebaseSync';
import { loadStoredProfilePermissions, resolveUserPermissions } from '../lib/permissions';

/**
 * Sessão, usuários e permissões — extraído de App.tsx sem mudar o
 * comportamento do login (validação de senha continua 100% na Cloud
 * Function `login`; ver functions/index.js). Concentra: lista de contas,
 * usuário logado, `authReady`, permissões de perfil, a assinatura do
 * Firebase Auth e as assinaturas do Firestore de `users`/`permissions`.
 */
export function useAuthSession() {
  const [users, rawSetUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem('ms-users');
    if (!saved) {
      const defaultUsers: UserAccount[] = [
        { id: '1', username: 'admin', name: 'Administrador Geral', password: 'admin', role: 'admin', status: 'Ativo', primeiro_acesso: false },
        { id: '2', username: 'colaborador', name: 'Colaborador Padrão', password: '123', role: 'colaborador', status: 'Ativo', primeiro_acesso: true }
      ];
      localStorage.setItem('ms-users', JSON.stringify(defaultUsers));
      return defaultUsers;
    }
    try {
      return JSON.parse(saved);
    } catch (e) {
      return [];
    }
  });

  const setUsers = useCallback((val: React.SetStateAction<UserAccount[]>) => {
    rawSetUsers((prev) => {
      const computed = typeof val === 'function' ? val(prev) : val;
      computed.forEach(item => {
        const original = prev.find(p => p.id === item.id);
        if (!original || JSON.stringify(original) !== JSON.stringify(item)) {
          dbSaveUserAccount(item);
        }
      });
      return computed;
    });
  }, []);

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('ms-current-user');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch (e) {
      return null;
    }
  });

  // Fica `true` assim que existir QUALQUER sessão do Firebase Auth (anônima
  // ponte para login por CPF/senha, ou Google). As leituras/escritas no
  // Firestore só começam depois disso, porque as regras agora exigem
  // `request.auth != null`.
  const [authReady, setAuthReady] = useState(false);

  const [profilePermissions, rawSetProfilePermissions] = useState<ProfilePermissions>(loadStoredProfilePermissions);

  const setProfilePermissions = useCallback((val: React.SetStateAction<ProfilePermissions>) => {
    rawSetProfilePermissions((prev) => {
      const computed = typeof val === 'function' ? val(prev) : val;
      dbSavePermissions(computed);
      return computed;
    });
  }, []);

  const handleUpdatePermissions = (newPerms: ProfilePermissions) => {
    setProfilePermissions(newPerms);
    localStorage.setItem('ms-profile-permissions', JSON.stringify(newPerms));
  };

  const userPermissions = useMemo(
    () => resolveUserPermissions(currentUser, profilePermissions),
    [currentUser, profilePermissions]
  );

  // Sync current user with updated list in case of changes
  useEffect(() => {
    if (currentUser) {
      const matched = users.find(u => 
        u.id === currentUser.id || 
        (u.username && currentUser.username && u.username.toLowerCase() === currentUser.username.toLowerCase())
      );
      if (matched) {
        if (JSON.stringify(matched) !== JSON.stringify(currentUser)) {
          setCurrentUser(matched);
          localStorage.setItem('ms-current-user', JSON.stringify(matched));
        }
      }
      // DO NOT logout currentUser when users list is updated!
    }
  }, [users]);

  const handleUpdateUsers = (newUsers: UserAccount[]) => {
    setUsers(newUsers);
    localStorage.setItem('ms-users', JSON.stringify(newUsers));
  };

  const handleLogin = (user: UserAccount) => {
    setCurrentUser(user);
    localStorage.setItem('ms-current-user', JSON.stringify(user));

    // A Cloud Function `login` (chamada dentro de fazerLogin, em
    // src/lib/userManagement.ts) já validou a senha no servidor e já
    // gravou auth_links/{uid} lá — o cliente não escreve mais isso
    // diretamente (ver o comentário grande em functions/index.js sobre
    // por que essa mudança fecha uma falha de segurança real).
  };

  const handleLogout = () => {
    signOut(auth);
    setCurrentUser(null);
    localStorage.removeItem('ms-current-user');
  };

  // Confere se auth_links/{uid} ainda corresponde ao currentUser
  // restaurado do localStorage após recarregar a página. O cliente NÃO
  // pode mais gravar esse vínculo (só as Cloud Functions login/
  // linkGoogleUser podem — ver firestore.rules e o comentário grande em
  // functions/index.js), então isto é só uma checagem de leitura: na
  // grande maioria dos casos a sessão anônima persiste no navegador
  // entre recarregamentos e o vínculo gravado no login original continua
  // válido (nada a fazer). Se a sessão do Firebase Auth foi perdida (ex.:
  // storage do navegador parcialmente limpo) e uma sessão anônima NOVA
  // foi criada, não existe vínculo correspondente — nesse caso, em vez
  // de reconstruir o vínculo confiando cegamente no que está no
  // localStorage (que era exatamente a falha de segurança antiga),
  // pedimos um novo login.
  useEffect(() => {
    if (!authReady || !currentUser) return;
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !firebaseUser.isAnonymous) return; // sessão do Google tem seu próprio fluxo, abaixo

    getDoc(doc(db, 'auth_links', firebaseUser.uid))
      .then(snap => {
        const linked = snap.exists() ? (snap.data() as { userId?: string }) : null;
        if (linked && linked.userId === currentUser.id) return; // vínculo já válido

        console.warn('Sessão restaurada sem vínculo de autenticação correspondente — solicitando novo login.');
        setCurrentUser(null);
        localStorage.removeItem('ms-current-user');
      })
      .catch(e => console.warn('Falha ao verificar vínculo da sessão restaurada:', e));
  }, [authReady, currentUser?.id]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.isAnonymous) {
        // Sessão-ponte (ver ensureAnonymousAuth): não é um login de verdade,
        // só destrava as leituras/escritas do Firestore para quem entrou
        // por CPF/senha. Não mexe em currentUser.
        //
        // Espera resolver o ID token ANTES de liberar authReady: o SDK do
        // Firestore só anexa o token corretamente às requisições depois
        // que esse round-trip termina — sem isso, as primeiras chamadas
        // onSnapshot() abertas em sequência logo a seguir (sectors,
        // employees, atrs...) saem sem autenticação e tomam
        // permission-denied, mesmo com a sessão já existindo.
        try {
          await firebaseUser.getIdToken();
        } catch (e) {
          console.warn('Falha ao resolver token da sessão anônima:', e);
        }
        setAuthReady(true);
        return;
      }

      if (firebaseUser) {
        // Logged in via Google Sign-In. Mesmo motivo do ramo da sessão
        // anônima abaixo: espera o ID token resolver antes de liberar
        // authReady, pra evitar permission-denied nas primeiras leituras
        // do Firestore.
        try {
          await firebaseUser.getIdToken();
        } catch (e) {
          console.warn('Falha ao resolver token da sessão Google:', e);
        }
        setAuthReady(true);

        // O papel (admin/gestor/colaborador) e o vínculo com o
        // funcionário/setor são resolvidos no SERVIDOR pela Cloud
        // Function linkGoogleUser — o cliente não decide mais sozinho
        // qual papel esta conta deveria ter (ver comentário grande em
        // functions/index.js). Ela também grava auth_links/{uid}.
        try {
          const result = await linkGoogleUserCallable();
          const data = result.data as { success: boolean; userId: string; userData: UserAccount };
          const googleUserAccount = data.userData;

          rawSetUsers(prev => {
            if (!prev.some(u => u.id === googleUserAccount.id)) {
              return [...prev, googleUserAccount];
            }
            return prev.map(u => (u.id === googleUserAccount.id ? { ...u, ...googleUserAccount } : u));
          });

          setCurrentUser(googleUserAccount);
          localStorage.setItem('ms-current-user', JSON.stringify(googleUserAccount));
        } catch (e) {
          console.error('Falha ao vincular sessão do Google:', e);
        }

        // Seed DB if empty
        await seedDatabaseIfEmpty();
      } else {
        // Nenhuma sessão do Firebase Auth ainda: cria uma anônima para que
        // o login por CPF/senha (que não usa Firebase Auth) consiga ler/
        // gravar no Firestore assim que terminar. O listener acima é
        // rechamado automaticamente quando essa sessão anônima é criada.
        ensureAnonymousAuth().catch(e =>
          console.error('Falha ao criar sessão anônima do Firebase Auth:', e)
        );

        // If logged out from Firebase Auth, only reset currentUser if they were a Google user
        setCurrentUser(prev => {
          if (prev && !prev.password) {
            localStorage.removeItem('ms-current-user');
            return null;
          }
          return prev;
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Synchronize collections with Firestore for real-time multi-device persistence
  useEffect(() => {
    // Espera existir sessão do Firebase Auth (mesmo anônima) antes de abrir
    // qualquer listener — as Firestore Rules agora exigem request.auth.
    if (!db || !authReady) return;

    // Seed database if empty on load
    seedDatabaseIfEmpty();

    // Setores, funcionários, ATRs, POPs e ITs têm cada um seu próprio hook
    // agora (ver src/hooks/) — estado, persistência em localStorage e
    // assinatura do Firestore isolados, sem depender deste efeito nem de
    // `currentUser` (só de `authReady`, que é tudo que eles realmente
    // precisam).

    // guarded_documents NÃO tem mais um listener global aqui — ver
    // comentário na declaração do estado (removida), mais acima.
    // DocumentsView.tsx assina só o setor/página que está aberta.

    // Real-time Users subscription. A coleção inteira só é legível por
    // admin/gestor/lider agora (ver firestore.rules — antes qualquer
    // sessão autenticada, inclusive a anônima de todo visitante, lia
    // usuário e hash de senha de todo mundo). Qualquer outra sessão só
    // assina o PRÓPRIO registro logo abaixo (unsubOwnUser).
    const isAccountManager = currentUser?.role === 'admin' || currentUser?.role === 'gestor' || currentUser?.role === 'lider';

    const unsubUsers = isAccountManager
      ? onSnapshot(collection(db, 'users'), (snapshot) => {
          const list: UserAccount[] = [];
          snapshot.forEach((doc) => {
            list.push(doc.data() as UserAccount);
          });
          if (list.length > 0) {
            rawSetUsers(prev => {
              const map = new Map<string, UserAccount>();
              prev.forEach(item => map.set(item.id, item));
              list.forEach(item => {
                const existingKey = Array.from(map.keys()).find(k =>
                  k === item.id ||
                  (map.get(k)?.username && item.username && map.get(k)!.username.toLowerCase() === item.username.toLowerCase())
                );
                if (existingKey) {
                  map.delete(existingKey);
                }
                map.set(item.id, item);
              });
              const result = Array.from(map.values());
              localStorage.setItem('ms-users', JSON.stringify(result));
              return result;
            });
          }
        }, (err) => {
          console.warn("Firestore snapshot error (users):", err);
        })
      : () => {};

    const unsubOwnUser = (!isAccountManager && currentUser)
      ? onSnapshot(doc(db, 'users', currentUser.id), (docSnap) => {
          if (!docSnap.exists()) return;
          const updated = docSnap.data() as UserAccount;
          rawSetUsers(prev => {
            const map = new Map<string, UserAccount>();
            prev.forEach(item => map.set(item.id, item));
            map.set(updated.id, updated);
            const result = Array.from(map.values());
            localStorage.setItem('ms-users', JSON.stringify(result));
            return result;
          });
        }, (err) => {
          console.warn("Firestore snapshot error (own user):", err);
        })
      : () => {};

    // Real-time Permissions subscription
    const unsubPermissions = onSnapshot(doc(db, 'permissions', 'default'), (docSnap) => {
      if (docSnap.exists()) {
        rawSetProfilePermissions(docSnap.data() as ProfilePermissions);
      }
    }, (err) => {
      console.warn("Firestore snapshot error (permissions):", err);
    });

    return () => {
      unsubUsers();
      unsubOwnUser();
      unsubPermissions();
    };
  }, [currentUser, authReady]);

  return {
    users,
    setUsers,
    currentUser,
    authReady,
    profilePermissions,
    userPermissions,
    handleUpdatePermissions,
    handleUpdateUsers,
    handleLogin,
    handleLogout
  };
}
