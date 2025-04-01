<script setup>
import { ref, watch, onMounted, computed } from "vue";
import { format } from 'date-fns'; // For formatting dates for the API call
// Tag no longer needed if we stick to basic columns
// import Tag from 'primevue/tag';

// Define props received from parent (e.g., App.vue)
const props = defineProps({
  selectedStore: String,
  dateRange: {
    type: Array,
    required: true,
    validator: (value) => Array.isArray(value) && value.length === 2
  },
  selectedRevenueSource: String,
  limit: { // Limit prop for API call
      type: Number,
      default: 40 // Default to 40 as per requirement
  }
});

// --- State ---
const topProductsData = ref([]);
// REMOVED productNameMap state
const loading = ref(true); // Combined loading state (initially true)
// REMOVED loadingProducts and loadingNames specific states
const error = ref(false);
const errorMessage = ref('');

// --- Helper: Date Range Validation ---
const isRangeValid = (range) => {
    return range && range.length === 2 && range[0] && range[1];
};

// --- Currency Formatter ---
const formatCurrency = (value) => {
    if (typeof value !== 'number') return 'N/A'; // Handle null/undefined/non-numbers
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
};

// --- Fetching Logic for Top Products (Unified) ---
const fetchTopProducts = async (store, range, source, limit) => {
    if (!isRangeValid(range)) {
        console.error("TopProductsWidget: Invalid date range provided.", range);
        error.value = true;
        errorMessage.value = 'Invalid Date Range';
        loading.value = false;
        topProductsData.value = []; // Clear old data
        return;
    }

    loading.value = true; // Set combined loading state
    error.value = false; // Reset error state
    errorMessage.value = '';
    topProductsData.value = []; // Clear previous results

    const startDateFormatted = format(range[0], 'yyyy-MM-dd');
    const endDateFormatted = format(range[1], 'yyyy-MM-dd');

    try {
        // Use the limit prop in the API call
        const apiUrl = `${import.meta.env.VITE_API_BASE_URL}/api/top-products?store=${encodeURIComponent(store)}&startDate=${startDateFormatted}&endDate=${endDateFormatted}&source=${encodeURIComponent(source)}&limit=${limit}`;
        console.log('TopProductsWidget: Fetching top products from:', apiUrl);
        const response = await fetch(apiUrl);

        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: 'Unknown error fetching top products' }));
             throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();
        topProductsData.value = data; // API now returns the final processed list
        console.log(`TopProductsWidget: Received ${data.length} processed top products.`);

    } catch (err) {
        console.error("TopProductsWidget: Failed to fetch top products:", err);
        error.value = true;
        errorMessage.value = err.message || 'Failed to load product data.';
        topProductsData.value = []; // Clear data on error
    } finally {
        loading.value = false; // Clear combined loading state
    }
};

// --- REMOVED fetchProductNames function --- 

// --- Computed property for stable date watching ---
const dateRangeKey = computed(() => {
    if (!isRangeValid(props.dateRange)) {
        return 'invalid';
    }
    // Use timestamps as a stable primitive value for watching
    return `${props.dateRange[0]?.getTime()}|${props.dateRange[1]?.getTime()}`;
});

// --- Lifecycle and Watchers ---
onMounted(() => {
    console.log("TopProductsWidget: Mounted. Initial fetch.");
    fetchTopProducts(props.selectedStore, props.dateRange, props.selectedRevenueSource, props.limit);
});

// Watch primitive values instead of deep watching the date objects
watch(() => [props.selectedStore, dateRangeKey.value, props.selectedRevenueSource, props.limit], ([newStore, newDateKey, newSource, newLimit]) => {
    // The watcher now triggers only when the key changes
    console.log('TopProductsWidget: Watcher triggered (store, dateKey, source, limit), refetching...');
    fetchTopProducts(newStore, props.dateRange, newSource, newLimit);
    // Note: We still pass the original props.dateRange to fetchTopProducts
} /* REMOVED { deep: true } */ );

</script>

