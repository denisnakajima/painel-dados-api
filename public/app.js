const state = {
  stateChart: null,
  regionChart: null,
  municipalityChart: null,
  sparkChart: null,
  rows: [],
  descending: true,
  totalPopulation: 0,
  states: [],
  cityRows: [],
  cityChart: null,
  cityBandsChart: null,
  municipalityLoaded: false,
  municipalityLoading: false
};

const numberBR = new Intl.NumberFormat('pt-BR');
const percentBR = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const regionOrder = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
const regionColors = ['#83a98d', '#a8c4a8', '#c7d5a0', '#4e8c66', '#6e9f7a'];

async function getJSON(path) {
  const response = await fetch(path);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
}

function displayState(id, message = '') {
  const element = document.getElementById(`${id}-state`);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('hidden', !message);
}

function readPopulation(payload, year) {
  const results = Array.isArray(payload) ? payload[0]?.resultados : null;
  if (!results) throw new Error('O IBGE não retornou dados populacionais neste formato.');

  const rows = [];
  for (const result of results) {
    for (const serie of result.series || []) {
      const locality = serie.localidade || {};
      const code = String(locality.id || '');
      const rawValue = serie.serie?.[String(year)] ?? Object.values(serie.serie || {})[0];
      const value = Number(String(rawValue ?? '').replace(/\s/g, '').replace(',', '.'));
      if (/^\d{2}$/.test(code) && locality.nome && Number.isFinite(value) && value > 0) {
        rows.push({ code, name: locality.nome, value });
      }
    }
  }
  if (!rows.length) throw new Error(`Não há estimativas disponíveis para ${year}.`);
  return rows;
}

function chartBase() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 450 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#183b30', padding: 9, displayColors: false,
        titleFont: { family: 'DM Sans', size: 10 }, bodyFont: { family: 'DM Mono', size: 10 }
      }
    },
    scales: {
      x: {
        border: { display: false }, grid: { color: '#edf0ed', drawTicks: false },
        ticks: { color: '#96a099', font: { family: 'DM Mono', size: 9 }, padding: 7 }
      },
      y: {
        border: { display: false }, grid: { display: false },
        ticks: { color: '#617368', font: { family: 'DM Mono', size: 9 } }
      }
    }
  };
}

function renderHorizontalBars(canvasId, rows, value, color, formatter) {
  if (typeof Chart === 'undefined') throw new Error('Chart.js não carregou.');
  const options = chartBase();
  options.indexAxis = 'y';
  options.scales.x.ticks.callback = formatter.axis;
  options.plugins.tooltip.callbacks = { label: context => formatter.tooltip(context.parsed.x) };
  return new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels: rows.map(row => row.label),
      datasets: [{
        data: rows.map(value),
        backgroundColor: rows.map((_, index) => Array.isArray(color) ? color[index] : color),
        borderRadius: 3,
        barThickness: rows.length > 10 ? 10 : 16
      }]
    },
    options
  });
}

