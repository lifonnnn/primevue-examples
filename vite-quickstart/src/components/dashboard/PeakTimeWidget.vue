<script setup>
import { ref, watch, onMounted, computed } from 'vue';
import { format } from 'date-fns';
import Chart from 'primevue/chart';
// Import Chart.js core and necessary components for registration
import { Chart as ChartJS, registerables } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';

// Register the matrix controller and element with Chart.js
ChartJS.register(MatrixController, MatrixElement, ...registerables);

// Define props
const props = defineProps({
  selectedStore: String,
  dateRange: {
    type: Array,
    required: true,
    validator: (value) => Array.isArray(value) && value.length === 2
  },
  selectedRevenueSource: String
});

// --- State ---
const activityData = ref([]); // Raw data from API
const loading = ref(true);
const error = ref(false);
const errorMessage = ref('');
const selectedMetric = ref('total_sales'); // 'total_sales' or 'order_count'

// --- Constants for Heatmap ---
// Assuming day_of_week from backend is ISO standard (1=Mon, 7=Sun)
const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Define hour range for the heatmap (e.g., 8 AM to 10 PM / 22:00)
const startHour = 8;
const endHour = 22;
const hoursOfDay = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i); // [8, 9, ..., 22]
const hourLabels = hoursOfDay.map(h => `${h % 12 === 0 ? 12 : h % 12}${h < 12 || h === 24 ? ' AM' : ' PM'}`); // Format hour labels

// --- Helper: Date Range Validation ---
const isRangeValid = (range) => {
    return range && range.length === 2 && range[0] && range[1];
};

// --- Fetching Logic ---
const fetchSalesActivity = async (store, range, source) => {
    if (!isRangeValid(range)) {
        console.error("PeakTimeWidget: Invalid date range provided.");
        error.value = true;
        errorMessage.value = 'Invalid Date Range';
        loading.value = false;
        activityData.value = [];
        return;
    }

    loading.value = true;
    error.value = false;
    errorMessage.value = '';

    const startDateFormatted = format(range[0], 'yyyy-MM-dd');
    const endDateFormatted = format(range[1], 'yyyy-MM-dd');

    try {
        const apiUrl = `http://localhost:3001/api/sales-activity?store=${encodeURIComponent(store)}&startDate=${startDateFormatted}&endDate=${endDateFormatted}&source=${encodeURIComponent(source)}`;
        console.log('PeakTimeWidget: Fetching data from:', apiUrl);
        const response = await fetch(apiUrl);

        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: 'Unknown error fetching activity' }));
             throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
        }

        activityData.value = await response.json();
        console.log(`PeakTimeWidget: Received ${activityData.value.length} data points.`);

    } catch (err) {
        console.error("PeakTimeWidget: Failed to fetch sales activity:", err);
        error.value = true;
        errorMessage.value = err.message || 'Failed to load activity data.';
        activityData.value = [];
    } finally {
        loading.value = false;
    }
};

// --- Data Processing for Heatmap Matrix ---
const heatmapMatrix = computed(() => {
    const matrix = [];
    // Initialize matrix with zeros: rows = hours, cols = days
    for (let h = 0; h < hoursOfDay.length; h++) {
        matrix[h] = Array(daysOfWeek.length).fill(0);
    }

    // Populate matrix with data
    activityData.value.forEach(item => {
        // Adjust day_of_week (1-7) to 0-6 index for columns
        const dayIndex = item.day_of_week - 1;
        // Find hour index
        const hourIndex = hoursOfDay.indexOf(item.hour_of_day);

        // Check if dayIndex and hourIndex are valid before assigning
        if (dayIndex >= 0 && dayIndex < daysOfWeek.length && hourIndex >= 0 && hourIndex < hoursOfDay.length) {
            // Use the selected metric (total_sales or order_count)
             matrix[hourIndex][dayIndex] = item[selectedMetric.value] || 0;
        } else {
            // Log unexpected day/hour values if necessary
             // console.warn(`PeakTimeWidget: Ignoring data point with unexpected day (${item.day_of_week}) or hour (${item.hour_of_day})`);
        }
    });

    return matrix;
});


