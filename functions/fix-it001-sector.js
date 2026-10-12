// Correção pontual — SOMENTE a IT-001 da ACII, que ficou sem sectorId
// vinculado porque o texto do campo "sector" ("Tecnologia da Informação")
// não batia exatamente com o nome do setor cadastrado ("TI").
//
// Uso:
//   cd functions
//   node fix-it001-sector.js            (dry-run)
//   node fix-it001-sector.js --apply    (grava de verdade)

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const FIRESTORE_DATABASE_ID = 'ai-studio-aciicontroledodo-8a9badc3-1faa-4b52-9783-49cb0814c900';
const PROJECT_ID = 'dogwood-loader-bln7n';
const APPLY = process.argv.includes('--apply');

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(FIRESTORE_DATABASE_ID);

async function main() {
  const sectorsSnap = await db.collection('sectors')
    .where('companyId', '==', 'acii')
    .where('name', '==', 'TI')
    .limit(1)
    .get();

  if (sectorsSnap.empty) {
    console.log('Não encontrei um setor chamado "TI" na ACII. Nada feito.');
    return;
  }
  const sectorId = sectorsSnap.docs[0].id;
  console.log(`Setor "TI" encontrado: ${sectorId}`);

  const itsSnap = await db.collection('its')
    .where('companyId', '==', 'acii')
    .where('sector', '==', 'Tecnologia da Informação')
    .get();

  console.log(`${itsSnap.size} Instrução(ões) de Trabalho com sector="Tecnologia da Informação" sem sectorId.`);
  itsSnap.docs.forEach(d => console.log(`  - ${d.id}: "${d.data().title}" (sectorId atual: ${d.data().sectorId || 'nenhum'})`));

  if (APPLY && itsSnap.size > 0) {
    const batch = db.batch();
    itsSnap.docs.forEach(d => batch.update(d.ref, { sectorId }));
    await batch.commit();
    console.log('Atualizado(s).');
  } else if (!APPLY) {
    console.log('Dry-run — nada gravado. Rode com --apply para corrigir de verdade.');
  }
}

main().catch(err => { console.error('Erro:', err); process.exit(1); });
