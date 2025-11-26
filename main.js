/* main.js - Versión Universal (Estudiantes, Estadística, Negocios) */

// --- ESTADO GLOBAL ---
let globalData = [];
let headers = [];
let chartInstances = {};

// --- PAGINACIÓN ---
let savedCharts = []; 
let currentPage = 1;
let itemsPerPage = 4; // Configurable

// Plugins
Chart.register(ChartDataLabels);

// --- NAVEGACIÓN ---
function showView(viewId) {
    ['view-upload', 'view-config', 'view-dashboard'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(`view-${viewId}`).classList.remove('hidden');
    document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
    const navItem = document.getElementById(`nav-${viewId}`);
    if(navItem) navItem.classList.add('active');
}

// --- CARGA DE DATOS ---
document.getElementById('fileInput').addEventListener('change', handleFileSelect);

function handleFileSelect(evt) {
    const file = evt.target.files[0];
    if (!file) return;

    document.getElementById('fileName').innerText = `Archivo: ${file.name}`;
    document.getElementById('status-text').innerText = "Leyendo datos...";

    const reader = new FileReader();
    const handleData = (data) => processData(data);

    if (file.name.endsWith('.csv')) {
        reader.onload = (e) => {
            Papa.parse(e.target.result, {
                header: true, skipEmptyLines: true,
                complete: (results) => handleData(results.data)
            });
        };
        reader.readAsText(file);
    } else {
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
            handleData(jsonData);
        };
        reader.readAsArrayBuffer(file);
    }
}

function processData(data) {
    if (!data || data.length === 0) { alert("Archivo vacío."); return; }
    
    // Normalizar datos (quitar espacios en headers)
    globalData = data.map(row => {
        const newRow = {};
        Object.keys(row).forEach(key => newRow[key.trim()] = row[key]);
        return newRow;
    });

    headers = Object.keys(globalData[0]);
    document.getElementById('status-text').innerText = `Dataset: ${globalData.length} registros`;
    updateConfigForm();
    showView('config');
}

// --- CONFIGURACIÓN UNIVERSAL ---
function updateConfigForm() {
    const type = document.getElementById('analysisType').value;
    const container = document.getElementById('configFields');
    container.innerHTML = '';

    const createSelect = (id, label) => {
        let options = headers.map(h => `<option value="${h}">${h}</option>`).join('');
        return `<div class="form-group"><label>${label}</label><select id="${id}" class="form-control">${options}</select></div>`;
    };

    let html = '';

    // 1. Evolución Temporal (Línea)
    if (type === 'evolution_product') {
        html += createSelect('colDate', 'Columna FECHA / TIEMPO');
        html += createSelect('colProduct', 'Columna CATEGORÍA (Variable a filtrar)');
        html += createSelect('colValue', 'Columna VALOR (Numérico a sumar)');
        html += `<div class="form-group" style="background:#f8fafc; padding:10px; border:1px dashed #cbd5e1;">
                <label style="color:var(--accent);">Filtrar por Específico:</label>
                <button class="btn-neon secondary" style="width:100%; margin-bottom:5px;" onclick="loadUniqueValues('colProduct', 'targetProduct')">🔄 Cargar Lista de Valores</button>
                <select id="targetProduct" class="form-control"><option value="">(Selecciona columna y pulsa cargar)</option></select></div>`;
    }
    // 2. Total Mensual (Barras)
    else if (type === 'total_monthly') {
        html += createSelect('colDate', 'Columna FECHA / TIEMPO');
        html += createSelect('colValue', 'Columna VALOR (Numérico)');
    }
    // 3. Frecuencia (Conteo)
    else if (type === 'frequency_monthly') {
        html += createSelect('colDate', 'Columna FECHA / TIEMPO');
        html += `<p style="font-size:0.8rem; color:#64748b;">Se contarán cuántos registros existen por cada periodo de tiempo.</p>`;
    }
    // 4. Comparativa (Top Vertical)
    else if (type === 'comparison_category') {
        html += createSelect('colProduct', 'Columna CATEGORÍA (Eje X)');
        html += createSelect('colValue', 'Columna VALOR (Eje Y)');
    }
    // 5. Ranking Horizontal
    else if (type === 'top_suppliers') {
        html += createSelect('colSupplier', 'Columna GRUPO / ITEM (Eje Y)');
        html += createSelect('colValue', 'Columna VALOR (Eje X)');
    }
    // 6. Distribución (Dona)
    else if (type === 'distribution_pie') {
        html += createSelect('colCategory', 'Columna CATEGORÍA (Variable)');
        html += createSelect('colValue', 'Columna VALOR (Numérico)');
    }

    html += `<div class="form-group"><label>Título del Gráfico</label><input type="text" id="chartTitle" class="form-control" placeholder="Ej: Resultados Encuesta 2024"></div>`;
    container.innerHTML = html;
}

