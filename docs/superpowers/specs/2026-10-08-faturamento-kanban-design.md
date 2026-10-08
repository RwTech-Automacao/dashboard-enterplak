# Faturamento e Vendas do dashboard vindos do Kanban PRO

**Data:** 2026-10-08 · **Status:** aprovado no brainstorming

## Objetivo

As abas **Produção** (`faturamento`) e **Vendas** (`vendas`) do dashboard passam a ler os dados do
**Kanban PRO** (`https://kanbanpro.enterplak.com.br`) em vez da planilha Google lida pelo n8n
(webhook `4cb6950a-…`, fluxo `w4jYmktp2GSyfD9u`). **Cálculos, metas, gráficos e layout não mudam**,
com duas exceções aprovadas: produção realizada passa a ser a quantidade faturada, e o nome do
cliente fica numa linha com reticências.

## Por quê

- A planilha deixou de ser alimentada em 11/09/2026 (o dia em que o Kanban entrou em produção):
  em setembro/26 ela tem só a primeira NF do mês, e o faturado real (Kanban) é cerca de 10x maior.
  A mesma NF bate entre os dois, a menos do câmbio digitado com 2 casas. (Valores reais ficam fora
  deste repositório, que é público.)
- O webhook do n8n entrega faturamento e vendas **sem autenticação**. A integração direta mantém o
  token só no servidor e exige login com permissão na aba.

## Decisões

| Tema | Decisão |
|---|---|
| Arquitetura | Integração direta: função Vercel `/api/faturamento` → rota do Kanban com token. Sem n8n |
| Produção realizada | Σ quantidade faturada (antes `Qtde Embalada`, que nunca foi preenchida → sempre 0) |
| Cliente | Nome cadastrado completo; agrupamento por `clienteId` (nomes iguais com ids diferentes são desambiguados) |
| Vendas em USD | Recebidas com `moeda`, **excluídas da soma** (igual à tela do Kanban) |
| Vendas sem data de aprovação | O Kanban usa fallback (`evento` → `pedido` → `criacao`) em `dataAprovacaoOrigem`; o dashboard soma todas |
| Notas sem entrega / entregas sem produto | Ignoradas pelo Kanban, igual à tela dele |
| Atualização | Puxar sob demanda (abrir aba, "Atualizar", refresh de 5 min). Sem push |

## Contrato do Kanban (implementado pela sessão `kanban-pro-db`)

`GET {KANBAN_URL}/api/integracoes/dashboard/faturamento?de=YYYY-MM&ate=YYYY-MM`
- `Authorization: Bearer {DASHBOARD_TOKEN}` (no Kanban; na Vercel a variável chama
  `KANBAN_DASHBOARD_TOKEN`). 401 sem/errado · 503 não configurado · 400 `de`/`ate` inválidos ou
  `de > ate` · `Cache-Control: no-store`.
- `de`/`ate` inclusivos por mês: entregas pela data da entrega, notas pela data da nota, vendas
  pela data de aprovação. Datas `"YYYY-MM-DD"` (dia de calendário, sem fuso).
- Entregas e notas só de cards **Venda** não cancelados; vendas só de cards **Prospecção** com
  desfecho **Ganho**. Valores pela fórmula do `getSalesSummary`:
  entrega `(fixo + câmbio do PEDIDO × variável) × qtd`; nota `(fixo + câmbio da NOTA × variável) × qtd`.

```json
{
  "geradoEm": "2026-10-08T12:00:00Z",
  "entregas": [{ "id": "…", "pedidoId": "…", "pedido": "ALFA PV0001/26 ACP001/26 PC000001",
    "acp": "ACP001/26", "clienteId": "…", "cliente": "Cliente Alfa Ltda",
    "produtoCodigo": "…", "produtoDescricao": "…", "quantidade": 1000,
    "data": "2026-10-30", "cambio": 5.2, "valorEstimadoBRL": 5000.5 }],
  "notas": [{ "id": "…", "pedidoId": "…", "pedido": "…", "acp": "…", "clienteId": "…",
    "cliente": "…", "produtoCodigo": "…", "produtoDescricao": "…", "quantidade": 141,
    "data": "2026-09-11", "cambio": 5.1654, "numeroNF": 1001, "valorBRL": 1234.56 }],
  "vendas": [{ "pedidoId": "…", "pedido": "…", "acp": "ACP003/26", "clienteId": "…",
    "cliente": "…", "valor": 2500.9, "moeda": "BRL", "dataAprovacao": "2026-09-14",
    "dataAprovacaoOrigem": "evento" }]
}
```

`acp` pode ser `null`; `cliente`/`clienteId` podem ser `null` (card sem empresa).

## Arquitetura no dashboard

```
aba Produção/Vendas ──GET /api/faturamento?mes=outubro/26&mes2=…&mes3=… (Bearer sessão)──▶
  função Vercel: autoriza (faturamento|vendas) → Kanban (Bearer KANBAN_DASHBOARD_TOKEN, de/ate do
  trimestre) → converte para as linhas legadas → responde array ──▶ parseFaturamentoData (inalterado)
```

