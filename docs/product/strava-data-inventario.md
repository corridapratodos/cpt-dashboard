# Inventario de dados do Strava no CPT Dashboard

## Objetivo

Consolidar em um unico lugar:

- quais dados do Strava entram hoje na integracao
- quais dados derivados o dashboard calcula em cima deles
- o que aparece na interface por recorte
- quais feedbacks automaticos existem hoje
- quais lacunas impedem leituras mais profundas

Este documento fala da integracao atual do produto. Nao e um inventario completo de tudo o que a API do Strava poderia fornecer em teoria.

## 1. Fontes do Strava usadas hoje

Hoje o produto usa dois niveis da API do Strava:

### 1.1 Lista de atividades do atleta

Endpoint usado:

- `GET /api/v3/athlete/activities`

Campos que entram no mapeamento atual do produto:

- `id`
- `name`
- `start_date`
- `distance`
- `moving_time`
- `average_heartrate`
- `max_heartrate`
- `total_elevation_gain`
- `kudos_count`
- `type`

Campos derivados no mapeamento interno:

- `distanceKm`
- `durationSec`
- `paceSec`
- `syncedAt`

Observacao:

- `paceSec` e calculado localmente a partir de `moving_time / distancia`.
- O produto nao usa `elapsed_time` na atividade base, apenas no detalhe de splits e best efforts quando necessario.

### 1.2 Detalhe de atividade individual

Endpoint usado:

- `GET /api/v3/activities/{id}`

Esse endpoint e consultado hoje para enriquecer duas coisas:

- `splits_metric`
- `best_efforts`

#### Splits metricos usados hoje

De `splits_metric`, o produto aproveita:

- `distance`
- `elapsed_time`
- `moving_time`
- `elevation_difference`
- `average_heartrate`

Campos derivados por split:

- `index`
- `distanceKm`
- `elapsedSec`
- `movingSec`
- `paceSec`
- `elevationGain`
- `hrAvg`

#### Best efforts usados hoje

De `best_efforts`, o produto aproveita:

- `name`
- `distance`
- `elapsed_time`
- `moving_time`

Campos derivados por best effort:

- `name`
- `distanceKm`
- `elapsedSec`
- `movingSec`

Observacoes:

- Os best efforts sao filtrados para distancias de interesse do produto: `3`, `5`, `10`, `15`, `21.1` e `30 km`.
- O dashboard so tenta enriquecer best efforts de atividades elegiveis, priorizando corrida/endurance com volume minimo.

## 2. Dados persistidos hoje por atividade

A atividade salva hoje no Firestore carrega estes campos principais:

- `stravaId`
- `name`
- `date`
- `distanceKm`
- `durationSec`
- `paceSec`
- `hrAvg`
- `hrMax`
- `elevationGain`
- `kudos`
- `type`
- `syncedAt`
- `bestEfforts` quando houver

Campos de governanca/curadoria adicionados pelo produto:

- `excludedFromMetrics`
- `qualityFlags`
- `splits`
- `splitsFetchedAt`

Significado pratico:

- `excludedFromMetrics`: atividade fica visivel, mas deixa de entrar nas analises.
- `qualityFlags`: flags internas de leitura e controle do dado.
- `splits`: cache local do detalhe km a km consultado no Strava.
- `splitsFetchedAt`: marca quando o detalhe foi buscado.

## 3. Dados derivados que o dashboard calcula

O dashboard nao trabalha so com atividades isoladas. Ele tambem monta um cache anual agregado por dia e por esporte.

### 3.1 Estrutura anual agregada

Para cada ano, o produto guarda:

- `year`
- `activityCount`
- `sports`
- `totalsByType`
- `days`
- `updatedAt`
- `cacheVersion`

### 3.2 Estrutura por dia e esporte

Dentro de cada dia, por esporte, o produto calcula:

