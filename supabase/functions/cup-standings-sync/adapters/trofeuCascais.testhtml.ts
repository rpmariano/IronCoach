// Renderizador de TESTE: escreve HTML com a estrutura do site do Troféu a
// partir das páginas SINTÉTICAS de @formulas/cupResults.fixtures.ts (nomes,
// dorsais e clubes inventados). Nenhuma página real entra no git: a
// estrutura (acordeão com <h5>"6200 metros - Series"</h5>, "1ª Série M
// (Masculino)", <table class="table …"> com <th scope="col">, a <img> do
// clube com o nome no atributo, a legenda da geral, as entidades &#NNN; do
// IIS) foi lida do site a 2026-09-27 e reproduz-se aqui à mão.
//
// Só os testes importam este ficheiro.

import type { SourceRoundPage, SourceStandingsPage } from "../../_shared/formulas/cupResults.ts";

/** Como o IIS do site: maiúsculas acentuadas e alguns sinais em &#NNN;, o
 *  resto em UTF-8; & < > " escapados. */
export function esc(s: string, entities = true): string {
  const base = String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return entities ? base.replace(/[À-ÝºªÃãç]/g, (c) => `&#${c.codePointAt(0)};`) : base;
}

const ROUND_HEAD: Record<string, string> = {
  pos: "Pos", bib: "Dorsal", name: "Nome", club: "Clube", category: "Escalão", nac: "Nac", time: "Marca",
};
const MISSING_KEY: Record<string, string> = {
  pos: "pos", dorsal: "bib", nome: "name", clube: "club", escalao: "category", marca: "time",
};

export interface RoundHtmlOptions {
  /** Ordem das colunas (chaves de ROUND_HEAD). Por omissão, a do site. */
  columns?: string[];
  /** Uma coluna a mais no fim ("Tempo Real"), que o parse ignora. */
  extraColumn?: boolean;
  /** false = texto em UTF-8, sem &#NNN;. */
  entities?: boolean;
}

function dmy(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "";
}

/** A página de erro do IIS (o site responde-a com 200). */
export function iisErrorHtml(): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"/>
<title>404 - File or directory not found.</title><style type="text/css">body{margin:0;}</style></head>
<body><div id="header"><h1>Server Error</h1></div><div id="content"><div class="content-container"><fieldset>
<h2>404 - File or directory not found.</h2><h3>The resource you are looking for might have been removed.</h3>
</fieldset></div></div></body></html>`;
}

function pageShell(title: string, body: string, entities: boolean): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>
\t${esc(title, entities)}
</title>
<link href="/Content/bootstrap.css" rel="stylesheet"/>
<style>.pagination { margin: 0px; }</style>
<script type="text/javascript">var t = "<table><tr><td>não é uma tabela</td></tr></table>";</script>
</head>
<body>
<form method="post" action="./x" id="ctl01">
<div class="aspNetHidden"><input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="/wEPDwUKLTk2&gt;" /></div>
<script src="/bundles/MsAjaxJs?v=x" type="text/javascript"></script>
<!-- <table><tr><td>comentário</td></tr></table> -->
<div id="wrapper">${body}
</div>
</form>
</body>
</html>`;
}

/** /Resultados/{id} a partir de uma SourceRoundPage (as colunas em
 *  `missingColumns` não se escrevem; errorPage → a página do IIS). */
export function renderRoundHtml(page: SourceRoundPage, opts: RoundHtmlOptions = {}): string {
  if (page.errorPage) return iisErrorHtml();
  const ent = opts.entities !== false;
  const order = opts.columns ?? ["pos", "bib", "name", "club", "category", "nac", "time"];
  let lastDistance: number | null = null;
  const blocks = page.tables.map((t, ti) => {
    const missing = new Set(t.missingColumns.map((c) => MISSING_KEY[c] ?? c));
    const cols = order.filter((c) => !missing.has(c));
    const head = cols.map((c) => `<th class="text-center" scope="col">${ROUND_HEAD[c]}</th>`).join("") +
      (opts.extraColumn ? `<th class="text-center" scope="col">Tempo Real</th>` : "");
    const rows = t.rows.map((r) => {
      const cells = cols.map((c) => {
        if (c === "nac") return `<td class="text-center"><img src="/img/pt.png" title="Portugal" alt="POR" /></td>`;
        if (c === "club") {
          // O nome do clube vai no atributo da imagem (não é texto) e a sigla no <span>.
          return `<td class="text-center"><img src="/logos/x.png" title="${esc(`Logo ${r.club}`, ent)}" alt="${esc(r.club, ent)}" data-bs-toggle="tooltip" /> <span>${esc(r.club, ent)}</span></td>`;
        }
        const v = (r as unknown as Record<string, string>)[c] ?? "";
        return c === "name" ? `<td>${esc(v, ent)}</td>` : `<td class="text-center">${esc(v, ent)}</td>`;
      }).join("") + (opts.extraColumn ? `<td class="text-center">00:00</td>` : "");
      return `<tr>${cells}</tr>`;
    }).join("\n");
    const g = t.gender === "M" ? "M (Masculino)" : t.gender === "F" ? "F (Feminino)" : "";
    const newDistance = t.distanceM != null && t.distanceM !== lastDistance;
    if (t.distanceM != null) lastDistance = t.distanceM;
    const accordion = newDistance
      ? `<div class="according-item mb-2"><h2 id="h_${ti}" class="accordion-header"><button class="accordion-button collapsed" type="button">
<h5 id="MainContent_nome_prova_${ti}" class="according-header text-center">${t.distanceM} metros - Series</h5></button></h2>`
      : "";
    return `${accordion}
<div class="accordion-body"><div class="container-fluid"><div class="row">
<div class="col-8 col-lg-4"><span id="nome_bloco_${ti}">1&#170; S&#233;rie ${g}</span></div>
<div class="col-6 col-lg-2 text-center"></div><div class="col-4 col-lg-1 text-end"><span data-bs-toggle="tooltip"></span></div>
</div></div>
<div class="table-responsive"><div>
<table class="table table-striped table-bordered table-hover">
<thead><tr>${head}</tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div></div>
<div class="modal fade" role="dialog"><div class="modal-body"><img class="mx-auto d-block" src="/img/p.jpg" /></div></div>
</div>`;
  }).join("\n");
  const body = `
<div id="MainContent_div_result" class="d-flex"><p id="MainContent_div_resultados" class="fs-1">RESULTADOS</p></div>
<div id="MainContent_div_evento" class="d-flex"><p id="MainContent_nome_evento" class="fs-1">${esc(page.raceName ?? "", ent)}</p></div>
<div id="MainContent_div_classificacoes"><a class="btn" href="javascript:__doPostBack('x','')"><span class="fa fa-clock"></span> CLASSIFICA&#199;&#195;O</a></div>
<div id="MainContent_div_dias"><ul class="pagination pull-right"><li><a class="btn" title="${dmy(page.date)}" href="javascript:__doPostBack('d','')"><span class="fas fa-calendar text-success"></span> ${dmy(page.date)}</a></li><li></li></ul></div>
<div><div class="card-body"><div class="accordion accordion-flush" id="accordionProvas">
${blocks}
</div></div></div>`;
  return pageShell(page.title, body, ent);
}

