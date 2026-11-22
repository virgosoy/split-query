import { APP_VERSION } from './version';

/** 自动检查的最小间隔；手动检查不受限制。 */
const AUTO_CHECK_INTERVAL_MS = 10 * 60_000;
/** 等浏览器完成 SW 字节比对的上限。 */
const UPDATE_CHECK_TIMEOUT_MS = 15_000;
/** 等新 SW 完成安装的上限。 */
const UPDATE_INSTALL_TIMEOUT_MS = 30_000;
/** 等 Service Worker 注册就绪的上限。 */
const REGISTRATION_READY_TIMEOUT_MS = 20_000;
/** installed 之后进入 waiting 的宽限（部分 WebKit 有延迟）。 */
const WAITING_SETTLE_MS = 2_000;
/** 个别 WebKit 不派发 controllerchange 时的兜底重载。 */
const RELOAD_FALLBACK_MS = 5_000;

type UiState =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'offline'
  | 'failed'
  | 'pending'
  | 'applying';

type CheckStatus = 'current' | 'available' | 'offline' | 'failed' | 'pending';

const VIEW: Record<UiState, { status: string; action: string; disabled: boolean }> = {
  idle: { status: '', action: '检查更新', disabled: false },
  checking: { status: '检查中…', action: '检查中…', disabled: true },
  current: { status: '已是最新', action: '检查更新', disabled: false },
  available: { status: '发现新版本', action: '立即更新', disabled: false },
  offline: { status: '当前离线，无法检查', action: '检查更新', disabled: false },
  failed: { status: '检查失败，请稍后再试', action: '检查更新', disabled: false },
  pending: { status: '更新正在下载，请稍后再试', action: '检查更新', disabled: false },
  applying: { status: '更新中…', action: '更新中…', disabled: true },
};

/**
 * 更新提示与手动更新的薄胶水。只在 PROD 调用；dev 下入口保持隐藏。
 * 状态机、超时与 WebKit 兜底的取舍见 docs/adr/0002-prompt-mode-updates.md。
 */
