import { createRouter, createWebHistory } from 'vue-router'
import ExpenseList from '../views/ExpenseList.vue'
import ExpenseForm from '../views/ExpenseForm.vue'
import BalanceView from '../views/BalanceView.vue'
import Reports from '../views/Reports.vue'
import Settings from '../views/Settings.vue'

const routes = [
  {
    path: '/',
    name: 'ExpenseList',
    component: ExpenseList
  },
  {
    path: '/expense/new',
    name: 'NewExpense',
    component: ExpenseForm
  },
  {
    path: '/expense/edit/:id',
    name: 'EditExpense',
    component: ExpenseForm
  },
  {
    path: '/balance',
    name: 'Balance',
    component: BalanceView
  },
  {
    path: '/reports',
    name: 'Reports',
    component: Reports
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router