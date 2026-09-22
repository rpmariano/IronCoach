/* O catálogo das fontes — que app deu o print, que ECRÃ dessa app traz que campos.
 *
 * Porque existe: o extrator não tem bug nenhum. O `analyze-run` lê `hr_zones`
 * sempre que o ecrã das zonas está entre as imagens. O que faltava era a app
 * saber DIZER que ecrãs valem a pena — e por isso o atleta manda um print, a
 * app deteta oito campos em falta, mostra um painel que se dispensa, e nunca
 * mais insiste. Medido a 2026-09-22, com a MESMA corrida (7,01 km, 2635 s)
 * registada duas vezes pelo mesmo atleta:
 *
 *   4 fotos → 16 campos em `details` (zonas de FC, os dois limiares, toda a
 *             biomecânica)
 *   1 foto  → 8 campos. Os outros oito perdem-se, em silêncio.
 *
 * No outro perfil da app: 73 corridas, 1,44 fotos de média, ZERO com zonas de
 * FC — e por isso o badge Mestre da Z2 nunca lhe pode cair.
 *
 * Vive em `_shared/` porque o cliente e as Edge Functions têm de ler a mesma
 * coisa: a Edge Function para IDENTIFICAR a app no print, o cliente para
 * SUGERIR o ecrã que falta. É o mesmo molde do `_shared/badgeCatalog.ts`.
 *
 * ── O que é MEDIDO e o que é INFERIDO ────────────────────────────────────
 * A fronteira entre a 1.ª foto e as outras três é medida: sabe-se, dos dados
 * reais, que campos vieram só com o ecrã de resumo e que oito campos só
 * apareceram quando as outras três fotos entraram. Cada ecrã leva um
 * `confirmado` que diz qual dos dois casos é. NÃO se sabe qual dos oito veio
 * de qual dos três prints — essa repartição é inferida pela semântica e está
 * por confirmar com dados reais. Ver o comentário de cada ecrã.
 *
 * ── Fontes novas ─────────────────────────────────────────────────────────
 * Acrescentar uma app é acrescentar uma entrada a `SOURCE_APPS`. Nada no
 * consumo muda: quem lê passa por `appDaFonte()`/`agruparCamposPorEcra()`, que
 * já tratam do caso "não conheço esta chave" devolvendo null / um grupo sem
 * ecrã. Uma chave desconhecida cai no comportamento genérico de sempre — nunca
 * parte nada, e nunca se inventa o nome de um ecrã de uma app que não está cá.
 */

export type SourceDomain = "corrida" | "corpo";

/** O valor que a extração devolve quando não consegue identificar a app.
 *  É uma chave a sério (o modelo tem de a escolher explicitamente), não a
 *  ausência de resposta — distingue "olhei e não reconheci" de "não te
 *  perguntei". Não existe em `SOURCE_APPS`: de propósito, porque tudo o que
 *  a consome já sabe lidar com uma chave que o catálogo não conhece. */
export const FONTE_NAO_RECONHECIDA = "desconhecida";

export interface SourceScreen {
  /** Chave estável do ecrã — nunca aparece ao atleta. */
  id: string;
  /** Como o ecrã se chama NA APP, para se poder dizer ao atleta qual é. */
  nome: string;
  /** Chaves de extração que este ecrã traz. */
  campos: string[];
  /** true: sabe-se, de dados reais, que estes campos vêm deste ecrã.
   *  false: repartição inferida pela semântica, por confirmar. */
  confirmado: boolean;
}

export interface SourceApp {
  /** Nome da app como o atleta a conhece. */
  nome: string;
  dominio: SourceDomain;
  /** Pela ordem em que se sugerem. O PRIMEIRO é o ecrã que um print solitário
   *  quase sempre é (o resumo) — os seguintes são os que se perdem. */
  ecras: SourceScreen[];
}

