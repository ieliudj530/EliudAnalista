/* main.js - AlephGraf Pro v5.5 (Final Full Version) */

// --- 1. VARIABLES GLOBALES ---
let globalData = [];
let headers = [];
let pivotData = null;
let savedCharts = [];
let currentPage = 1;
let itemsPerPage = 4;
let activeChartInstances = {};

// --- 2. CONFIGURACIÓN DE GRÁFICOS (Chart.js) ---
Chart.register(ChartDataLabels);

// Estilo de Fuente Global (Windows/Office style)
Chart.defaults.font.family = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
Chart.defaults.color = '#555';
Chart.defaults.scale.grid.color = '#f0f0f0';

// Paleta de Colores para Series (Gris Azulado, Oro, Rojo, Verde, etc.)
const seriesPalette = [
    '#2c3e50', // Gris Oscuro (Principal)
    '#f39c12', // Amarillo Oro (Tu Marca)
    '#c0392b', // Rojo Ladrillo
    '#27ae60', // Verde Bosque
    '#8e44ad', // Violeta
    '#2980b9', // Azul
    '#d35400', // Naranja
    '#7f8c8d'  // Gris
];

// --- 3. NAVEGACIÓN Y MENÚ ---

function showView(viewId) {
    // Ocultar todas las vistas
    const views = ['view-upload', 'view-studio', 'view-dashboard'];
    views.forEach(id => {
        document.getElementById(id).classList.add('d-none');
    });

    // Mostrar la vista seleccionada
    document.getElementById(`view-${viewId}`).classList.remove('d-none');
    
    // Actualizar el menú lateral (PC)
    document.querySelectorAll('.list-group-item').forEach(li => {
        li.classList.remove('active');
    });
    
    const navItem = document.getElementById('nav-' + viewId.replace('view-', ''));
    if (navItem) {
        navItem.classList.add('active');
    }
}

// Función para abrir/cerrar menú en móvil
function toggleMenu() {
    const wrapper = document.getElementById("wrapper");
    wrapper.classList.toggle("toggled");
}

// Función para cerrar menú automáticamente al hacer clic (UX Móvil)
function toggleMenuMobile() {
    if (window.innerWidth < 768) {
        document.getElementById("wrapper").classList.remove("toggled");
    }
}

// --- 4. CARGA DE DATOS ---

document.getElementById('fileInput').addEventListener('change', (evt) => {
    const file = evt.target.files[0];
    if (!file) return;

    document.getElementById('fileName').innerText = file.name;
    updateStatus('Procesando datos...', 'warning');

    const reader = new FileReader();
    
    // Procesador central
    const done = (data) => processData(data);

    if (file.name.endsWith('.csv')) {
        reader.onload = (e) => {
            Papa.parse(e.target.result, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => done(results.data)
            });
        };
        reader.readAsText(file);
    } else {
        reader.onload = (e) => {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
            done(json);
        };
        reader.readAsArrayBuffer(file);
    }
});

function processData(data) {
    if (!data || data.length === 0) {
        alert("El archivo parece estar vacío.");
        return;
    }

    // Limpiar claves (quitar espacios en nombres de columnas)
    globalData = data.map(row => {
        const newRow = {};
        Object.keys(row).forEach(key => {
            newRow[key.trim()] = row[key];
        });
        return newRow;
    });

    headers = Object.keys(globalData[0]);
    updateStatus('Datos Conectados', 'success');
    
    initStudioControls();
    showView('studio');
}

function updateStatus(msg, type) {
    const el = document.getElementById('status-text');
    const icon = document.getElementById('status-icon');
    el.innerText = msg;
    // Amarillo para éxito, gris para espera
    icon.style.color = (type === 'success') ? '#ffc107' : '#666';
}

// --- 5. LÓGICA DEL STUDIO (Controles) ---

function initStudioControls() {
    const fillSelect = (id) => {
        const sel = document.getElementById(id);
        const isOptional = (id === 'filterCol' || id === 'legendCol');
        sel.innerHTML = isOptional ? '<option value="">(Ninguno)</option>' : '';
        
        headers.forEach(h => {
            sel.innerHTML += `<option value="${h}">${h}</option>`;
        });
    };

    fillSelect('filterCol');
    fillSelect('groupCol');
    fillSelect('legendCol');
    fillSelect('valueCol');
    
    document.getElementById('preview-area').classList.add('d-none');
}

