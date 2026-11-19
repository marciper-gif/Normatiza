// Checagem de segurança — SOMENTE LEITURA, não grava nada.
//
// Lista as contas (users) cuja senha ainda é uma senha padrão conhecida:
//   - "admin", "123", "Colaborador123" (contas criadas automaticamente por
//     versões antigas do app);
//   - "[PrimeiroNome]123" e "[CPF]123" (senha inicial gerada pelo app ao
//     cadastrar colaborador — ver getDefaultInitialPassword em
//     src/lib/userManagement.ts).
// Testa tanto hash antigo (SHA-256) quanto o novo (scrypt).
//
// Não imprime senha nem hash — só login, nome, empresa e qual padrão bateu.
//
// Uso:
//   cd functions
//   node check-default-passwords.js

const crypto = require('crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const FIRESTORE_DATABASE_ID = 'ai-studio-aciicontroledodo-8a9badc3-1faa-4b52-9783-49cb0814c900';
const PROJECT_ID = 'dogwood-loader-bln7n';

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(FIRESTORE_DATABASE_ID);

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

function matches(password, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith('scrypt$')) {
    const [, saltHex, hashHex] = storedHash.split('$');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length, SCRYPT_PARAMS);
    return crypto.timingSafeEqual(expected, actual);
  }
  return sha256Hex(password) === storedHash || sha256Hex(String(password).toLowerCase()) === storedHash;
}

function defaultCandidates(user, employee) {
  const list = ['admin', '123', 'Colaborador123'];
  const name = (employee?.name || user.name || '').trim().split(' ')[0];
  if (name) list.push(name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() + '123');
  const cpf = String(employee?.cpf || user.username || '').replace(/\D/g, '');
  if (cpf) list.push(cpf + '123');
  return [...new Set(list)];
}

async function main() {
  const [usersSnap, employeesSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('employees').get()
  ]);
  const employees = new Map(employeesSnap.docs.map((d) => [d.id, d.data()]));

  let found = 0;
  for (const doc of usersSnap.docs) {
    const user = doc.data();
    if (user.password) {
      console.log(`  ! ${user.username} (${user.name || '-'}) | empresa: ${user.companyId || '-'} | AINDA TEM SENHA EM TEXTO PURO`);
      found++;
      continue;
    }
    const employee = user.employeeId ? employees.get(String(user.employeeId)) : null;
    const hit = defaultCandidates(user, employee).find((pw) => matches(pw, user.passwordHash));
    if (hit) {
      const pending = user.firstAccess === true || user.primeiro_acesso === true;
      const kind = ['admin', '123', 'Colaborador123'].includes(hit) ? `"${hit}"` : 'senha inicial padrão (Nome123/CPF123)';
      console.log(`  ! ${user.username} (${user.name || '-'}) | empresa: ${user.companyId || '-'} | papel: ${user.role} | senha = ${kind}${pending ? ' | ainda não fez o primeiro acesso' : ''}`);
      found++;
    }
  }
  console.log(`\n${usersSnap.size} contas verificadas, ${found} com senha padrão/conhecida.`);
}

main().catch((err) => { console.error('Erro na checagem:', err); process.exit(1); });
