(function bootstrapApp() {
  const configScript = document.createElement("script");
  const appScript = document.createElement("script");

  appScript.src = "app.js";
  appScript.defer = true;

  configScript.src = location.protocol === "file:" ? "supabase-config.js" : "/api/config.js";
  configScript.onload = function loadApp() {
    document.body.appendChild(appScript);
  };
  configScript.onerror = function loadAppWithoutConfig() {
    window.RESERVA_VM_SUPABASE = window.RESERVA_VM_SUPABASE || {};
    document.body.appendChild(appScript);
  };

  document.body.appendChild(configScript);
})();