function loadUniqueValues(sourceId, targetId) {
    const colName = document.getElementById(sourceId).value;
    const selectTarget = document.getElementById(targetId);
    const unique = [...new Set(globalData.map(item => item[colName]))].sort();
    if(unique.length === 0) { alert("Columna vacía."); return; }
    selectTarget.innerHTML = unique.map(u => `<option value="${u}">${u}</option>`).join('');
}

// --- GENERACIÓN DE DATOS ---
function generateChart() {
    const type = document.getElementById('analysisType').value;
    const title = document.getElementById('chartTitle').value || 'Sin Título';
    const isCurrency = document.getElementById('isCurrency').checked; // Checkbox nuevo
    
    let labels = [], dataValues = [], chartType = 'bar', axisIndex = 'x';
    let backgroundColors = null;

    try {
        // Lógica Genérica
        const getVal = (row, col) => cleanNumber(row[col]);
        const getKey = (row, col) => row[col] || "Otros";
        const getDate = (row, col) => parseDateToMonth(row[col]);

        if (type === 'evolution_product') {
            const colDate = document.getElementById('colDate').value;
            const colVal = document.getElementById('colValue').value;
            const colProd = document.getElementById('colProduct').value;
            const target = document.getElementById('targetProduct').value;
            if (!target) { alert("Debes seleccionar un valor específico para filtrar."); return; }

            const filtered = globalData.filter(row => row[colProd] == target);
            const grouped = {};
            filtered.forEach(row => {
                const k = getDate(row, colDate);
                grouped[k] = (grouped[k] || 0) + getVal(row, colVal);
            });
            labels = Object.keys(grouped).sort();
            dataValues = labels.map(k => grouped[k]);
            chartType = 'line';
        }
        else if (type === 'comparison_category') {
            const colProd = document.getElementById('colProduct').value;
            const colVal = document.getElementById('colValue').value;
            const grouped = {};
            globalData.forEach(row => grouped[getKey(row, colProd)] = (grouped[getKey(row, colProd)] || 0) + getVal(row, colVal));
            const sorted = Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,10);
            labels = sorted.map(e=>e[0]); dataValues = sorted.map(e=>e[1]);
        }
        else if (type === 'total_monthly') {
            const colDate = document.getElementById('colDate').value;
            const colVal = document.getElementById('colValue').value;
            const grouped = {};
            globalData.forEach(row => {
                const k = getDate(row, colDate);
                grouped[k] = (grouped[k] || 0) + getVal(row, colVal);
            });
            labels = Object.keys(grouped).sort();
            dataValues = labels.map(k => grouped[k]);
        }
        else if (type === 'frequency_monthly') {
            const colDate = document.getElementById('colDate').value;
            const grouped = {};
            globalData.forEach(row => {
                const k = getDate(row, colDate);
                grouped[k] = (grouped[k] || 0) + 1; // Conteo simple
            });
            labels = Object.keys(grouped).sort();
            dataValues = labels.map(k => grouped[k]);
        }
        else if (type === 'top_suppliers') {
            const colSupp = document.getElementById('colSupplier').value;
            const colVal = document.getElementById('colValue').value;
            const grouped = {};
            globalData.forEach(row => grouped[getKey(row, colSupp)] = (grouped[getKey(row, colSupp)] || 0) + getVal(row, colVal));
            const sorted = Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,10);
            labels = sorted.map(e=>e[0]); dataValues = sorted.map(e=>e[1]);
            axisIndex = 'y';
        }
        else if (type === 'distribution_pie') {
            const colCat = document.getElementById('colCategory').value;
            const colVal = document.getElementById('colValue').value;
            const grouped = {};
            globalData.forEach(row => grouped[getKey(row, colCat)] = (grouped[getKey(row, colCat)] || 0) + getVal(row, colVal));
            let sorted = Object.entries(grouped).sort((a,b)=>b[1]-a[1]);
            if (sorted.length > 8) {
                const top8 = sorted.slice(0,8);
                const others = sorted.slice(8).reduce((acc, curr) => acc + curr[1], 0);
                sorted = [...top8, ['Otros', others]];
            }
            labels = sorted.map(e=>e[0]); dataValues = sorted.map(e=>e[1]);
            chartType = 'doughnut';
            backgroundColors = generatePalette(labels.length);
        }

        if (labels.length === 0) { alert("Sin datos resultantes."); return; }

        const newChartConfig = {
            id: 'chart_' + Date.now() + Math.random(),
            title: title,
            type: chartType,
            labels: labels,
            dataValues: dataValues,
            indexAxis: axisIndex,
            bgColors: backgroundColors,
            isCurrency: isCurrency // Guardamos preferencia de formato
        };

        savedCharts.push(newChartConfig);
        currentPage = Math.ceil(savedCharts.length / itemsPerPage);
        renderCurrentPage();
        showView('dashboard');

    } catch (e) { console.error(e); alert("Error procesando. Revisa los tipos de datos."); }
}

