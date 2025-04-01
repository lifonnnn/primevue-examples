<script setup>
import { ref, onMounted, watch, watchEffect, computed } from 'vue';
import { format } from 'date-fns'; // Import date-fns for formatting
import Chart from 'primevue/chart'; // Import Chart component

// Define props received from App.vue - updated for dateRange
const props = defineProps({
  selectedStore: String,
  dateRange: { // Expect an array [startDate, endDate]
    type: Array,
    required: true,
    // Basic validation: Ensure it's an array of two potentially null dates
    validator: (value) => Array.isArray(value) && value.length === 2
  },
  // Add prop for selected revenue source
  selectedRevenueSource: String
});

// --- Raw Data Refs ---
// Store raw numbers for calculations and breakdowns
const rawRevenueData = ref({
    total: null,
    inStore: null,
    online: null,
    loading: true, // Add loading state
    error: false   // Add error state
});
const rawOrdersData = ref({
    total: null,
    inStore: null,
    online: null,
    loading: true, // Add loading state
    error: false   // Add error state
});

// --- State for ATV Breakdown ---
const inStoreATVText = ref('Calculating...'); // Keep text version for potential display elsewhere if needed
const onlineATVText = ref('Calculating...');
const rawInStoreATV = ref(null);          // Store raw numeric value for chart
const rawOnlineATV = ref(null);           // Store raw numeric value for chart

// Make stats reactive
const stats = ref([
    {
        title: "Revenue",
        icon: "pi-dollar",
        value: "Loading...",
        subtitle: "Fetching...",
    },
    {
        title: "Avg. Transaction Value",
        icon: "pi-calculator",
        value: "Loading...",
        subtitle: "Calculating...",
    },
    {
        title: "Total Orders",
        icon: "pi-shopping-cart",
        value: "Loading...",
        subtitle: "Fetching...",
    },
    // --- Add Placeholder Card --- 
    {
        title: "Placeholder",
        icon: "pi-question-circle",
        value: "N/A",
        subtitle: "Future use",
    }
]);

// Function to format currency
const formatCurrency = (value) => {
    if (typeof value !== 'number') return 'N/A'; // Handle non-numeric input
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
};

// Function to format number (for total orders)
const formatNumber = (value) => {
    if (typeof value !== 'number') return '-'; // Handle non-numeric input
    return new Intl.NumberFormat('en-AU').format(value);
}

// Function to format date range for subtitle
const formatDateRangeSubtitle = (range) => {
    if (!isRangeValid(range)) return 'Invalid range';
    const start = format(range[0], 'dd MMM');
    const end = format(range[1], 'dd MMM yyyy');
    return `${start} - ${end}`;
};

// --- Reusable validation and subtitle logic ---
const isRangeValid = (range) => {
    return range && range.length === 2 && range[0] && range[1];
};

const getBaseSubtitle = (store, source) => {
    // Map store value to display label
    let storeSubtitle = 'All stores'; // Default
    if (store === 'Wagga') {
        storeSubtitle = 'Wagga Wagga';
    } else if (store === 'Preston') {
        storeSubtitle = 'Preston, Melbourne';
    }

    // Map source value to display label
    let sourceSubtitle = 'All Sources'; // Default
    if (source === 'In Store') {
        sourceSubtitle = 'In Store Orders';
    } else if (source === 'Bite') {
        sourceSubtitle = 'Bite Online Orders';
    }

    return `${storeSubtitle}, ${sourceSubtitle}`;
};

// --- Chart Configuration (Main Doughnuts) ---
const chartOptions = ref({
    responsive: true,
    maintainAspectRatio: false, // Adjust if needed for sizing within card
    plugins: {
        legend: {
            // Display legend at the bottom, reduce font size if needed
            position: 'bottom',
            labels: {
                usePointStyle: true,
                 boxWidth: 10, // Smaller legend color box
                 padding: 10 // Padding around legend items
            }
        }
    },
     // Adjust cutout percentage for doughnut thickness
    cutout: '60%'
});

// Computed property for Revenue Chart Data
const revenueChartData = computed(() => {
    const { inStore, online, loading, error } = rawRevenueData.value;

    if (loading || error || typeof inStore !== 'number' || typeof online !== 'number') {
        // Return null or empty state if data not ready or invalid
        return null;
    }

    // Prevent chart rendering if total is zero, or show a specific state?
    // if (inStore === 0 && online === 0) return null;

    return {
        labels: ['In-Store', 'Online'],
        datasets: [
            {
                data: [inStore, online],
                backgroundColor: [
                    document.documentElement.style.getPropertyValue('--p-cyan-500') || '#06b6d4', // Example colors
                    document.documentElement.style.getPropertyValue('--p-orange-500') || '#f97316'
                ],
                 hoverBackgroundColor: [
                    document.documentElement.style.getPropertyValue('--p-cyan-400') || '#22d3ee',
                    document.documentElement.style.getPropertyValue('--p-orange-400') || '#fb923c'
                 ]
            }
        ]
    };
});

