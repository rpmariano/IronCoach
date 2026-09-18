/**
 * PROTÓTIPO — não existe como componente. A nav inferior real, com a minhoca e o FAB, está inline em `src/components/Layout/Layout.jsx`. Alterações à nav fazem-se lá; este ficheiro serve para desenhar mocks.
 *
 * @startingPoint section="Components" subtitle="Nav inferior com minhoca e FAB da prova" viewport="700x200"
 */
export interface BottomNavProps {
  /** exatamente 4: Início, Provas, Dashboard, Coach (desde 2026-09-13; o
   *  Calendário passou para o cabeçalho — specs/prova-concluida.md,
   *  "Onde vivem as provas") */
  items: { icon: React.ReactNode; label: string }[];
  active?: 0 | 1 | 2 | 3;
  onChange?: (index: number) => void;
  fabIcon: React.ReactNode;
  onFab?: () => void;
  /** roda o + 45° quando o menu está aberto */
  fabOpen?: boolean;
}
export function BottomNav(props: BottomNavProps): JSX.Element;