<template>
    <div class="layout-card widget-top-products col-item-2">
        <div class="widget-header">
            <span class="widget-title">Top Selling Products (Top {{ props.limit }})</span> <!-- Updated Title -->
        </div>
        <div class="widget-content">
            <div v-if="loading" class="loading-indicator">
                Loading product data...
            </div>
            <div v-else-if="error" class="error-message">
                Error: {{ errorMessage }}
            </div>
            <div v-else-if="!topProductsData || topProductsData.length === 0" class="no-data-message">
                No product data available for the selected period.
            </div>
            <div v-else class="table-container simple-table-wrapper"> <!-- Added wrapper for potential scroll -->
                <table class="simple-table">
                    <thead>
                        <tr>
                            <th>Product Name</th>
                            <th>Source</th>
                            <th>Qty Sold</th>
                            <th>Total Revenue</th>
                            <th>Sale Price</th>
                            <th>Cost Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(product, index) in topProductsData" :key="index">
                            <td>{{ product.name }}</td>
                            <td>{{ product.source }}</td>
                            <td class="text-right">{{ product.quantity }}</td>
                            <td class="text-right">{{ formatCurrency(product.revenue) }}</td>
                            <td class="text-right">{{ formatCurrency(product.salePrice) }}</td>
                            <td class="text-right">{{ formatCurrency(product.costPrice) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Inherits base card styles */

.widget-top-products {
    display: flex;
    flex-direction: column;
    /* min-height: 550px; /* REMOVE min-height */
    height: 600px; /* SET fixed height */
    /* max-height: 600px; */ /* Optional: prevent excessive growth */
    width: 100%;
}

.widget-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem; /* Add slight padding below title */
    border-bottom: 1px solid var(--p-surface-border); /* Separator line */
    flex-shrink: 0; /* Prevent header from shrinking */
}

.widget-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--p-text-color);
}


.widget-content {
    flex-grow: 1; /* Allow content to fill available space */
    /* position: relative; /* Not strictly needed now */
    /* overflow: hidden; /* REMOVE this to allow wrapper scrollbars */
    display: flex;
    flex-direction: column;
    min-height: 0; /* Added to help flex calculations in some cases */
}

.products-table-container {
     flex-grow: 1; /* Allow table container to grow */
     position: relative; /* Needed for flex scroll */
     overflow: hidden; /* Hide overflow */
}

/* Apply styles directly to the DataTable component for scroll */
.products-table.p-datatable-sm {
    /* height: 100%; Causes issues with scrollHeight="flex" */
    /* width: 100%; Ensure it takes full width of parent */
}

/* Make scrollable view take up the container space */
/* :deep(.p-datatable-scrollable-view) { 
    height: 100%;
    display: flex;
    flex-direction: column;
} */ /* REMOVED deep scroll style */
/* :deep(.p-datatable-scrollable-body) {
    flex-grow: 1;
    overflow-y: auto; 
} */ /* REMOVED deep scroll style */


/* Font size styles remain as they were */
.products-table.p-datatable-sm .p-datatable-tbody > tr > td {
    padding: 0.6rem 0.8rem; /* Slightly reduce padding */
     font-size: 0.95rem; /* Slightly smaller font */
     white-space: nowrap; /* Prevent text wrapping */
     overflow: hidden;
     text-overflow: ellipsis; /* Add ellipsis if text overflows */
}
.products-table.p-datatable-sm .p-datatable-thead > tr > th {
     padding: 0.6rem 0.8rem;
     font-size: 0.95rem;
     position: sticky; /* Make header sticky */
     top: 0;
     z-index: 1;
     background-color: var(--p-surface-section); /* Match background */
}

.loading-indicator,
.error-message,
.no-data-message {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%; /* Take full height of content area */
    color: var(--p-text-muted-color);
    font-style: italic;
}

/* Basic Table Styling */
.simple-table-wrapper {
    overflow-x: auto; /* Allow horizontal scrolling if needed */
    overflow-y: auto; /* ADD vertical scroll */
    flex-grow: 1; /* Allow wrapper to grow and fill space */
    height: 0; /* Added to help flexbox determine scroll height within fixed parent */
    /* max-height: 100%; /* Let flexbox handle height */
}

.simple-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.95rem;
    border: 1px solid var(--p-surface-border);
}

.simple-table th,
.simple-table td {
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--p-surface-border);
    text-align: left;
    white-space: nowrap; /* Prevent text wrapping */
    overflow: hidden;
    text-overflow: ellipsis; /* Add ellipsis if text overflows */
    border-right: none; /* Remove right border */
    border-left: none; /* Remove left border */
    border-top: none; /* Remove top border */
}

.simple-table th {
    background-color: var(--p-surface-ground); /* CHANGED to ground (more opaque?) */
    font-weight: 600;
    position: sticky; /* Keep header sticky during vertical scroll */
    top: 0;
    z-index: 1;
    border-bottom: 1px solid var(--p-surface-border); /* Ensure header has bottom border */
}

.simple-table tbody tr {
    border-bottom: 1px solid var(--p-surface-border); /* Add bottom border to each row */
}

.simple-table tbody tr:last-child {
    border-bottom: none; /* Remove border from the very last row */
}

.simple-table tbody tr:nth-child(even) {
    background-color: var(--p-surface-ground); /* Optional: alternating row color */
}

.simple-table tbody tr:hover {
    background-color: var(--p-surface-hover); /* Optional: hover effect */
}

.text-right {
    text-align: right;
}

/* REMOVE products-table-container styles */
/* .products-table-container {
     /* Keep flex-grow */
/*     position: static; /* Reset position */
/*     overflow: visible; /* Reset overflow */
/*} */
</style>
