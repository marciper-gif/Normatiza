import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Building2, LogOut, Loader2, ArrowRight, UserPlus, RefreshCw, ShieldCheck } from 'lucide-react';
import { UserAccount } from '../types';
import { listCompaniesCallable, enterCompanyCallable } from '../lib/functions';
import CompanyOnboardingModal from './CompanyOnboardingModal';

interface CompanySummary {
  id: string;
  name: string;
}

interface PlatformAdminHomeProps {
  currentUser: UserAccount;
  onEnteredCompany: (updatedUser: UserAccount) => void;
  onLogout: () => void;
}

/**
 * Tela inicial neutra do dono da plataforma (ver PLATFORM_COMPANY_ID em
 * src/lib/tenant.ts). Antes, o login Google do dono caía direto no portal
 * da ACII — o botão "Empresas" só existia DENTRO dela. Isso misturava
 * ferramenta de gestão da plataforma com os dados de um cliente real.
 *
 * Esta tela não carrega documentos/setores/funcionários de nenhuma
 * empresa — só lista as empresas existentes (com um botão "Entrar") e dá
 * acesso ao mesmo modal de sempre pra criar uma nova ou resetar senha.
 */
export default function PlatformAdminHome({ currentUser, onEnteredCompany, onLogout }: PlatformAdminHomeProps) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  const loadCompanies = () => {
    setLoading(true);
    setLoadError(null);
    listCompaniesCallable()
      .then((res) => {
        const data = res.data as { companies: CompanySummary[] };
        setCompanies(data.companies || []);
      })
      .catch((err) => {
        setLoadError(err?.message || 'Falha ao carregar a lista de empresas.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const handleEnter = async (companyId: string) => {
    setEnteringId(companyId);
    try {
      const res = await enterCompanyCallable({ companyId });
      const data = res.data as { userData: UserAccount };
      onEnteredCompany(data.userData);
    } catch (err: any) {
      setLoadError(err?.message || 'Falha ao entrar na empresa.');
      setEnteringId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-600 text-white shadow-xl mb-3">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white font-display">
            Administração da Plataforma
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Olá, {currentUser.name.split(' ')[0]} — escolha uma empresa pra acessar o portal dela, ou gerencie o cadastro abaixo.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5" />
              Empresas cadastradas
            </h2>
            <button
              onClick={loadCompanies}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
              title="Recarregar lista"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadError && (
            <div className="px-4 pt-4 text-xs text-rose-600 dark:text-rose-400 font-semibold">{loadError}</div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-6 flex items-center justify-center text-slate-400 text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando empresas...
              </div>
            ) : companies.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">Nenhuma empresa cadastrada ainda.</div>
            ) : (
              companies.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono truncate">{c.id}</p>
                  </div>
                  <button
                    onClick={() => handleEnter(c.id)}
                    disabled={enteringId !== null}
                    className="shrink-0 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-violet-600 hover:text-white dark:hover:bg-violet-600 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {enteringId === c.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        Entrar <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setIsOnboardingOpen(true)}
              className="w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Criar nova empresa / Resetar senha
            </button>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="w-full mt-4 px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sair
        </button>
      </motion.div>

      <CompanyOnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => {
          setIsOnboardingOpen(false);
          loadCompanies();
        }}
      />
    </div>
  );
}
