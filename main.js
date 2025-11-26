/* main.js - Versión BI Completa (6 Tipos de Análisis) */

// --- ESTADO GLOBAL ---
let globalData = [];
let headers = [];
let chartInstances = {};

// --- ESTADO DE PAGINACIÓN ---
let savedCharts = []; 
let currentPage = 1;
const itemsPerPage = 4;

// Activamos plugins
Chart.register(ChartDataLabels);

// --- NAVEGACIÓN ---
function showView(viewId) {
    ['view-upload', 'view-config', 'view-dashboard'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(`view-${viewId}`).classList.remove('hidden');
    // Actualizar menú
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
    document.getElementById('status-text').innerText = "Procesando...";

    const reader = new FileReader();
    if (file.name.endsWith('.csv')) {
        reader.onload = (e) => {
            Papa.parse(e.target.result, {
                header: true, skipEmptyLines: true,
                complete: (results) => processData(results.data)
            });
        };
        reader.readAsText(file);
    } else {
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
            processData(jsonData);
        };
        reader.readAsArrayBuffer(file);
    }
}

function processData(data) {
    if (!data || data.length === 0) { alert("Archivo vacío."); return; }
    
    globalData = data.map(row => {
        const newRow = {};
        Object.keys(row).forEach(key => newRow[key.trim()] = row[key]);
        return newRow;
    });

    headers = Object.keys(globalData[0]);
    document.getElementById('status-text').innerText = `Datos: ${globalData.length} filas`;
    updateConfigForm();
    showView('config');
}

// --- CONFIGURACIÓN DE FORMULARIO (WIZARD) ---
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
        html += createSelect('colDate', 'Columna FECHA');
        html += createSelect('colProduct', 'Columna PRODUCTO');
        html += createSelect('colValue', 'Columna VALOR (Dinero)');
        html += `<div class="form-group" style="background:#f8fafc; padding:10px; border:1px dashed #cbd5e1;">
                <label style="color:var(--accent);">Filtro Producto</label>
                <button class="btn-neon secondary" style="width:100%; margin-bottom:5px;" onclick="loadUniqueValues('colProduct', 'targetProduct')">🔄 Cargar Lista</button>
                <select id="targetProduct" class="form-control"><option value="">(Esperar carga...)</option></select></div>`;
    }
    // 2. Total Mensual (Barras)
    else if (type === 'total_monthly') {
        html += createSelect('colDate', 'Columna FECHA');
        html += createSelect('colValue', 'Columna VALOR (Dinero)');
    }
    // 3. Frecuencia de Compra (Línea/Barras)
    else if (type === 'frequency_monthly') {
        html += createSelect('colDate', 'Columna FECHA');
        html += `<p style="font-size:0.8rem; color:#64748b;">Contaremos cuántas transacciones se hicieron por mes.</p>`;
    }
    // 4. Comparativa Productos (Barras Verticales)
    else if (type === 'comparison_category') {
        html += createSelect('colProduct', 'Columna PRODUCTO');
        html += createSelect('colValue', 'Columna VALOR');
    }
    // 5. Top Proveedores (Barras Horizontales)
    else if (type === 'top_suppliers') {
        html += createSelect('colSupplier', 'Columna PROVEEDOR');
        html += createSelect('colValue', 'Columna VALOR');
    }
    // 6. Distribución (Dona)
    else if (type === 'distribution_pie') {
        html += createSelect('colCategory', 'Columna CATEGORÍA / TIPO');
        html += createSelect('colValue', 'Columna VALOR');
    }

    html += `<div class="form-group"><label>Título del Gráfico</label><input type="text" id="chartTitle" class="form-control" placeholder="Ej: Análisis de Compras"></div>`;
    container.innerHTML = html;
}

// Carga valores únicos para filtros
function loadUniqueValues(sourceId, targetId) {
    const colName = document.getElementById(sourceId).value;
    const selectTarget = document.getElementById(targetId);
    const unique = [...new Set(globalData.map(item => item[colName]))].sort();
    if(unique.length === 0) { alert("Sin datos."); return; }
    selectTarget.innerHTML = unique.map(u => `<option value="${u}">${u}</option>`).join('');
}

