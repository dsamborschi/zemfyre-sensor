import { defineStore } from 'pinia'

export const useGlobalStore = defineStore('global', {
  state: () => {
    return {
      isSidebarMinimized: false,
      isDeviceSidebarVisible: true,
    }
  },

  actions: {
    toggleSidebar() {
      this.isSidebarMinimized = !this.isSidebarMinimized
    },
    toggleDeviceSidebar() {
      this.isDeviceSidebarVisible = !this.isDeviceSidebarVisible
    },
  },
})