// Computed property for Orders Chart Data
const ordersChartData = computed(() => {
    const { inStore, online, loading, error } = rawOrdersData.value;

     if (loading || error || typeof inStore !== 'number' || typeof online !== 'number') {
        return null;
    }

     // if (inStore === 0 && online === 0) return null;

    return {
        labels: ['In-Store', 'Online'],
        datasets: [
            {
                data: [inStore, online],
                 backgroundColor: [
                    document.documentElement.style.getPropertyValue('--p-cyan-500') || '#06b6d4',
                    document.documentElement.style.getPropertyValue('--p-orange-500') || '#f97316'
                 ],
                 hoverBackgroundColor: [
                    document.documentElement.style.getPropertyValue('--p-cyan-400') || '#22d3ee',
                    document.documentElement.style.getPropertyValue('--p-orange-400') || '#fb923c'
                 ]
            }
        ]
    };
});

// --- Function to fetch total revenue ---
const fetchTotalRevenue = async (store, range, source) => {
    const stat = stats.value.find(s => s.title === "Revenue");
    if (!stat) return;

    // Reset raw data state
    rawRevenueData.value = { total: null, inStore: null, online: null, loading: true, error: false };

    if (!isRangeValid(range)) {
        console.error("Invalid date range for fetchTotalRevenue:", range);
        stat.value = "Error";
        stat.subtitle = "Invalid Date Range";
        rawRevenueData.value.loading = false;
        rawRevenueData.value.error = true;
        return;
    }

    stat.value = "Loading...";
    stat.subtitle = "Fetching...";
    const startDateFormatted = format(range[0], 'yyyy-MM-dd');
    const endDateFormatted = format(range[1], 'yyyy-MM-dd');

    try {
        const apiUrl = `${import.meta.env.VITE_API_BASE_URL}/api/total-revenue?store=${encodeURIComponent(store)}&startDate=${startDateFormatted}&endDate=${endDateFormatted}&source=${encodeURIComponent(source)}`;
        console.log('Fetching revenue from:', apiUrl);
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        // Store raw data
        rawRevenueData.value.total = data.totalRevenue;
        rawRevenueData.value.inStore = data.inStoreRevenue;
        rawRevenueData.value.online = data.onlineRevenue;
        rawRevenueData.value.error = false;

        // Update formatted stat card
        stat.value = formatCurrency(data.totalRevenue);
        stat.subtitle = `${getBaseSubtitle(store, source)}, ${formatDateRangeSubtitle(range)}`;
    } catch (error) {
        console.error("Failed to fetch total revenue:", error);
        stat.value = "Error";
        stat.subtitle = "Failed to load";
        rawRevenueData.value.error = true;
    } finally {
         rawRevenueData.value.loading = false;
    }
};

// --- Function to fetch total orders ---
const fetchTotalOrders = async (store, range, source) => {
    const stat = stats.value.find(s => s.title === "Total Orders");
    if (!stat) return;

    // Reset raw data state
    rawOrdersData.value = { total: null, inStore: null, online: null, loading: true, error: false };

    if (!isRangeValid(range)) {
        console.error("Invalid date range for fetchTotalOrders:", range);
        stat.value = "Error";
        stat.subtitle = "Invalid Date Range";
        rawOrdersData.value.loading = false;
        rawOrdersData.value.error = true;
        return;
    }

    stat.value = "Loading...";
    stat.subtitle = "Fetching...";
    const startDateFormatted = format(range[0], 'yyyy-MM-dd');
    const endDateFormatted = format(range[1], 'yyyy-MM-dd');

    try {
        const apiUrl = `${import.meta.env.VITE_API_BASE_URL}/api/total-orders?store=${encodeURIComponent(store)}&startDate=${startDateFormatted}&endDate=${endDateFormatted}&source=${encodeURIComponent(source)}`;
        console.log('Fetching total orders from:', apiUrl);
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        // Store raw data
        rawOrdersData.value.total = data.totalOrders;
        rawOrdersData.value.inStore = data.inStoreOrders;
        rawOrdersData.value.online = data.onlineOrders;
        rawOrdersData.value.error = false;

        // Update formatted stat card
        stat.value = formatNumber(data.totalOrders);
        stat.subtitle = `${getBaseSubtitle(store, source)}, ${formatDateRangeSubtitle(range)}`;
    } catch (error) {
        console.error("Failed to fetch total orders:", error);
        stat.value = "Error";
        stat.subtitle = "Failed to load";
        rawOrdersData.value.error = true;
    } finally {
        rawOrdersData.value.loading = false;
    }
};

