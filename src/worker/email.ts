import { formatEther, formatUnits } from "viem";
import type { Env } from "./lib/env";
import { getToken } from "./lib/token-info";
import notificationTemplate from "./templates/notification.html?raw";
import signInTemplate from "./templates/sign-in.html?raw";

/** Chain metadata used in emails. */
export const CHAINS: Record<number, { name: string; short: string }> = {
  1: { name: "Ethereum", short: "eth" },
  42161: { name: "Arbitrum", short: "arb" },
  10: { name: "Optimism", short: "op" },
  8453: { name: "Base", short: "base" },
  137: { name: "Polygon", short: "matic" },
  100: { name: "Gnosis", short: "gno" },
  43114: { name: "Avalanche", short: "avax" },
  56: { name: "BNB Smart Chain", short: "bsc" },
  250: { name: "Fantom", short: "ftm" },
  32520: { name: "Brise", short: "brise" },
  11155111: { name: "Sepolia", short: "sepolia" },
  84532: { name: "Base Sepolia", short: "base-sep" },
};

export function chainName(chainId: number): string {
  return CHAINS[chainId]?.name ?? `Chain ${chainId}`;
}

/** Public block-explorer base URL per chain (falls back to a null explorer). */
export const CHAIN_EXPLORER: Record<number, string> = {
  1: "https://etherscan.io",
  42161: "https://arbiscan.io",
  10: "https://optimistic.etherscan.io",
  8453: "https://basescan.org",
  137: "https://polygonscan.com",
  100: "https://gnosisscan.io",
  43114: "https://snowtrace.io",
  56: "https://bscscan.com",
  250: "https://ftmscan.com",
};

/** Link to a transaction on that chain's public explorer, or null. */
export function explorerTxUrl(chainId: number, hash?: string): string | null {
  const base = CHAIN_EXPLORER[chainId];
  if (!base || !hash) return null;
  return `${base}/tx/${hash}`;
}

/** One effect as delivered by wallet-webhooks. `kind` + `direction` are the
 * canonical fields from the scanner; the old `type`/`asset` names are kept for
 * messages that still serialise them. */
export interface EventEffect {
  kind?: "native" | "erc20" | "erc721" | string;
  type?: string;
  direction?: "incoming" | "outgoing" | "self" | string;
  asset?: string;
  assetAddress?: string;
  from?: string;
  to?: string;
  amount?: string;
  tokenId?: string;
  [k: string]: unknown;
}

export interface EventData {
  chainId: number;
  trackedAddress: string;
  initiatedByTrackedAddress: boolean;
  blockNumber: string;
  transaction: {
    hash: string;
    from: string;
    to: string | null;
    status: string;
    value: string;
  };
  effects?: EventEffect[];
}

/** An effect enriched with resolved token/native metadata and a USD value. */
export interface ResolvedEffect extends EventEffect {
  kind: "native" | "erc20" | "erc721";
  direction: "incoming" | "outgoing" | "self";
  symbol?: string; // resolved token symbol
  humanAmount?: string; // resolved token amount, e.g. "5.00"
  usdValue?: number; // resolved USD value, when price known
}

/** A resolved native (mainnet coin) leg derived from tx.value. */
export type ResolvedNative = {
  symbol: string;
  humanAmount: string;
  usdValue?: number;
};

function displayAddress(address: string | null | undefined, len = 4): string {
  if (!address) return "—";
  const a = address.toLowerCase();
  return `${a.slice(0, 2 + len)}…${a.slice(-len)}`;
}

function usd(value: number, digits: 0 | 2 = 2): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Aave-style subject value: "$5" whole dollars, "$0.42" sub-dollar. */
function subjectDollar(value: number): string {
  return usd(value, value >= 1 ? 0 : 2);
}

/** Overall event tense (initiated-by semantics). */
function eventVerb(data: EventData): "received" | "sent" {
  return data.initiatedByTrackedAddress ? "sent" : "received";
}

