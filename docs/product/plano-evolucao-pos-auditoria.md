# Plano de evolucao pos-auditoria do CPT Dashboard

## 1. Objetivo

Transformar os achados da auditoria tecnica e de produto em um plano executavel para elevar o CPT Dashboard de MVP avancado para uma beta controlada, com foco em:

- confiabilidade das metricas
- integridade da sincronizacao com o Strava
- seguranca e privacidade
- previsibilidade de custo e operacao
- testes comportamentais
- manutencao incremental da arquitetura existente

Este plano nao propoe reescrita total. A estrategia e corrigir primeiro a confianca do dado, depois endurecer operacao e arquitetura, e somente entao ampliar produto e IA.

## 2. Resultado esperado

Ao final dos tres horizontes, a equipe deve conseguir afirmar que:

1. Uma atividade ignorada nao influencia nenhuma metrica.
2. Dias, semanas e meses refletem a data local do atleta.
3. Recordes oficiais nao se confundem com estimativas.
4. Consistencia inclui periodos sem treino e sequencia atual significa realmente atual.
5. Alteracoes e exclusoes no Strava convergem para a base do CPT.
6. Sync concorrente e eventos repetidos nao corrompem nem multiplicam trabalho.
7. Tokens OAuth nunca ficam em texto puro em producao nem chegam ao JavaScript do navegador.
8. Dados de saude e IA possuem consentimento e transparencia compativeis com seu uso.
9. O quality gate testa comportamento, nao apenas presenca de codigo.
10. A equipe consegue medir falhas, latencia, custo e frescor dos caches.

## 3. Principios de execucao

### 3.1 Prioridade de produto

A ordem de prioridade e:

1. Corrigir numeros incorretos.
2. Evitar perda, permanencia indevida ou divergencia de dados.
3. Reduzir risco de seguranca e privacidade.
4. Melhorar operacao e custo.
5. Refinar UX.
6. Adicionar novas funcionalidades.

### 3.2 Regras para mudancas analiticas

Toda mudanca de metrica deve incluir:

- definicao funcional em `docs/product`
- fixture representativa
- teste unitario
- versao nova do cache quando o schema ou a semantica mudar
- texto de interface compativel com a precisao do calculo
- plano para recomputar anos ja armazenados

### 3.3 Regras para alteracoes de persistencia

- Nao apagar dados antigos sem definir recuperacao ou reconciliacao.
- Fazer migracoes idempotentes.
- Preservar compatibilidade de leitura durante rollout quando possivel.
- Registrar versao de schema/cache e data da migracao.
- Testar downgrade, upgrade de plano e usuario com dados legados.

## 4. Sequencia recomendada

```text
Confianca das metricas
        |
        v
Testes comportamentais -----> Seguranca e privacidade
        |                              |
        v                              v
Integridade Strava ----------> Operacao assincrona
        |                              |
        +--------------+---------------+
                       v
             Refatoracao incremental
                       |
                       v
             Novos recursos de produto
```

## 5. Matriz de prioridade

| Prioridade | Significado | Regra de liberacao |
|---|---|---|
| `P0` | Pode comprometer confianca, privacidade ou integridade | Corrigir antes de ampliar a beta |
| `P1` | Limita escala, operacao ou manutencao | Corrigir antes de aquisicao aberta |
| `P2` | Melhora clareza, eficiencia ou diferenciacao | Executar depois da base estabilizada |

## 6. Horizonte 1 - 1 a 2 semanas

### Epic P0-A - Atividades ignoradas deixam de contaminar analytics

**Objetivo:** garantir que `excludedFromMetrics=true` retire a atividade de todas as analises sem remove-la do historico.

**Arquivos principais:**

- `dash/lib/activity-analytics.ts`
- `dash/lib/analytics-types.ts`
- `dash/components/dashboard/analytics.ts`
- `dash/lib/activity-cache.ts`
- `dash/app/api/activities/[stravaId]/route.ts`

**Tarefas:**