// --- Chart Configuration ---
const chartData = computed(() => {
    if (!activityData.value || activityData.value.length === 0) return null;

    const matrix = heatmapMatrix.value;
     // Find max value for color scaling (optional, Chart.js might handle auto-scaling)
    // const maxValue = matrix.flat().reduce((max, val) => Math.max(max, val), 0);

    // Transform the matrix into the format Chart.js expects for 'matrix' dataset
    // Each data point needs x (day), y (hour), and v (value)
    const dataPoints = [];
    matrix.forEach((row, hourIndex) => {
        row.forEach((value, dayIndex) => {
            dataPoints.push({
                x: daysOfWeek[dayIndex], // Day label
                y: hourLabels[hourIndex], // Hour label
                v: value // The actual metric value
            });
        });
    });

    const documentStyle = getComputedStyle(document.documentElement);
    const primaryColor = documentStyle.getPropertyValue('--p-primary-500') || '#34d399';
    const textColor = documentStyle.getPropertyValue('--p-text-color') || '#495057';
    const mutedColor = documentStyle.getPropertyValue('--p-text-muted-color') || '#6c757d';
    const surfaceBorder = documentStyle.getPropertyValue('--p-surface-border') || '#dee2e6';


    return {
         datasets: [{
            label: selectedMetric.value === 'total_sales' ? 'Total Sales' : 'Order Count',
            data: dataPoints,
            // Configure appearance for matrix dataset
            backgroundColor: function(context) {
                // Example: Simple linear color scale from white to primaryColor
                const value = context.dataset.data[context.dataIndex].v;
                 // Find max value dynamically for better scaling (can be optimized)
                 const maxValue = Math.max(...context.dataset.data.map(d => d.v), 0);
                if (value === 0 || maxValue === 0) return 'rgba(255, 255, 255, 0.1)'; // Use a near-transparent color for zero
                const alpha = Math.max(0.1, Math.min(1, value / maxValue)); // Clamp alpha between 0.1 and 1
                 // Interpolate towards primary color based on value
                // This requires a color library or manual calculation - using alpha for simplicity
                // Replace hexToRgba logic here if needed or use a fixed color with varying alpha
                return hexToRgba(primaryColor, alpha);

            },
             borderColor: surfaceBorder,
             borderWidth: 1,
             width: ({chart}) => (chart.chartArea || {}).width / daysOfWeek.length - 1,
             height: ({chart}) => (chart.chartArea || {}).height / hoursOfDay.length - 1,
         }]
    };
});


