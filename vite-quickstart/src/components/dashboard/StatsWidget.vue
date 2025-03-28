<script setup>
import { ref, onMounted, watch } from 'vue';
import { format } from 'date-fns'; // Import date-fns for formatting

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

// Make stats reactive
const stats = ref([
    {
        title: "Total Orders",
        icon: "pi-shopping-cart",
        value: "-", // Default placeholder
        subtitle: "Selected range", // Updated subtitle placeholder
    },
    {
        title: "Active Users",
        icon: "pi-users",
        value: "-", // Default placeholder
         subtitle: "Selected range", // Updated subtitle placeholder
    },
    {
        title: "Revenue",
        icon: "pi-dollar",
        value: "Loading...", // Initial loading state
        subtitle: "Fetching...",
    },
    {
        title: "Success Rate",
        icon: "pi-chart-line",
        value: "-", // Default placeholder
         subtitle: "Selected range", // Updated subtitle placeholder
    },
]);

// Function to format currency
const formatCurrency = (value) => {
    // Use 'AUD' for Australian Dollar
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
};

// Function to format date range for subtitle
const formatDateRangeSubtitle = (range) => {
    if (!range || !range[0] || !range[1]) return 'Invalid range';
    const start = format(range[0], 'dd MMM');
    const end = format(range[1], 'dd MMM yyyy');
    return `${start} - ${end}`;
};

// Function to fetch total revenue, now accepts store, dateRange, and source
const fetchTotalRevenue = async (store, range, source) => {
    const revenueStat = stats.value.find(stat => stat.title === "Revenue");
    if (!revenueStat) return;

    // Check if range is valid before proceeding
    if (!range || range.length !== 2 || !range[0] || !range[1]) {
        console.error("Invalid date range provided to fetchTotalRevenue:", range);
        revenueStat.value = "Error";
        revenueStat.subtitle = "Invalid Date Range";
        // Optionally update other stats to show error/invalid state
        return;
    }

    revenueStat.value = "Loading..."; // Set loading state on fetch
    revenueStat.subtitle = "Fetching...";

    // Format dates for API query (YYYY-MM-DD)
    const startDateFormatted = format(range[0], 'yyyy-MM-dd');
    const endDateFormatted = format(range[1], 'yyyy-MM-dd');

    try {
        // Construct URL with query parameters for store, startDate, endDate, and source
        const apiUrl = `http://localhost:3001/api/total-revenue?store=${encodeURIComponent(store)}&startDate=${startDateFormatted}&endDate=${endDateFormatted}&source=${encodeURIComponent(source)}`;
        console.log('Fetching revenue from:', apiUrl); // Log the full URL
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        revenueStat.value = formatCurrency(data.totalRevenue);
         // Update subtitle to show store and date range
        const storeSubtitle = store === 'All' ? `All stores` : store;
        // Add source to subtitle
        const sourceSubtitle = source === 'All' ? 'All Sources' : source;
        revenueStat.subtitle = `${storeSubtitle}, ${sourceSubtitle}, ${formatDateRangeSubtitle(range)}`;

        // Update other stats' subtitles if needed (assuming they use the same range)
         stats.value.forEach(stat => {
             if (stat.title !== "Revenue") { // Avoid overwriting Revenue subtitle again
                 stat.subtitle = formatDateRangeSubtitle(range);
             }
         });


    } catch (error) {
        console.error("Failed to fetch total revenue:", error);
        revenueStat.value = "Error";
        revenueStat.subtitle = "Failed to load";
         // Update other stats' subtitles on error
        stats.value.forEach(stat => {
            if (stat.title !== "Revenue") {
                stat.subtitle = "Failed to load";
            }
        });
    }
};

// Fetch data when the component is mounted
onMounted(() => {
    // Pass store, initial dateRange, and initial source
    fetchTotalRevenue(props.selectedStore, props.dateRange, props.selectedRevenueSource);
});

// Watch for changes in selectedStore, dateRange, OR selectedRevenueSource prop and re-fetch data
watch(() => [props.selectedStore, props.dateRange, props.selectedRevenueSource], ([newStore, newRange, newSource]) => {
    console.log('StatsWidget: Props changed, refetching revenue for:', newStore, newRange, newSource);
     // Pass store, new dateRange, and new source
    fetchTotalRevenue(newStore, newRange, newSource);
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
            </div>
        </div>
    </div>
</template>