function loadFilterValues() {
    const col = document.getElementById('filterCol').value;
    const valSel = document.getElementById('filterVal');
    valSel.innerHTML = '<option value="">(Todo)</option>';
    
    if (!col) return;

    // Detectar valores únicos para llenar el filtro
    const uniqueValues = [...new Set(globalData.map(r => r[col]))].sort();
    
    uniqueValues.forEach(val => {
        valSel.innerHTML += `<option value="${val}">${val}</option>`;
    });
}

function resetStudio() {
    document.getElementById('filterCol').value = "";
    document.getElementById('legendCol').value = "";
    document.getElementById('filterVal').innerHTML = '<option value="">(Todo)</option>';
    document.getElementById('preview-area').classList.add('d-none');
}

// --- 6. MOTOR MATEMÁTICO (Pivot / Matriz) ---

function calculateMatrix(config, overrideFilterVal = null) {
    let dataset = globalData;
    
    // 1. APLICAR FILTRO
    const activeFilterVal = overrideFilterVal !== null ? overrideFilterVal : config.filterVal;

    if (config.filterCol && activeFilterVal && activeFilterVal !== "") {
        dataset = dataset.filter(row => {
            const rowVal = row[config.filterCol];
            // Lógica especial para fechas YYYY-MM
            if (typeof activeFilterVal === 'string' && activeFilterVal.match(/^\d{4}-\d{2}$/)) {
                return parseDate(rowVal, 'iso') === activeFilterVal;
            }
            return rowVal == activeFilterVal;
        });
    }

    // 2. AGRUPAR DATOS
    const grouped = {}; 
    const legendsSet = new Set();
    const rowTotals = {}; // Usado para ordenar de mayor a menor

    dataset.forEach(row => {
        // Eje X (Filas)
        let rowKey = row[config.groupCol] || "ND";
        if (config.dateMode === 'month') rowKey = parseDate(row[config.groupCol], 'month');
        if (config.dateMode === 'year') rowKey = parseDate(row[config.groupCol], 'year');

        // Leyenda (Columnas/Series)
        let legendKey = config.legendCol ? (row[config.legendCol] || "ND") : "Total";
        legendsSet.add(legendKey);

        // Valor Numérico
        let val = (config.operation === 'count') ? 1 : cleanNumber(row[config.valueCol]);

        // Inicializar estructura
        if (!grouped[rowKey]) grouped[rowKey] = {};
        if (!grouped[rowKey][legendKey]) grouped[rowKey][legendKey] = 0;
        
        // Sumar
        grouped[rowKey][legendKey] += val;
        
        // Acumular total de fila para ordenamiento
        rowTotals[rowKey] = (rowTotals[rowKey] || 0) + val;
    });

    // 3. ORDENAR EJE X
    const labels = Object.keys(grouped);
    if (config.dateMode !== 'none') {
        labels.sort(); // Cronológico si es fecha
    } else {
        labels.sort((a, b) => rowTotals[b] - rowTotals[a]); // Mayor a menor si es texto
    }

    // 4. PREPARAR SERIES
    const legends = Array.from(legendsSet).sort();
    
    const datasets = legends.map((legend, i) => {
        const data = labels.map(label => {
            return grouped[label][legend] || 0;
        });
        
        // Color: Si hay leyenda usa paleta variada, si no usa el color corporativo oscuro
        let color = config.legendCol ? seriesPalette[i % seriesPalette.length] : '#2c3e50';
        
        return {
            label: legend,
            data: data,
            backgroundColor: color,
            borderColor: '#ffffff',
            borderWidth: config.legendCol ? 1 : 0
        };
    });

    return { labels, datasets, legends, grouped };
}

// --- 7. VISTA PREVIA Y GUARDADO ---

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

function calculatePreview() {
    const config = getConfigFromUI();
    
    if (!config.groupCol || !config.valueCol) {
        alert("Error: Debes seleccionar al menos el Eje X y la Columna de Valor.");
        return;
    }
    
    pivotData = calculateMatrix(config);
    renderPreviewTable(pivotData);
}