1. Adicionar `includedSessions` a `AnalyticsDaySport`.
2. Incrementar `includedSessions` somente para atividades ativas.
3. Atualizar `maxDistanceActivity`, `fastestPaceActivity`, `fastestSpeedActivity` e `recordCandidates` somente para atividades ativas.
4. Fazer `groupTotals()` somar sessoes incluidas, nao `day.sessions` bruto.
5. Corrigir `periodRadar`, esporte dominante, participacao de fim de semana e demais consumidores de sessoes.
6. Incrementar `ANALYTICS_CACHE_VERSION`.
7. Recalcular o ano ao alternar a exclusao.

**Criterios de aceite:**

- Uma atividade ignorada continua aparecendo no historico com badge apropriado.
- Ela contribui zero para sessoes, distancia, tempo, pace, carga, consistencia, recordes, maior sessao e radar.
- Em um dia com uma atividade ativa e uma ignorada, o dia continua ativo com uma sessao.
- Em um dia apenas com atividades ignoradas, o dia nao entra na analise.
- Reativar a atividade restaura todas as contribuicoes depois do rebuild.

**Testes obrigatorios:**

- atividade ativa + ignorada no mesmo dia
- dia totalmente ignorado
- atividade ignorada que seria a maior distancia
- bike ignorada que seria o pico de velocidade
- corrida ignorada contendo best effort

### Epic P0-B - Data local como base de calendario

**Objetivo:** impedir que atividades noturnas caiam no dia, semana ou mes errado.

**Arquivos principais:**

- `dash/lib/strava.ts`
- `dash/lib/activity-cache.ts`
- `dash/lib/activity-analytics.ts`
- `dash/lib/dashboard.ts`
- filtros e formatadores em `dash/components/dashboard`

**Decisao de schema proposta:**

```ts
{
  date: Date,              // instante UTC para ordenacao
  localDate: 'YYYY-MM-DD', // calendario do atleta
  startDateLocal: string,
  timezone: string | null
}
```

**Tarefas:**

1. Mapear `start_date_local` e `timezone` do Strava.
2. Derivar `localDate` de forma deterministica.
3. Usar `localDate` para agrupamento diario, mensal e semanal.
4. Manter `date` UTC para ordenacao, cursor e auditoria.
5. Preparar fallback documentado para atividades antigas sem data local.
6. Criar backfill idempotente durante full sync ou job administrativo.
7. Alinhar datas de saude e atividade na mesma semantica local.
8. Incrementar versoes de cache afetadas.

**Criterios de aceite:**

- Uma corrida as 22h em Sao Paulo aparece no dia local correto.
- Virada de mes e ano usa data local para KPI e filtro.
- Ordenacao cronologica continua usando o instante real.
- Atividades legadas continuam visiveis durante a migracao.
- O plano por ano segue a regra de produto documentada para ano local.

### Epic P0-C - Recordes e best efforts confiaveis

**Objetivo:** separar marca oficial, melhor atividade e projecao.

**Arquivos principais:**

- `dash/lib/strava.ts`
- `dash/lib/activity-analytics.ts`
- `dash/lib/analytics-types.ts`
- `dash/components/dashboard/DashboardInterpretationSection.tsx`

**Tarefas:**

1. Usar `elapsedSec` como tempo oficial do best effort.
2. Preservar `movingSec` apenas como informacao secundaria.
3. Mapear best efforts por distancia canonica/nome conhecido, reduzindo dependencia de tolerancias largas.
4. Remover atividades inteiras estimadas do bloco chamado `Recordes`.
5. Se a projecao for mantida, criar bloco distinto chamado `Projecoes`.
6. Nunca projetar marca para distancia maior que a efetivamente completada.
7. Exibir fonte, data e atividade em toda marca.
8. Impedir atividade ignorada ou com flag critica de qualidade de gerar marca.

**Criterios de aceite:**

- `Recordes` contem somente best efforts oficiais.
- O tempo exibido corresponde ao elapsed time persistido.
- Atividade de 4,65 km nao gera recorde de 5 km.
- A ausencia de best effort exibe estado vazio honesto, nao recorde aproximado.
- Uma projecao, se existir, nunca e apresentada como fato historico.

