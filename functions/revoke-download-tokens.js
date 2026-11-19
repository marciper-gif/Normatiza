/**
 * Script de manutenção (rodar UMA vez, manual, DEPOIS do deploy do
 * frontend novo): revoga os tokens permanentes de download dos arquivos de
 * documentos já enviados ao Storage (documentos/...). Sem isso, os links
 * `fileUrl` antigos gravados no Firestore continuam abrindo o arquivo para
 * quem os tiver, ignorando as permissões e o isolamento entre empresas.
 *
 * NÃO mexe em branding/ (logos de empresa são públicos por desenho e a
 * tela usa o link com token).
 *
 *   cd functions && npm install && node revoke-download-tokens.js          (simula)
 *   node revoke-download-tokens.js --apply                                 (executa)
 */
const { initializeApp } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');

const BUCKET = 'dogwood-loader-bln7n.firebasestorage.app';
initializeApp({ projectId: 'dogwood-loader-bln7n', storageBucket: BUCKET });

(async () => {
  const apply = process.argv.includes('--apply');
  const [files] = await getStorage().bucket(BUCKET).getFiles({ prefix: 'documentos/' });
  let revoked = 0;
  for (const file of files) {
    const meta = file.metadata?.metadata || {};
    if (!meta.firebaseStorageDownloadTokens) continue;
    console.log(`${apply ? 'Revogando' : '[simulação] revogaria'}: ${file.name}`);
    if (apply) await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
    revoked++;
  }
  console.log(`${files.length} arquivos verificados, ${revoked} com token${apply ? ' revogado' : ' (use --apply para revogar)'}.`);
})().catch(e => { console.error(e); process.exit(1); });
