(function () {
  let data = window.CodexUsageData;
  const statsArea = document.querySelector("#statsArea");
  const heatmap = document.querySelector("#heatmap");
  const monthRow = document.querySelector("#monthRow");
  const quotaList = document.querySelector("#quotaList");
  const updatedAt = document.querySelector("#updatedAt");
  const profileAvatar = document.querySelector(".mini-avatar");
  const profileName = document.querySelector("#profileName");
  const profileMeta = document.querySelector("#profileMeta");
  const refreshButton = document.querySelector("[data-action='refresh']");
  const collapsedSummary = document.querySelector(".collapsed-summary");
  const storageKey = "codex-usage-panel";
  const refreshIntervalMs = 10000;
  const minRefreshFeedbackMs = 650;
  let refreshInFlight = null;
  let lastSyncedAt = null;

  const state = readState();

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || {};
    } catch (_) {
      return {};
    }
  }

  function writeState(next) {
    localStorage.setItem(storageKey, JSON.stringify({ ...state, ...next }));
    Object.assign(state, next);
  }

  function renderStats() {
    const statItem = (item) => `
      <article class="stat-item">
        <div class="stat-value">${item.value}</div>
        <div class="stat-label">${item.label}</div>
      </article>
    `;

    statsArea.innerHTML = `
      <div class="stats-row stats-row-primary">
        ${data.summary.slice(0, 2).map(statItem).join("")}
      </div>
      <div class="stats-row stats-row-secondary">
        ${data.summary.slice(2).map(statItem).join("")}
      </div>
    `;
  }

  function renderProfile() {
    const profile = data.profile || {};
    if (profileName) profileName.textContent = profile.name || "Codex User";
    if (profileAvatar) {
      const avatarUrl = profile.avatarUrl || profile.avatar || "./avatar.svg";
      profileAvatar.alt = profile.name ? `${profile.name} avatar` : "";
      profileAvatar.onerror = () => {
        profileAvatar.onerror = null;
        profileAvatar.src = "./avatar.svg";
      };
      if (profileAvatar.getAttribute("src") !== avatarUrl) profileAvatar.src = avatarUrl;
    }
    if (profileMeta) {
      const meta = [profile.handle || "Local account", profile.plan || "Pro"].filter(Boolean);
      profileMeta.textContent = meta.join(" · ");
    }
  }

  function renderAll() {
    renderProfile();
    renderStats();
    renderCollapsedSummary();
    renderMonths();
    renderQuota();
    renderUpdatedTime();
    applyMode(state.mode || "daily");
  }

  function transformLevel(level, mode, columnIndex) {
    if (mode === "weekly") {
      return Math.min(4, level + (columnIndex > data.activitySeed.length - 7 && level > 0 ? 1 : 0));
    }

    if (mode === "total") {
      const rampStart = Math.max(0, data.activitySeed.length - 9);
      if (columnIndex < rampStart) return 0;
      return Math.min(4, level + Math.max(0, Math.floor((columnIndex - rampStart) / 3)));
    }

    return level;
  }

  function renderHeatmap(mode) {
    const visibleWeeks = data.activitySeed.slice(-(data.activityVisibleWeeks || data.activitySeed.length));
    const offset = data.activitySeed.length - visibleWeeks.length;

    heatmap.innerHTML = visibleWeeks
      .map((week, columnIndex) =>
        week
          .map((level, dayIndex) => {
            const displayLevel = transformLevel(level, mode, offset + columnIndex);
            const label = `第 ${columnIndex + 1} 周，第 ${dayIndex + 1} 天，活跃度 ${displayLevel}`;
            return `<span class="cell" data-level="${displayLevel}" title="${label}"></span>`;
          })
          .join("")
      )
      .join("");
  }

  function renderMonths() {
    const months = data.activityMonths || data.months;
    const maxColumn = (data.activityVisibleWeeks || data.activitySeed.length) - 1;
    monthRow.innerHTML = months
      .map((month) => {
        const left = Math.min(96, (month.at / maxColumn) * 100);
        return `<span class="month" style="left:${left}%">${month.label}</span>`;
      })
      .join("");
  }

  function renderQuota() {
    quotaList.innerHTML = data.quota
      .map((item) => {
        const isReset = item.percent === null;
        const percent = isReset ? 100 : item.percent;
        const meta = isReset ? `${item.count ?? 1} 次可用` : `剩余 ${percent}%`;
        const reset = item.reset ? item.reset : ">";
        const icon = isReset ? "↻" : item.percent;
        const resetLabel = isReset ? "下一次刷新" : reset;
        return `
          <article class="quota-item" data-tone="${item.tone}">
            <div class="quota-icon">${icon}</div>
            <div>
              <div class="quota-copy">
                <p class="quota-label">${item.label}</p>
                <p class="quota-meta">${meta}</p>
              </div>
              <div class="progress-track" aria-hidden="true">
                <span class="progress-fill" style="width:${percent}%"></span>
              </div>
            </div>
            <div class="quota-reset">${resetLabel}</div>
          </article>
        `;
      })
      .join("");
  }

  function renderCollapsedSummary() {
    const totalTokens = data.summary.find((item) => item.label === "累计 Token");
    const currentStreak = data.summary.find((item) => item.label === "当前连续");
    const currentQuota = data.quota.find((item) => item.percent !== null);
    const quotaLabel = currentQuota?.label.replace(/\s+/g, "") || "";
    const quotaText = currentQuota ? `${quotaLabel} ${currentQuota.percent}%` : "";

    collapsedSummary.innerHTML = `
      <span>${totalTokens ? `${totalTokens.value} Token` : ""}</span>
      <span>${currentStreak ? `${currentStreak.value}连续` : ""}</span>
      <span>${quotaText}</span>
    `;
  }

  function renderUpdatedTime() {
    const dataDate = new Date(data.generatedAt);
    const timeText = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(dataDate);
    const dataText = new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(dataDate);

    if (data.source?.type === "codex-app-server") {
      updatedAt.textContent = `同步 ${timeText}`;
      updatedAt.title = `来自 Codex app-server，数据时间 ${dataText}`;
      return;
    }

    if (!lastSyncedAt) {
      updatedAt.textContent = dataText;
      updatedAt.title = `数据时间 ${dataText}`;
      return;
    }

    const syncText = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(lastSyncedAt);
    updatedAt.textContent = `已刷新 ${syncText}`;
    updatedAt.title = `数据时间 ${dataText}`;
  }

  function setRefreshing(isRefreshing) {
    refreshButton?.classList.toggle("is-refreshing", isRefreshing);
    refreshButton?.setAttribute("aria-busy", String(isRefreshing));
    if (refreshButton) refreshButton.disabled = isRefreshing;
  }

  function loadLatestData(options = {}) {
    if (refreshInFlight) return refreshInFlight;

    const visibleFeedback = Boolean(options.visibleFeedback);
    if (visibleFeedback) setRefreshing(true);
    const startedAt = Date.now();

    refreshInFlight = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = `./usage-data.js?ts=${Date.now()}`;
      script.async = true;
      script.dataset.dynamicUsageData = "true";

      const finish = () => {
        const elapsed = Date.now() - startedAt;
        const delay = visibleFeedback ? Math.max(0, minRefreshFeedbackMs - elapsed) : 0;
        window.setTimeout(() => {
          lastSyncedAt = new Date();
          renderUpdatedTime();
          if (visibleFeedback) setRefreshing(false);
          refreshInFlight = null;
          resolve();
        }, delay);
      };

      script.onload = () => {
        if (window.CodexUsageData) {
          data = window.CodexUsageData;
          renderAll();
        }
        document.querySelectorAll("[data-dynamic-usage-data]").forEach((node) => {
          if (node !== script) node.remove();
        });
        finish();
      };

      script.onerror = () => {
        finish();
      };

      document.head.appendChild(script);
    });

    return refreshInFlight;
  }

  function applyMode(mode) {
    renderHeatmap(mode);
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    });
    writeState({ mode });
  }

  function applyCollapsed(collapsed) {
    document.body.classList.toggle("is-collapsed", collapsed);
    document.querySelector("[data-action='toggle']").setAttribute("aria-label", collapsed ? "展开面板" : "折叠面板");
    writeState({ collapsed });
  }

  document.addEventListener("click", (event) => {
    const modeButton = event.target.closest("[data-mode]");
    const refreshDataButton = event.target.closest("[data-action='refresh']");
    const toggleButton = event.target.closest("[data-action='toggle']");

    if (modeButton) applyMode(modeButton.dataset.mode);
    if (refreshDataButton) loadLatestData({ visibleFeedback: true });
    if (toggleButton) applyCollapsed(!document.body.classList.contains("is-collapsed"));
  });

  window.addEventListener("focus", () => loadLatestData());
  setInterval(loadLatestData, refreshIntervalMs);

  renderAll();
  applyCollapsed(Boolean(state.collapsed));
  loadLatestData();
})();