### Epic P0-D - Pace medio, melhor pace e qualidade do dado

**Objetivo:** tornar nomes e calculos defensaveis para o atleta.

**Tarefas:**

1. Separar `sanidade tecnica` de `corrida qualificada CPT`.
2. Definir limites tecnicos amplos e diferentes para `Run`, `VirtualRun`, `TrailRun`, `Walk` e `Hike`.
3. Nao excluir automaticamente corrida real apenas por ser mais rapida que 4:30/km.
4. Adicionar ao agregado `reliableDistanceKm` e `reliableDurationSec`.
5. Calcular `Pace medio do periodo` como tempo confiavel dividido por distancia confiavel.
6. Se a media simples continuar disponivel, nomear `Pace medio por sessao`.
7. Renomear `Melhor pace` para `Melhor pace medio de atividade`.
8. Nao mostrar pace combinado para selecao multiesporte.
9. Documentar claramente a regra de corrida qualificada e onde ela e usada.

**Criterios de aceite:**

- Uma corrida valida a 4:00/km entra nas analises.
- TrailRun lenta nao e descartada pela regra de corrida de rua.
- O KPI de pace agregado pode ser reproduzido por `tempo/distancia`.
- Filtro misto nao mostra comparacao de pace sem contexto.
- Todos os labels indicam exatamente a grandeza calculada.

### Epic P0-E - Consistencia e carga sem falsas conclusoes

**Objetivo:** corrigir denominadores e reduzir linguagem prescritiva.

**Arquivos principais:**

- `dash/components/dashboard/analytics.ts`
- `dash/components/dashboard/insights.ts`
- `dash/components/dashboard/DashboardExecutiveSection.tsx`
- `dash/components/dashboard/DashboardAnalysisSection.tsx`

**Tarefas:**

1. Gerar calendario continuo da janela, incluindo semanas sem atividade.
2. Fazer `trackedWeeks` representar semanas do calendario, nao apenas semanas ativas.
3. Zerar `currentStreakDays` quando a ultima atividade nao encostar no fim relevante da janela.
4. Marcar semana atual como parcial.
5. Excluir semana parcial da comparacao ou normalizar pelo numero de dias decorridos.
6. Renomear `Carga semanal` para `Indice de volume ajustado` enquanto nao houver carga fisiologica.
7. Separar series por esporte.
8. Remover recomendacao automatica de deload da heuristica atual.
9. Trocar por observacoes como `volume acima da referencia recente`.

**Criterios de aceite:**

- Quatro semanas, sendo duas vazias, produzem `trackedWeeks=4`.
- Atleta parado ha dez dias nao aparece com sequencia atual positiva.
- Segunda-feira nao gera alerta de queda por comparacao com semanas completas.
- Ciclismo nao usa fator de pace de corrida.
- A interface nao prescreve deload sem dados suficientes.

### Epic P0-F - Testes comportamentais no quality gate

**Objetivo:** fazer o CI detectar regressao de regra de negocio.

**Tarefas:**

1. Criar suite `test:domain` para analytics puros.
2. Criar fixtures pequenas e legiveis por cenario.
3. Adicionar testes de escopo `free`, `pro`, `admin` e `master`.
4. Adicionar testes de rota com Firestore e Strava simulados.
5. Manter smoke regex apenas como verificacao secundaria.
6. Incluir `test:domain` e testes de rota no comando `npm run check`.
7. Adicionar cobertura minima inicialmente focada nos modulos de dominio, sem impor percentual global artificial.

**Criterios de aceite:**

- Cada bug P0 de metrica possui teste que falha na implementacao antiga.
- CI falha quando uma atividade ignorada volta a contaminar analytics.
- CI falha quando moving time volta a ser usado como recorde oficial.
- CI testa resultados numericos, nao somente regex de arquivos.

### Epic P0-G - Tokens, sessao e configuracao segura

