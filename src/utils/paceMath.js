/* A conta da calculadora de ritmo: distância, ritmo e tempo total são três
   valores com dois graus de liberdade — dados dois, o terceiro sai.

   Fica aqui e não dentro do componente por causa da regra de
   specs/formulas-centralizacao.md ("uma métrica, uma implementação"): é
   pouca conta, mas é a mesma que o plano de prova e os dashboards fazem, e
   uma segunda cópia dentro de um ecrã é como as divergências começam. A
   formatação e a leitura continuam em utils/run.js e em
   _shared/formulas/paceFormat.ts — aqui é só a aritmética. */

/** Segundos por km a partir da distância e do tempo total. null se não der. */
export function paceFromTotal(distanceKm, totalSeconds) {
  const d = Number(distanceKm);
  const t = Number(totalSeconds);
  if (!(d > 0) || !(t > 0)) return null;
  return Math.round(t / d);
}

/** Tempo total a partir da distância e do ritmo. null se não der. */
export function totalFromPace(distanceKm, paceSecondsPerKm) {
  const d = Number(distanceKm);
  const p = Number(paceSecondsPerKm);
  if (!(d > 0) || !(p > 0)) return null;
  return Math.round(d * p);
}

/* Lê a distância como o atleta a escreve. A vírgula é o separador decimal em
   português e é o que o teclado do telemóvel oferece — "21,1" tem de valer o
   mesmo que "21.1", senão a meia maratona não se consegue escrever. */
export function parseDistanceKm(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** "21.1" → "21,1 km"; corta o ".0" que só faz ruído ("5.0 km" → "5 km"). */
export function formatDistanceKm(distanceKm) {
  const d = Number(distanceKm);
  if (!(d > 0)) return '';
  const txt = Number.isInteger(d) ? String(d) : String(Number(d.toFixed(3)));
  return `${txt.replace('.', ',')} km`;
}

/** As distâncias que o atleta escolhe sem escrever nada. */
export const DISTANCIAS_RAPIDAS = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.1, label: 'Meia' },
  { km: 42.2, label: 'Maratona' },
];