// --- ATV Calculation (including raw values) ---
watchEffect(() => {
    const atvStat = stats.value.find(s => s.title === "Avg. Transaction Value");
    if (!atvStat) return;

    const revenueData = rawRevenueData.value;
    const ordersData = rawOrdersData.value;

    // Reset raw ATV values
    rawInStoreATV.value = null;
    rawOnlineATV.value = null;

    // Update subtitle based on overall state
    const dateSubtitle = isRangeValid(props.dateRange) ? formatDateRangeSubtitle(props.dateRange) : 'Invalid Range';
    const baseSub = getBaseSubtitle(props.selectedStore, props.selectedRevenueSource);

    // Determine overall loading/error state for ATV card
    const isLoading = revenueData.loading || ordersData.loading;
    const isError = revenueData.error || ordersData.error || !isRangeValid(props.dateRange);

    if (isLoading) {
        atvStat.value = "Loading...";
        atvStat.subtitle = "Calculating...";
        inStoreATVText.value = "Loading...";
        onlineATVText.value = "Loading...";
    } else if (isError) {
        atvStat.value = "Error";
        atvStat.subtitle = revenueData.error || ordersData.error ? "Failed to load data" : "Invalid Date Range";
        inStoreATVText.value = "Error";
        onlineATVText.value = "Error";
    } else if (typeof revenueData.total === 'number' && typeof ordersData.total === 'number') {
        // Calculate Overall ATV
        atvStat.value = ordersData.total === 0 ? formatCurrency(0) : formatCurrency(revenueData.total / ordersData.total);
        atvStat.subtitle = `${baseSub}, ${dateSubtitle}`;

        // Calculate In-Store ATV (Raw and Text)
        if (typeof revenueData.inStore === 'number' && typeof ordersData.inStore === 'number') {
            rawInStoreATV.value = ordersData.inStore === 0 ? 0 : (revenueData.inStore / ordersData.inStore);
            inStoreATVText.value = formatCurrency(rawInStoreATV.value);
        } else {
             inStoreATVText.value = "N/A"; 
        }

        // Calculate Online ATV (Raw and Text)
        if (typeof revenueData.online === 'number' && typeof ordersData.online === 'number') {
            rawOnlineATV.value = ordersData.online === 0 ? 0 : (revenueData.online / ordersData.online);
            onlineATVText.value = formatCurrency(rawOnlineATV.value);
        } else {
            onlineATVText.value = "N/A";
        }

    } else {
        atvStat.value = "Error"; // Fallback for unexpected data types
        atvStat.subtitle = "Calculation error";
        inStoreATVText.value = "Error";
        onlineATVText.value = "Error";
    }
});

// --- ATV Comparison Chart Data ---
const atvComparisonChartData = computed(() => {
    const inStore = rawInStoreATV.value;
    const online = rawOnlineATV.value;

    // Only return data if both values are valid numbers
    if (typeof inStore !== 'number' || typeof online !== 'number') {
        return null;
    }

    const documentStyle = getComputedStyle(document.documentElement);
    const cyanColor = documentStyle.getPropertyValue('--p-cyan-500') || '#06b6d4';
    const orangeColor = documentStyle.getPropertyValue('--p-orange-500') || '#f97316';

    return {
        labels: ['In-Store', 'Online'],
        datasets: [
            {
                label: 'ATV',
                backgroundColor: [cyanColor, orangeColor],
                data: [inStore, online],
                borderWidth: 0, // No border for cleaner look
                barThickness: 15, // Make bars relatively thin
            }
        ]
    };
});

// --- ATV Comparison Chart Options ---
const atvComparisonChartOptions = ref({
    indexAxis: 'y', // Horizontal bars
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false // No legend needed for 2 bars
        },
        tooltip: {
            callbacks: {
                // Format tooltip label as currency
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.x !== null) {
                        label += formatCurrency(context.parsed.x);
                    }
                    return label;
                }
            }
        }
    },
    scales: {
        x: { // Value axis (now horizontal)
            display: true,
            ticks: {
                display: true,
                 color: 'var(--p-text-color)', // Changed to theme text color
                 font: { size: 10 },
                 // Optional: Format ticks as compact currency
            },
             grid: {
                color: 'var(--p-surface-border)'
            }
        },
        y: { // Category axis (now vertical)
            display: true,
            ticks: {
                display: true,
                 color: 'var(--p-text-color)', // Changed to theme text color
                 font: { size: 10 },
            },
            grid: {
                color: 'transparent' 
            }
        }
    }
});