export function initUpdates(app: HTMLElement): void {
  if (!('serviceWorker' in navigator)) return;

  // 标记由 main.ts 的模板提供；与它一样用 `!` 断言，缺失时尽早炸掉而不是静默半残。
  const button = app.querySelector<HTMLButtonElement>('#update-btn')!;
  const dot = app.querySelector<HTMLElement>('#update-dot')!;
  const overlay = app.querySelector<HTMLElement>('#update')!;
  const versionEl = app.querySelector<HTMLElement>('#update-version')!;
  const statusEl = app.querySelector<HTMLElement>('#update-status')!;
  const actionBtn = app.querySelector<HTMLButtonElement>('#update-action')!;
  const closeBtn = app.querySelector<HTMLButtonElement>('#update-close')!;

  let registration: ServiceWorkerRegistration | null = null;
  let watched: ServiceWorkerRegistration | null = null;
  let state: UiState = 'idle';
  let lastAutoCheck = 0;
  let autoInFlight = false;
  let manualInFlight = false;

  button.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', () => {
    overlay.hidden = true;
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.hidden = true;
  });
  actionBtn.addEventListener('click', () => {
    if (state === 'available') void applyUpdate();
    else void manualCheck();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void autoCheck();
  });

  if (document.readyState === 'complete') startRegistration();
  else window.addEventListener('load', startRegistration);

  // 所有监听器就绪后再露出入口，避免第一帧的点击落空。
  button.hidden = false;
  versionEl.textContent = APP_VERSION;

  function startRegistration(): void {
    void navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        registration = reg;
        watch(reg);
        void autoCheck();
      })
      .catch((err) => console.warn('Service Worker 注册失败', err));
  }

  function watch(reg: ServiceWorkerRegistration): void {
    if (watched === reg) return;
    watched = reg;
    if (hasWaitingUpdate(reg)) markAvailable();
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      const check = (): void => {
        if (hasWaitingUpdate(reg)) {
          markAvailable();
          return;
        }
        // statechange 与 registration.waiting 的落地顺序在部分 WebKit 上不同步：
        // 到达 installed 后给 waiting 一个短窗口，抓到就亮圆点。
        if (installing.state === 'installed') {
          void waitForWaiting(reg).then((waiting) => {
            if (waiting) markAvailable();
          });
        }
      };
      installing.addEventListener('statechange', check);
      check();
    });
  }

  function markAvailable(): void {
    syncDot(true);
    if (!overlay.hidden && state !== 'applying') setState('available');
  }

  function syncDot(show: boolean): void {
    dot.hidden = !show;
    button.setAttribute('aria-label', show ? '有新版本，检查更新' : '检查更新');
  }

  function setState(next: UiState): void {
    state = next;
    const view = VIEW[next];
    statusEl.textContent = view.status;
    actionBtn.textContent = view.action;
    actionBtn.disabled = view.disabled;
    if (next === 'available') syncDot(true);
    else if (next === 'current' || next === 'offline' || next === 'failed' || next === 'pending') {
      syncDot(false);
    }
  }

  function openPanel(): void {
    overlay.hidden = false;
    if (hasWaitingUpdate(registration)) {
      markAvailable();
      setState('available');
      return;
    }
    if (!navigator.onLine) {
      setState('offline');
      return;
    }
    void manualCheck();
  }

  async function autoCheck(): Promise<void> {
    if (autoInFlight || !navigator.onLine) return;
    if (hasWaitingUpdate(registration)) {
      markAvailable();
      return;
    }
    const now = Date.now();
    if (now - lastAutoCheck < AUTO_CHECK_INTERVAL_MS) return;
    lastAutoCheck = now;
    autoInFlight = true;
    try {
      const reg = await getRegistration();
      if (!reg) return;
      if (hasWaitingUpdate(reg)) {
        markAvailable();
        return;
      }
      const result = await checkForWaiting(reg);
      if (result === 'available') markAvailable();
    } catch (err) {
      console.warn('自动检查更新失败', err);
    } finally {
      autoInFlight = false;
    }
  }

  async function manualCheck(): Promise<void> {
    if (manualInFlight) return;
    manualInFlight = true;
    setState('checking');
    try {
      const reg = await getRegistration();
      if (!reg) {
        setState('failed');
        return;
      }
      const result = await checkForWaiting(reg);
      applyCheckStatus(result);
    } catch (err) {
      console.warn('检查更新失败', err);
      setState('failed');
    } finally {
      manualInFlight = false;
    }
  }

  function applyCheckStatus(result: CheckStatus): void {
    if (result === 'available') setState('available');
    else if (result === 'offline') setState('offline');
    else if (result === 'pending') setState('pending');
    else if (result === 'failed') setState('failed');
    else setState('current');
  }

  async function applyUpdate(): Promise<void> {
    setState('applying');
    const reg = registration ?? (await getRegistration());
    if (!reg) {
      setState('failed');
      return;
    }
    const result = await checkForWaiting(reg);
    if (result !== 'available') {
      applyCheckStatus(result);
      return;
    }
    const waiting = reg.waiting;
    if (!waiting || !hasWaitingUpdate(reg)) {
      setState('failed');
      return;
    }
    let reloaded = false;
    const reload = (): void => {
      if (reloaded) return;
      reloaded = true;
      window.clearTimeout(fallback);
      window.location.reload();
    };
    const fallback = window.setTimeout(reload, RELOAD_FALLBACK_MS);
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (registration) return registration;
    try {
      const reg = await withTimeout(
        navigator.serviceWorker.ready,
        REGISTRATION_READY_TIMEOUT_MS,
        null,
      );
      if (!reg) return null;
      registration = reg;
      watch(reg);
      return reg;
    } catch {
      return null;
    }
  }

  async function checkForWaiting(reg: ServiceWorkerRegistration): Promise<CheckStatus> {
    if (hasWaitingUpdate(reg)) return 'available';
    if (!navigator.onLine) return 'offline';

    if (!reg.installing) {
      let updateFound = false;
      const onUpdateFound = (): void => {
        updateFound = true;
      };
      reg.addEventListener('updatefound', onUpdateFound);
      try {
        const result = await withTimeout(
          reg.update().then(
            () => 'ok' as const,
            () => 'fail' as const,
          ),
          UPDATE_CHECK_TIMEOUT_MS,
          'timeout' as const,
        );
        if (hasWaitingUpdate(reg)) return 'available';
        if (result === 'fail') return 'failed';
        if (result === 'timeout' && !reg.installing) return 'pending';
        if (!updateFound && !hasWaitingUpdate(reg) && !reg.installing) {
          // 有的 WebKit 先 resolve update()、再派发 updatefound：让事件有机会落地。
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      } finally {
        reg.removeEventListener('updatefound', onUpdateFound);
      }
    }

    if (hasWaitingUpdate(reg)) return 'available';
    const installing = reg.installing;
    if (!installing) return 'current';

    if (!(await waitForInstalled(installing))) {
      if (hasWaitingUpdate(reg)) return 'available';
      return reg.installing ? 'pending' : 'current';
    }
    return (await waitForWaiting(reg)) ? 'available' : reg.installing ? 'pending' : 'current';
  }

  function waitForInstalled(worker: ServiceWorker): Promise<boolean> {
    if (worker.state === 'installed' || worker.state === 'activated') return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(false), UPDATE_INSTALL_TIMEOUT_MS);
      const onChange = (): void => {
        if (worker.state === 'installed' || worker.state === 'activated') {
          window.clearTimeout(timer);
          worker.removeEventListener('statechange', onChange);
          resolve(true);
        } else if (worker.state === 'redundant') {
          window.clearTimeout(timer);
          worker.removeEventListener('statechange', onChange);
          resolve(false);
        }
      };
      worker.addEventListener('statechange', onChange);
    });
  }

  function waitForWaiting(reg: ServiceWorkerRegistration): Promise<boolean> {
    if (hasWaitingUpdate(reg)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const deadline = Date.now() + WAITING_SETTLE_MS;
      const tick = (): void => {
        if (hasWaitingUpdate(reg)) {
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          resolve(false);
          return;
        }
        window.setTimeout(tick, 25);
      };
      tick();
    });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * waiting 只有在已有 active SW 时才算「可接管的更新」。
 * 首次安装时 installed → activating 之间 registration.waiting 可能瞬时非空，
 * 那不是更新，不能亮圆点、也不能显示「发现新版本」。
 */
function hasWaitingUpdate(reg: ServiceWorkerRegistration | null): boolean {
  return !!reg && !!reg.waiting && !!reg.active && reg.waiting !== reg.active;
}
