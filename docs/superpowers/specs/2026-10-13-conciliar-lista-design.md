# Conciliar em lista: uma linha por lançamento — design

Data: 2026-10-13
Substitui a experiência de `2026-10-01-conciliar-modo-foco-design.md` (card por
vez). A rota, os pontos de entrada, a leitura da fila (`carregarFila`) e as
server actions continuam os mesmos.

## 1. O problema

O modo foco mostra um lançamento por vez, com três blocos de informação para
uma decisão só. Para quatro cópias do mesmo envio do banco são quatro telas, e
cada clique espera o servidor antes de mostrar o próximo. O usuário achou lento
e confuso: "tem muita info, isso confunde".

## 2. A experiência

Uma lista. Cada linha diz **quem, quando, quanto e o que o floow acha**, com um
botão. O detalhe só aparece se o usuário pedir.

```
Conciliar                                             4 pendentes

☐  Facebook    12/09   -R$ 12,56   Cópia, chegou de novo em 13/10   [Descartar]
☐  Facebook    12/09   -R$ 12,64   Cópia, chegou de novo em 13/10   [Descartar]
☐  Uber        10/10   -R$ 23,40   Transporte                       [Confirmar]
☐  Pix João    09/10   +R$ 500,00  É o "Aluguel" de 10/10?          [Vincular]

                                                [Confirmar 2 marcados]
```

### 2.1 O palpite da linha

Um só por linha, na ordem em que o modo foco já decide (`faseDe`):

| Situação | Frase | Botão |
|---|---|---|
| Repetido proposto | "Cópia, chegou de novo em DD/MM" | Descartar |
| Tem previsão parecida | "É o "<previsão>" de DD/MM?" (a melhor candidata) | Vincular |
| Classificação completa | o nome da categoria (ou "Transferência para <conta>") | Confirmar |
| Classificação incompleta | "Escolher categoria" | (abre a linha) |

O botão faz exatamente o que o Enter faz hoje no card: `aprovarDuplicata`,
`vincularPrevisao` com a melhor candidata, ou o lançar com a `decisaoInicial`
(inclui "fazer igual daqui pra frente" quando a contraparte não é CPF próprio).

### 2.2 Vários de uma vez

Caixa de seleção por linha e uma no cabeçalho ("marcar todos"). Com algo
marcado, aparece um botão fixo embaixo: **Confirmar N marcados**, que aplica o
palpite de cada linha marcada. Linha com "Escolher categoria" não pode ser
marcada.

### 2.3 O detalhe, só quando pedido

Clicar na linha (fora do botão e da caixa) a abre por baixo, uma de cada vez.
Dentro, as peças que já existem, sem reescrever:

- repetido: a comparação dos dois lados (`CardRepetido`), com "São duas compras";
- previsão: as candidatas, a busca e o "lançar como novo" (`PainelDeDecisao`);
- classificação: natureza, categoria e a regra (`CardClassificar`).

Fechar a linha não decide nada.

### 2.4 Rápido

A linha sai da lista **no clique**, e a gravação segue por trás, uma de cada
vez, na ordem dos cliques. Se o servidor recusar, a linha volta para o lugar e
aparece um aviso. O "Confirmar N marcados" faz o mesmo para cada linha.

Uma regra confirmada ("fazer igual com <contraparte>") resolve as outras linhas
da mesma contraparte: elas saem junto, como no modo foco.

Lista vazia com mais pendentes no servidor: pede o próximo lote (50), como hoje.

### 2.5 Celular

A linha quebra em duas: descrição e valor em cima, palpite e botão embaixo.

## 3. O que sai

`fila-foco.tsx`, `progresso-da-fila.tsx`, `use-atalhos.ts` e o "Pular" — numa
lista não há o que pular. `estado-da-fila.ts` fica no que ainda servir
(`faseDe`).

## 4. Fora do escopo

- Mudança no servidor: as actions e a leitura da fila são as mesmas.
- Agrupar cópias do mesmo envio: "marcar todos" já resolve.
- Atalhos de teclado.

## 5. Testes

- A frase e o botão de cada situação de 2.1.
- O clique tira a linha antes de a action responder; erro devolve a linha e avisa.
- "Confirmar N marcados" chama a action de cada linha marcada, na ordem.
- Regra confirmada tira as outras linhas da contraparte.
- Linha sem categoria não pode ser marcada; abrir mostra a escolha.