### Função `api/faturamento.js` (+ `api/_lib/faturamento.js`, puro e testado)
- **Método:** só `GET` → 405 nos demais. `Cache-Control: no-store`.
- **Autorização:** sessão do Supabase do dashboard (mesmo `autorizarUsuario` existente,
  generalizado para receber a(s) página(s) exigida(s)). Ok se `active` e (admin | moderador | tem
  `faturamento` ou `vendas`). 401/403/503 como na função do ShopFloor.
- **Configuração:** `KANBAN_URL` e `KANBAN_DASHBOARD_TOKEN`; ausentes → 503 "Integração com o
  Kanban não configurada.".
- **Parâmetros:** `mes` obrigatório, `mes2`/`mes3` opcionais, no formato `nomeDoMes/aa`
  (`outubro/26`), igual ao front de hoje. Inválido → 400. `de`/`ate` = menor e maior dos meses
  recebidos, em `YYYY-MM` (`/26` → `2026`).
- **Kanban:** timeout 15 s. Não-2xx ou erro de rede → 502 `{ erro }` (com `console.error` sem segredos).
- **Resposta:** `200` com **array** de linhas (o front já faz `Array.isArray`). Em erro, `{ erro }`
  com status ≠ 2xx (o front já trata `!response.ok`).

### Conversão (linhas legadas)
Meses e datas: `"YYYY-MM-DD"` → `"DD/MM/YYYY"`; mês → `"outubro/26"` (minúsculo, PT-BR).

| `_source` | De | Filtro | Campos |
|---|---|---|---|
| `previsto` | `entregas` | mês da `data` = `mes` | `ID` (= `acp` ou `pedido`), `Cliente`, `PMO` (= `acp` ou `""`), `Descrição` (= `produtoDescricao`), `Qtde planejada` (= `quantidade`), `Data entrega planejada`, `Mês entrega planejada`, `Total fat. Estimado` (= `valorEstimadoBRL`) |
| `realizado` | `notas` | mês da `data` = `mes` | `ID`, `Mês`, `Cliente`, `PMO`, `Descrição`, `Qtde Faturada` (= `quantidade`), `Data faturada`, `Dólar` (= `cambio`), `Valor total` (= `valorBRL`), `Nota Fiscal` (= `numeroNF`) |
| `vendas` | `vendas` | `moeda === "BRL"`, todo o intervalo | `col_2` (= `pedido`), `col_3` (= `valor`), `col_4` (= `acp`), `col_6` = `"Aprovado"`, `col_8` e `col_10` (= data), `col_9`, `col_11` e `col_14` (= mês), `cliente` |

- **Cliente:** `Cliente` = nome; se dois `clienteId` distintos têm o mesmo nome, o segundo vira
  `"Nome (2)"`; `cliente` `null` → `"(sem cliente)"`.
- Linhas sem `data` são descartadas (não há mês para filtrar).

### `index.html` — três mudanças
1. `FATURAMENTO_WEBHOOK` → `'/api/faturamento'`; `loadFaturamento` envia `Authorization: Bearer
   <access_token>` (mesmo `sfAuthHeaders` já existente) e trata 401/403 com mensagem clara.
2. `parseFaturamentoData`, ramo `realizado`: produção soma `Qtde Faturada` (não `Qtde Embalada`).
3. CSS de `.fat-proj-name`: uma linha, `overflow: hidden; text-overflow: ellipsis; white-space:
   nowrap`, com o nome completo no `title`.

## Erros

| Situação | Resultado |
|---|---|
| Sem login / sem permissão | 401 / 403 → card de erro da aba com a mensagem |
| Variáveis ausentes | 503 "Integração com o Kanban não configurada." |
| Kanban fora, lento ou 401/503 | 502 → card de erro com "Tentar novamente" (fluxo atual) |
| Mês inválido | 400 |

## Testes
- `tests/faturamento.test.js`: conversão (cada `_source`, formatos de data/mês, filtro por mês,
  USD excluído, desambiguação de cliente, `acp`/`cliente` nulos, linha sem data), cálculo de
  `de`/`ate`, validação de meses.
- `tests/handlers.test.js`: handler de faturamento (405, auth 401/403, 503 sem config, 502 Kanban
  fora, URL e Bearer corretos, 200 com array).
- `tests/auth.test.js`: autorização generalizada por página continua cobrindo o Fluxo ShopFloor.

## Entrega em etapas
1. Publicar a função e as variáveis na Vercel **sem** mudar o `index.html` (o n8n segue ativo).
2. Conferir `/api/faturamento?mes=setembro/26&…` contra o total faturado de set/26 na tela do Kanban
   e o programado informado pela sessão do Kanban.
3. Publicar as três mudanças do `index.html`.
4. Após alguns dias estável, desligar o fluxo do n8n e remover o webhook do código.

## Fora de escopo
- Converter vendas em USD.
- Mudar metas (`META_VENDAS_TRIMESTRE`), layout ou cálculos.
- Corrigir os dados do Kanban (câmbio com 2 casas, notas com câmbio zero, nota sem entrega)
  — reportados ao time.
