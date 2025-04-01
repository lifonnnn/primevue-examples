<script setup>
import { useLayout } from "../composables/useLayout";
import AppConfig from "./AppConfig.vue";
import Select from 'primevue/select';
import Calendar from 'primevue/calendar';
// REMOVED: import FloatLabel from 'primevue/floatlabel'; // No longer needed if only using IftaLabel for these inputs
import IftaLabel from 'primevue/iftalabel'; // <-- IMPORT IftaLabel
import Button from 'primevue/button'; // <-- Added import for Button
import { ref, watch } from 'vue';

// Define props received from App.vue
const props = defineProps({
  selectedStore: String,
  stores: Array,
  dateRange: {
    type: Array,
    required: true
  },
  selectedRevenueSource: String
});

// Define emits to notify App.vue of changes
const emit = defineEmits(['update:selectedStore', 'update:dateRange', 'update:selectedRevenueSource']);

// Use a local ref to manage the calendar's model, initialized from the prop
const localDateRange = ref([...props.dateRange]);

// Watch for changes in the prop and update the local ref
watch(() => props.dateRange, (newRange) => {
  localDateRange.value = [...newRange];
});

const { isDarkMode, toggleDarkMode } = useLayout();

// Handle dropdown change and emit event
const onStoreChange = (event) => {
  console.log("Topbar: Store selection changed to:", event.value);
  emit('update:selectedStore', event.value);
};

// Handle revenue source change and emit event
const onRevenueSourceChange = (event) => {
  console.log("Topbar: Revenue source changed to:", event.value);
  emit('update:selectedRevenueSource', event.value);
};

// Handle date range change and emit event
const onDateRangeChange = (newRange) => {
    // Keep existing logic, ensure null/undefined checks are robust if needed
    if (newRange && newRange.length === 2 && newRange[0] && newRange[1]) {
        console.log("Topbar: Date range changed to:", newRange);
        emit('update:dateRange', newRange);
    } else if (newRange === null || (newRange && newRange.length > 0 && newRange[0] === null && (newRange.length === 1 || newRange[1] === null))) {
         // Handle cases where the range is cleared or only one date is selected temporarily
         console.log("Topbar: Date range cleared or incomplete.");
         // Optionally emit null or an empty array if cleared, depending on parent expectation
         if (newRange === null || (newRange.length === 2 && newRange[0] === null && newRange[1] === null)) {
             // emit('update:dateRange', null); // Or an empty array []
         }
    }
    localDateRange.value = newRange; // Always update local state
};

