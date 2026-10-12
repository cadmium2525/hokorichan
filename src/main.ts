import './styles.css';
import { Game } from './game/Game.ts';

const root = document.getElementById('app');
if (root) {
  try {
    new Game(root).start();
  } catch (error) {
    console.error(error);
    root.innerHTML = '<div class="fatal">この端末では表示できませんでした。<br>WebGLに対応したブラウザで開いてください。</div>';
  }
}