- `sessions`
- `excludedSessions`
- `distanceKm`
- `durationSec`
- `includedDistanceKm`
- `includedDurationSec`
- `reliablePaceCount`
- `reliablePaceSumSec`
- `maxDistanceActivity`
- `fastestPaceActivity`
- `fastestSpeedActivity`
- `recordCandidates`

### 3.3 Regras derivadas relevantes

#### Pace confiavel

Nem toda atividade com pace entra como base de desempenho. O produto aplica regras de confiabilidade por tipo.

Exemplos:

- corrida/endurance com pace muito fora da faixa nao entra como `reliable pace`
- caminhada e hike usam faixa diferente
- atividades ignoradas saem das metricas

#### Record candidates

O sistema monta candidatos a recorde para:

- `3 km`
- `5 km`
- `10 km`
- `15 km`
- `21.1 km`
- `30 km`

Fonte do recorde:

- `strava-best-effort` quando existe best effort oficial
- `estimated` quando a propria atividade inteira aproxima a distancia alvo

## 4. O que a interface mostra por recorte

A interface hoje trabalha com janela ativa. Essa janela pode ser:

- `year`
- `month`
- `week`
- `rolling28`

Quase toda a home e recalculada em cima da janela ativa e dos filtros de esporte/ano.

### 4.1 Resumo executivo

Mostra no recorte ativo:

- `Sessoes ativas`
- `Distancia`
- `Tempo ativo`
- `Pace medio`, `Velocidade media` ou `Peso da corrida` dependendo do foco
- `Maior sessao`
- `Melhor pace`, `Pico de velocidade` ou `Esporte dominante`

### 4.2 Rotina e consistencia

Mostra no recorte ativo:

- `Dias ativos por semana`
- `Sequencia atual`
- `Maior sequencia`
- `Semanas firmes`

Esses dados sao derivados dos dias com atividade dentro da janela.

### 4.3 Volume e desempenho

Mostra no recorte ativo:

- serie de volume por mes ou por dia, dependendo da janela
- linha de evolucao recente com pace ou velocidade
- comparativo contra periodo anterior equivalente
- carga semanal heuristica das ultimas 8 semanas

### 4.4 Leitura comparativa e radar

Mostra no recorte ativo:

- densidade do periodo
- sessao media
- peso do longao
- sessoes por semana ativa
- ranking do mes/semana no historico filtrado
- media comparavel de janelas equivalentes
- melhor janela e janela atual
- dia mais forte
- maior pausa do recorte
- dia dominante da semana
- participacao de fim de semana

### 4.5 Historico navegavel

A tabela de atividades mostra por item:

- `Data`
- `Tipo`
- `Sessao`
- `Distancia`
- `Tempo`
- `Ritmo/Vel.`
- `FC media`
- `Altimetria`
- status de `Ignorada` quando a atividade sai das analises

### 4.6 Detalhe da atividade

No detalhe individual da atividade, hoje aparecem:

- data
- tipo
- distancia
- tempo
- pace ou velocidade
- elevacao
- FC media
- FC maxima
- kudos
- Strava ID
- status de analise

Se a conta tiver acesso a splits detalhados, tambem aparecem:

- km a km
- tempo por split
- pace por split
- FC por split
- elevacao por split

## 5. Feedbacks e informacoes automaticas que o produto gera

Hoje o dashboard ja devolve leitura, nao apenas dado cru.

### 5.1 Feedback de rotina

Origem:

- `routineConsistency`

Entrega:

- status da rotina (`alto`, `equilibrado`, `baixo`)
- titulo automatico
- texto curto sobre frequencia, semanas firmes e sequencia atual

### 5.2 Feedback comparativo do recorte

Origem:

- `buildAnalysisInsights(...)`

Leituras produzidas hoje:

- volume acima, abaixo ou perto do bloco anterior
- desempenho ganhou, perdeu ou manteve eficiencia
- posicao do mes/semana no historico filtrado
- ritmo acima, abaixo ou em linha com a media comparavel
- densidade do recorte
- consistencia recente da carga

### 5.3 Feedback de carga semanal

Origem:

- `loadInsight`

Entrega:

