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
const productNameMap = ref({}); // <-- Add state for product name map
const loading = ref(true); // Combined loading state (initially true)
const loadingProducts = ref(true); // Specific loading state for products fetch
const loadingNames = ref(true);    // Specific loading state for names fetch
const error = ref(false);
const errorMessage = ref('');

// --- Define Columns Dynamically ---
const columns = ref([
    // { field: 'rank', header: '#', style: 'width: 3rem' }, // REMOVED RANK
    { field: 'product_identifier', header: 'Product' }, // We'll use a template for this
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

// --- Fetching Logic for Top Products Sales Data ---
const fetchTopProducts = async (store, range, source, limit) => {
    if (!isRangeValid(range)) {
        console.error("TopProductsWidget: Invalid date range provided.", range);
        error.value = true;
        errorMessage.value = 'Invalid Date Range';
        loading.value = false;
        topProductsData.value = []; // Clear old data
        return;
    }

    loadingProducts.value = true; // Set specific loading state
    error.value = false; // Reset common error state
    errorMessage.value = '';
    topProductsData.value = []; // Clear previous results

    const startDateFormatted = format(range[0], 'yyyy-MM-dd');
    const endDateFormatted = format(range[1], 'yyyy-MM-dd');

    try {
        const apiUrl = `http://localhost:3001/api/top-products?store=${encodeURIComponent(store)}&startDate=${startDateFormatted}&endDate=${endDateFormatted}&source=${encodeURIComponent(source)}&limit=${limit}`;
        console.log('TopProductsWidget: Fetching sales data from:', apiUrl);
        const response = await fetch(apiUrl);

        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: 'Unknown error fetching top products' }));
             throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();
        topProductsData.value = data;
        console.log(`TopProductsWidget: Received ${data.length} product sales stats.`);

    } catch (err) {
        console.error("TopProductsWidget: Failed to fetch top products sales:", err);
        error.value = true;
        errorMessage.value = err.message || 'Failed to load product sales.';
        topProductsData.value = []; // Clear data on error
    } finally {
        loadingProducts.value = false; // Clear specific loading state
        // Update combined loading state
        loading.value = loadingProducts.value || loadingNames.value;
    }
};

// --- Fetching Logic for Product Names Map ---
const fetchProductNames = async () => {
    loadingNames.value = true;
    error.value = false; // Reset common error state (might be overwritten by other fetch)

    try {
        const apiUrl = `http://localhost:3001/api/products`;
        console.log('TopProductsWidget: Fetching product names map from:', apiUrl);
        const response = await fetch(apiUrl);

        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: 'Unknown error fetching product names' }));
             throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
        }

        productNameMap.value = await response.json(); // Expecting { "id": "Name", ... }
        console.log(`TopProductsWidget: Received product name map with ${Object.keys(productNameMap.value).length} entries.`);

    } catch (err) {
        console.error("TopProductsWidget: Failed to fetch product names map:", err);
        // Set error state, but maybe don't clear sales data?
        error.value = true;
        errorMessage.value = err.message || 'Failed to load product names.';
        productNameMap.value = {}; // Clear map on error
    } finally {
        loadingNames.value = false;
        // Update combined loading state
        loading.value = loadingProducts.value || loadingNames.value;
    }
};

// --- Lifecycle and Watchers ---
onMounted(() => {
    loading.value = true; // Set combined loading true initially
    fetchTopProducts(props.selectedStore, props.dateRange, props.selectedRevenueSource, props.limit);
    fetchProductNames(); // Fetch names map on mount
});

watch(() => [props.selectedStore, props.dateRange, props.selectedRevenueSource, props.limit], ([newStore, newRange, newSource, newLimit], [oldStore, oldRange, oldSource, oldLimit]) => {
    console.log('TopProductsWidget: Props changed, refetching sales data...');
    loading.value = true; // Set combined loading
    fetchTopProducts(newStore, newRange, newSource, newLimit);
    // Optionally refetch names if needed, though usually less frequent
    // if (some_condition_to_refetch_names) { fetchProductNames(); }
    // If names rarely change, fetching only on mount might be sufficient.
    // If store changes might imply different product sets, refetch names:
    if (newStore !== oldStore) {
        console.log('TopProductsWidget: Store changed, refetching product names...');
        fetchProductNames();
    }

}, { deep: true });

</script>

<template>
    <div class="layout-card widget-top-products col-item-2">
        <div class="widget-header">
            <span class="widget-title">Top Selling Products</span>
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
                         <!-- Template for Product Name Lookup -->
                         <template v-if="col.field === 'product_identifier'" #body="{ data }">
                             {{ productNameMap[data.product_identifier] || `ID: ${data.product_identifier}` }}
                        </template>
                        <!-- Template for Currency Formatting -->
                        <template v-else-if="col.field === 'final_revenue'" #body="{ data }">
                             {{ formatCurrency(data[col.field]) }}
                        </template>
                         <!-- Default slot for other columns (like quantity) -->
                         <!-- <template v-else #body="{ data }">
                            {{ data[col.field] }}
                         </template> -->
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
    min-height: 550px; /* Increased minimum height */
    width: 100%; /* Explicitly set width to 100% */
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
    flex-grow: 1; /* Allow content to fill available space */
    position: relative;
    overflow: auto; /* Change from hidden to auto to allow scrolling if content exceeds min-height */
    display: flex; /* Use flex to make child container grow */
    flex-direction: column;
}

.products-table-container {
     flex-grow: 1; /* Allow table container to grow */
     overflow: auto; /* Allow scrolling within the container */
     /* width: 100%; Ensure it takes full width of parent */
}

.products-table.p-datatable-sm {
    /* Ensure table itself can grow vertically if needed, though DataTable might handle this */
    height: 100%; /* Try making table take full height of container */
}

/* Font size styles remain as they were */
.products-table.p-datatable-sm .p-datatable-tbody > tr > td {
    padding: 0.7rem 0.9rem;
     font-size: 1.05rem;
}
.products-table.p-datatable-sm .p-datatable-thead > tr > th {
     padding: 0.7rem 0.9rem;
     font-size: 1.05rem;
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

/* Adjust nth-child for removed column and ensure alignment */
.products-table .p-datatable-tbody > tr > td:nth-child(2), /* Qty Sold */
.products-table .p-datatable-tbody > tr > td:nth-child(3) { /* Total Revenue */
    text-align: right;
}

</style>