/** /Trofeu/{id} a partir de uma SourceStandingsPage. */
export function renderStandingsHtml(page: SourceStandingsPage, opts: { entities?: boolean } = {}): string {
  if (page.errorPage) return iisErrorHtml();
  const ent = opts.entities !== false;
  const tables = page.tables.map((t, ti) => {
    const missing = new Set(t.missingColumns);
    const pHead = missing.has("p") ? "" : Array.from({ length: t.pCount }, (_, k) => `<th scope="col">P${k + 1}</th>`).join("");
    const head = [
      missing.has("pos") ? "" : `<th scope="col">Pos</th>`,
      missing.has("nome") ? "" : `<th scope="col">Nome</th>`,
      missing.has("ano") ? "" : `<th scope="col">Ano</th>`,
      missing.has("equipa") ? "" : `<th scope="col">Equipa</th>`,
      pHead,
      missing.has("total") ? "" : `<th scope="col">Total</th>`,
    ].join("");
    const rows = t.rows.map((r) => {
      const cells = [
        missing.has("pos") ? "" : `<td>${esc(r.pos, ent)}</td>`,
        missing.has("nome") ? "" : `<td>${esc(r.name, ent)}</td>`,
        missing.has("ano") ? "" : `<td>${esc(r.year, ent)}</td>`,
        missing.has("equipa") ? "" : `<td>${esc(r.team, ent)}</td>`,
        missing.has("p") ? "" : r.points.map((p) => `<td>${esc(p, ent)}</td>`).join(""),
        missing.has("total") ? "" : `<td>${esc(r.total, ent)}</td>`,
      ].join("");
      return `<tr>${cells}</tr>`;
    }).join("\n");
    const g = t.gender === "M" ? " (Masculino)" : t.gender === "F" ? " (Feminino)" : "";
    return `<h2 id="MainContent_RepeaterClassificacao_flushheading_${ti}" class="accordion-header"><button class="accordion-button" type="button">
<h5 id="MainContent_RepeaterClassificacao_nome_escalao_${ti}" class="according-header text-center">${esc(t.category, ent)}${g}</h5>
</button></h2>
<div class="accordion-collapse show"><div class="accordion-body"><div id="grelha_${ti}"><input type="hidden" value="k${ti}" />
<div class="panel panel-primary"><div class="panel-heading text-right"></div><div class="panel-body"><div class="table-responsive"><div>
<table class="table table-striped table-bordered table-hover">
<thead><tr>${head}</tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div></div></div></div></div></div></div>`;
  }).join("\n");
  const legend = page.legend.length
    ? `<div class="d-flex m-3"><h5 id="MainContent_P1" class="fs-6">Legenda</h5></div>
<div class="d-flex m-3"><p id="MainContent_div_legenda" class="fs-6">${
      page.legend.map((l) => `P${l.k}: ${esc(l.name, ent)} (${l.dayMonth}), `).join("")
    }</p></div>`
    : "";
  const body = `
<img id="MainContent_imgFoto" class="img-responsive" src="/img/trofeu.jpg" />
<div id="MainContent_div_evento" class="d-flex"><p id="MainContent_div_subtitulo" class="fs-1">Classifica&#231;&#227;o Geral Individual - Equipas/individuais de Cascais</p></div>
<div id="MainContent_div_coletivo_filtro"><a id="MainContent_BotaoGeralColetiva_LinkButton_Gravar" class="btn" href="javascript:__doPostBack('c','')">COLETIVA</a></div>
<div id="MainContent_div_classificacao_individual"><div class="card-body"><div class="accordion accordion-flush" id="accordionProvas">
${tables}
</div></div></div>
${legend}`;
  return pageShell(page.title, body, ent);
}