/** Native leg direction (initiated-by semantics). */
function nativeDirection(data: EventData): "incoming" | "outgoing" {
  return data.initiatedByTrackedAddress ? "outgoing" : "incoming";
}

/** Direction of a single leg relative to the tracked wallet. */
function legVerb(e: ResolvedEffect): "received" | "sent" {
  if (e.direction === "outgoing") return "sent";
  if (e.direction === "incoming") return "received";
  const tracked = e.to?.toLowerCase();
  return tracked ? "received" : "sent";
}

/** Sanitise the raw effect into the canonical (kind, direction, asset) shape. */
function normalize(e: EventEffect): ResolvedEffect {
  const kindRaw = (e.kind ?? e.type ?? "").toLowerCase();
  const directionRaw = (e.direction ?? "").toLowerCase();
  return {
    ...e,
    kind: (kindRaw === "native"
      ? "native"
      : kindRaw === "erc721"
        ? "erc721"
        : kindRaw === "erc20"
          ? "erc20"
          : kindRaw) as ResolvedEffect["kind"],
    direction: (directionRaw === "incoming"
      ? "incoming"
      : directionRaw === "outgoing"
        ? "outgoing"
        : "self") as ResolvedEffect["direction"],
    asset: (e.assetAddress ?? e.asset) as string | undefined,
    assetAddress: (e.assetAddress ?? e.asset) as string | undefined,
  };
}

/** Format a leg's amount+symbol for a line, with USD when known. */
function amountText(e: ResolvedEffect): string {
  if (e.usdValue !== undefined) {
    const qty = `${e.humanAmount ?? e.amount ?? "0"} ${e.symbol ?? (e.kind === "native" ? "ETH" : "token")}`;
    return `${qty} (${usd(e.usdValue)})`;
  }
  if (e.kind === "erc721") return `${e.symbol ?? "NFT"} #${e.tokenId ?? "?"}`;
  const sym = e.symbol ?? (e.kind === "native" ? "ETH" : displayAddress(e.asset));
  return `${e.humanAmount ?? e.amount ?? "0"} ${sym}`;
}

/**
 * Fetch token metadata/prices (via DeFiLlama, cached in D1) and compute the
 * display strings for the event's token/native legs.
 */
export async function enrichEvent(
  env: Env,
  data: EventData,
): Promise<{ effects: ResolvedEffect[]; native?: ResolvedNative }> {
  const chainId = data.chainId;

  const effects: ResolvedEffect[] = [];
  for (const e of data.effects ?? []) {
    const resolved = normalize(e);
    if (resolved.kind === "erc20") {
      const tok = await getToken(env, chainId, resolved.assetAddress ?? null);
      if (tok) {
        const human = Number(formatUnits(BigInt(resolved.amount ?? "0"), tok.decimals));
        resolved.symbol = tok.symbol;
        resolved.humanAmount = human.toLocaleString("en-US", { maximumFractionDigits: 6 });
        resolved.usdValue = human * tok.priceUsd;
      }
    } else if (resolved.kind === "native") {
      const nat = await getToken(env, chainId, null, true);
      const human = Number(formatEther(BigInt(resolved.amount ?? "0")));
      resolved.symbol = nat?.symbol ?? "ETH";
      resolved.humanAmount = human.toLocaleString("en-US", { maximumFractionDigits: 6 });
      resolved.usdValue = nat ? human * nat.priceUsd : undefined;
    }
    effects.push(resolved);
  }

  // tx.value native (EOA-authored sends) — only when the scanner didn't already
  // deliver a native leg, so we never double count.
  let native: ResolvedNative | undefined;
  const rawValue = data.transaction?.value;
  const hasNativeLeg = effects.some((e) => e.kind === "native");
  if (!hasNativeLeg && rawValue && rawValue !== "0") {
    const nat = await getToken(env, chainId, null, true);
    const human = Number(formatEther(BigInt(rawValue)));
    native = {
      symbol: nat?.symbol ?? "ETH",
      humanAmount: human.toLocaleString("en-US", { maximumFractionDigits: 6 }),
      usdValue: nat ? human * nat.priceUsd : undefined,
    };
  }

  return { effects, native };
}