**Objetivo:** reduzir o impacto de vazamento de banco ou XSS.

**Arquivos principais:**

- `dash/lib/auth.ts`
- `dash/lib/oauth-tokens.ts`
- `dash/scripts/check-env.mjs`
- rotas que hoje usam `session.accessToken`

**Tarefas:**

1. Tornar `OAUTH_TOKEN_ENCRYPTION_KEY` obrigatoria em producao.
2. Criar migracao dos documentos antigos em plaintext.
3. Remover `accessToken` da sessao exposta ao cliente.
4. Obter token somente em rotas server-side, via JWT server-side ou armazenamento criptografado.
5. Planejar rotacao da chave com versao de envelope.
6. Falhar o deploy de producao quando a criptografia estiver ausente.
7. Confirmar que logs nunca incluem token, URL completa com token ou payload sensivel.

**Criterios de aceite:**

- `/api/auth/session` nao devolve bearer token do Strava.
- Novos logins nao criam `accessToken` ou `refreshToken` plaintext no Firestore.
- Documentos antigos sao migrados sem interromper webhook e refresh.
- Ambiente de producao sem chave falha antes do deploy.

### Epic P0-H - Privacidade, saude e IA

**Objetivo:** alinhar o consentimento com o processamento real.

**Tarefas de produto/juridico:**

1. Atualizar politica para incluir Garmin, sono, peso, composicao corporal e Gemini.
2. Informar finalidade, categorias, retencao, exclusao, subprocessadores e contato.
3. Definir se dados de saude terao consentimento separado.
4. Definir prazo de retencao de tokens, atividades, caches e claims de convite.
5. Definir fluxo de exportacao e revogacao.
6. Incrementar `LEGAL_VERSION` e exigir novo aceite.

**Tarefas de engenharia para IA:**

1. Validar schema e tamanho do payload.
2. Limitar textos, arrays e numero de atividades.
3. Aplicar quota/rate limit por usuario.
4. Nao devolver mensagem interna do provedor ao cliente.
5. Registrar somente metadados operacionais, evitando payload esportivo completo em logs.
6. Mostrar na UI exatamente qual recorte sera enviado.

**Criterios de aceite:**

- O usuario le sobre Garmin e Gemini antes do aceite.
- O endpoint rejeita payload fora do schema e acima do limite.
- A quota impede chamadas repetidas sem controle.
- A exclusao da conta cobre atividades, saude, tokens e caches.

## 7. Horizonte 2 - 1 a 2 meses

### Epic P1-A - Webhook completo e reconciliacao com o Strava

**Objetivo:** fazer a copia local convergir para o estado atual do Strava.

**Tarefas:**

1. Confirmar o contrato atual de eventos do Strava antes da implementacao.
2. Processar `create`, `update` e `delete` de atividade.
3. Em `update`, buscar novamente a atividade e identificar ano antigo e novo.
4. Em `delete`, carregar o documento local antes de apagar para descobrir o ano afetado.
5. Recalcular caches de todos os anos tocados.
6. Tratar desautorizacao removendo tokens e impedindo novos fetches.
7. Adicionar idempotencia por evento e atividade.
8. Implementar reconciliacao no full sync:
   - IDs vindos do Strava
   - IDs locais dentro do mesmo escopo
   - IDs locais ausentes viram tombstone ou sao removidos conforme politica
9. Nao remover silenciosamente dados fora do escopo atual sem decisao de retencao/downgrade.

**Criterios de aceite:**

- Editar nome/tipo no Strava atualiza o CPT.
- Excluir atividade no Strava remove ou marca o registro local conforme politica.
- Evento repetido produz o mesmo estado final.
- Full sync detecta divergencias antigas.

### Epic P1-B - Sync idempotente, transacional e assincrono

**Objetivo:** evitar corrida de requests, timeout e amplificacao de custo.

**Tarefas:**

