export type LaunchGateAction = "cancel" | "anyway" | "openLogin" | "retry";

export type LaunchGateState = {
  open: boolean;
  activeUserId: string;
  activeUsername: string;
  activeDisplayName: string;
  playerUserId: string;
  playerUsername: string | null;
  playerDisplayName: string | null;
  resolve: ((action: LaunchGateAction) => void) | null;
};

type Listener = () => void;

let state: LaunchGateState = {
  open: false,
  activeUserId: "",
  activeUsername: "",
  activeDisplayName: "",
  playerUserId: "",
  playerUsername: null,
  playerDisplayName: null,
  resolve: null,
};

const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function getLaunchGateState() {
  return state;
}

export function subscribeLaunchGate(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function promptLaunchGate(input: {
  activeUserId: string;
  activeUsername: string;
  activeDisplayName: string;
  playerUserId: string;
  playerUsername: string | null;
  playerDisplayName: string | null;
}): Promise<LaunchGateAction> {
  return new Promise((resolve) => {
    if (state.resolve) {
      state.resolve("cancel");
    }
    state = {
      open: true,
      ...input,
      resolve,
    };
    emit();
  });
}

export function answerLaunchGate(action: LaunchGateAction) {
  const resolve = state.resolve;
  state = { ...state, open: false, resolve: null };
  emit();
  resolve?.(action);
}

async function resolvePublicUser(userId: string): Promise<{
  username: string | null;
  displayName: string | null;
}> {
  try {
    const res = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`);
    if (!res.ok) return { username: null, displayName: null };
    const data = (await res.json()) as { name?: string; displayName?: string };
    return {
      username: data.name?.trim() || null,
      displayName: data.displayName?.trim() || null,
    };
  } catch {
    return { username: null, displayName: null };
  }
}

/** Returns true when launch should proceed. */
export async function ensureLaunchAccountMatches(): Promise<boolean> {
  const session = (await import("../store")).useAppStore.getState().session;
  if (!session?.authenticated || !session.user?.id) return true;

  const probe = await window.sbDesktop?.getRobloxLoggedInUser?.().catch(() => null);
  const playerUserId = probe?.userId?.trim() || null;
  if (!playerUserId) {
    // Can't verify — don't block (still useful OAuth switching without false positives).
    return true;
  }

  if (playerUserId === session.user.id) return true;

  const publicUser = await resolvePublicUser(playerUserId);
  const action = await promptLaunchGate({
    activeUserId: session.user.id,
    activeUsername: session.user.username,
    activeDisplayName: session.user.displayName,
    playerUserId,
    playerUsername: publicUser.username,
    playerDisplayName: publicUser.displayName,
  });

  if (action === "cancel") return false;
  if (action === "anyway") return true;
  if (action === "openLogin") {
    const loginUrl =
      `https://www.roblox.com/login?returnUrl=${encodeURIComponent("https://www.roblox.com/home")}`;
    await window.sbDesktop?.openExternal(loginUrl);
    return false;
  }
  if (action === "retry") {
    return ensureLaunchAccountMatches();
  }
  return false;
}