// --- GENERACIÓN DE DATOS (LÓGICA MATEMÁTICA) ---
function generateChart() {
    const type = document.getElementById('analysisType').value;
    const title = document.getElementById('chartTitle').value || 'Sin Título';
    
    let labels = [], dataValues = [], chartType = 'bar', axisIndex = 'x';
    let backgroundColors = null; // Para Pie/Dona

    try {
        // Lógica 1: Evolución Producto
        if (type === 'evolution_product') {
            const colDate = document.getElementById('colDate').value;
            const colVal = document.getElementById('colValue').value;
            const colProd = document.getElementById('colProduct').value;
            const target = document.getElementById('targetProduct').value;
            if (!target) { alert("Elige un producto."); return; }

            const filtered = globalData.filter(row => row[colProd] == target);
            const grouped = {};
            filtered.forEach(row => {
                const k = parseDateToMonth(row[colDate]);
                grouped[k] = (grouped[k] || 0) + cleanNumber(row[colVal]);
            });
            const keys = Object.keys(grouped).sort();
            labels = keys; dataValues = keys.map(k => grouped[k]);
            chartType = 'line';
        }
        // Lógica 2: Comparativa (Top 10)
        else if (type === 'comparison_category') {
            const colProd = document.getElementById('colProduct').value;
            const colVal = document.getElementById('colValue').value;
            const grouped = {};
            globalData.forEach(row => {
                const k = row[colProd] || "Otros";
                grouped[k] = (grouped[k] || 0) + cleanNumber(row[colVal]);
            });
            // Top 10 Mayor a Menor
            const sorted = Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,10);
            labels = sorted.map(e=>e[0]); dataValues = sorted.map(e=>e[1]);
        }
        // Lógica 3: Total Mensual
        else if (type === 'total_monthly') {
            const colDate = document.getElementById('colDate').value;
            const colVal = document.getElementById('colValue').value;
            const grouped = {};
            globalData.forEach(row => {
                const k = parseDateToMonth(row[colDate]);
                grouped[k] = (grouped[k] || 0) + cleanNumber(row[colVal]);
            });
            const keys = Object.keys(grouped).sort();
            labels = keys; dataValues = keys.map(k => grouped[k]);
        }
        // Lógica 4: Frecuencia (Conteo)
        else if (type === 'frequency_monthly') {
            const colDate = document.getElementById('colDate').value;
            const grouped = {};
            globalData.forEach(row => {
                const k = parseDateToMonth(row[colDate]);
                grouped[k] = (grouped[k] || 0) + 1; // Sumamos 1 por cada fila
            });
            const keys = Object.keys(grouped).sort();
            labels = keys; dataValues = keys.map(k => grouped[k]);
            chartType = 'bar'; // Puede ser línea también
        }
        // Lógica 5: Top Proveedores (Horizontal)
        else if (type === 'top_suppliers') {
            const colSupp = document.getElementById('colSupplier').value;
            const colVal = document.getElementById('colValue').value;
            const grouped = {};
            globalData.forEach(row => {
                const k = row[colSupp] || "Desconocido";
                grouped[k] = (grouped[k] || 0) + cleanNumber(row[colVal]);
            });
            const sorted = Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,10);
            labels = sorted.map(e=>e[0]); dataValues = sorted.map(e=>e[1]);
            axisIndex = 'y'; // Barras Horizontales
        }
        // Lógica 6: Distribución (Dona)
        else if (type === 'distribution_pie') {
            const colCat = document.getElementById('colCategory').value;
            const colVal = document.getElementById('colValue').value;
            const grouped = {};
            globalData.forEach(row => {
                const k = row[colCat] || "Otros";
                grouped[k] = (grouped[k] || 0) + cleanNumber(row[colVal]);
            });
            // Top 8 + Otros (Para que la dona no explote de secciones)
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

        // Guardar configuración
        const newChartConfig = {
            id: 'chart_' + Date.now() + Math.random(),
            title: title,
            type: chartType,
            labels: labels,
            dataValues: dataValues,
            indexAxis: axisIndex,
            bgColors: backgroundColors // Guardamos colores si es dona
        };

        savedCharts.push(newChartConfig);
        currentPage = Math.ceil(savedCharts.length / itemsPerPage);
        renderCurrentPage();
        showView('dashboard');

    } catch (e) { console.error(e); alert("Error procesando datos."); }
}

// --- RENDERIZADO VISUAL ---
function renderCurrentPage() {
    const container = document.getElementById('dashboard-container');
    container.innerHTML = ''; 

    const totalPages = Math.ceil(savedCharts.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * itemsPerPage;
    const chartsToShow = savedCharts.slice(start, start + itemsPerPage);

    chartsToShow.forEach(config => drawChartCard(config));

    // Controles Paginación
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
    
    // Filtro zoom solo para fechas
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
    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
            <h3 style="color:var(--primary-dark); font-size:0.95rem; font-weight:700;">${config.title}</h3>
            <button class="btn-neon danger" style="padding:2px 6px; font-size:0.7rem;" onclick="deleteChart('${config.id}')">X</button>
        </div>
        ${controlsHtml}
        <div class="chart-wrapper"><canvas id="${config.id}"></canvas></div>
    `;
    container.appendChild(card);

    const ctx = document.getElementById(config.id).getContext('2d');
    
    // Determinar colores
    let bg, border;
    if (config.type === 'doughnut' || config.type === 'pie') {
        bg = config.bgColors;
        border = '#ffffff';
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
            indexAxis: config.indexAxis || 'x', // Soporte para barras horizontales
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20, right: 20 } },
            plugins: {
                legend: { display: (config.type === 'doughnut') }, // Solo mostrar leyenda en dona
                datalabels: {
                    display: true,
                    align: (config.type==='doughnut')?'center':(config.indexAxis==='y'?'end':'end'),
                    anchor: (config.type==='doughnut')?'center':(config.indexAxis==='y'?'end':'end'),
                    color: '#334155', font: { weight: 'bold', size: 10 },
                    formatter: (v) => {
                         // Formato condicional: Si es entero pequeño (frecuencia) sin decimales, si es dinero con símbolo
                         if (v < 1000 && v % 1 === 0 && config.title.includes('Frecuencia')) return v; 
                         return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 }).format(v);
                    }
                }
            },
            scales: (config.type === 'doughnut') ? {} : { // Dona no tiene ejes
                y: { beginAtZero: true, grid: {color:'#f1f5f9'} },
                x: { grid: {display:false} }
            }
        }
    });

    chart.originalConfig = config;
    chartInstances[config.id] = chart;
}

// Actualizar rango (Zoom)
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

// Eliminar
function deleteChart(id) {
    if(!confirm("¿Eliminar?")) return;
    savedCharts = savedCharts.filter(c => c.id !== id);
    if(chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
    renderCurrentPage();
}

function printDashboard() { window.print(); }

// Utils & Helpers
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
// Generador de colores neón para el gráfico de dona
function generatePalette(count) {
    const colors = ['#06b6d4', '#0f172a', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444'];
    while (colors.length < count) {
        colors.push('#' + Math.floor(Math.random()*16777215).toString(16)); // Random si faltan
    }
    return colors.slice(0, count);
}