/**
 * Minimum combined USD value the event must carry (across every leg we can
 * price — native, incoming & outgoing ERC-20s) before we email about it.
 * Rejects dust activity: tiny token receipts, unpriced airdrops, micro native
 * value, etc.
 */
const MIN_EVENT_VALUE_USD = 0.5;

/**
 * Decide whether an event warrants an email. We only notify when the event's
 * combined USD value across all priced legs exceeds the threshold. Unpriced
 * legs (e.g. obscure tokens, NFTs) contribute $0 and only matter alongside a
 * leg that actually prices above the bar. Below the threshold — or with no
 * resolvable value at all — there's nothing worth notifying about.
 */
export function shouldNotifyEmail(
  data: EventData,
  resolved?: { effects: ResolvedEffect[]; native?: ResolvedNative },
): boolean {
  const effects = resolved?.effects ?? [];
  const native = resolved?.native;

  if (effects.length === 0 && !native) {
    // Enrichment gave us nothing (e.g. token lookups failed); still notify when
    // the tx demonstrably moved raw native value so real activity isn't lost.
    const rawValue = data.transaction?.value;
    return !!rawValue && rawValue !== "0";
  }

  // Full leg set, mirroring buildNotificationEmail.
  const legs: ResolvedEffect[] = [...effects];
  if (native) {
    legs.push({
      kind: "native",
      direction: nativeDirection(data),
      symbol: native.symbol,
      humanAmount: native.humanAmount,
      usdValue: native.usdValue,
    } as ResolvedEffect);
  }

  // Total value across every priced leg. Unpriced legs contribute 0.
  const totalUsd = legs.reduce((sum, l) => sum + (l.usdValue ?? 0), 0);
  return totalUsd > MIN_EVENT_VALUE_USD;
}

