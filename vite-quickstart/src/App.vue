<script setup>
import { ref } from 'vue';
import AppTopbar from "./components/AppTopbar.vue";
import AppFooter from "./components/AppFooter.vue";
import StatsWidget from "./components/dashboard/StatsWidget.vue";
import SalesTrendWidget from "./components/dashboard/SalesTrendWidget.vue";
import RecentActivityWidget from "./components/dashboard/RecentActivityWidget.vue";
import ProductOverviewWidget from "./components/dashboard/ProductOverviewWidget.vue";

// Shared state for selected store
const selectedStore = ref('All');
const stores = ref(['All', 'Wagga', 'Preston']);

// Shared state for dates - replaced startDate and endDate with dateRange
// Initialize with default: last 7 days
const today = new Date();
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(today.getDate() - 7);
const dateRange = ref([sevenDaysAgo, today]); // Array [startDate, endDate]

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

</script>

<template>
    <div class="layout-container">
        <AppTopbar
            :selectedStore="selectedStore"
            :stores="stores"
            :dateRange="dateRange"
            @update:selectedStore="handleStoreChange"
            @update:dateRange="handleDateRangeChange"
        />
        <div class="layout-grid">
            <StatsWidget 
                :selectedStore="selectedStore"
                :dateRange="dateRange"
            />
            <div class="layout-grid-row">
                <SalesTrendWidget />
                <RecentActivityWidget />
            </div>
            <ProductOverviewWidget />
        </div>
        <AppFooter />
    </div>
</template>
