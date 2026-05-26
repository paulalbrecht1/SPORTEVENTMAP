const state = {
  events: [],
  markers: new Map(),

  filters: {
    search: "",
    sport: "All",
    date: "all",
    sort: "default"
  },

  favorites: new Set(),

  selected: null,
  showingFavorites: false,
  userLocation: null
};