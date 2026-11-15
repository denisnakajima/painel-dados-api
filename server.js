const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};
const cache = new Map();

async function fetchJson(url, cacheKey, ttlMs = 30 * 60 * 1000) {
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < ttlMs) return cached.data;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'painel-dados-ibge/1.0 (dados abertos)' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`O IBGE respondeu com HTTP ${response.status}`);
  const data = await response.json();
  cache.set(cacheKey, { data, time: Date.now() });
  return data;
}

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

async function routeApi(url, res) {
  try {
    if (url.pathname === '/api/ibge/estados') {
      const data = await fetchJson(
        'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome',
        'ibge-estados', 24 * 60 * 60 * 1000
      );
      return jsonResponse(res, 200, data);
    }

    if (url.pathname === '/api/ibge/municipios') {
      const data = await fetchJson(
        'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome',
        'ibge-municipios', 24 * 60 * 60 * 1000
      );
      return jsonResponse(res, 200, data);
    }

    if (url.pathname === '/api/ibge/populacao-municipios') {
      const year = Number(url.searchParams.get('ano') || new Date().getFullYear());
      if (!Number.isInteger(year) || year < 2010 || year > new Date().getFullYear()) {
        return jsonResponse(res, 400, { error: 'Ano inválido.' });
      }
      // Agregado 6579, variável 9324, nível N6 (municípios).
      const endpoint = `https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/${year}/variaveis/9324?localidades=N6`;
      const data = await fetchJson(endpoint, `ibge-pop-municipios-${year}`, 24 * 60 * 60 * 1000);
      return jsonResponse(res, 200, data);
    }
    if (url.pathname === '/api/ibge/populacao') {
      const year = Number(url.searchParams.get('ano') || new Date().getFullYear());
      if (!Number.isInteger(year) || year < 2010 || year > new Date().getFullYear()) {
        return jsonResponse(res, 400, { error: 'Ano inválido.' });
      }
      // Agregado 6579: estimativas de população; variável 9324: população residente.
      const endpoint = `https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/${year}/variaveis/9324?localidades=N3`;
      const data = await fetchJson(endpoint, `ibge-pop-${year}`, 24 * 60 * 60 * 1000);
      return jsonResponse(res, 200, data);
    }

    return jsonResponse(res, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    console.error(`[IBGE] ${url.pathname}:`, error.message);
    return jsonResponse(res, 502, { error: 'Não foi possível carregar os dados do IBGE.', detail: error.message });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return routeApi(url, res);

  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Arquivo não encontrado.');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Painel disponível em http://localhost:${PORT}`);
});