function renderTable() {
  const body = document.getElementById('state-table-body');
  const rows = [...state.rows].sort((a, b) => state.descending ? b.value - a.value : a.value - b.value);
  body.innerHTML = rows.map(row => {
    const share = state.totalPopulation ? row.value / state.totalPopulation * 100 : 0;
    return `<tr><td>${escapeHTML(row.name)}</td><td>${escapeHTML(row.uf)}</td><td>${numberBR.format(row.value)}</td><td>${numberBR.format(row.municipalities || 0)}</td><td>${percentBR.format(share)}%</td></tr>`;
  }).join('');
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function renderMunicipalityData(states, municipalities) {
  const byState = new Map(states.map(item => [String(item.id), { count: 0, item }]));
  for (const municipality of municipalities) {
    const stateCode = String(municipality.id).slice(0, 2);
    const stateData = byState.get(stateCode);
    if (stateData) stateData.count += 1;
  }

  for (const row of state.rows) {
    row.municipalities = byState.get(row.code)?.count || 0;
  }

  const countsByRegion = new Map(regionOrder.map(name => [name, 0]));
  for (const { count, item } of byState.values()) {
    const region = item.regiao?.nome;
    if (countsByRegion.has(region)) countsByRegion.set(region, countsByRegion.get(region) + count);
  }
  const regionRows = regionOrder.map((name, index) => ({ label: name, value: countsByRegion.get(name) || 0, color: regionColors[index] }));
  document.getElementById('municipality-value').textContent = numberBR.format(municipalities.length);
  document.getElementById('municipality-note').textContent = `${states.length} UFs · ${regionRows.length} regiões`;

  if (state.municipalityChart) state.municipalityChart.destroy();
  state.municipalityChart = renderHorizontalBars(
    'municipality-chart', regionRows, row => row.value, regionRows.map(row => row.color),
    { axis: value => numberBR.format(value), tooltip: value => `${numberBR.format(value)} municípios` }
  );
  displayState('municipality');
  renderTable();
}

function renderPopulationData(rows, states, year) {
  const stateInfo = new Map(states.map(item => [String(item.id), item]));
  state.rows = rows.map(row => {
    const info = stateInfo.get(row.code);
    return {
      ...row,
      uf: info?.sigla || '',
      region: info?.regiao?.nome || 'Outras'
    };
  }).sort((a, b) => b.value - a.value);
  state.totalPopulation = state.rows.reduce((total, row) => total + row.value, 0);
  const regions = regionOrder.map((name, index) => ({
    label: name,
    value: state.rows.filter(row => row.region === name).reduce((total, row) => total + row.value, 0),
    color: regionColors[index]
  }));
  const largestRegion = [...regions].sort((a, b) => b.value - a.value)[0];
  const share = largestRegion.value / state.totalPopulation * 100;

  document.getElementById('population-value').textContent = `${(state.totalPopulation / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
  document.getElementById('population-date').textContent = `Brasil · referência em 1º de julho de ${year}`;
  document.getElementById('population-year').textContent = `JUL ${year}`;
  document.getElementById('table-year').textContent = String(year);
  document.getElementById('state-count').textContent = `${state.rows.length} unidades da federação`;
  document.getElementById('largest-region-value').textContent = largestRegion.label;
  document.getElementById('largest-region-context').textContent = `${percentBR.format(share)}% da população brasileira`;
  document.getElementById('region-note').textContent = `${(state.totalPopulation / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi no total`;

  if (typeof Chart === 'undefined') throw new Error('Chart.js não carregou.');
  if (state.regionChart) state.regionChart.destroy();
  state.regionChart = renderHorizontalBars(
    'region-chart', regions, row => row.value / 1_000_000, regions.map(row => row.color),
    { axis: value => `${String(value).replace('.', ',')} mi`, tooltip: value => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} milhões de habitantes` }
  );

  const spark = document.getElementById('population-spark');
  if (state.sparkChart) state.sparkChart.destroy();
  state.sparkChart = new Chart(spark, {
    type: 'bar',
    data: { labels: regions.map(row => row.label), datasets: [{ data: regions.map(row => row.value), backgroundColor: '#c7ed9b', borderRadius: 2, barThickness: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
  });

  if (state.stateChart) state.stateChart.destroy();
  const topStates = state.rows.slice(0, 10).map(row => ({ label: row.uf, value: row.value }));
  state.stateChart = renderHorizontalBars(
    'state-chart', topStates, row => row.value / 1_000_000,
    topStates.map((_, index) => index === 0 ? '#4e8c66' : '#b9d5c1'),
    { axis: value => `${String(value).replace('.', ',')} mi`, tooltip: value => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} milhões de habitantes` }
  );
  displayState('region');
  displayState('state-chart');
  renderTable();
}

async function loadAll(showMessage = false) {
  const timestamp = document.getElementById('updated-at');
  timestamp.textContent = 'atualizando…';
  const [statesResult, municipalitiesResult] = await Promise.allSettled([
    getJSON('/api/ibge/estados'),
    getJSON('/api/ibge/municipios')
  ]);
  const states = statesResult.status === 'fulfilled' ? statesResult.value : [];
  const municipalities = municipalitiesResult.status === 'fulfilled' ? municipalitiesResult.value : [];
  state.states = states;

  if (!states.length) {
    displayState('municipality', 'Não foi possível carregar a divisão territorial do IBGE.');
    displayState('state-chart', 'Não foi possível carregar os dados do IBGE.');
  }
  if (!municipalities.length) {
    displayState('municipality', 'Não foi possível carregar a lista de municípios do IBGE.');
    document.getElementById('municipality-value').textContent = '—';
  }

  let populationLoaded = false;
  const currentYear = new Date().getFullYear();
  for (const year of [currentYear, currentYear - 1]) {
    try {
      const payload = await getJSON(`/api/ibge/populacao?ano=${year}`);
      const rows = readPopulation(payload, year);
      if (!states.length) throw new Error('A lista de estados do IBGE não carregou.');
      renderPopulationData(rows, states, year);
      if (municipalities.length) renderMunicipalityData(states, municipalities);
      populationLoaded = true;
      break;
    } catch (error) {
      console.warn(`Estimativa do IBGE ${year} indisponível:`, error.message);
    }
  }
  if (!populationLoaded) {
    displayState('region', 'Não foi possível carregar as estimativas populacionais do IBGE.');
    displayState('state-chart', 'Não foi possível carregar as estimativas populacionais do IBGE.');
    document.getElementById('population-value').textContent = '—';
    document.getElementById('population-date').textContent = 'Fonte temporariamente indisponível';
  }
  if (states.length && municipalities.length && !populationLoaded) renderMunicipalityData(states, municipalities);

  timestamp.textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
  if (showMessage) notify('Dados atualizados a partir do IBGE.');
}

let toastTimer;
function notify(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

async function selectPanel(panelName) {
  const isMunicipalityPanel = panelName === 'municipalities';
  document.getElementById('overview-panel').hidden = isMunicipalityPanel;
  document.getElementById('municipalities-panel').hidden = !isMunicipalityPanel;
  document.getElementById('overview-tab').classList.toggle('active', !isMunicipalityPanel);
  document.getElementById('overview-tab').setAttribute('aria-selected', String(!isMunicipalityPanel));
  document.getElementById('municipalities-tab').classList.toggle('active', isMunicipalityPanel);
  document.getElementById('municipalities-tab').setAttribute('aria-selected', String(isMunicipalityPanel));
  if (isMunicipalityPanel && !state.municipalityLoaded && !state.municipalityLoading) {
    await loadMunicipalityAnalysis();
  }
}

async function loadMunicipalityAnalysis() {
  state.municipalityLoading = true;
  displayState('city-top', 'Buscando estimativas municipais no IBGE…');
  displayState('city-bands', 'Buscando estimativas municipais no IBGE…');
  document.getElementById('city-table-body').innerHTML = '<tr><td colspan="5" class="table-loading">Carregando dados do IBGE…</td></tr>';
  try {
    const currentYear = new Date().getFullYear();
    let rows;
    let year;
    let lastError;
    for (const candidateYear of [currentYear, currentYear - 1]) {
      try {
        const payload = await getJSON(`/api/ibge/populacao-municipios?ano=${candidateYear}`);
        const results = Array.isArray(payload) ? payload[0]?.resultados : null;
        if (!results) throw new Error('Formato municipal não reconhecido.');
        const series = results.flatMap(result => result.series || []);
        rows = series.map(item => {
          const locality = item.localidade || {};
          const code = String(locality.id || '');
          const rawValue = item.serie?.[String(candidateYear)] ?? Object.values(item.serie || {})[0];
          const value = Number(String(rawValue ?? '').replace(/\s/g, '').replace(',', '.'));
          if (!/^\d{7}$/.test(code) || !locality.nome || !Number.isFinite(value) || value <= 0) return null;
          const info = state.states.find(uf => String(uf.id) === code.slice(0, 2));
          return { code, name: locality.nome, value, uf: info?.sigla || '', region: info?.regiao?.nome || '' };
        }).filter(Boolean).sort((a, b) => b.value - a.value);
        if (!rows.length) throw new Error(`Sem estimativas municipais para ${candidateYear}.`);
        year = candidateYear;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!rows?.length) throw lastError || new Error('Não há estimativas municipais disponíveis.');
    if (!state.states.length) state.states = await getJSON('/api/ibge/estados');
    for (const row of rows) {
      if (!row.uf || !row.region) {
        const info = state.states.find(uf => String(uf.id) === row.code.slice(0, 2));
        row.uf = info?.sigla || '';
        row.region = info?.regiao?.nome || '';
      }
    }
    state.cityRows = rows;
    const topTenTotal = rows.slice(0, 10).reduce((total, row) => total + row.value, 0);
    const nationalTotal = state.totalPopulation || rows.reduce((total, row) => total + row.value, 0);
    const largest = rows[0];
    document.getElementById('city-year').textContent = `JUL ${year}`;
    document.getElementById('city-chart-year').textContent = `ESTIMATIVA ${year}`;
    document.getElementById('city-total').textContent = numberBR.format(rows.length);
    document.getElementById('city-largest').textContent = largest.name;
    document.getElementById('city-largest-context').textContent = `${(largest.value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} milhões de habitantes`;
    document.getElementById('city-largest-uf').textContent = largest.uf;
    document.getElementById('city-top-share').textContent = `${percentBR.format(topTenTotal / nationalTotal * 100)}%`;

    if (state.cityChart) state.cityChart.destroy();
    const topRows = rows.slice(0, 10).map(row => ({ label: `${row.name} · ${row.uf}`, value: row.value / 1_000_000 }));
    state.cityChart = renderHorizontalBars(
      'city-top-chart', topRows, row => row.value, topRows.map((_, index) => index === 0 ? '#4e8c66' : '#b9d5c1'),
      { axis: value => `${String(value).replace('.', ',')} mi`, tooltip: value => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} milhões de habitantes` }
    );

    const bands = [
      { label: 'Até 10 mil', min: 0, max: 10_000 },
      { label: '10–50 mil', min: 10_000, max: 50_000 },
      { label: '50–100 mil', min: 50_000, max: 100_000 },
      { label: '100–500 mil', min: 100_000, max: 500_000 },
      { label: '500 mil–1 mi', min: 500_000, max: 1_000_000 },
      { label: 'Acima de 1 mi', min: 1_000_000, max: Infinity }
    ].map((band, index) => ({ ...band, value: rows.filter(row => row.value >= band.min && row.value < band.max).length, color: regionColors[index % regionColors.length] }));
    if (state.cityBandsChart) state.cityBandsChart.destroy();
    state.cityBandsChart = renderHorizontalBars(
      'city-bands-chart', bands, row => row.value, bands.map(row => row.color),
      { axis: value => numberBR.format(value), tooltip: value => `${numberBR.format(value)} municípios` }
    );
    displayState('city-top');
    displayState('city-bands');
    renderCityTable();
    state.municipalityLoaded = true;
  } catch (error) {
    console.error('Falha ao carregar estimativas municipais do IBGE:', error);
    displayState('city-top', 'Não foi possível carregar estimativas municipais do IBGE.');
    displayState('city-bands', 'Não foi possível carregar estimativas municipais do IBGE.');
    document.getElementById('city-table-body').innerHTML = '<tr><td colspan="5" class="table-loading">Dados temporariamente indisponíveis.</td></tr>';
  } finally {
    state.municipalityLoading = false;
  }
}

function renderCityTable() {
  const term = document.getElementById('city-search').value.trim().toLocaleLowerCase('pt-BR');
  const region = document.getElementById('region-filter').value;
  const filtered = state.cityRows.filter(row => {
    const matchesSearch = !term || row.name.toLocaleLowerCase('pt-BR').includes(term) || row.uf.toLocaleLowerCase('pt-BR').includes(term);
    return matchesSearch && (!region || row.region === region);
  });
  const shown = filtered.slice(0, 50);
  const nationalTotal = state.totalPopulation || state.cityRows.reduce((total, row) => total + row.value, 0);
  document.getElementById('city-result-count').textContent = filtered.length > shown.length
    ? `Exibindo ${numberBR.format(shown.length)} de ${numberBR.format(filtered.length)} municípios`
    : `${numberBR.format(filtered.length)} municípios`;
  document.getElementById('city-table-body').innerHTML = shown.length ? shown.map(row => {
    const share = nationalTotal ? row.value / nationalTotal * 100 : 0;
    return `<tr><td>${escapeHTML(row.name)}</td><td>${escapeHTML(row.uf)}</td><td>${escapeHTML(row.region)}</td><td>${numberBR.format(row.value)}</td><td>${percentBR.format(share)}%</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="table-loading">Nenhum município encontrado.</td></tr>';
}

document.getElementById('overview-tab').addEventListener('click', () => selectPanel('overview'));
document.getElementById('municipalities-tab').addEventListener('click', () => selectPanel('municipalities'));
document.getElementById('refresh-button').addEventListener('click', async () => {
  state.municipalityLoaded = false;
  await loadAll(true);
  if (!document.getElementById('municipalities-panel').hidden) await loadMunicipalityAnalysis();
});
document.getElementById('city-search').addEventListener('input', renderCityTable);
document.getElementById('region-filter').addEventListener('change', renderCityTable);
document.getElementById('sort-population').addEventListener('click', event => {
  state.descending = !state.descending;
  event.currentTarget.innerHTML = state.descending ? 'Maior população <span>↓</span>' : 'Menor população <span>↑</span>';
  renderTable();
});
loadAll();

document.querySelector('[role="tablist"]').addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const current = tabs.indexOf(document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  const offset = event.key === 'ArrowRight' ? 1 : -1;
  const next = tabs[(current + offset + tabs.length) % tabs.length];
  next.focus();
  next.click();
});