- semanas sustentando a faixa de carga
- recomendacao curta sobre deload, manutencao ou baixa carga
- semana atual versus referencia recente

Importante:

- essa carga e heuristica, nao TRIMP nem TSS.

### 5.4 Feedback intra-treino por splits

Origem:

- `buildActivityInterpretation(...)`

So aparece quando ha splits suficientes e o esporte e compativel.

Leituras produzidas hoje:

- `Treino que ganhou ritmo`
- `Treino que perdeu sustentacao`
- `Treino bem redondo`
- `Treino com oscilacao moderada`

Sinais usados:

- progressao entre metades do bloco principal
- dispersao de pace entre parciais
- deteccao de aquecimento/entrada em ritmo
- deteccao de desaquecimento ou sobra final
- sinal simples de FC ao longo do bloco

### 5.5 Leitura com IA

Origem:

- payload estruturado do proprio dashboard enviado ao Gemini

Entradas que a IA recebe hoje:

- nome do atleta
- esporte em foco
- ano e janela ativa
- stats do recorte
- consistencia da rotina
- comparativo de periodo
- contexto do periodo
- radar do periodo
- insights automaticos ja calculados
- atividades recentes

Saida esperada hoje:

- `title`
- `summary`
- `bullets`
- `caution`

Observacao:

- hoje a IA nao consulta Strava diretamente; ela le o resumo estruturado produzido pelo dashboard.

## 6. Dados do Strava que o produto nao explora hoje

Pelo codigo atual, estes dados nao fazem parte da camada principal do produto hoje:

- zonas de FC
- zonas de pace
- cadence
- power
- temperatura
- calorias
- mapa/track
- device info
- suffer score / training load oficial
- lap data fora de `splits_metric`
- dados de segmentos como camada analitica do dashboard

Isso significa que varias leituras mais sofisticadas ainda nao sao sustentadas pelo dado salvo hoje.

Exemplos do que falta para subir o nivel das analises:

- classificar tipo de treino com confianca
- comparar esforco relativo entre atletas
- detectar drift cardiaco com mais robustez
- falar de zona, limiar ou intensidade real
- montar leitura de bloco por distribuicao de intensidade

## 7. Leituras que dependem de recorte e podem confundir

Alguns indicadores estao corretos tecnicamente, mas a interpretacao humana pode ficar ruim sem contexto.

Exemplos:

- `Maior pausa do recorte`: pode vir do ano inteiro, nao da fase atual
- `Melhor pace`: pode ser atividade isolada, nao tendencia
- `Carga semanal`: serve como sinal heuristico, nao como ciencia de treino
- `Peso da corrida`: util para recorte misto, mas nao substitui desempenho

## 8. Resumo executivo para evolucao de produto

### O que temos forte hoje

- boa base de volume e frequencia
- comparativos por janela ja uteis
- recordes por distancia com best effort oficial quando existe
- detalhe de atividade com splits e leitura intra-treino
- camada inicial de IA em cima de JSON curado

### O que ainda esta raso

- intensidade real
- contexto fisiologico
- classificacao automatica de tipo de treino
- leitura por zonas
- comparacao de esforco entre sessoes parecidas

### Onde vale investir primeiro

1. deixar explicito na UI o que e dado do Strava e o que e leitura derivada nossa
2. separar melhor `volume`, `desempenho`, `consistencia` e `qualidade do treino`
3. criar indicadores de pausa recente, nao so pausa maxima do recorte
4. enriquecer o detalhe do treino com mais sinais deterministas antes de depender de IA
5. estruturar um arsenal de prompts por intencao em cima do JSON do dashboard

## 9. Decisao pratica

Antes de ampliar a camada de IA, vale responder para cada leitura:

- qual dado bruto do Strava sustenta isso
- qual regra nossa transforma esse dado em insight
- em qual recorte isso faz sentido
- o usuario entende se isso fala do ano, do mes, da semana ou do treino

Se isso estiver claro, a evolucao do dashboard fica muito mais consistente.
