// Everything you are expected to change before launch lives here.

const REPO = 'https://github.com/elizafirstai/eliza1966';

export const CONFIG = {
  // WebSocket URL of the emulator bridge (bridge/server.js), e.g.
  // 'wss://eliza1966.xyz/ws', or 'same-origin' when the bridge also serves
  // this site (docker compose does). Empty = always the JavaScript port.
  // For testing, ?bridge=ws://localhost:8080/ws in the page URL overrides it.
  bridgeUrl: '',

  // How long to wait for the IBM 7094 to say hello before falling back.
  connectTimeoutMs: 5000,
  replyTimeoutMs: 30000,

  links: {
    source: `${REPO}/blob/main/original/eliza.mad`, // the 1965 MAD-SLIP source in this repo
    github: REPO,
    x: 'https://x.com/eliza1966org',
  },
};

// Token module. $ELIZA1966 lives on Solana. Leave `mint` empty until launch:
// the page then shows "not live yet" and the wallet module has nothing to swap.
export const TOKEN = {
  symbol: '$ELIZA1966',
  chain: 'Solana',
  mint: '5Bx3emSas2W3KtXqSPRtXo4W3vEYC6aHW6EhHdGnpump', // the SPL token mint address (base58), e.g. from pump.fun or Raydium
  dexscreener: (mint) => (mint ? `https://dexscreener.com/solana/${mint}` : 'https://dexscreener.com/solana'),
  swap: (mint) => (mint ? `https://jup.ag/swap/SOL-${mint}` : null),
};

export const isLive = () => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(TOKEN.mint);
export const shortAddr = (a) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
