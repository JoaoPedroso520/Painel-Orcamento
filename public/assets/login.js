const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "/api"
  : "https://painel-orcamento-hm4e.onrender.com/api";

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginCard = document.querySelector(".login-card");
const registerCard = document.querySelector(".register-card");
const registerLink = document.getElementById("registerLink");
const loginLink = document.getElementById("loginLink");
const toast = document.getElementById("toast");
const usernameInput = document.getElementById("username");
const rememberMeInput = document.getElementById("rememberMe");

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
}

function getStoredAuthToken() {
  return localStorage.getItem("authToken") || sessionStorage.getItem("authToken") || "";
}

function persistAuthSession(authToken, provider, rememberMe, username, password) {
  const providerPayload = JSON.stringify(provider || {});
  if (rememberMe) {
    localStorage.setItem("authToken", authToken);
    localStorage.setItem("providerAccount", providerPayload);
    sessionStorage.removeItem("authToken");
    sessionStorage.removeItem("providerAccount");
    localStorage.setItem("rememberMe", "1");
    localStorage.setItem("rememberUsername", username || "");
    localStorage.setItem("rememberPassword", password || "");
    return;
  }

  sessionStorage.setItem("authToken", authToken);
  sessionStorage.setItem("providerAccount", providerPayload);
  localStorage.removeItem("authToken");
  localStorage.removeItem("providerAccount");
  localStorage.setItem("rememberMe", "0");
  localStorage.removeItem("rememberUsername");
  localStorage.removeItem("rememberPassword");
}

function hydrateRememberMe() {
  const remembered = localStorage.getItem("rememberMe") === "1";
  const rememberedUsername = localStorage.getItem("rememberUsername") || "";
  const rememberedPassword = localStorage.getItem("rememberPassword") || "";
  if (rememberMeInput) rememberMeInput.checked = remembered;
  if (usernameInput && remembered && rememberedUsername) usernameInput.value = rememberedUsername;
  const passwordInput = document.getElementById("password");
  if (passwordInput && remembered && rememberedPassword) passwordInput.value = rememberedPassword;
}

function syncPasswordToggle(button) {
  const targetId = button.dataset.target;
  const input = document.getElementById(targetId);
  if (!input) return;
  const isVisible = input.type === "text";
  button.classList.toggle("is-visible", isVisible);
  button.setAttribute("aria-label", isVisible ? "Ocultar senha" : "Mostrar senha");
}

function bindPasswordToggles() {
  document.querySelectorAll(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      syncPasswordToggle(button);
    });
    syncPasswordToggle(button);
  });
}

registerLink?.addEventListener("click", (e) => {
  e.preventDefault();
  loginCard.classList.add("hidden");
  registerCard.classList.remove("hidden");
});

loginLink?.addEventListener("click", (e) => {
  e.preventDefault();
  registerCard.classList.add("hidden");
  loginCard.classList.remove("hidden");
});

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const rememberMe = Boolean(rememberMeInput?.checked);

  if (!username || !password) {
    showToast("Preencha todos os campos");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/provider/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      showToast(data.message || "Erro ao fazer login");
      return;
    }

    persistAuthSession(data.authToken, data.provider, rememberMe, username, password);
    showToast("Login realizado com sucesso!");
    setTimeout(() => {
      window.location.href = "/";
    }, 500);
  } catch (error) {
    console.error(error);
    showToast("Erro ao conectar com o servidor");
  }
});

registerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("regUsername").value.trim();
  const displayName = document.getElementById("regDisplayName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const phone = document.getElementById("regPhone").value.trim();
  const cnpj = document.getElementById("regCnpj").value.trim();
  const address = document.getElementById("regAddress").value.trim();
  const city = document.getElementById("regCity").value.trim();
  const password = document.getElementById("regPassword").value;
  const passwordConfirm = document.getElementById("regPasswordConfirm").value;
  const rememberMe = Boolean(rememberMeInput?.checked);

  if (!username || !displayName || !email || !phone || !cnpj || !address || !city || !password || !passwordConfirm) {
    showToast("Preencha todos os campos");
    return;
  }

  if (password !== passwordConfirm) {
    showToast("As senhas nao coincidem");
    return;
  }

  if (password.length < 6) {
    showToast("A senha deve ter no minimo 6 caracteres");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/provider/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        displayName,
        email,
        phone,
        cnpj,
        address,
        city,
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      showToast(data.message || "Erro ao criar conta");
      return;
    }

    persistAuthSession(data.authToken, data.provider, rememberMe, username, password);
    showToast("Conta criada com sucesso!");
    setTimeout(() => {
      window.location.href = "/";
    }, 500);
  } catch (error) {
    console.error(error);
    showToast("Erro ao conectar com o servidor");
  }
});

if (getStoredAuthToken()) {
  window.location.href = "/";
} else {
  hydrateRememberMe();
  bindPasswordToggles();
}
