import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store';
import RaceCard from '../Home/RaceCard';
import RaceListCard from './RaceListCard';
import SectionLabel from '../shared/SectionLabel';
import CoachInsightsDock from '../BI/CoachInsightsDock';
import CupDoorCard from './CupDoorCard';
import CupEnrollmentScreen from './CupEnrollmentScreen';
import CupTrofeuScreen from './CupTrofeuScreen';
import { useCup } from '../../utils/useCup';
import { cupScreenRequestValid } from '../../store/cupSlice';

/* "As tuas provas" — o separador Provas da barra (2026-09-13, opção A de
   "Onde vivem as provas"). A prova é o grande objetivo da app e estava
   espalhada por quatro sítios: a próxima no Início, a lista no Dashboard
   Corrida, o Palmarés no Perfil e cada uma no seu dia do Calendário. Aqui
   junta-se tudo, de cima para baixo:

   1. "Para onde vou" — o MESMO cartão do Início (a próxima prova, a fase, os
      dias, o trilho; o dia seguinte com as conquistas), porque é a mesma
      prova e tem de se ler da mesma maneira;
   2. todas as provas por grupos — próximas, por registar, concluídas — com
      "Marcar prova". Cada linha abre o hub.

   O Palmarés (2026-09-22, fase 1 da reforma da gamificação) mudou-se daqui
   para o separador "Vitrina" do Perfil, e na fase C deu lugar aos badges —
   este ecrã volta a falar só de provas, ver Perfil.jsx.

   Sem estado próprio: tudo vem do store e dos componentes que já existiam. */
export default function RacesScreen() {
  const { raceEvents, runs, profile, setEditingRaceId, setOpenCreationMode, dismissCupEdition, cupScreenRequest, clearCupScreenRequest } = useAppStore();
  const createRace = () => setOpenCreationMode('race');
  // Registar a prova é abrir o registo de corrida em modo prova (specs/
  // prova-concluida.md §3) — o mesmo ponto do store que o Início usa.
  const registerRace = (raceId) => useAppStore.getState().openRaceRun(raceId);

  // O Troféu (specs/trofeu.md §4.1, Fase 1): useCup() só lê alguma coisa
  // quando ESTE ecrã monta (é o ponto de entrada do hook, ver utils/useCup.js)
  // e devolve null para quase toda a gente — nesse caso `cupScreen` nunca
  // chega a ter para onde abrir, e nada abaixo desta linha muda o ecrã de
  // hoje (teste de invariância em RacesScreen.test.jsx).
  const cup = useCup();
  // null | 'inscricao' | { kind: 'trofeu', mode, roundId } — `mode` e
  // `roundId` dizem ao ecrã do Troféu onde abrir (null: ele decide).
  const [cupScreen, setCupScreen] = useState(null);

  /* Fase 3 (§4.3): o Troféu também se abre de fora deste ecrã — o bloco da
     lista, a linha do "Para onde vou", a migalha do hub — por um pedido no
     store (cupScreenRequest). Só com inscrição se abre; lida a competição
     sem inscrição, o pedido já não tem para onde ir e limpa-se. Enquanto a
     leitura corre, espera. Um pedido velho (quem o fez saiu daqui antes de
     a leitura acabar) ou de outra conta deita-se fora sem abrir nada
     (cupScreenRequestValid, cupSlice.js). */
  const userId = useAppStore((s) => s.session?.user?.id || s.profile?.id || null);
  const cupRead = useAppStore((s) => ['ready', 'indisponivel', 'erro'].includes(s.cup.status)
    && s.cup.userId === (s.session?.user?.id || s.profile?.id || null));
  const cupEnrolled = !!cup?.enrollment;
  useEffect(() => {
    if (!cupScreenRequest) return;
    if (!cupScreenRequestValid(cupScreenRequest, userId)) {
      clearCupScreenRequest();
    } else if (cupEnrolled) {
      setCupScreen({ kind: 'trofeu', mode: cupScreenRequest.mode ?? null, roundId: cupScreenRequest.roundId ?? null });
      clearCupScreenRequest();
    } else if (cupRead) {
      clearCupScreenRequest();
    }
  }, [cupScreenRequest, cupEnrolled, cupRead, userId, clearCupScreenRequest]);

  return (
    <div className="flex flex-col gap-2 fade-in pb-2" data-testid="races-screen">
      <h2 className="sr-only">As tuas provas</h2>

      <SectionLabel>Para onde vou</SectionLabel>
      <RaceCard
        raceEvents={raceEvents}
        runs={runs}
        profile={profile}
        onOpenRace={setEditingRaceId}
        onCreateRace={createRace}
        onRegisterRace={registerRace}
      />

      <div className="flex flex-col gap-2" style={{ marginTop: 6 }}>
        <RaceListCard />
      </div>

      {/* O cartão do Troféu vive no FIM do ecrã (§4.1) — depois de tudo o
          que já existia, nunca antes. Com inscrição, a lista tem o bloco
          fixo da edição (Fase 3) e a porta seria a mesma próxima jornada
          duas vezes: fica só o convite. */}
      <CupDoorCard
        view={cupEnrolled ? null : cup}
        onEnroll={() => setCupScreen('inscricao')}
        onDismiss={(editionId) => dismissCupEdition(editionId)}
        onOpenTrofeu={() => setCupScreen({ kind: 'trofeu', mode: null, roundId: null })}
      />

      {/* Os avisos da Carol acompanham o atleta em todo o lado menos no
          Chat (pedido do utilizador). */}
      <CoachInsightsDock />

      {cupScreen === 'inscricao' && (
        <CupEnrollmentScreen
          view={cup}
          onClose={() => setCupScreen(null)}
          // Logo a seguir à inscrição o atleta vê a lista de jornadas (§4.2).
          onEnrolled={() => setCupScreen({ kind: 'trofeu', mode: 'decidir', roundId: null })}
        />
      )}
      {cupScreen?.kind === 'trofeu' && cup?.enrollment && (
        <CupTrofeuScreen
          view={cup}
          onClose={() => setCupScreen(null)}
          initialMode={cupScreen.mode ?? undefined}
          focusRoundId={cupScreen.roundId ?? undefined}
        />
      )}
    </div>
  );
}
