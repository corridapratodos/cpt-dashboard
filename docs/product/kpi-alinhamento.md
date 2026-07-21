# Alinhamento de KPIs do Painel

## Objetivo

Definir quais indicadores o CPT Dashboard deve mostrar, o que cada um significa e quais regras precisam ser explicitas para evitar leituras erradas.

## 1. O que o painel calcula hoje

### KPIs principais atuais

- `Sessoes`: quantidade de atividades no recorte ativo.
- `Distancia`: soma de `distanceKm` no recorte ativo.
- `Tempo ativo`: soma de `durationSec` no recorte ativo.
- `Pace medio`: soma do tempo confiavel dividida pela soma da distancia confiavel no recorte.
- `Velocidade media`: usada quando o filtro principal e ciclismo.
- `Peso corrida`: quando o filtro e `Tudo`, mostra o percentual de atividades do tipo `Run` dentro da selecao.
- `Maior sessao`: atividade com maior distancia no recorte.
- `Melhor pace medio`: menor pace medio entre atividades confiaveis do recorte.
- `Esporte dominante`: esporte com maior numero de sessoes no recorte `Tudo`.

### Blocos analiticos atuais

- `Volume mensal`: km por mes.
- `Evolucao recente`: ultimas 24 atividades com pace ou velocidade.
- `Comparativo 28 dias`: distancia, sessoes, tempo e pace da janela atual versus 28 dias anteriores.
- `Minutos ativos semanais`: tempo incluido por semana; e volume externo, nao carga fisiologica.
- `Leituras rapidas`: textos fixos de produto.
- `Ultimos treinos`: cards qualitativos com amostra recente.
- `Atividades recentes`: tabela detalhada paginada no cliente.

## 2. Onde o painel ainda esta desalinhado

### Mistura de metricas de treino com metricas de catalogo

Hoje `Sessoes`, `Distancia` e `Tempo` tratam qualquer atividade do recorte como equivalente. Isso funciona para volume bruto, mas confunde leitura de treino quando misturamos corrida, caminhada, treino funcional, bike e atividades com GPS ruim.

### Ambiguidade no KPI de desempenho

`Pace medio` e `Melhor pace` sao corretos para corrida, mas ficam pouco confiaveis para filtros mistos. No modo `Tudo`, trocar para `Peso corrida` evita parte do problema, mas ainda nao entrega um KPI de desempenho multiesporte realmente bom.

### Comparativos dependem da selecao atual

O comparativo de 28 dias hoje compara a janela ativa contra a anterior. Isso e bom, mas precisa ficar claro no produto que a leitura depende do filtro de esporte e ano.

### Carga semanal ainda e heuristica

Minutos ativos sao uteis para contexto de volume, mas nao representam TRIMP, TSS, intensidade ou recomendacao automatica de deload.

## 3. Estrutura recomendada de KPIs

### Camada A - Resumo executivo

Essa deve ser a primeira linha do painel.

- `Sessoes`
- `Distancia`
- `Tempo ativo`
- `Esporte dominante` ou `Pace medio` dependendo do foco
- `Maior sessao`
- `Melhor marca do recorte`

### Camada B - Volume e frequencia

Foco em carga externa.

- `Km por mes`
- `Sessoes por semana`
- `Tempo por semana`
- `Sequencia de semanas ativas`
- `Semanas dentro da faixa de carga`

### Camada C - Desempenho

Foco em qualidade do treino.

- `Pace medio` para corrida/caminhada/trilha
- `Velocidade media` para bike/virtual ride
- `Melhor pace do ano`
- `Melhor marca por distancia`
- `Tendencia recente de pace`

### Camada D - Comparativos

Foco em tomada de decisao.

- `28 dias vs 28 dias anteriores`
- `Ano atual vs ano anterior`
- `Mes atual vs mesmo mes do ano anterior`
- `Corrida vs caminhada` quando o usuario selecionar multiplos esportes

### Camada E - Saude da progressao

Foco em orientar o atleta.

- `Semanas sustentando a carga`
- `Subida brusca de volume`
- `Queda brusca de frequencia`
- `Observacao de volume versus referencia`
- `Retomada apos baixa carga`

## 4. Regras de produto que precisam ficar explicitas

### Corrida qualificada

A regra atual existe no backend e deve ser tratada como regra nossa, nao do Strava.

- `type = Run`
- `distancia >= 2 km`
- `duracao >= 20 min`
- `pace dentro da faixa sanitaria por modalidade (corrida de rua, trail, caminhada e hike possuem limites distintos)`

Uso recomendado:

- aplicar em metricas de "corridas validas"
- nao usar como filtro universal de toda a base
- deixar claro no texto do produto quando um KPI usa corrida qualificada em vez de todas as corridas

### Escopo por plano

- `free`: `Run` e `Walk` nos 2 anos correntes permitidos pelo backend
- `pro`: historico ampliado de endurance
- `master/admin`: acesso total

### Janela ativa

Toda leitura precisa deixar claro se esta usando:

- ano filtrado
- esporte filtrado
- historico completo
- periodo recente

## 5. Direcao recomendada para o painel

### Etapa 1 - alinhar leitura

- separar `metricas de volume` de `metricas de desempenho`
- renomear textos ambigueos
- mostrar claramente `base ativa` e `base total`
- tratar `carga` como heuristica

### Etapa 2 - liberar comparativos multiplos

- permitir multisselecao de anos
- permitir multisselecao de esportes
- comparar blocos agregados, nao atividade por atividade

### Etapa 3 - aprofundar corrida

- recordes por distancia
- melhores marcas do ano
- recortes `corridas validas` vs `todas as corridas`
- leitura de consistencia semanal e volume recente

## 6. Proposta de KPI por perfil

### Usuario free

- foco em corrida e caminhada de `2026`
- volume, frequencia, pace, comparativo 28 dias, carga recente

### Usuario pro

- historico multianual
- multiplos esportes de endurance
- comparativos por periodo
- recordes e melhores marcas

### Usuario master

- tudo do pro
- full sync
- leitura de governanca do dado
- visibilidade do escopo real salvo

## 7. Decisao sugerida para a proxima iteracao

Antes de adicionar novas features, alinhar o painel em cima de 5 perguntas:

1. O que queremos que o atleta entenda em 10 segundos?
2. O que e volume?
3. O que e desempenho?
4. O que e consistencia?
5. O que e dado bruto versus dado filtrado por regra nossa?

Se essas respostas estiverem claras, a evolucao de filtros, comparativos, recordes e IA fica muito mais coerente.


## Decisoes P0 - 2026-07-20

- Recordes por distancia usam apenas `best_efforts` do Strava e `elapsed_time`; atividades inteiras nao sao extrapoladas.
- Atividades ignoradas contribuem zero para KPIs, extremos, recordes, consistencia e minutos ativos.
- Agrupamento diario e anual usa `start_date_local`, com UTC apenas como fallback legado.
- Sem periodo anterior valido, o comparativo fica indisponivel em vez de exibir variacao artificial.
