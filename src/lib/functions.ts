import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

// Região precisa bater com a das Cloud Functions (functions/index.js) —
// 'us-central1', mesma região já usada por syncAuthLinkClaims.
export const functions = getFunctions(app, 'us-central1');

// Verifica usuário/senha no servidor (Admin SDK) e vincula a sessão atual
// via auth_links/{uid}. Ver comentário grande em functions/index.js sobre
// por que isso deixou de ser validado no navegador.
export const loginCallable = httpsCallable(functions, 'login');

// Chamado logo após "Entrar com o Google" ter sucesso — resolve o papel
// (admin/gestor/colaborador) no servidor e vincula auth_links/{uid}.
export const linkGoogleUserCallable = httpsCallable(functions, 'linkGoogleUser');

// Define uma nova senha (troca própria ou reset por admin/gestor) sem
// nunca gravar texto puro — só o hash.
export const setPasswordCallable = httpsCallable(functions, 'setPassword');

// Devolve uma URL assinada (expira em minutos) para baixar um arquivo do
// módulo de guarda de documentos, após checar a permissão no servidor.
export const getDocumentDownloadUrlCallable = httpsCallable<
  { documentId: string; version?: number },
  { url: string }
>(functions, 'getDocumentDownloadUrl');
