export function settingsContextComputed(keys) {
  return Object.fromEntries(keys.map((key) => [
    key,
    {
      get() {
        return this.settingsContext?.[key];
      },
      set(value) {
        if (this.settingsContext) {
          this.settingsContext[key] = value;
        }
      }
    }
  ]));
}

export function settingsContextMethods(names) {
  return Object.fromEntries(names.map((name) => [
    name,
    function forwardSettingsMethod(...args) {
      const method = this.settingsContext?.[name];
      if (typeof method === "function") {
        return method.apply(this.settingsContext, args);
      }
      return undefined;
    }
  ]));
}
