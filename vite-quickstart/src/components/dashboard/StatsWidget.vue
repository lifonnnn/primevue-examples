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
    const storeSubtitle = store === 'All' ? 'All stores' : store;
    const sourceSubtitle = source === 'All' ? 'All Sources' : source;
    return `${storeSubtitle}, ${sourceSubtitle}`;
};

// --- Chart Configuration ---
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
        const apiUrl = `http://localhost:3001/api/total-revenue?store=${encodeURIComponent(store)}&startDate=${startDateFormatted}&endDate=${endDateFormatted}&source=${encodeURIComponent(source)}`;
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
        const apiUrl = `http://localhost:3001/api/total-orders?store=${encodeURIComponent(store)}&startDate=${startDateFormatted}&endDate=${endDateFormatted}&source=${encodeURIComponent(source)}`;
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

// --- ATV Calculation ---
watchEffect(() => {
    const atvStat = stats.value.find(s => s.title === "Avg. Transaction Value");
    if (!atvStat) return;

    const revenue = rawRevenueData.value.total;
    const orders = rawOrdersData.value.total;
    const revenueLoading = rawRevenueData.value.loading;
    const ordersLoading = rawOrdersData.value.loading;
    const revenueError = rawRevenueData.value.error;
    const ordersError = rawOrdersData.value.error;

    // Update subtitle based on overall state
     const dateSubtitle = isRangeValid(props.dateRange) ? formatDateRangeSubtitle(props.dateRange) : 'Invalid Range';
     const baseSub = getBaseSubtitle(props.selectedStore, props.selectedRevenueSource);

    if (revenueLoading || ordersLoading) {
        atvStat.value = "Loading...";
        atvStat.subtitle = "Calculating...";
    } else if (revenueError || ordersError || !isRangeValid(props.dateRange)) {
        atvStat.value = "Error";
        atvStat.subtitle = revenueError || ordersError ? "Failed to load data" : "Invalid Date Range";
    } else if (typeof revenue === 'number' && typeof orders === 'number') {
        if (orders === 0) {
            atvStat.value = formatCurrency(0); // Or 'N/A' if preferred
        } else {
            atvStat.value = formatCurrency(revenue / orders);
        }
         atvStat.subtitle = `${baseSub}, ${dateSubtitle}`;
    } else {
         atvStat.value = "Error"; // Fallback for unexpected data types
         atvStat.subtitle = "Calculation error";
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
                <div class="stats-subtitle">{{ stat.subtitle }}</div>

                <!-- Add Revenue Chart -->
                <div v-if="stat.title === 'Revenue' && revenueChartData" class="chart-container mt-4">
                     <Chart type="doughnut" :data="revenueChartData" :options="chartOptions" class="chart-canvas" />
                </div>
                 <!-- Add Loader/Error state for Revenue Chart -->
                 <div v-else-if="stat.title === 'Revenue' && rawRevenueData.loading" class="chart-container mt-4 text-center">Loading Chart...</div>
                 <div v-else-if="stat.title === 'Revenue' && rawRevenueData.error" class="chart-container mt-4 text-center text-red-500">Chart Error</div>

                <!-- Add Orders Chart -->
                 <div v-if="stat.title === 'Total Orders' && ordersChartData" class="chart-container mt-4">
                     <Chart type="doughnut" :data="ordersChartData" :options="chartOptions" class="chart-canvas" />
                 </div>
                 <!-- Add Loader/Error state for Orders Chart -->
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

/* Optional: Adjust layout-card padding if chart feels cramped */
/* .layout-card {
  padding-bottom: 1.5rem;
} */
</style>
