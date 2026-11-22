// The four places topside. Settings live under the diver's name, which is the fifth tab on a phone.
export const NAV_ITEMS = [
  { id: "logbook", path: "/", label: "Logbook", views: ["logbook", "dive", "edit", "create"] },
  { id: "imports", path: "/imports", label: "Imports", views: ["imports", "importFile"] },
  { id: "sites", path: "/map", label: "Sites", views: ["sites"] },
  { id: "gear", path: "/equipment", label: "Gear", views: ["gear"] }
];

export const ACCOUNT_VIEWS = ["diver", "application"];
