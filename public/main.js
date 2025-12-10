// public/main.js
const socket = io();

// Chart.js setup
const ctx = document.getElementById('chart').getContext('2d');
const chartData = {
  labels: [],
  datasets: [
    {
      label: 'Temperature (°C)',
      data: [],
      yAxisID: 'y',
      tension: 0.2,
      pointRadius: 2
    },
    {
      label: 'Humidity (%)',
      data: [],
      yAxisID: 'y1',
      tension: 0.2,
      pointRadius: 2
    }
  ]
};
const config = {
  type: 'line',
  data: chartData,
  options: {
    animation: false,
    responsive: true,
    scales: {
      x: {
        type: 'time',
        time: { parser: 'YYYY-MM-DD HH:mm:ss', tooltipFormat: 'YYYY-MM-DD HH:mm:ss', unit: 'minute' }
      },
      y: {
        type: 'linear',
        position: 'left',
        title: { display: true, text: 'Temperature (°C)' }
      },
      y1: {
        type: 'linear',
        position: 'right',
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'Humidity (%)' }
      }
    },
    plugins: {
      legend: { position: 'top' }
    }
  }
};
const myChart = new Chart(ctx, config);

// utility to format time
function fmt(ts) {
  const d = new Date(ts + 'Z'); // ensure UTC parse
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

function addRow(reading) {
  const tbody = document.getElementById('tableBody');
  const tr = document.createElement('tr');
  const timeTd = document.createElement('td');
  const tempTd = document.createElement('td');
  const humTd = document.createElement('td');

  timeTd.textContent = reading.created_at;
  tempTd.textContent = reading.temperature.toFixed(2);
  humTd.textContent = reading.humidity.toFixed(2);

  tr.appendChild(timeTd);
  tr.appendChild(tempTd);
  tr.appendChild(humTd);

  // insert at top
  if (tbody.firstChild) tbody.insertBefore(tr, tbody.firstChild);
  else tbody.appendChild(tr);

  // keep only last 200 rows
  while (tbody.childElementCount > 200) tbody.removeChild(tbody.lastChild);
}

function pushChart(reading) {
  const ts = reading.created_at;
  chartData.labels.push(ts);
  chartData.datasets[0].data.push({ x: ts, y: reading.temperature });
  chartData.datasets[1].data.push({ x: ts, y: reading.humidity });

  // keep last 200 points
  if (chartData.labels.length > 200) {
    chartData.labels.shift();
    chartData.datasets.forEach(ds => ds.data.shift());
  }

  myChart.update('none');
}

function updateLast(reading) {
  const lastDiv = document.getElementById('lastReading');
  lastDiv.innerHTML = `Temp: <strong>${reading.temperature.toFixed(2)} °C</strong> • Humidity: <strong>${reading.humidity.toFixed(2)} %</strong><br><small>${reading.created_at}</small>`;
}

// Socket events
socket.on('connect', () => {
  document.getElementById('status').textContent = 'Connected';
  document.getElementById('status').style.background = '#b6f7c6';
});

socket.on('disconnect', () => {
  document.getElementById('status').textContent = 'Disconnected';
  document.getElementById('status').style.background = '#eee';
});

socket.on('init', (rows) => {
  // rows are oldest-first
  rows.forEach(r => {
    addRow(r);
    pushChart(r);
  });
  if (rows.length) {
    updateLast(rows[rows.length - 1]);
  }
});

socket.on('reading', (r) => {
  addRow(r);
  pushChart(r);
  updateLast(r);
});