export const SOURCE_APPS: Record<string, SourceApp> = {
  samsung_health: {
    nome: "Samsung Health",
    dominio: "corrida",
    ecras: [
      {
        /* MEDIDO (2026-09-22): estes são exatamente os campos que a corrida
           registada com UMA só foto trouxe. `splits` inclui-se aqui de
           propósito — a tabela de voltas vem do próprio ecrã de resumo, por
           cima do mapa, e não de um ecrã à parte como se supunha.
           `distance_km`/`duration_seconds` não são de `details` (são colunas
           de `runs`), mas vêm do mesmo ecrã e entram na lista porque é por
           elas que o painel de métricas em falta também pergunta. */
        id: "resumo",
        nome: "Resumo da corrida",
        campos: [
          "distance_km",
          "duration_seconds",
          "avg_heart_rate_bpm",
          "cadence_spm",
          "calories_kcal",
          "elevation_gain_m",
          "recommended_hydration_ml",
          "splits",
          "sweat_loss_ml",
          "vo2_max",
        ],
        confirmado: true,
      },
      {
        /* INFERIDO — POR CONFIRMAR COM DADOS REAIS.
           Sabe-se que `hr_zones` e os dois limiares vieram das OUTRAS três
           fotos (nenhum deles aparece no registo de uma foto só). Não se sabe
           de qual. Ficam juntos porque os limiares aeróbio/anaeróbio são as
           fronteiras das próprias zonas — a Samsung mostra-os no mesmo ecrã
           quando o método de zonas é o do limiar. Se um dia se medir o
           contrário, é esta lista que muda, não o consumo. */
        id: "zonas_fc",
        nome: "Zonas de Frequência Cardíaca",
        campos: ["hr_zones", "aerobic_threshold_bpm", "anaerobic_threshold_bpm"],
        confirmado: false,
      },
      {
        /* INFERIDO — POR CONFIRMAR COM DADOS REAIS.
           Os outros cinco dos oito campos que só apareceram com as três fotos
           extra. Agrupam-se por serem todos a mesma família de medida — o que
           o relógio calcula sobre a passada, e não sobre o esforço.
           Nota honesta: eram TRÊS fotos além do resumo e aqui só se
           reconstroem DOIS ecrãs. Ou uma delas repetia informação, ou há um
           terceiro ecrã cujo conteúdo ainda não se viu — a repartição
           1 ecrã ↔ 1 foto não está provada. */
        id: "dinamica_corrida",
        nome: "Dinâmica de Corrida",
        campos: [
          "ground_contact_time_ms",
          "vertical_oscillation_cm",
          "flight_time_ms",
          "leg_stiffness_kn_m",
          "regularity_score",
        ],
        confirmado: false,
      },
    ],
  },

  renpho: {
    nome: "Renpho Health",
    dominio: "corpo",
    /* TUDO INFERIDO — não há, para a Renpho, nada equivalente à calibração da
       Samsung: não existe a experiência das duas pesagens com número de fotos
       diferente. Os nomes dos ecrãs vêm do prompt do `analyze-body`
       ("Composição corporal / Comparativo", "Relatório de métricas / Visão
       geral", "Tendências"), que foi calibrado com prints reais — os NOMES
       são, portanto, de confiança; o que cada um traz é que não está medido.
       O "Comparativo" não entra como ecrã próprio porque, pelo que o prompt
       descreve, mostra o mesmo conjunto de métricas do relatório, só que com
       a variação ao lado do valor — seria um ecrã a sugerir em vez de outro
       sem nada acrescentar. */
    ecras: [
      {
        /* INFERIDO: é o ecrã que lista todas as métricas da pesagem, por isso
           é o único que se sugere quando falta seja o que for. */
        id: "relatorio",
        nome: "Relatório de métricas (Visão geral)",
        campos: [
          "weight_kg",
          "bmi",
          "body_fat_pct",
          "skeletal_muscle_pct",
          "muscle_mass_kg",
          "body_water_pct",
          "protein_pct",
          "bone_mass_kg",
          "bmr_kcal",
          "visceral_fat",
          "subcutaneous_fat_pct",
          "metabolic_age",
          "lean_body_mass_kg",
        ],
        confirmado: false,
      },
      {
        /* INFERIDO: o gráfico de evolução só cobre as métricas de topo. Fica
           catalogado para o dia em que a extração souber ler histórico — hoje
           não acrescenta nada que o relatório não traga. */
        id: "tendencias",
        nome: "Tendências",
        campos: ["weight_kg", "bmi", "body_fat_pct", "muscle_mass_kg"],
        confirmado: false,
      },
    ],
  },
};

/* As métricas que o painel de métricas em falta trata como UMA só, embora
   sejam vários campos (`src/components/Run/RunRegistration.jsx`,
   detectMissingRunMetrics). Sem isto, agrupar por ecrã não conseguia colocar
   "Métricas Biomecânicas" em ecrã nenhum — a chave `biomechanics` não existe
   em extração nenhuma. Espelha exatamente o que essa função testa; se lá
   mudar, muda aqui. */
export const CAMPOS_AGREGADOS: Record<string, string[]> = {
  biomechanics: ["ground_contact_time_ms", "vertical_oscillation_cm", "asymmetry_pct"],
  thresholds: ["aerobic_threshold_bpm", "anaerobic_threshold_bpm"],
};

/** A app de uma chave de fonte, ou null se o catálogo não a conhecer.
 *  `FONTE_NAO_RECONHECIDA`, lixo, null e undefined caem todos no mesmo sítio:
 *  null — que é o sinal para quem consome manter o texto genérico. */
export function appDaFonte(chave: unknown): SourceApp | null {
  if (typeof chave !== "string") return null;
  return SOURCE_APPS[chave] ?? null;
}

/** As chaves conhecidas, opcionalmente só as de um domínio. Ordenadas para a
 *  lista ser estável entre execuções (entra no schema da extração). */