</script>
<template>
    <div class="topbar">
        <div class="topbar-container">
            <div class="topbar-brand">
                <!-- SVG Logo -->
                <svg width="35" height="40" viewBox="0 0 35 40" fill="none" class="w-8" xmlns="http://www.w3.org/2000/svg">
                     <path d="M25.87 18.05L23.16 17.45L25.27 20.46V29.78L32.49 23.76V13.53L29.18 14.73L25.87 18.04V18.05ZM25.27 35.49L29.18 31.58V27.67L25.27 30.98V35.49ZM20.16 17.14H20.03H20.17H20.16ZM30.1 5.19L34.89 4.81L33.08 12.33L24.1 15.67L30.08 5.2L30.1 5.19ZM5.72 14.74L2.41 13.54V23.77L9.63 29.79V20.47L11.74 17.46L9.03 18.06L5.72 14.75V14.74ZM9.63 30.98L5.72 27.67V31.58L9.63 35.49V30.98ZM4.8 5.2L10.78 15.67L1.81 12.33L0 4.81L4.79 5.19L4.8 5.2ZM24.37 21.05V34.59L22.56 37.29L20.46 39.4H14.44L12.34 37.29L10.53 34.59V21.05L12.42 18.23L17.45 26.8L22.48 18.23L24.37 21.05ZM22.85 0L22.57 0.69L17.45 13.08L12.33 0.69L12.05 0H22.85Z" class="fill-primary"/>
                    <path d="M30.69 4.21L24.37 4.81L22.57 0.69L22.86 0H26.48L30.69 4.21ZM23.75 5.67L22.66 3.08L18.05 14.24V17.14H19.7H20.03H20.16H20.2L24.1 15.7L30.11 5.19L23.75 5.67ZM4.21002 4.21L10.53 4.81L12.33 0.69L12.05 0H8.43002L4.22002 4.21H4.21002ZM21.9 17.4L20.6 18.2H14.3L13 17.4L12.4 18.2L12.42 18.23L17.45 26.8L22.48 18.23L22.5 18.2L21.9 17.4ZM4.79002 5.19L10.8 15.7L14.7 17.14H14.74H15.2H16.85V14.24L12.24 3.09L11.15 5.68L4.79002 5.2V5.19Z" class="fill-surface"/>
                </svg>
                <span class="topbar-brand-text">
                    <span class="topbar-title">Habibi Chicken Dashboard</span>
                    <span class="topbar-subtitle">Analytics</span>
                </span>
            </div>


             <!-- Back to original structure, using justify-end and gap -->
             <!-- Adjusted gap to gap-4 for slightly more space -->
            <div class="topbar-actions flex justify-evenly items-center flex-wrap gap-4 w-full">

                <!-- Location Select -->
                <div class="flex items-center"> <!-- Wrapper div for alignment within flex -->
                    <IftaLabel class="w-full md:w-64">
                        <Select
                            inputId="topbar-store-select"
                            :modelValue="props.selectedStore"
                            :options="props.stores"
                            optionLabel="label"
                            optionValue="value"
                            placeholder=" "
                            class="w-full"
                            @change="onStoreChange"
                            variant="filled"
                        />
                        <label for="topbar-store-select">Location</label>
                    </IftaLabel>
                </div>

            <!-- Revenue Source Select -->
            <div class="flex items-center"> <!-- Wrapper div for alignment within flex -->
                <IftaLabel class="w-full md:w-164">
                    <Select
                        inputId="topbar-revenue-select"
                        :modelValue="props.selectedRevenueSource"
                        :options="[
                            { label: 'In Store & Bite', value: 'All' },
                            { label: 'In Store Orders', value: 'In Store' },
                            { label: 'Bite Online Orders', value: 'Bite' }
                        ]"
                        optionLabel="label"
                        optionValue="value"
                        placeholder=" "
                        class="w-full"
                        @change="onRevenueSourceChange"
                        variant="filled"
                    />
                    <label for="topbar-revenue-select">Revenue Source</label>
                </IftaLabel>
            </div>

                <!-- Date Range Calendar -->
                <div class="flex items-center"> <!-- Wrapper div for alignment within flex -->
                    <span class="mr-2 text-sm self-center">Date Range:</span>
                    <Calendar
                        v-model="localDateRange"
                        @update:modelValue="onDateRangeChange"
                        selectionMode="range"
                        dateFormat="yy-mm-dd"
                        placeholder="Select Date Range"
                        showIcon
                        class="w-full md:w-56"
                        :manualInput="false"
                        variant="filled"
                    />
                </div>



                <!-- Theme Button -->
                <Button type="button" class="topbar-theme-button" @click="toggleDarkMode" text rounded>
                    <i :class="['pi ', { 'pi-moon': isDarkMode, 'pi-sun': !isDarkMode }]" />
                </Button>

                <!-- Settings Button -->
                <div class="relative"> <!-- Wrapper div needed for v-styleclass target -->
                    <Button
                        v-styleclass="{
                            selector: '@next',
                            enterFromClass: 'hidden',
                            enterActiveClass: 'animate-scalein',
                            leaveToClass: 'hidden',
                            leaveActiveClass: 'animate-fadeout',
                            hideOnOutsideClick: true,
                        }"
                        icon="pi pi-cog"
                        text
                        rounded
                        aria-label="Settings"
                    />
                    <AppConfig />
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Keep the notch fix CSS */
:deep(.p-iftalabel.p-inputwrapper-filled .p-iftalabel-label) {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
    background-color: var(--surface-card); /* Adjust if needed */
}

/* Keep calendar style */
:deep(.p-calendar .p-inputtext) {
    font-size: 1rem;
     padding-top: 0.75rem;
     padding-bottom: 0.75rem;
}

/* Keep IftaLabel base styles */
:deep(.p-iftalabel) {
    display: block;
}
:deep(.p-iftalabel .p-select) {
    width: 100%;
}

/* Add Media Query for mobile responsiveness */
@media (max-width: 768px) { /* Adjust breakpoint as needed */
  .topbar-container {
    flex-direction: column; /* Stack brand and actions vertically */
    align-items: stretch; /* Make items stretch full width */
  }

  .topbar-brand {
     margin-bottom: 1rem; /* Add space below brand */
     justify-content: center; /* Center brand elements */
   }

  .topbar-actions {
    flex-direction: column; /* Stack action items vertically */
    align-items: stretch; /* Make action items stretch full width */
    gap: 1rem; /* Adjust vertical gap */
    width: 100%; /* Ensure actions container takes full width */
  }

  /* Ensure wrappers inside actions also allow content to stretch */
  .topbar-actions > div {
     width: 100%;
     display: flex; /* Keep flex for internal alignment if needed */
     justify-content: center; /* Center items like buttons */
   }

  /* Adjust width overrides for mobile if needed */
  .topbar-actions .md\:w-64,
  .topbar-actions .md\:w-164, /* Might need a different class if w-164 is used */
  .topbar-actions .md\:w-56 {
     width: 100% !important; /* Override desktop widths */
   }

  /* Ensure Calendar also takes full width */
  .topbar-actions .p-calendar {
     width: 100%;
   }

   /* Center the date range label and calendar */
   .topbar-actions > div:has(.p-calendar) {
     flex-direction: column; /* Stack label and calendar */
     align-items: stretch;
     gap: 0.5rem;
   }

  .topbar-actions > div > span.mr-2 {
      margin-right: 0; /* Remove right margin */
      text-align: center; /* Center the 'Date Range:' text */
   }

   /* Adjust buttons container if needed */
   .topbar-actions > div:has(.topbar-theme-button) {
       justify-content: center; /* Center theme/settings buttons */
       gap: 1rem;
   }
}
</style>