// --- RENDERIZADO VISUAL ---

// Cambiar cantidad por página
function updatePaginationSettings() {
    const val = document.getElementById('itemsPerPageSelect').value;
    itemsPerPage = parseInt(val);
    currentPage = 1;
    renderCurrentPage();
}

function renderCurrentPage() {
    const container = document.getElementById('dashboard-container');
    container.innerHTML = ''; 

    const totalPages = Math.ceil(savedCharts.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * itemsPerPage;
    const chartsToShow = savedCharts.slice(start, start + itemsPerPage);

    chartsToShow.forEach(config => drawChartCard(config));

    document.getElementById('pageIndicator').innerText = `Página ${savedCharts.length===0?0:currentPage} de ${totalPages}`;
    document.getElementById('btnPrevPage').disabled = (currentPage === 1);
    document.getElementById('btnNextPage').disabled = (currentPage === totalPages || totalPages === 0);
    document.getElementById('btnPrevPage').style.opacity = (currentPage === 1) ? '0.5' : '1';
    document.getElementById('btnNextPage').style.opacity = (currentPage === totalPages || totalPages === 0) ? '0.5' : '1';
}

function changePage(d) {
    const total = Math.ceil(savedCharts.length / itemsPerPage);
    const next = currentPage + d;
    if (next >= 1 && next <= total) { currentPage = next; renderCurrentPage(); }
}

function drawChartCard(config) {
    const container = document.getElementById('dashboard-container');
    
    // Filtro zoom fechas
    let controlsHtml = '';
    const isDateData = config.labels[0] && config.labels[0].toString().match(/^\d{4}-\d{2}$/);
    if (isDateData && config.labels.length > 1) {
        controlsHtml = `
            <div class="chart-controls no-print" style="display:flex; gap:10px; margin-bottom:10px; background:#f1f5f9; padding:5px; border-radius:4px;">
                <select class="form-control" style="padding:2px; height:auto; font-size:0.8rem;" onchange="updateChartRange('${config.id}')" id="start_${config.id}">
                    ${config.labels.map((l, i) => `<option value="${i}" ${i===0?'selected':''}>${l}</option>`).join('')}
                </select>
                <span>➜</span>
                <select class="form-control" style="padding:2px; height:auto; font-size:0.8rem;" onchange="updateChartRange('${config.id}')" id="end_${config.id}">
                    ${config.labels.map((l, i) => `<option value="${i}" ${i===config.labels.length-1?'selected':''}>${l}</option>`).join('')}
                </select>
            </div>`;
    }

    const card = document.createElement('div');
    card.className = 'data-card';
    if(itemsPerPage === 1) card.style.height = "600px"; // Más altura si es detalle

    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;">
            <h3 style="color:var(--primary-dark); font-size:0.95rem; font-weight:700;">${config.title}</h3>
            <div>
                <button class="btn-neon secondary" style="padding:2px 6px; font-size:0.7rem; margin-right:5px;" title="Descargar PNG" onclick="downloadChartImage('${config.id}', '${config.title}')">⬇️ PNG</button>
                <button class="btn-neon danger" style="padding:2px 6px; font-size:0.7rem;" onclick="deleteChart('${config.id}')">X</button>
            </div>
        </div>
        ${controlsHtml}
        <div class="chart-wrapper" style="${itemsPerPage===1 ? 'height:500px;' : ''}"><canvas id="${config.id}"></canvas></div>
    `;
    container.appendChild(card);

    const ctx = document.getElementById(config.id).getContext('2d');
    
    // Colores
    let bg, border;
    if (config.type === 'doughnut' || config.type === 'pie') {
        bg = config.bgColors; border = '#ffffff';
    } else if (config.type === 'line') {
        const g = ctx.createLinearGradient(0,0,0,300);
        g.addColorStop(0, 'rgba(6, 182, 212, 0.5)'); g.addColorStop(1, 'rgba(6, 182, 212, 0.0)');
        bg = g; border = '#06b6d4';
    } else {
        bg = '#06b6d4'; border = '#06b6d4';
    }

    const chart = new Chart(ctx, {
        type: config.type,
        data: {
            labels: config.labels,
            datasets: [{
                label: 'Valor',
                data: config.dataValues,
                backgroundColor: bg,
                borderColor: border,
                borderWidth: (config.type==='doughnut')?2:2,
                fill: config.type === 'line',
                tension: 0.3
            }]
        },
        options: {
            indexAxis: config.indexAxis || 'x',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20, right: 20 } },
            plugins: {
                legend: { display: (config.type === 'doughnut') },
                datalabels: {
                    display: true,
                    align: (config.type==='doughnut')?'center':(config.indexAxis==='y'?'end':'end'),
                    anchor: (config.type==='doughnut')?'center':(config.indexAxis==='y'?'end':'end'),
                    color: '#334155', font: { weight: 'bold', size: 10 },
                    formatter: (v) => {
                         // FORMATO INTELIGENTE: Si seleccionó "Es Dinero" usa divisa, si no, usa decimal
                         if (config.isCurrency) {
                            return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 }).format(v);
                         } else {
                            return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(v);
                         }
                    }
                }
            },
            scales: (config.type === 'doughnut') ? {} : {
                y: { beginAtZero: true, grid: {color:'#f1f5f9'} },
                x: { grid: {display:false} }
            }
        }
    });

    chart.originalConfig = config;
    chartInstances[config.id] = chart;
}

window.updateChartRange = function(id) {
    const chart = chartInstances[id];
    if (!chart) return;
    const s = parseInt(document.getElementById(`start_${id}`).value);
    const e = parseInt(document.getElementById(`end_${id}`).value);
    if (s > e) return;
    chart.data.labels = chart.originalConfig.labels.slice(s, e + 1);
    chart.data.datasets[0].data = chart.originalConfig.dataValues.slice(s, e + 1);
    chart.update();
}

function downloadChartImage(id, title) {
    const link = document.createElement('a');
    link.download = title + '.png';
    link.href = document.getElementById(id).toDataURL('image/png', 1.0);
    link.click();
}

function deleteChart(id) {
    if(!confirm("¿Eliminar?")) return;
    savedCharts = savedCharts.filter(c => c.id !== id);
    if(chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
    renderCurrentPage();
}

function printDashboard() { window.print(); }

function cleanNumber(v) {
    if(typeof v==='number') return v;
    if(!v) return 0;
    let s=v.toString().replace(/[^\d.,-]/g,'');
    if(s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g,'').replace(',','.');
    else s = s.replace(/,/g,'');
    return parseFloat(s)||0;
}

function parseDateToMonth(d) {
    if(!d) return "ND";
    let date;
    if(typeof d==='number' && d>20000) date = new Date(Math.round((d-25569)*86400*1000));
    else {
        date = new Date(d);
        if(isNaN(date.getTime()) && typeof d==='string' && d.includes('/')) {
            const p = d.split('/'); if(p.length===3) date = new Date(p[2], p[1]-1, p[0]);
        }
    }
    if(!date || isNaN(date.getTime())) return "Fecha Inv";
    return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}`;
}

function generatePalette(count) {
    const colors = ['#06b6d4', '#0f172a', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444'];
    while (colors.length < count) {
        colors.push('#' + Math.floor(Math.random()*16777215).toString(16));
    }
    return colors.slice(0, count);
}