1. Substituir o lock read/write por lease adquirido em transacao.
2. Adicionar `jobId`, `ownerId`, modo, status, tentativas e timestamps.
3. Responder ao webhook rapidamente depois de validar e enfileirar.
4. Escolher mecanismo de job compativel com a infraestrutura de deploy.
5. Implementar retry com backoff para 429 e erros transitorios.
6. Respeitar headers de rate limit do Strava.
7. Separar falha de enriquecimento de falha do sync principal.
8. Expor status ao frontend por polling leve.
9. Tornar o job retomavel depois de timeout.

**Criterios de aceite:**

- Duas requisicoes simultaneas criam no maximo um job ativo por atleta/modo.
- Reexecutar o mesmo job nao duplica atividades nem contadores.
- Falha depois de parte do processamento pode ser retomada.
- Webhook responde dentro do limite operacional definido.

### Epic P1-C - Atualizacao incremental dos agregados

**Objetivo:** reduzir rebuild completo do ano a cada atividade.

**Tarefas:**

1. Isolar uma funcao pura `applyActivityMutation(previous, next)`.
2. Calcular delta por dia/esporte para create/update/delete/exclusao.
3. Manter rebuild anual como mecanismo de reparo.
4. Executar verificacao periodica entre cache e fonte.
5. Registrar checksum/contagem por ano para detectar drift.
6. Medir leituras e escritas antes e depois.

**Criterios de aceite:**

- Nova atividade atualiza somente documentos necessarios.
- Rebuild completo reproduz exatamente o estado incremental.
- Divergencia pode ser detectada e reparada.

### Epic P1-D - Refatoracao incremental do dominio

**Objetivo:** reduzir acoplamento sem alterar comportamento de uma vez.

**Estrutura sugerida:**

```text
dash/lib/domain/
  activity.ts
  calendar.ts
  consistency.ts
  load.ts
  performance.ts
  records.ts
  types.ts
```

**Tarefas:**

1. Mover `Activity`, `ActivitySplit` e contratos comuns para `lib/domain/types.ts`.
2. Remover imports de `components` a partir de `lib`.
3. Extrair funcoes puras de `components/dashboard/analytics.ts` por dominio.
4. Manter no componente somente view models, textos e formatos.
5. Centralizar tolerancias, tipos de esporte e regras de pace.
6. Centralizar o fluxo persistencia -> cache -> meta em um servico.
7. Remover constantes/funcoes mortas depois de confirmar uso.

**Criterios de aceite:**

- `dash/lib` nao depende de `dash/components`.
- Cada modulo de dominio possui testes proprios.
- Rotas nao repetem manualmente o protocolo de invalidacao.
- Refatoracao nao muda resultados sem ticket de produto associado.

### Epic P1-E - Observabilidade e runbooks

**Objetivo:** diagnosticar producao sem depender de relato visual do usuario.

**Eventos minimos:**

- inicio/fim/falha de sync
- modo, quantidade recebida/processada/nova
- latencia e status de chamadas Strava
- rate limit restante
- rebuild ou delta de cache
- versao e idade do cache
- falha de decrypt/refresh OAuth
- webhook recebido, duplicado, processado ou ignorado
- chamadas, latencia e erros da IA sem registrar o payload completo

**Tarefas:**

1. Padronizar logs estruturados com correlation ID.
2. Adotar error tracking e alertas para falhas criticas.
3. Criar painel operacional simples.
4. Criar runbooks para:
   - token Strava expirado
   - webhook sem eventos
   - cache divergente
   - quota Firestore
   - rate limit Strava
   - falha de chave OAuth
5. Atualizar `SETUP.md` com todas as variaveis e callback real.

**Criterios de aceite:**

- Uma falha de sync pode ser rastreada por usuario e job sem expor segredo.
- A equipe recebe alerta quando webhook para de processar.
- O runbook permite reparar cache por ano.

### Epic P1-F - UX de confianca e acessibilidade

**Tarefas:**

