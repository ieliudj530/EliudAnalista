/* main.js - AlephGraf v4.1 (Matrix + Funciones Recuperadas) */

let globalData = [];
let headers = [];
let pivotData = null; 
let savedCharts = []; 
let currentPage = 1;
let itemsPerPage = 4;
let activeChartInstances = {};

// Configuración Global Chart.js (Estilo Power BI)
Chart.register(ChartDataLabels);
Chart.defaults.font.family = "'Segoe UI', Roboto, sans-serif";
Chart.defaults.color = '#605e5c';
Chart.defaults.scale.grid.color = '#e1dfdd';

// Paleta de Colores Corporativa
const seriesPalette = ['#0078d4', '#d83b01', '#107c10', '#a80000', '#5c2d91', '#00bcf2', '#b4009e', '#ffb900', '#7f8c8d', '#2c3e50'];

// --- NAVEGACIÓN ---
function showView(viewId) {
    ['view-upload', 'view-studio', 'view-dashboard'].forEach(id => document.getElementById(id).classList.add('d-none'));
    document.getElementById(`view-${viewId}`).classList.remove('d-none');
    document.querySelectorAll('.list-group-item').forEach(li => li.classList.remove('active'));
    const navItem = document.getElementById('nav-' + viewId.replace('view-',''));
    if(navItem) navItem.classList.add('active');
}

// --- CARGA DE ARCHIVO ---
document.getElementById('fileInput').addEventListener('change', (evt) => {
    const file = evt.target.files[0];
    if (!file) return;
    document.getElementById('fileName').innerText = file.name;
    updateStatus('Procesando...', 'warning');

    const reader = new FileReader();
    const done = (d) => processData(d);

    if (file.name.endsWith('.csv')) {
        reader.onload = (e) => Papa.parse(e.target.result, { header: true, skipEmptyLines: true, complete: (r) => done(r.data) });
        reader.readAsText(file);
    } else {
        reader.onload = (e) => {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
            done(json);
        };
        reader.readAsArrayBuffer(file);
    }
});

function processData(data) {
    if (!data || data.length === 0) return alert("Archivo vacío");
    globalData = data.map(row => {
        const r = {}; Object.keys(row).forEach(k => r[k.trim()] = row[k]); return r;
    });
    headers = Object.keys(globalData[0]);
    updateStatus('Datos Conectados', 'success');
    initStudioControls();
    showView('studio');
}

function updateStatus(msg, type) {
    document.getElementById('status-text').innerText = msg;
    document.getElementById('status-icon').className = `bi bi-circle-fill text-${type} me-2`;
}

// --- CONTROLES DEL STUDIO ---
function initStudioControls() {
    const fill = (id) => {
        const sel = document.getElementById(id);
        const isOpt = (id === 'filterCol' || id === 'legendCol');
        sel.innerHTML = isOpt ? '<option value="">(Ninguno)</option>' : '';
        headers.forEach(h => sel.innerHTML += `<option value="${h}">${h}</option>`);
    };
    fill('filterCol'); fill('groupCol'); fill('legendCol'); fill('valueCol');
    document.getElementById('preview-area').classList.add('d-none');
}

function loadFilterValues() {
    const col = document.getElementById('filterCol').value;
    const valSel = document.getElementById('filterVal');
    valSel.innerHTML = '<option value="">(Todo)</option>';
    if (!col) return;
    const unique = [...new Set(globalData.map(r => r[col]))].sort();
    unique.forEach(u => valSel.innerHTML += `<option value="${u}">${u}</option>`);
}

function resetStudio() {
    document.getElementById('filterCol').value = "";
    document.getElementById('legendCol').value = "";
    document.getElementById('filterVal').innerHTML = '<option value="">(Todo)</option>';
    document.getElementById('preview-area').classList.add('d-none');
}