const chartOptions = computed(() => {
     const textColor = getComputedStyle(document.documentElement).getPropertyValue('--p-text-color') || '#495057';
     const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--p-text-muted-color') || '#6c757d';
     const surfaceBorder = getComputedStyle(document.documentElement).getPropertyValue('--p-surface-border') || '#dee2e6';
     // Define the color scale function here or ensure it's accessible
     const backgroundColorScale = function(context) {
        const value = context.dataset.data[context.dataIndex]?.v || 0; // Safer access
        const maxValue = Math.max(...context.dataset.data.map(d => d.v), 0);
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--p-primary-500') || '#34d399';
        if (value === 0 || maxValue === 0) return 'rgba(255, 255, 255, 0.1)';
        const alpha = Math.max(0.1, Math.min(1, value / maxValue));
        return hexToRgba(primaryColor, alpha);
     };

    return {
        maintainAspectRatio: false,
        responsive: true,
         plugins: {
            legend: {
                display: false // Legend might be redundant for heatmap
            },
            tooltip: {
                 // Use the functions directly here if they aren't methods
                 callbacks: {
                    title: function(tooltipItems) {
                        const item = tooltipItems[0]?.raw;
                        return item ? `${item.x} ${item.y}` : '';
                    },
                    label: function(context) {
                         const item = context.raw;
                         if (!item) return ''; // Handle cases where item might be undefined
                        const metricLabel = selectedMetric.value === 'total_sales' ? 'Sales' : 'Orders';
                        const value = item.v;
                        const formattedValue = selectedMetric.value === 'total_sales'
                            ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
                            : value;
                        return `${metricLabel}: ${formattedValue}`;
                    }
                }
            },
             // Potentially add datalabels plugin for showing values directly on cells
            // datalabels: { ... }
         },
         scales: {
            y: { // Hours
                type: 'category', // Treat hours as categories
                labels: hourLabels, // Use formatted hour labels
                offset: true,
                 ticks: { color: mutedColor, font: { size: 10 } },
                 grid: { display: false } // Hide grid lines on y-axis
            },
            x: { // Days of Week
                type: 'category',
                labels: daysOfWeek,
                 offset: true,
                 ticks: { color: mutedColor, font: { size: 10 } },
                 grid: { color: surfaceBorder } // Show subtle grid lines for days
            }
        },
         // Ensure backgroundColor is defined and passed correctly
         // If it was part of datasets before, move it here or ensure it's applied correctly.
         // This might not be needed if defined within the dataset itself.
         // backgroundColor: backgroundColorScale, // Example if needed at the top level

         // Aspect Ratio might need adjustment depending on container
         aspectRatio: 1, // Adjust as needed, might cause sizing issues if too rigid
    };
});

// Utility to convert hex to rgba (needed for background color function)
function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(0,0,0,${alpha})`; // Fallback color
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- Lifecycle and Watchers ---
onMounted(() => {
    fetchSalesActivity(props.selectedStore, props.dateRange, props.selectedRevenueSource);
});

watch(() => [props.selectedStore, props.dateRange, props.selectedRevenueSource], ([newStore, newRange, newSource]) => {
    console.log('PeakTimeWidget: Props changed, refetching data...');
    fetchSalesActivity(newStore, newRange, newSource);
}, { deep: true });

</script>

<template>
    <div class="layout-card widget-peak-time col-item-2"> <!-- Assuming col-item-2 for layout -->
        <div class="widget-header">
            <h3 class="widget-title">Sales Activity Heatmap</h3>
             <!-- TODO: Add toggle button for Sales/Orders metric later -->
            <!-- <SelectButton v-model="selectedMetric" :options="[{label: 'Sales', value: 'total_sales'}, {label: 'Orders', value: 'order_count'}]" optionLabel="label" optionValue="value" /> -->
        </div>
        <div class="widget-content">
            <div v-if="loading" class="loading-indicator">
                 Loading Activity Data...
            </div>
            <div v-else-if="error" class="error-message">
                Error loading activity data: {{ errorMessage }}
            </div>
             <div v-else-if="!chartData" class="no-data-message">
                No activity data available for the selected period.
             </div>
            <div v-else class="chart-container">
                 <Chart
                     type="matrix"
                     :data="chartData"
                     :options="chartOptions"
                     class="chart-canvas"
                 />
                 <!-- Fallback message if matrix chart fails -->
                 <!-- <div v-else>Matrix chart type might require additional setup or is not supported by the current Chart.js version integrated with PrimeVue.</div> -->
            </div>
        </div>
    </div>
</template>

<style scoped>
.widget-peak-time {
     min-height: 550px; /* Increased min height */
     display: flex;
     flex-direction: column;
     width: 100%; /* Explicitly set width to 100% */
}

.widget-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.widget-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.widget-content {
    flex-grow: 1;
    position: relative;
}

.chart-container {
  position: relative;
  height: 500px; /* Increased height */
  width: 100%;
}

.chart-canvas {
  width: 100% !important;
  height: 100% !important;
}

.loading-indicator,
.error-message,
.no-data-message {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    min-height: 150px;
    text-align: center;
    color: var(--p-text-muted-color);
}

.error-message {
    color: var(--p-red-500);
}
</style> 