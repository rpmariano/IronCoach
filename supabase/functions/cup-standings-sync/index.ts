// IronCoach · cup-standings-sync Edge Function — o job da classificação do
// Troféu (specs/trofeu.md §7; Fase 4). 2026-09-27.
//
// Lê a classificação oficial no site do organizador (só GET, pelo adaptador
// adapters/trofeuCascais.ts), valida-a com as invariantes de
// @formulas/cupResults.ts e, conforme o sync_mode da edição, observa
// (estado agregado para o admin) ou publica (a linha DE CADA INSCRITO, nunca
// dados de terceiros). O ensaio (admin) lê uma época inteira e devolve só
// números.
//
// INERTE ATÉ SER LIGADO: sem a M2 (20260928120000_cup_results.sql) o cron e
// o "Ler agora" não fazem nada (nem pedidos ao site); a 34.ª nasce com
// sync_mode 'desligado'; e o cron só se cria à mão depois da M2 (hora a hora
// aos :37, copiando o comando do compute-percentile-snapshots — o
// CRON_SECRET nunca entra no git; fase4-desenho.md H.6). verify_jwt = false
// no config.toml: o cron não tem JWT e o admin é verificado lá dentro
// (handler.ts).
//
// A EXCEÇÃO é o ensaio: só com o JWT de um admin (o cron nunca o corre — o
// pedido com x-cron-secret vai sempre para a volta normal), lê os links que
// ele cola e devolve só números. Corre SEM a M2, de propósito: não lê nem
// grava nada que um atleta leia (na BD, só 1 linha agregada em app_logs).
//
// Segredos: os que já existem (CRON_SECRET, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY); opcional
// CUP_SYNC_USER_AGENT.

import { makeHandler, realDeps } from "./handler.ts";

Deno.serve(makeHandler(realDeps()));