// --- LÓGICA MATRICIAL (PIVOT) ---
function calculateMatrix(config, overrideFilterVal = null) {
    let dataset = globalData;
    const activeFilterVal = overrideFilterVal !== null ? overrideFilterVal : config.filterVal;

    // 1. Filtrar
    if (config.filterCol && activeFilterVal && activeFilterVal !== "") {
        dataset = dataset.filter(row => row[config.filterCol] == activeFilterVal);
    }

    // 2. Agrupar (Matriz)
    const grouped = {}; 
    const legendsSet = new Set();
    const rowTotals = {}; // Para ordenar después

    dataset.forEach(row => {
        // Eje X (Filas)
        let rowKey = row[config.groupCol] || "ND";
        if (config.dateMode === 'month') rowKey = parseDate(row[config.groupCol], 'month');
        if (config.dateMode === 'year') rowKey = parseDate(row[config.groupCol], 'year');

        // Leyenda (Columnas)
        let legendKey = config.legendCol ? (row[config.legendCol] || "ND") : "Total";
        legendsSet.add(legendKey);

        let val = (config.operation === 'count') ? 1 : cleanNumber(row[config.valueCol]);

        if (!grouped[rowKey]) grouped[rowKey] = {};
        if (!grouped[rowKey][legendKey]) grouped[rowKey][legendKey] = 0;
        
        grouped[rowKey][legendKey] += val;
        
        // Sumar al total de la fila para ordenar
        rowTotals[rowKey] = (rowTotals[rowKey] || 0) + val;
    });

    // 3. Ordenar Filas (X)
    const labels = Object.keys(grouped);
    if (config.dateMode !== 'none') {
        labels.sort(); // Orden cronológico si es fecha
    } else {
        // Ordenar por Valor Total (Mayor a menor) si no es fecha
        labels.sort((a, b) => rowTotals[b] - rowTotals[a]);
    }

    // 4. Ordenar Leyendas (Series)
    const legends = Array.from(legendsSet).sort();

    // 5. Construir Datasets para ChartJS
    const datasets = legends.map((legend, i) => {
        const data = labels.map(label => {
            return grouped[label][legend] || 0;
        });
        
        // Asignar color: Si hay leyenda, usa paleta. Si no, usa azul corporativo.
        let color = config.legendCol ? seriesPalette[i % seriesPalette.length] : '#0078d4';
        // Si hay una sola serie y la etiqueta es "Otros" (casos raros), poner gris
        if (!config.legendCol && labels.length > 10 && labels.indexOf('Otros') > -1) {
            // (Logica compleja de colores por barra omitida para mantener simpleza en matriz)
        }

        return {
            label: legend,
            data: data,
            backgroundColor: color,
            borderColor: '#fff',
            borderWidth: config.legendCol ? 1 : 0
        };
    });

    return { labels, datasets, legends, grouped };
}

// --- VISTA PREVIA ---
function calculatePreview() {
    const config = getConfigFromUI();
    if (!config.groupCol || !config.valueCol) return alert("Falta definir Ejes.");
    
    pivotData = calculateMatrix(config);
    renderPreviewTable(pivotData);
}

function getConfigFromUI() {
    return {
        filterCol: document.getElementById('filterCol').value,
        filterVal: document.getElementById('filterVal').value,
        groupCol: document.getElementById('groupCol').value,
        legendCol: document.getElementById('legendCol').value,
        dateMode: document.getElementById('dateMode').value,
        valueCol: document.getElementById('valueCol').value,
        operation: document.getElementById('operation').value
    };
}

function renderPreviewTable(data) {
    const thead = document.querySelector('#previewTable thead');
    const tbody = document.querySelector('#previewTable tbody');
    tbody.innerHTML = '';
    
    // Cabecera
    let headHtml = `<tr><th>${document.getElementById('groupCol').value}</th>`;
    data.legends.forEach(l => headHtml += `<th class="text-end">${l}</th>`);
    headHtml += '</tr>';
    thead.innerHTML = headHtml;

    // Cuerpo (Max 8 filas)
    data.labels.slice(0, 8).forEach(label => {
        let rowHtml = `<tr><td>${label}</td>`;
        data.legends.forEach(legend => {
            const val = data.grouped[label][legend] || 0;
            rowHtml += `<td class="text-end">${formatMoney(val)}</td>`;
        });
        rowHtml += '</tr>';
        tbody.innerHTML += rowHtml;
    });
    
    if (data.labels.length > 8) {
        tbody.innerHTML += `<tr><td colspan="${data.legends.length + 1}" class="text-center small text-muted">... y ${data.labels.length - 8} filas más</td></tr>`;
    }

    document.getElementById('preview-area').classList.remove('d-none');
}

// --- GUARDAR Y RENDERIZAR DASHBOARD ---
function saveToDashboard() {
    const config = getConfigFromUI();
    config.id = 'chart_' + Date.now();
    config.title = document.getElementById('chartTitle').value || 'Análisis';
    config.chartType = document.getElementById('chartType').value;

    savedCharts.push(config);
    currentPage = Math.ceil(savedCharts.length / itemsPerPage);
    renderCurrentPage();
    showView('dashboard');
}

function updatePaginationSettings() {
    itemsPerPage = parseInt(document.getElementById('itemsPerPageSelect').value);
    currentPage = 1; renderCurrentPage();
}

