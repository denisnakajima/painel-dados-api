# Público — Retrato do Brasil

Painel em Node.js para explorar dados demográficos brasileiros, usando exclusivamente as APIs públicas do IBGE e gráficos em Chart.js.

## Requisitos

- Node.js 18 ou superior
- Conexão com a internet para consultar o IBGE e carregar Chart.js/fontes

## Executar

```bash
cd C:\projetos\painel-dados-api
npm start
```

Abra [http://localhost:3000](http://localhost:3000). Para usar outra porta, defina `PORT` antes de iniciar.

## Análises

- População residente estimada por estado, região e município
- Participação de cada região e concentração nos dez maiores municípios
- Quantidade de municípios por região e faixas populacionais
- Ranking estadual e municipal, com busca por município e filtro por região

As análises são calculadas a partir dos dados do IBGE: agregado 6579, variável 9324, e API de Localidades. A aba “Municípios” carrega as estimativas municipais sob demanda. O servidor faz proxy e cache temporário das respostas. Se a estimativa do ano corrente ainda não estiver disponível, o painel tenta o ano anterior.
