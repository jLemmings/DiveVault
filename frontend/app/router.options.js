import { APP_ROUTES } from "./routing/routes.js";

const routeShell = () => import("~/shared/components/NuxtRouteShell.vue");

export default {
  routes() {
    return APP_ROUTES.map((route) => ({
      ...route,
      component: routeShell
    }));
  }
};
