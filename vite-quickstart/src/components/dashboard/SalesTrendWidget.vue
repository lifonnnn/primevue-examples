<script setup>
import { ref, watch, computed, onMounted } from 'vue';
import { format } from 'date-fns';
import Chart from 'primevue/chart';
import ChartDataLabels from 'chartjs-plugin-datalabels';

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
const trendData = ref([]); // Stores the raw { date, sales } array
const loading = ref(true);
const error = ref(false);
const errorMessage = ref('');

// --- Helper: Date Range Validation ---
const isRangeValid = (range) => {
    return range && range.length === 2 && range[0] && range[1];
};

// --- Fetching Logic ---
const fetchSalesTrend = async (store, range, source) => {
    if (!isRangeValid(range)) {
        console.error("SalesTrendWidget: Invalid date range provided.");
        error.value = true;
        errorMessage.value = 'Invalid Date Range';
        loading.value = false;
        trendData.value = []; // Clear old data
        return;
    }

    loading.value = true;
    error.value = false;
    errorMessage.value = '';

    const startDateFormatted = format(range[0], 'yyyy-MM-dd');
    const endDateFormatted = format(range[1], 'yyyy-MM-dd');

    try {
        const apiUrl = `http://localhost:3001/api/sales-trend?store=${encodeURIComponent(store)}&startDate=${startDateFormatted}&endDate=${endDateFormatted}&source=${encodeURIComponent(source)}`;
        console.log('SalesTrendWidget: Fetching data from:', apiUrl);
        const response = await fetch(apiUrl);

        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: 'Unknown error fetching trend' })); // Try to get error details
             throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();
        trendData.value = data;
        console.log(`SalesTrendWidget: Received ${data.length} data points.`);

    } catch (err) {
        console.error("SalesTrendWidget: Failed to fetch sales trend:", err);
        error.value = true;
        errorMessage.value = err.message || 'Failed to load trend data.';
        trendData.value = []; // Clear data on error
    } finally {
        loading.value = false;
    }
};

// --- Chart Data and Options ---
const chartData = computed(() => {
    if (!trendData.value || trendData.value.length === 0) return null;

    const documentStyle = getComputedStyle(document.documentElement);

    return {
        labels: trendData.value.map(item => format(new Date(item.date + 'T00:00:00'), 'eee dd MMM')), // Updated format
        datasets: [
            {
                label: 'Daily Sales',
                data: trendData.value.map(item => item.sales),
                fill: true, // Fill area below line
                borderColor: documentStyle.getPropertyValue('--p-primary-500') || '#34d399', // Use primary color
                tension: 0.4, // Smooth curve
                backgroundColor: hexToRgba(documentStyle.getPropertyValue('--p-primary-500') || '#34d399', 0.1) // Semi-transparent fill
            }
        ]
    };
});

const chartOptions = ref({
    responsive: true,
    maintainAspectRatio: false, // Allow chart to fill container height
    plugins: {
        legend: {
            display: false // Hide legend for a single dataset
        },
        tooltip: {
             callbacks: {
                // Format tooltip title (date)
                title: function(tooltipItems) {
                    const dateStr = trendData.value[tooltipItems[0].dataIndex]?.date;
                    return dateStr ? format(new Date(dateStr + 'T00:00:00'), 'eee, dd MMM yyyy') : '';
                },
                // Format tooltip label (sales value)
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        label += new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(context.parsed.y);
                    }
                    return label;
                }
            }
        },
        datalabels: {
            display: 'auto',
            anchor: 'end',
            align: 'top',
            clamp: true,
            offset: 4,
            color: getComputedStyle(document.documentElement).getPropertyValue('--p-text-muted-color') || '#6c757d',
            font: {
                size: 11,
                weight: 'bold'
            },
            formatter: function(value, context) {
                return new Intl.NumberFormat('en-AU', {
                    style: 'currency',
                    currency: 'AUD',
                    notation: 'compact',
                    maximumFractionDigits: 1
                }).format(value);
            },
        }
    },
    scales: {
        x: {
            title: {
                display: false, // No need for x-axis title 'Date'
                text: 'Date'
            },
            ticks: {
                color: getComputedStyle(document.documentElement).getPropertyValue('--p-text-muted-color') || '#6c757d',
                autoSkip: true, // Automatically skip labels if they overlap
                maxTicksLimit: 10 // Limit the number of ticks shown for readability
            },
            grid: {
                 color: getComputedStyle(document.documentElement).getPropertyValue('--p-surface-border') || '#dee2e6' // Match grid color
            }
        },
        y: {
            title: {
                display: true,
                text: 'Sales (AUD)',
                color: getComputedStyle(document.documentElement).getPropertyValue('--p-text-color') || '#495057'
            },
            ticks: {
                color: getComputedStyle(document.documentElement).getPropertyValue('--p-text-muted-color') || '#6c757d',
                 // Format y-axis ticks as currency
                callback: function(value) {
                    // Show compact notation for larger numbers? e.g., $1k, $10k
                     return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', notation: 'compact', compactDisplay: 'short' }).format(value);
                    // Or full currency:
                    // return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
                }
            },
            grid: {
                 color: getComputedStyle(document.documentElement).getPropertyValue('--p-surface-border') || '#dee2e6'
            }
        }
    }
});

// Utility to convert hex to rgba
function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


// --- Lifecycle and Watchers ---
onMounted(() => {
    fetchSalesTrend(props.selectedStore, props.dateRange, props.selectedRevenueSource);
});

watch(() => [props.selectedStore, props.dateRange, props.selectedRevenueSource], ([newStore, newRange, newSource]) => {
    console.log('SalesTrendWidget: Props changed, refetching data...');
    fetchSalesTrend(newStore, newRange, newSource);
}, { deep: true });

</script>

<template>
    <div class="layout-card widget-sales-trend col-item-2">
        <div class="widget-header">
            <h3 class="widget-title">Sales Trend</h3>
            <!-- Add info/options if needed -->
        </div>
        <div class="widget-content">
            <div v-if="loading" class="loading-indicator">
                 Loading Sales Trend...
                 <!-- Maybe add a spinner later -->
            </div>
            <div v-else-if="error" class="error-message">
                Error loading trend data: {{ errorMessage }}
            </div>
             <div v-else-if="!chartData || chartData.datasets[0].data.length === 0" class="no-data-message">
                No sales data available for the selected period.
             </div>
            <div v-else class="chart-container">
                 <Chart
                     type="line"
                     :data="chartData"
                     :options="chartOptions"
                     :plugins="[ChartDataLabels]"
                     class="chart-canvas"
                 />
            </div>
        </div>
    </div>
</template>

<style scoped>
.widget-sales-trend {
     min-height: 550px; /* Increased min height further */
     display: flex;
     flex-direction: column;
     width: 100%; /* Explicitly set width to 100% */
}

.widget-content {
    flex-grow: 1; /* Allow content to fill space */
    position: relative; /* For positioning chart container */
}

.chart-container {
  position: relative;
  height: 500px; /* Increased chart height further */
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
    min-height: 150px; /* Ensure some height */
    text-align: center;
    color: var(--p-text-muted-color);
}

.error-message {
    color: var(--p-red-500);
}

</style>
