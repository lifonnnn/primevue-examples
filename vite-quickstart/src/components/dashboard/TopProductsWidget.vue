<script setup>
import { ref, watch, onMounted } from "vue";
import { format } from 'date-fns'; // For formatting dates for the API call
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
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
  limit: { // Optional: Allow parent to specify limit
      type: Number,
      default: 10
  }
});

// --- State ---
const topProductsData = ref([]);
const loading = ref(true);
const error = ref(false);
const errorMessage = ref('');

// --- Define Columns Dynamically ---
const columns = ref([
    // { field: 'rank', header: '#', style: 'width: 3rem' }, // REMOVED RANK
    { field: 'product_identifier', header: 'Product' },
    { field: 'final_quantity', header: 'Qty Sold', style: 'width: 6rem' },
    { field: 'final_revenue', header: 'Total Revenue', style: 'width: 10rem' }
]);

// --- Helper: Date Range Validation ---
const isRangeValid = (range) => {
    return range && range.length === 2 && range[0] && range[1];
};

// --- Currency Formatter ---
const formatCurrency = (value) => {
    if (typeof value !== 'number') return 'N/A';
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
};

// --- Fetching Logic ---
const fetchTopProducts = async (store, range, source, limit) => {
    if (!isRangeValid(range)) {
        console.error("TopProductsWidget: Invalid date range provided.", range);
        error.value = true;
        errorMessage.value = 'Invalid Date Range';
        loading.value = false;
        topProductsData.value = []; // Clear old data
        return;
    }

    loading.value = true;
    error.value = false;
    errorMessage.value = '';
    topProductsData.value = []; // Clear previous results

    const startDateFormatted = format(range[0], 'yyyy-MM-dd');
    const endDateFormatted = format(range[1], 'yyyy-MM-dd');

    try {
        const apiUrl = `http://localhost:3001/api/top-products?store=${encodeURIComponent(store)}&startDate=${startDateFormatted}&endDate=${endDateFormatted}&source=${encodeURIComponent(source)}&limit=${limit}`;
        console.log('TopProductsWidget: Fetching data from:', apiUrl);
        const response = await fetch(apiUrl);

        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: 'Unknown error fetching top products' }));
             throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();
        // SIMPLIFIED UPDATE: Assign raw data directly
        topProductsData.value = data;
        console.log(`TopProductsWidget: Received ${data.length} products.`);

    } catch (err) {
        console.error("TopProductsWidget: Failed to fetch top products:", err);
        error.value = true;
        errorMessage.value = err.message || 'Failed to load products.';
        topProductsData.value = []; // Clear data on error
    } finally {
        loading.value = false;
    }
};

// --- Lifecycle and Watchers ---
onMounted(() => {
    fetchTopProducts(props.selectedStore, props.dateRange, props.selectedRevenueSource, props.limit);
});

watch(() => [props.selectedStore, props.dateRange, props.selectedRevenueSource, props.limit], ([newStore, newRange, newSource, newLimit]) => {
    console.log('TopProductsWidget: Props changed, refetching data...');
    fetchTopProducts(newStore, newRange, newSource, newLimit);
}, { deep: true }); // Use deep watch for the dateRange array

</script>

<template>
    <div class="layout-card widget-top-products col-item-2">
        <div class="widget-header">
            <span class="widget-title">Top Selling Products</span>
        </div>
        <div class="widget-content">
            <div v-if="loading" class="loading-indicator">
                Loading top products...
            </div>
            <div v-else-if="error" class="error-message">
                Error: {{ errorMessage }}
            </div>
            <div v-else-if="!topProductsData || topProductsData.length === 0" class="no-data-message">
                No product data available for the selected period.
            </div>
            <div v-else class="products-table-container">
                <DataTable
                    :value="topProductsData"
                    class="products-table p-datatable-sm"
                    tableStyle="min-width: 30rem"
                >
                    <Column v-for="col of columns"
                        :key="col.field"
                        :field="col.field"
                        :header="col.header"
                        :style="col.style">
                        <template v-if="col.field === 'final_revenue'" #body="{ data }">
                             {{ formatCurrency(data[col.field]) }}
                        </template>
                    </Column>
                </DataTable>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Inherits base card styles */

.widget-top-products {
    display: flex;
    flex-direction: column;
    /* Consider setting a min-height or height if needed */
}

.widget-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem; /* Add some space below header */
}

.widget-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--p-text-color);
}


.widget-content {
    flex-grow: 1; /* Allow content to fill space */
    position: relative; /* For loading/error states */
     overflow: hidden; /* Prevent content overflow */
}

.products-table-container {
     overflow-x: auto; /* Allow horizontal scroll if needed on small screens */
}

/* Make table text slightly smaller */
.products-table.p-datatable-sm .p-datatable-tbody > tr > td {
    padding: 0.5rem 0.75rem; /* Adjust padding */
     font-size: 0.875rem; /* Smaller font size */
}
.products-table.p-datatable-sm .p-datatable-thead > tr > th {
     padding: 0.5rem 0.75rem;
     font-size: 0.875rem;
}

.loading-indicator,
.error-message,
.no-data-message {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 150px; /* Ensure some height */
    text-align: center;
    color: var(--p-text-muted-color);
    padding: 1rem;
}

.error-message {
    color: var(--p-red-500);
}

/* Align text in specific columns */
:deep(.text-right) {
    text-align: right;
    justify-content: flex-end; /* For flex layouts within cells if any */
}

/* Ensure text alignment if needed via CSS */
/* Adjust nth-child for removed column */
.products-table .p-datatable-tbody > tr > td:nth-child(2), /* Qty Sold */
.products-table .p-datatable-tbody > tr > td:nth-child(3) { /* Total Revenue */
    text-align: right;
}

</style>
