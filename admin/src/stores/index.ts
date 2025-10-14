import { createPinia } from 'pinia'

export default createPinia()

// Export store composables for easy imports
export { useApplicationManagerStore } from './device-manager'
export { useGlobalStore } from './global-store'
export { useUserStore } from './user-store'
export { useProjectsStore } from './projects'
export { useUsersStore } from './users'
