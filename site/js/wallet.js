// Wallet module for Solana. Separate on purpose: the mint is a placeholder
// until launch. It can connect Phantom (or any wallet that injects the
// standard window.phantom.solana / window.solana provider) and send people to
// Jupiter with the mint filled in. It never signs or sends a transaction.

import { TOKEN, isLive, shortAddr } from './config.js';

let dialog = null;

const provider = () => window.phantom?.solana || window.solflare || window.solana || null;

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'wallet';
  dialog.setAttribute('aria-labelledby', 'wallet-title');
  dialog.innerHTML = `
    <h3 id="wallet-title">buy ${TOKEN.symbol}</h3>
    <dl>
      <dt>chain</dt><dd id="w-chain"></dd>
      <dt>mint</dt><dd id="w-contract"></dd>
      <dt>wallet</dt><dd id="w-account">not connected</dd>
    </dl>
    <div class="actions">
      <button class="btn" type="button" id="w-connect">connect wallet</button>
      <a class="btn" id="w-swap" target="_blank" rel="noopener">swap on Jupiter</a>
      <button class="btn" type="button" id="w-close">close</button>
    </div>
    <p class="msg" id="w-msg" role="status"></p>`;
  document.body.appendChild(dialog);

  const $ = (id) => dialog.querySelector('#' + id);
  const msg = (t) => { $('w-msg').textContent = t; };
  $('w-chain').textContent = TOKEN.chain;
  $('w-contract').textContent = isLive() ? TOKEN.mint : 'not live yet';

  const swap = $('w-swap');
  if (isLive()) swap.href = TOKEN.swap(TOKEN.mint);
  else { swap.removeAttribute('href'); swap.setAttribute('aria-disabled', 'true'); swap.style.opacity = '.4'; }
  swap.addEventListener('click', (e) => { if (!isLive()) { e.preventDefault(); msg('The token is not live yet. Nothing to swap.'); } });

  $('w-close').addEventListener('click', () => dialog.close());
  $('w-connect').addEventListener('click', async () => {
    const p = provider();
    if (!p) { msg('No Solana wallet found on this page. Phantom and Solflare both work.'); return; }
    try {
      const res = await p.connect();
      const key = (res?.publicKey || p.publicKey)?.toString();
      $('w-account').textContent = key ? shortAddr(key) : 'connected';
      msg(isLive() ? 'Connected.' : 'Connected. The token is not live yet.');
    } catch (e) {
      msg(e && e.code === 4001 ? 'Connection cancelled.' : 'The wallet did not connect.');
    }
  });
}

export function openWallet() {
  if (!dialog) build();
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute('open', '');
}
