/* O fuso dos testes é UTC, sempre (2026-09-26). O CI (GitHub Actions) corre
   em UTC; quem os corria noutro fuso via vermelhos falsos — os testes que
   fixam o relógio numa terça antes e depois do cron (percentile.test.js,
   TabelasScreen/OndeEstasScreen.test.jsx) dependem do dia LOCAL desse
   instante. globalSetup corre no processo principal antes de os workers
   arrancarem, e eles herdam o fuso. */
export default function setup() {
  process.env.TZ = 'UTC';
}
