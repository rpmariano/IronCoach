import React from 'react';

/* Campo de tempo h:mm:ss com máscara (pedido 2026-09-13): no telemóvel o
   teclado numérico não tem ":" — o atleta só conseguia escrever "51,28" ou
   "51.28", que o parser lia como 51,28 minutos. Escreve-se só com dígitos, à
   maneira de um cronómetro, da direita para a esquerda: "5" → 0:05, "51" →
   0:51, "5128" → 51:28, "15128" → 1:51:28. Os ":" nascem sozinhos, e um
   valor colado com ":", "," ou "." (do rascunho, do servidor, da área de
   transferência) é lido pelos seus dígitos.

   O `onChange` recebe SEMPRE a string já formatada (m:ss ou h:mm:ss), que é
   o que `parseDurationToSeconds` já sabia ler — nada muda a jusante. */

const MAX_DIGITS = 6; // hh:mm:ss

export function formatDurationDigits(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(-MAX_DIGITS);
  // Só zeros é "nada": senão apagar "0:05" com backspace deixava "0:00" para
  // sempre (revisão pré-deploy 2026-09-13).
  if (!digits || /^0+$/.test(digits)) return '';
  const padded = digits.padStart(4, '0');
  const seconds = padded.slice(-2);
  const minutes = padded.slice(-4, -2);
  const hours = padded.slice(0, -4);
  if (hours) return `${Number(hours)}:${minutes}:${seconds}`;
  return `${Number(minutes)}:${seconds}`;
}

export default function DurationInput({ value, onChange, className = '', ...rest }) {
  const handleChange = (e) => {
    const next = formatDurationDigits(e.target.value);
    onChange(next);
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatDurationDigits(value)}
      onChange={handleChange}
      className={className}
      {...rest}
    />
  );
}