function renderPreviewTable(data) {
    const thead = document.querySelector('#previewTable thead');
    const tbody = document.querySelector('#previewTable tbody');
    tbody.innerHTML = '';
    
    // Encabezados
    let headHtml = `<tr><th>${document.getElementById('groupCol').value}</th>`;
    data.legends.forEach(l => headHtml += `<th class="text-end">${l}</th>`);
    headHtml += '</tr>';
    thead.innerHTML = headHtml;

    // Cuerpo (Primeras 8 filas para no saturar)
    data.labels.slice(0, 8).forEach(label => {
        let rowHtml = `<tr><td>${label}</td>`;
        data.legends.forEach(legend => {
            const val = data.grouped[label][legend] || 0;
            rowHtml += `<td class="text-end">${formatMoney(val)}</td>`;
        });
        rowHtml += '</tr>';
        tbody.innerHTML += rowHtml;
    });
    
    // Aviso si hay más datos
    if (data.labels.length > 8) {
        const colSpan = data.legends.length + 1;
        tbody.innerHTML += `<tr><td colspan="${colSpan}" class="text-center small text-muted">... y ${data.labels.length - 8} filas más ...</td></tr>`;
    }

    document.getElementById('preview-area').classList.remove('d-none');
}

function saveToDashboard() {
    const config = getConfigFromUI();
    config.id = 'chart_' + Date.now();
    config.title = document.getElementById('chartTitle').value || 'Análisis Nuevo';
    config.chartType = document.getElementById('chartType').value;

    savedCharts.push(config);
    
    // Ir a la última página
    currentPage = Math.ceil(savedCharts.length / itemsPerPage);
    renderCurrentPage();
    showView('dashboard');
}

// --- 8. DASHBOARD INTERACTIVO ---

function updatePaginationSettings() {
    itemsPerPage = parseInt(document.getElementById('itemsPerPageSelect').value);
    currentPage = 1;
    renderCurrentPage();
}

function renderCurrentPage() {
    const container = document.getElementById('dashboard-container');
    container.innerHTML = '';
    
    const totalPages = Math.ceil(savedCharts.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    
    savedCharts.slice(start, end).forEach(config => {
        createChartCard(config, container);
    });

    document.getElementById('pageIndicator').innerText = `Pág ${currentPage}`;
}

function createChartCard(config, container) {
    const colClass = itemsPerPage === 1 ? 'col-12' : 'col-md-6';
    const height = itemsPerPage === 1 ? '500px' : '320px';

    // Generar Dropdown de Filtro Interactivo (Si aplica)
    let filterHtml = '';
    if (config.filterCol) {
        // Buscar un valor de muestra para saber si es fecha
        const sampleVal = globalData.find(r => r[config.filterCol])?.[config.filterCol];
        const isDate = isDateColumn(sampleVal);
        
        let uniqueVals;
        if (isDate) {
            uniqueVals = [...new Set(globalData.map(r => parseDate(r[config.filterCol], 'iso')))].sort();
        } else {
            uniqueVals = [...new Set(globalData.map(r => r[config.filterCol]))].sort();
        }
        
        const options = uniqueVals.map(v => 
            `<option value="${v}" ${v == config.filterVal ? 'selected' : ''}>${v}</option>`
        ).join('');
        
        filterHtml = `
            <div class="mt-2 no-print">
                <label class="small text-muted mb-0">Filtrar ${config.filterCol}:</label>
                <select class="form-select form-select-sm" onchange="updateLiveChart('${config.id}', this.value)">
                    <option value="">(Todo)</option>
                    ${options}
                </select>
            </div>`;
    }

    const html = `
    <div class="${colClass}">
        <div class="card h-100 shadow-sm">
            <div class="card-header bg-white d-flex justify-content-between py-2 align-items-center">
                <h6 class="mb-0 fw-bold text-truncate" title="${config.title}" style="color:#2c3e50;">${config.title}</h6>
                
                <div class="dropdown no-print">
                    <button class="btn btn-sm btn-link text-muted p-0" data-bs-toggle="dropdown">
                        <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                        <li><a class="dropdown-item small" href="#" onclick="downloadImg('${config.id}')"><i class="bi bi-download me-2"></i>Descargar PNG</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item small text-danger" href="#" onclick="delChart('${config.id}')"><i class="bi bi-trash me-2"></i>Eliminar</a></li>
                    </ul>
                </div>
            </div>
            <div class="card-body d-flex flex-column">
                <div class="flex-grow-1" style="height:${height}; position:relative">
                    <canvas id="${config.id}"></canvas>
                </div>
                ${filterHtml}
            </div>
        </div>
    </div>`;
    
    container.innerHTML += html;
    
    // Dibujar con delay para asegurar que el HTML existe
    setTimeout(() => {
        const data = calculateMatrix(config);
        drawChart(config, data);
    }, 50);
}

// Función global para actualizar desde el dropdown
window.updateLiveChart = function(id, val) {
    const config = savedCharts.find(c => c.id === id);
    if (!config) return;
    
    const data = calculateMatrix(config, val);
    drawChart(config, data);
};

// --- 9. DIBUJADO DE GRÁFICO (Chart.js) ---

function drawChart(config, data) {
    const ctx = document.getElementById(config.id).getContext('2d');
    
    // Limpieza de memoria
    if (activeChartInstances[config.id]) {
        activeChartInstances[config.id].destroy();
    }

    let type = config.chartType === 'horizontalBar' ? 'bar' : config.chartType;
    let indexAxis = config.chartType === 'horizontalBar' ? 'y' : 'x';
    // Apilar si hay leyenda y es de barras
    let stacked = (config.legendCol && type === 'bar');

    const newChart = new Chart(ctx, {
        type: type,
        data: {
            labels: data.labels,
            datasets: data.datasets
        },
        options: {
            indexAxis: indexAxis,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    display: true,
                    labels: { usePointStyle: true, boxWidth: 8 }
                },
                tooltip: {
                    callbacks: {
                        label: (c) => ` ${c.dataset.label}: ${formatMoney(c.raw)}`
                    }
                },
                datalabels: {
                    // Ocultar etiquetas si está apilado para evitar ruido visual
                    display: !config.legendCol && type !== 'line',
                    color: '#444',
                    anchor: 'end',
                    align: 'top',
                    offset: -2,
                    font: { weight: 'bold', size: 10 },
                    formatter: (v) => formatMoneyShort(v)
                }
            },
            scales: {
                x: {
                    stacked: stacked,
                    grid: { display: false }
                },
                y: {
                    stacked: stacked,
                    beginAtZero: true,
                    grid: { borderDash: [2, 4] }
                }
            }
        }
    });

    activeChartInstances[config.id] = newChart;
}

