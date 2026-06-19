// Lightweight toast — mirrors the original app's notify().
export function notify(message, type = 'info') {
  document.querySelectorAll('.notification').forEach((n) => n.remove());
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  n.textContent = message;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 3000);
}