1. Trocar `historico completo` por `todo o historico disponivel no plano` quando aplicavel.
2. Mostrar base ativa, total sincronizado e quantidade ignorada.
3. Exibir periodos vazios no seletor.
4. Indicar semana parcial e falta de base comparavel.
5. Quando o periodo anterior for zero, mostrar `sem base anterior`, nao `+100%`.
6. Desacoplar `Ultimos treinos` da pagina atual do historico.
7. Tornar modal acessivel por teclado e leitor de tela.
8. Adicionar fallback textual aos graficos principais.
9. Reduzir textos internos de operador na experiencia do atleta.

**Criterios de aceite:**

- Paginar o historico nao muda o bloco `Ultimos treinos` nem o payload da IA.
- Usuario entende quando uma comparacao nao tem base.
- Fluxos principais funcionam apenas com teclado.

## 8. Horizonte 3 - 3 a 6 meses

### Epic P2-A - Entitlements e governanca de planos

1. Persistir entitlement com origem, inicio, fim e historico de mudancas.
2. Retirar listas de IDs como mecanismo principal de promocao.
3. Definir matriz unica de anos, esportes, splits, IA e saude.
4. Corrigir a contradicao sobre ciclismo no Pro.
5. Testar upgrade e downgrade com dados preexistentes.
6. Exibir no produto qual dado fica oculto, retido ou removido apos downgrade.

### Epic P2-B - Dados de saude com governanca

1. Validar CSV com parser adequado a campos quoted e formatos regionais.
2. Diferenciar media por sete dias de media por sete registros.
3. Usar media movel trailing, sem valores futuros.
4. Permitir exclusao e exportacao especifica de saude.
5. Separar permissao de saude de role administrativa.
6. So correlacionar sono/peso com treino quando houver cobertura minima e linguagem nao causal.

### Epic P2-C - Desempenho e zonas mais robustos

1. Permitir escolher performance de referencia.
2. Exigir fonte oficial e recente para VDOT.
3. Mostrar validade, data e confianca da estimativa.
4. Validar faixas contra metodologia escolhida e documentada.
5. Separar estimativa de prescricao.
6. Nao calcular VDOT a partir de projecao aproximada.

### Epic P2-D - IA baseada em sinais validados

1. Enviar somente metricas com contrato e versao.
2. Incluir provenance de cada numero.
3. Impedir linguagem medica ou prescritiva.
4. Guardar somente metadados da leitura, salvo consentimento para historico.
5. Criar avaliacao com casos dourados para hallucination e exagero.
6. Medir utilidade antes de ampliar modelos ou prompts.

## 9. Plano de testes

### 9.1 Piramide recomendada

| Camada | Objetivo | Exemplos |
|---|---|---|
| Unitario de dominio | Validar calculos deterministas | pace, records, consistencia, calendario, carga |
| Integracao de persistencia | Validar mutacao e cache | create/update/delete/exclusao/rebuild |
| Contrato de API | Validar auth, escopo e payload | free/pro, schema invalido, paginacao |
| E2E curto | Validar fluxos criticos | login simulado, filtros, detalhe, exclusao |
| Smoke estatico | Detectar remocoes acidentais | manter os checks atuais como apoio |

### 9.2 Fixtures minimas

- corrida noturna em Sao Paulo na virada do mes
- corrida a 4:00/km
- TrailRun a 11:00/km
- dia com atividade ativa e ignorada
- quatro semanas com duas vazias
- semana atual com apenas um dia decorrido
- best effort com moving e elapsed diferentes
- atividade de 4,65 km sem best effort
- atividade alterada de ano por correcao de data
- downgrade Pro -> Free com atividade fora do escopo
- webhook repetido
- atividade excluida no Strava

## 10. Estrategia de rollout

### Etapa 1 - Shadow calculation

- Calcular metricas novas em paralelo sem trocar a UI.
- Comparar resultados antigos e novos para usuarios internos.
- Registrar divergencias esperadas por regra.

### Etapa 2 - Rebuild controlado

- Incrementar versoes de cache.
- Recalcular primeiro conta master/admin.
- Validar contagens, anos e recordes.
- Expandir para pequenos lotes.

### Etapa 3 - Feature flag