function renderCurrentPage() {
    const container = document.getElementById('dashboard-container');
    container.innerHTML = '';
    
    const totalPages = Math.ceil(savedCharts.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * itemsPerPage;
    
    savedCharts.slice(start, start + itemsPerPage).forEach(config => createChartCard(config, container));
    document.getElementById('pageIndicator').innerText = `Pág ${currentPage} de ${totalPages}`;
}

function createChartCard(config, container) {
    const colClass = itemsPerPage === 1 ? 'col-12' : 'col-md-6';
    const height = itemsPerPage === 1 ? '500px' : '320px';

    // Dropdown de Filtro (Interactivo)
    let filterHtml = '';
    if (config.filterCol) {
        const unique = [...new Set(globalData.map(r => r[config.filterCol]))].sort();
        const opts = unique.map(v => `<option value="${v}" ${v==config.filterVal?'selected':''}>${v}</option>`).join('');
        filterHtml = `<div class="mt-2 no-print"><label class="small text-muted mb-0">Filtrar ${config.filterCol}:</label><select class="form-select form-select-sm" onchange="updateLiveChart('${config.id}', this.value)"><option value="">(Todo)</option>${opts}</select></div>`;
    }

    const html = `
    <div class="${colClass}">
        <div class="card h-100 shadow-sm">
            <div class="card-header bg-white d-flex justify-content-between py-2 align-items-center">
                <h6 class="mb-0 fw-bold text-truncate" title="${config.title}">${config.title}</h6>
                <div class="dropdown no-print">
                    <button class="btn btn-sm btn-link text-muted p-0" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
                     <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                        <li><a class="dropdown-item small" onclick="downloadImg('${config.id}')"><i class="bi bi-download me-2"></i>Descargar Imagen</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item small text-danger" onclick="delChart('${config.id}')"><i class="bi bi-trash me-2"></i>Eliminar</a></li>
                    </ul>
                </div>
            </div>
            <div class="card-body d-flex flex-column">
                <div class="flex-grow-1" style="height:${height}; position:relative"><canvas id="${config.id}"></canvas></div>
                ${filterHtml}
            </div>
        </div>
    </div>`;
    container.innerHTML += html;
    
    setTimeout(() => {
        const data = calculateMatrix(config);
        drawChart(config, data);
    }, 50);
}

// --- ACTUALIZACIÓN EN VIVO ---
window.updateLiveChart = function(id, val) {
    const config = savedCharts.find(c => c.id === id);
    if(!config) return;
    // Recalcular datos con el nuevo filtro temporal
    const data = calculateMatrix(config, val);
    drawChart(config, data);
}

function drawChart(config, data) {
    const ctx = document.getElementById(config.id).getContext('2d');
    if (activeChartInstances[config.id]) activeChartInstances[config.id].destroy();

    let type = config.chartType === 'horizontalBar' ? 'bar' : config.chartType;
    let indexAxis = config.chartType === 'horizontalBar' ? 'y' : 'x';
    let stacked = (config.legendCol && type === 'bar'); // Apilar barras si hay leyenda

    const newChart = new Chart(ctx, {
        type: type,
        data: { labels: data.labels, datasets: data.datasets },
        options: {
            indexAxis: indexAxis,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { position: 'bottom', display: true, labels: { usePointStyle: true, boxWidth: 8 } },
                tooltip: { 
                    callbacks: { 
                        label: (c) => ` ${c.dataset.label}: ${formatMoney(c.raw)}` 
                    } 
                },
                datalabels: { 
                    display: !config.legendCol, // Ocultar etiquetas si está apilado (se ve sucio)
                    color: '#444', 
                    anchor: 'end', 
                    align: 'top', 
                    offset: -2,
                    font: { weight: 'bold', size: 10 },
                    formatter: (v) => formatMoneyShort(v)
                }
            },
            scales: {
                x: { stacked: stacked, grid: { display: false } },
                y: { stacked: stacked, beginAtZero: true, grid: { borderDash: [2, 4] } }
            }
        }
    });
    activeChartInstances[config.id] = newChart;
}

// --- UTILIDADES ---
function changePage(d) {
    const t = Math.ceil(savedCharts.length / itemsPerPage);
    const n = currentPage + d;
    if(n >= 1 && n <= t) { currentPage = n; renderCurrentPage(); }
}

function delChart(id) {
    if(confirm("¿Eliminar?")) { savedCharts = savedCharts.filter(c => c.id !== id); renderCurrentPage(); }
}

function downloadImg(id) {
    const link = document.createElement('a');
    link.download = 'alephgraf_chart.png';
    link.href = document.getElementById(id).toDataURL('image/png', 2.0);
    link.click();
}

function cleanNumber(v) {
    if(typeof v==='number') return v; if(!v) return 0;
    let s=v.toString().replace(/[^\d.,-]/g,'');
    if(s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g,'').replace(',','.');
    else s = s.replace(/,/g,'');
    return parseFloat(s)||0;
}

function parseDate(d, m) {
    if(!d) return "ND"; let date;
    if(typeof d==='number' && d>20000) date = new Date(Math.round((d-25569)*86400*1000));
    else date = new Date(d);
    if(isNaN(date.getTime())) return d;
    if(m==='year') return date.getFullYear().toString();
    const ms=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${ms[date.getMonth()]} ${date.getFullYear().toString().substr(2)}`;
}

function formatMoney(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL', maximumFractionDigits: 0 }).format(v); }

function formatMoneyShort(v) {
    if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(0) + 'k';
    return v;
}