// --- 10. UTILIDADES Y FORMATO ---

function changePage(direction) {
    const totalPages = Math.ceil(savedCharts.length / itemsPerPage);
    const nextPage = currentPage + direction;
    if (nextPage >= 1 && nextPage <= totalPages) {
        currentPage = nextPage;
        renderCurrentPage();
    }
}

function delChart(id) {
    if (confirm("¿Estás seguro de eliminar este análisis?")) {
        savedCharts = savedCharts.filter(c => c.id !== id);
        renderCurrentPage();
    }
}

function downloadImg(id) {
    const link = document.createElement('a');
    link.download = 'alephgraf_chart.png';
    link.href = document.getElementById(id).toDataURL('image/png', 2.0);
    link.click();
}

function cleanNumber(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    
    // Limpieza de moneda ($ 1.200,00 -> 1200.00)
    let s = val.toString().replace(/[^\d.,-]/g, '');
    
    // Detectar formato latino (punto miles, coma decimal)
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else {
        s = s.replace(/,/g, '');
    }
    return parseFloat(s) || 0;
}

function isDateColumn(val) {
    if (!val) return false;
    // Excel número serial
    if (typeof val === 'number' && val > 20000) return true;
    // Texto con separadores
    if (typeof val === 'string' && (val.includes('/') || val.includes('-')) && !isNaN(Date.parse(val))) return true;
    return false;
}

function parseDate(val, mode) {
    if (!val) return "ND";
    let date;
    
    // Caso Excel Serial
    if (typeof val === 'number' && val > 20000) {
        date = new Date(Math.round((val - 25569) * 86400 * 1000));
    } else {
        date = new Date(val);
        // Fix Latam DD/MM/YYYY
        if (isNaN(date.getTime()) && typeof val === 'string' && val.includes('/')) {
            const p = val.split('/');
            if (p.length === 3) date = new Date(p[2], p[1] - 1, p[0]);
        }
    }

    if (!date || isNaN(date.getTime())) return val;

    // Retornos según modo
    if (mode === 'year') return date.getFullYear().toString();
    if (mode === 'iso') {
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    }
    
    // Formato visual (Ene 24)
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${months[date.getMonth()]} ${date.getFullYear().toString().substr(2)}`;
}

function formatMoney(val) {
    return new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL', 
        maximumFractionDigits: 0 
    }).format(val);
}

function formatMoneyShort(val) {
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
    return val;
}

// --- 11. INICIALIZACIÓN MÓVIL ROBUSTA ---
document.addEventListener('DOMContentLoaded', () => {
    // Vincular botón menú
    const menuBtn = document.getElementById('menu-toggle');
    if (menuBtn) {
        menuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleMenu();
        });
    }
});