- Liberar novos calculos para equipe e atletas piloto.
- Manter rollback para a leitura anterior por curto periodo.
- Nao manter dois modelos indefinidamente.

### Etapa 4 - Migracao completa

- Recalcular todos os anos elegiveis.
- Remover fallback antigo depois de confirmada a cobertura.
- Atualizar documentacao e textos da UI no mesmo deploy funcional.

## 11. Metricas de sucesso

### Qualidade do dado

- zero divergencia conhecida causada por atividade ignorada
- percentual de atividades com `localDate` e timezone
- cobertura de best efforts oficiais por distancia
- numero de reconciliacoes create/update/delete bem-sucedidas
- divergencia entre rebuild completo e agregado incremental

### Operacao

- taxa de sucesso de sync
- p50/p95 de duracao do sync
- eventos de webhook processados dentro do SLA
- numero de jobs duplicados evitados
- chamadas Strava por atividade nova
- leituras/escritas Firestore por sync
- idade media do cache servido

### Produto

- usuarios que alternam janela ou esporte
- abertura de detalhe e splits
- uso de exclusao manual
- retorno semanal ao dashboard
- taxa de geracao da leitura IA e feedback de utilidade
- percentual de usuarios que entendem fonte e janela da metrica em teste qualitativo

## 12. Divisao sugerida de responsabilidade

| Frente | Responsavel sugerido | Apoio necessario |
|---|---|---|
| Definicao de KPI e nomenclatura | Produto | Engenharia e especialista de treino |
| Analytics e caches | Backend/domain | Frontend para view models |
| Strava, webhook e jobs | Backend/plataforma | Observabilidade |
| Tokens e privacidade tecnica | Backend/security | Produto/juridico |
| Consentimento e politica | Produto/juridico | Engenharia |
| UX e acessibilidade | Frontend/design | Produto |
| Testes de dominio | Engenharia | Produto para fixtures esperadas |

## 13. Definition of Done para tickets deste plano

Um ticket so deve ser considerado concluido quando:

- implementacao esta revisada
- regra esta documentada
- teste comportamental cobre o caso principal e limites
- cache/schema foi versionado quando necessario
- impacto em free/pro/admin/master foi verificado
- logs nao expõem dados sensiveis
- rollout e rollback foram considerados
- textos da UI correspondem ao calculo real
- validacao local apropriada passou
- o diario tecnico da sessao foi atualizado quando a mudanca for relevante

## 14. Backlog explicitamente adiado

Nao iniciar antes dos P0 e P1 essenciais:

- coach de IA mais autonomo
- prescricao automatica de deload
- TSS/TRIMP sem dados suficientes
- periodizacao automatica
- comparacao social ou ranking de atletas
- painel de treinador multiatleta
- expansao ampla para novos esportes
- reescrita do frontend ou troca de banco sem evidencia de necessidade

## 15. Primeira reuniao de kickoff

Agenda sugerida de 60 minutos:

1. Confirmar os P0 como bloqueadores de escala.
2. Aprovar definicoes de pace, recorde, consistencia e carga.
3. Escolher responsaveis pelos Epics P0-A a P0-H.
4. Definir fixtures com resultados esperados.
5. Definir estrategia de migracao de `localDate` e cache versionado.
6. Confirmar politica de dados apos exclusao, revogacao e downgrade.
7. Definir data de revisao ao fim da primeira semana.

## 16. Ordem pratica para os primeiros tickets

1. Criar suite de testes de dominio e fixtures.
2. Corrigir atividade ignorada.
3. Corrigir recordes e elapsed time.
4. Corrigir regras de pace e nomenclatura.
5. Corrigir consistencia/carga.
6. Introduzir `localDate` com compatibilidade de leitura.
7. Tornar criptografia obrigatoria e remover token da sessao client-side.
8. Atualizar privacidade, consentimento e setup.
9. Implementar webhook update/delete.
10. Adquirir lock transacional e desenhar job assincrono.

Essa ordem reduz rapidamente o risco para o usuario e cria uma rede de testes antes das mudancas mais estruturais.
