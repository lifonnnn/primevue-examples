<script setup>
import { ref } from 'vue';
import AppTopbar from "./components/AppTopbar.vue";
import AppFooter from "./components/AppFooter.vue";
import StatsWidget from "./components/dashboard/StatsWidget.vue";
import SalesTrendWidget from "./components/dashboard/SalesTrendWidget.vue";
import TopProductsWidget from "./components/dashboard/TopProductsWidget.vue";
import PeakTimeWidget from "./components/dashboard/PeakTimeWidget.vue";

// Shared state for selected store
const selectedStore = ref('All');
const stores = ref([ 
    { label: 'All Locations', value: 'All' }, 
    { label: 'Wagga Wagga', value: 'Wagga' },
    { label: 'Preston, Melbourne', value: 'Preston' }
]);

// Shared state for dates - replaced startDate and endDate with dateRange
// Initialize with default: last 7 days
const today = new Date();
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(today.getDate() - 7);
const dateRange = ref([sevenDaysAgo, today]); // Array [startDate, endDate]

// Shared state for revenue source
const selectedRevenueSource = ref('All'); // Default to 'All'

// Handler for store change event from Topbar
const handleStoreChange = (newStore) => {
  selectedStore.value = newStore;
  console.log('App.vue: Store changed to:', selectedStore.value);
};

// Handler for date range change - replaces old date handlers
const handleDateRangeChange = (newRange) => {
    dateRange.value = newRange;
    console.log('App.vue: Date range changed to:', dateRange.value);
}

// Handler for revenue source change
const handleRevenueSourceChange = (newSource) => {
    selectedRevenueSource.value = newSource;
    console.log('App.vue: Revenue source changed to:', selectedRevenueSource.value);
}

</script>

<template>
    <div class="layout-container">
        <AppTopbar
            :selectedStore="selectedStore"
            :stores="stores"
            :dateRange="dateRange"
            :selectedRevenueSource="selectedRevenueSource"
            @update:selectedStore="handleStoreChange"
            @update:dateRange="handleDateRangeChange"
            @update:selectedRevenueSource="handleRevenueSourceChange"
        />
        <div class="layout-grid">
            <StatsWidget 
                :selectedStore="selectedStore"
                :dateRange="dateRange"
                :selectedRevenueSource="selectedRevenueSource"
                class="mb-4"
            />
            <SalesTrendWidget
                :selectedStore="selectedStore"
                :dateRange="dateRange"
                :selectedRevenueSource="selectedRevenueSource"
                class="mb-4"
            />
            <TopProductsWidget
                :selectedStore="selectedStore"
                :dateRange="dateRange"
                :selectedRevenueSource="selectedRevenueSource"
                class="mb-4"
            />
            <PeakTimeWidget
                :selectedStore="selectedStore"
                :dateRange="dateRange"
                :selectedRevenueSource="selectedRevenueSource"
                class="mb-4"
            />
        </div>
        <AppFooter />
    </div>
</template>
