// 開発用バッジをクリックしたら案内を見せて薄く消し、5秒後に元へ戻す。
const badge = document.getElementById('development-environment-badge');

if (badge) {
  const originalText = badge.textContent;
  let hiding = false;

  badge.addEventListener('click', () => {
    if (hiding) return;
    hiding = true;
    badge.textContent = '一時的に非表示にします';

    // 案内を読む時間を置いてから、クリックも一時的に無効にする。
    setTimeout(() => {
      badge.style.opacity = '0';
      badge.style.pointerEvents = 'none';
    }, 800);

    // 業務画面と取り違えないよう、非表示のままにせず5秒後には必ず目印を戻す。
    setTimeout(() => {
      badge.textContent = originalText;
      badge.style.opacity = '1';
      badge.style.pointerEvents = '';
      hiding = false;
    }, 5000);
  });
}
