<template>
  <div class="app-navbar-actions">
    <!-- Devices toggle button -->
    <VaButton
      preset="secondary"
      color="textPrimary"
      class="app-navbar-actions__item flex-shrink-0 mx-0"
      @click="toggleDeviceSidebar"
      aria-label="Toggle devices sidebar"
    >
      <VaIcon size="large" :name="isDeviceSidebarVisible ? 'devices' : 'devices_other'" />
      <span v-if="!isMobile" class="ml-1">Devices</span>
    </VaButton>
    <!-- Support button removed for Iotistic rebranding -->
    <VaButton
      v-if="!isMobile"
      preset="secondary"
      href="#"
      target="_blank"
      color="textPrimary"
      class="app-navbar-actions__item flex-shrink-0 mx-0"
    >
      <VaIcon size="large" class="material-symbols-outlined mr-1">info</VaIcon>
      About Iotistic Admin
    </VaButton>
    <GithubButton v-if="!isMobile" class="app-navbar-actions__item" />
    <NotificationDropdown class="app-navbar-actions__item" />
    <ProfileDropdown class="app-navbar-actions__item app-navbar-actions__item--profile mr-1" />
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { useGlobalStore } from '../../../stores/global-store'
import ProfileDropdown from './dropdowns/ProfileDropdown.vue'
import NotificationDropdown from './dropdowns/NotificationDropdown.vue'
import GithubButton from './GitHubButton.vue'

defineProps({
  isMobile: { type: Boolean, default: false },
})

const globalStore = useGlobalStore()
const { isDeviceSidebarVisible } = storeToRefs(globalStore)

const toggleDeviceSidebar = () => {
  globalStore.toggleDeviceSidebar()
}
</script>

<style lang="scss">
.app-navbar-actions {
  display: flex;
  align-items: center;

  .va-dropdown__anchor {
    color: var(--va-primary);
    fill: var(--va-primary);
  }

  &__item {
    padding: 0;
    margin-left: 0.25rem;
    margin-right: 0.25rem;

    svg {
      height: 20px;
    }

    &--profile {
      display: flex;
      justify-content: center;
    }

    .va-dropdown-content {
      background-color: var(--va-white);
    }

    @media screen and (max-width: 640px) {
      margin-left: 0;
      margin-right: 0;

      &:first-of-type {
        margin-left: 0;
      }
    }
  }

  .fa-github {
    color: var(--va-on-background-primary);
  }
}
</style>
