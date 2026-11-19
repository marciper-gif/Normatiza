// Script de manutenção — roda MANUALMENTE. Desativa UMA conta de acesso
// (users), sem apagar nada: marca como inativa e remove a senha. O login
// passa a responder "Conta inativa". Reversível pelo Painel Admin.
//
// Uso (Cloud Shell):
//   cd ~/Normatiza/functions
//   node deactivate-account.js <login> <empresa>
// Exemplo:
//   node deactivate-account.js colaborador acii
//
// Exige login E empresa para nunca desativar a conta errada (o mesmo login
// pode existir em empresas diferentes).

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const PROJECT_ID = 'dogwood-loader-bln7n';
const FIRESTORE_DATABASE_ID = 'ai-studio-aciicontroledodo-8a9badc3-1faa-4b52-9783-49cb0814c900';

async function main() {
  const [username, companyId] = process.argv.slice(2);
  if (!username || !companyId) {
    console.error('Uso: node deactivate-account.js <login> <empresa>   (ex.: node deactivate-account.js colaborador acii)');
    process.exit(1);
  }

  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(FIRESTORE_DATABASE_ID);

  const snap = await db.collection('users').where('username', '==', username).get();
  const matches = snap.docs.filter((d) => (d.data().companyId || 'acii') === companyId);

  if (matches.length === 0) {
    console.error(`❌ Nenhuma conta "${username}" na empresa "${companyId}".`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`❌ Há ${matches.length} contas "${username}" na empresa "${companyId}". Nada foi alterado.`);
    process.exit(1);
  }

  const doc = matches[0];
  if (doc.data().role === 'admin') {
    console.error('❌ Esta é uma conta admin. Para o admin, troque a senha com set-admin-password.js em vez de desativar.');
    process.exit(1);
  }

  await doc.ref.update({
    accountStatus: 'inativo',
    status: 'Inativo',
    passwordHash: FieldValue.delete(),
    password: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp()
  });

  console.log(`✅ Conta "${username}" (${doc.data().name || '-'}) da empresa "${companyId}" desativada (documento ${doc.id}).`);
}

main().catch((err) => {
  console.error('Erro ao desativar a conta:', err);
  process.exit(1);
});