/** Build the "X activity" notification email for a single event. */
export function buildNotificationEmail(params: {
  email: string;
  walletLabel: string | null;
  data: EventData;
  resolved?: { effects: ResolvedEffect[]; native?: ResolvedNative };
  appUrl?: string;
}) {
  const { walletLabel, data, resolved, appUrl } = params;
  const chain = chainName(data.chainId);
  const tx = data.transaction;
  const effects = resolved?.effects ?? [];
  const native = resolved?.native;

  // Subject/heading identify the wallet by its label (or short address).
  const subjWho = walletLabel?.trim() || displayAddress(data.trackedAddress);

  // Assemble the full leg set: enriched effects + any tx.value native.
  const legs: ResolvedEffect[] = [...effects];
  if (native) {
    legs.push({
      kind: "native",
      direction: nativeDirection(data),
      symbol: native.symbol,
      humanAmount: native.humanAmount,
      usdValue: native.usdValue,
    } as ResolvedEffect);
  }

  const incoming = legs.filter((l) => l.direction === "incoming");
  const outgoing = legs.filter((l) => l.direction === "outgoing");
  const priceIn = incoming.filter((l) => l.usdValue !== undefined);
  const priceOut = outgoing.filter((l) => l.usdValue !== undefined);

  const transferLines: string[] = [];
  let subject: string;

  if (priceIn.length > 0 && priceOut.length > 0) {
    // It's an exchange: pair them into a single "swapped" summary.
    const summary = (legs_: ResolvedEffect[]) => {
      const sorted = [...legs_].sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
      const primary = sorted[0];
      let text = `${primary.humanAmount} ${primary.symbol ?? "token"}`;
      if (sorted.length > 1) text += ` (+${sorted.length - 1} more)`;
      return { text, primary };
    };
    const out = summary(priceOut);
    const inn = summary(priceIn);
    transferLines.push(`Swapped ${out.text} for ${inn.text}`);

    const pO = out.primary;
    const pI = inn.primary;
    subject = `${subjWho} swapped ${pO.humanAmount} ${pO.symbol ?? "token"} for ${pI.humanAmount} ${pI.symbol ?? "token"}`;

    // Any non-priced legs (e.g. an NFT also moved) still get their own line.
    const leftover = legs.filter((l) => l.direction !== undefined && l.usdValue === undefined);
    for (const l of leftover) {
      if (l.kind === "native" || l.usdValue !== undefined) continue;
      transferLines.push(`${legVerb(l)} ${amountText(l)}`);
    }
  } else {
    // Individual legs.
    for (const l of legs) {
      if (l.direction === "self") continue;
      transferLines.push(`${legVerb(l)} ${amountText(l)}`);
    }

    const priced = legs.find((l) => l.usdValue !== undefined);
    if (priced && priced.usdValue !== undefined) {
      const sym = priced.symbol ?? (priced.kind === "native" ? "ETH" : "token");
      subject = `${subjWho} ${legVerb(priced)} ${subjectDollar(priced.usdValue)} of ${sym}`;
    } else {
      subject = `Activity ${
        eventVerb(data) === "received" ? "received" : "sent"
      } on ${chain} · ${walletLabel?.trim() ?? displayAddress(data.trackedAddress)}`;
    }
  }

  const description =
    transferLines.length > 0
      ? transferLines.join("\n")
      : `Native value${ethAmountNote(tx.value)} on ${chain}`;

  const text = [
    subject,
    ``,
    description,
    ``,
    `Chain: ${chain}`,
    `From: ${tx.from}`,
    `To: ${tx.to ?? "—"}`,
    `Status: ${statusLabel(tx.status)}`,
    ``,
    `TX: ${tx.hash}`,
    ``,
    `— stupid wallet alerts`,
  ].join("\n");

  const htmlLines = transferLines.map(
    (l) => `<li style="font-size:15px;line-height:1.6;margin:2px 0;">${escapeHtml(l)}</li>`,
  );
  const manageUrl = appUrl?.trim() || "https://wallet-alerts.stupidtech.net";
  const txUrl = explorerTxUrl(data.chainId, tx.hash);
  const hashView = txUrl
    ? `<a href="${escapeHtml(txUrl)}" style="color:#1a0dab;text-decoration:none;">View transaction on the explorer</a>`
    : escapeHtml(tx.hash);
  const html = render(notificationTemplate, {
    account: escapeHtml(subjWho),
    subtitle: `${chain} · ${statusLabel(tx.status)}`,
    lines: htmlLines.join(""),
    hash: hashView,
    tracked: displayAddress(data.trackedAddress),
    manageUrl: escapeHtml(manageUrl),
  });

  return { subject, text, html, description };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

/** Substitute {{key}} placeholders in an HTML template from a variables map. */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

function statusLabel(status: string): string {
  return status === "success" ? "success" : "reverted";
}

function ethAmountNote(value: string): string {
  if (!value || value === "0") return "(zero-value)";
  return formatEther(BigInt(value)) + " ETH";
}

/** Magic link sign-in email. */
export function buildSignInEmail(params: { magicLink: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const { magicLink } = params;
  const subject = "Sign in to stupid wallet alerts";
  const text = [
    "Sign in to stupid wallet alerts",
    "",
    "Use this link to sign in (expires in 30 minutes):",
    magicLink,
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");
  const html = render(signInTemplate, { link: escapeHtml(magicLink) });
  return { subject, text, html };
}

/** Send an email through the Cloudflare Email Service binding. */
export async function sendEmail(
  env: Env,
  to: string,
  message: { subject: string; text: string; html: string },
): Promise<void> {
  await env.EMAIL.send({
    from: { email: env.EMAIL_FROM, name: "stupid wallet alerts" },
    replyTo: "hi@stupidtech.net",
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
