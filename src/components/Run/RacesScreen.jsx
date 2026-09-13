import React from 'react';
import { useAppStore } from '../../store';
import RaceCard from '../Home/RaceCard';
import PalmaresCard from '../Perfil/PalmaresCard';
import RaceListCard from './RaceListCard';
import SectionLabel from '../shared/SectionLabel';

/* "As tuas provas" — o separador Provas da barra (2026-09-13, opção A de
   "Onde vivem as provas"). A prova é o grande objetivo da app e estava
   espalhada por quatro sítios: a próxima no Início, a lista no Dashboard
   Corrida, o Palmarés no Perfil e cada uma no seu dia do Calendário. Aqui
   junta-se tudo, de cima para baixo:

   1. "Para onde vou" — o MESMO cartão do Início (a próxima prova, a fase, os
      dias, o trilho; o dia seguinte com as conquistas), porque é a mesma
      prova e tem de se ler da mesma maneira;
   2. o Palmarés, que saiu do Perfil: é o arquivo das provas, vive com elas;
   3. todas as provas por grupos — próximas, por registar, concluídas — com
      "Marcar prova". Cada linha abre o hub.

   Sem estado próprio: tudo vem do store e dos componentes que já existiam. */
export default function RacesScreen() {
  const { raceEvents, runs, profile, setEditingRaceId, setOpenCreationMode } = useAppStore();
  const createRace = () => setOpenCreationMode('race');
  // Registar a prova é abrir o registo de corrida em modo prova (specs/
  // prova-concluida.md §3) — o mesmo ponto do store que o Início usa.
  const registerRace = (raceId) => useAppStore.getState().openRaceRun(raceId);

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

      <SectionLabel style={{ marginTop: 6 }}>O que já conquistei</SectionLabel>
      <PalmaresCard onOpenRace={setEditingRaceId} />

      <div className="flex flex-col gap-2" style={{ marginTop: 6 }}>
        <RaceListCard />
      </div>
    </div>
  );
}
