(function bootstrapApp() {
  function loadApp() {
    const appScript = document.createElement("script");
    appScript.src = "app.js";
    appScript.defer = true;
    document.body.appendChild(appScript);
  }

  if (location.protocol === "file:") {
    const configScript = document.createElement("script");
    configScript.src = "supabase-config.js";
    configScript.onload = loadApp;
    configScript.onerror = function loadAppWithoutConfig() {
      window.RESERVA_VM_SUPABASE = window.RESERVA_VM_SUPABASE || {};
      loadApp();
    };
    document.body.appendChild(configScript);
    return;
  }

  fetch("/api/config", { cache: "no-store" })
    .then(function parseConfig(response) {
      if (!response.ok) {
        throw new Error("Configuração não encontrada.");
      }
      return response.json();
    })
    .then(function setConfig(config) {
      window.RESERVA_VM_SUPABASE = config;
    })
    .catch(function useEmptyConfig() {
      window.RESERVA_VM_SUPABASE = {};
    })
    .finally(loadApp);
})();