export function chavesDeFonte(dominio?: SourceDomain): string[] {
  return Object.keys(SOURCE_APPS)
    .filter((k) => !dominio || SOURCE_APPS[k].dominio === dominio)
    .sort();
}

/** Os valores que o campo `source_app` pode tomar na extração: as chaves
 *  conhecidas do domínio MAIS a chave de "não reconheci". O modelo tem sempre
 *  uma saída honesta — sem ela, um print do Strava era arrumado à força na
 *  app mais parecida. */
export function opcoesDeFonte(dominio: SourceDomain): string[] {
  return [...chavesDeFonte(dominio), FONTE_NAO_RECONHECIDA];
}

/** Normaliza o que veio do modelo: uma chave conhecida DESSE domínio fica como
 *  está; tudo o resto (outra app, outro domínio, lixo, vazio) vira
 *  `FONTE_NAO_RECONHECIDA`. Nunca devolve null — ter perguntado e não ter
 *  reconhecido é informação, e vale a pena ficar gravada. */
export function normalizarFonte(valor: unknown, dominio: SourceDomain): string {
  if (typeof valor !== "string") return FONTE_NAO_RECONHECIDA;
  const chave = valor.trim().toLowerCase();
  const app = SOURCE_APPS[chave];
  return app && app.dominio === dominio ? chave : FONTE_NAO_RECONHECIDA;
}

/** Uma linha por ecrã, com as chaves em falta que esse ecrã resolve.
 *
 *  É isto que transforma "seis campos soltos" em "dois prints": o atleta não
 *  tem de perceber que a oscilação vertical e o tempo de contacto no solo
 *  vivem no mesmo sítio — vê um ecrã, com nome, e sabe o que ir buscar.
 *
 *  Escolhe-se, de cada vez, o ecrã que resolve MAIS chaves ainda por resolver
 *  (empate: a ordem do catálogo). Assim um ecrã que traga tudo aparece
 *  sozinho, em vez de a mesma métrica se repetir por três sugestões.
 *
 *  O que nenhum ecrã conhecido cobrir — e TUDO, quando a fonte não é
 *  reconhecida — sai num grupo final com `ecra: null`, que é o pedido
 *  explícito a quem desenha o ecrã para manter aí o texto de hoje. */
export function agruparCamposPorEcra(
  chaveFonte: unknown,
  chaves: string[],
): Array<{ ecra: SourceScreen | null; chaves: string[] }> {
  const pendentes = (Array.isArray(chaves) ? chaves : []).filter(
    (c): c is string => typeof c === "string" && !!c,
  );
  const app = appDaFonte(chaveFonte);
  if (!app || pendentes.length === 0) {
    return pendentes.length ? [{ ecra: null, chaves: pendentes }] : [];
  }

  // Cada chave em falta vale pelos campos de extração que representa: as
  // agregadas ("biomechanics") por vários, as outras por si próprias.
  const camposDe = (chave: string) => CAMPOS_AGREGADOS[chave] ?? [chave];
  const cobre = (ecra: SourceScreen, chave: string) =>
    camposDe(chave).some((campo) => ecra.campos.includes(campo));

  const grupos: Array<{ ecra: SourceScreen | null; chaves: string[] }> = [];
  let porResolver = [...pendentes];

  while (porResolver.length > 0) {
    let melhor: SourceScreen | null = null;
    let melhorChaves: string[] = [];
    for (const ecra of app.ecras) {
      const resolvidas = porResolver.filter((chave) => cobre(ecra, chave));
      if (resolvidas.length > melhorChaves.length) {
        melhor = ecra;
        melhorChaves = resolvidas;
      }
    }
    if (!melhor) break;
    grupos.push({ ecra: melhor, chaves: melhorChaves });
    porResolver = porResolver.filter((chave) => !melhorChaves.includes(chave));
  }

  if (porResolver.length) grupos.push({ ecra: null, chaves: porResolver });
  return grupos;
}

/** Os ecrãs que se perdem quando só se manda um print: tudo menos o primeiro
 *  de cada app do domínio. Serve o seletor de fotos, que fala ANTES de haver
 *  print nenhum e portanto antes de se saber qual é a app. */
export function ecrasQueSePerdem(dominio: SourceDomain): Array<{ app: SourceApp; ecras: SourceScreen[] }> {
  return chavesDeFonte(dominio)
    .map((chave) => ({ app: SOURCE_APPS[chave], ecras: SOURCE_APPS[chave].ecras.slice(1) }))
    .filter((entrada) => entrada.ecras.length > 0);
}

/** O ecrã que um print solitário quase sempre é — o primeiro da lista. É o que
 *  vale a pena nomear quando ainda não há imagem nenhuma e portanto não se sabe
 *  qual é a app: serve o seletor de fotos, não o painel de métricas em falta. */
export function ecraPrincipal(chaveFonte: unknown): SourceScreen | null {
  return appDaFonte(chaveFonte)?.ecras[0] ?? null;
}