// --- Update Static Subtitles ---
// Exclude ATV card from generic subtitle updates
const updateStaticSubtitles = (range) => {
     const isValid = isRangeValid(range);
     const dateSubtitle = isValid ? formatDateRangeSubtitle(range) : 'Invalid Date Range';
     stats.value.forEach(stat => {
         // Update subtitles only for stats that don't fetch/calculate their own data/subtitle
         if (stat.title !== "Revenue" && stat.title !== "Total Orders" && stat.title !== "Avg. Transaction Value") {
             stat.subtitle = dateSubtitle;
         }
     });
};

// Fetch data when the component is mounted
onMounted(() => {
    fetchTotalRevenue(props.selectedStore, props.dateRange, props.selectedRevenueSource);
    fetchTotalOrders(props.selectedStore, props.dateRange, props.selectedRevenueSource); // Call fetchTotalOrders
    updateStaticSubtitles(props.dateRange); // Update others
});

// Watch for changes and re-fetch data
watch(() => [props.selectedStore, props.dateRange, props.selectedRevenueSource], ([newStore, newRange, newSource]) => {
    console.log('StatsWidget: Props changed, refetching data for:', newStore, newRange, newSource);
    fetchTotalRevenue(newStore, newRange, newSource);
    fetchTotalOrders(newStore, newRange, newSource); // Call fetchTotalOrders
    updateStaticSubtitles(newRange); // Update others
}, { deep: true });

</script>

<template>
    <div class="stats">
        <div v-for="(stat, index) in stats" :key="index" class="layout-card">
            <div class="stats-header">
                <span class="stats-title">{{ stat.title }}</span>
                <span class="stats-icon-box">
                    <i :class="['pi', stat.icon]"></i>
                </span>
            </div>
            <div class="stats-content">
                <div class="stats-value">{{ stat.value }}</div>

                <!-- Replace ATV Text Breakdown with Chart -->
                <div v-if="stat.title === 'Avg. Transaction Value'" class="atv-chart-container mt-2"> 
                    <div v-if="atvComparisonChartData" class="relative h-16"> <!-- Small fixed height container -->
                        <Chart 
                            type="bar" 
                            :data="atvComparisonChartData" 
                            :options="atvComparisonChartOptions" 
                            class="h-full w-full"
                         />
                    </div>
                    <!-- Optional: Add simple loading/error text if chart data is null/error -->
                     <div v-else-if="rawRevenueData.loading || rawOrdersData.loading" class="text-xs text-center text-muted-color mt-2">Loading comparison...</div>
                     <div v-else-if="rawRevenueData.error || rawOrdersData.error" class="text-xs text-center text-red-500 mt-2">Comparison error</div>
                </div>

                <div class="stats-subtitle mt-1">{{ stat.subtitle }}</div>

                <!-- Revenue Doughnut Chart -->
                <div v-if="stat.title === 'Revenue' && revenueChartData" class="chart-container mt-4">
                     <Chart type="doughnut" :data="revenueChartData" :options="chartOptions" class="chart-canvas" />
                </div>
                 <div v-else-if="stat.title === 'Revenue' && rawRevenueData.loading" class="chart-container mt-4 text-center">Loading Chart...</div>
                 <div v-else-if="stat.title === 'Revenue' && rawRevenueData.error" class="chart-container mt-4 text-center text-red-500">Chart Error</div>

                <!-- Orders Doughnut Chart -->
                 <div v-if="stat.title === 'Total Orders' && ordersChartData" class="chart-container mt-4">
                     <Chart type="doughnut" :data="ordersChartData" :options="chartOptions" class="chart-canvas" />
                 </div>
                 <div v-else-if="stat.title === 'Total Orders' && rawOrdersData.loading" class="chart-container mt-4 text-center">Loading Chart...</div>
                 <div v-else-if="stat.title === 'Total Orders' && rawOrdersData.error" class="chart-container mt-4 text-center text-red-500">Chart Error</div>

            </div>
        </div>
    </div>
</template>

<style scoped>
/* Add some basic styling for the chart container */
.chart-container {
  position: relative;
  /* Adjust height as needed, make sure it fits well within the card */
  height: 150px; /* Example height */
  width: 100%; /* Take full width of the content area */
}

.chart-canvas {
  /* Ensure canvas stretches if needed, but maintainAspectRatio might handle this */
  width: 100% !important;
  height: 100% !important;
}

/* Styles for the small ATV chart container */
.atv-chart-container {
    width: 100%; /* Take full width */
}

/* Ensure canvas fills its container */
.chart-canvas, 
.atv-chart-container .p-chart { /* Target chart component within ATV container */
  width: 100% !important;
  height: 100% !important;
}

/* Optional: Adjust layout-card padding if chart feels cramped */
/* .layout-card {
  padding-bottom: 1.5rem;
} */
</style>
