import { afterEach, describe, expect, it } from 'vitest';
import { createLandingEarlyIntentScript } from '../vite/earlyAppEntryBootstrap';
import {
  LANDING_EARLY_ACTIONS,
  LANDING_EARLY_INTENT_KEY,
  LANDING_EARLY_PENDING_ATTRIBUTE,
  takeLandingEarlyIntent,
} from './landingEarlyIntent';

function renderPrerenderedButtons() {
  document.body.innerHTML = `
    <button id="start" data-landing-early-action="${LANDING_EARLY_ACTIONS.heroPrimary}"><span id="label">开始使用</span></button>
    <button id="account" data-landing-early-action="${LANDING_EARLY_ACTIONS.account}">注册/登录</button>
    <button id="dot">轮播</button>`;
  return (id: string) => document.getElementById(id)!;
}

function installRecorder() {
  new Function(createLandingEarlyIntentScript())();
}

afterEach(() => {
  takeLandingEarlyIntent();
  delete (window as unknown as Record<string, unknown>)[LANDING_EARLY_INTENT_KEY];
  document.body.innerHTML = '';
});

describe('官网接管前点击记录', () => {
  it('记下第一次点到的主按钮并置为按下态，取走后不再记录', () => {
    const el = renderPrerenderedButtons();
    installRecorder();

    el('label').click();
    el('account').click();

    expect(el('start').getAttribute(LANDING_EARLY_PENDING_ATTRIBUTE)).toBe('true');
    expect(el('start').getAttribute('aria-busy')).toBe('true');
    expect(el('account').hasAttribute(LANDING_EARLY_PENDING_ATTRIBUTE)).toBe(false);
    expect(takeLandingEarlyIntent()).toEqual({ action: 'primary', source: 'landing_primary' });

    el('account').click();
    expect(takeLandingEarlyIntent()).toBeNull();
    expect(el('account').hasAttribute(LANDING_EARLY_PENDING_ATTRIBUTE)).toBe(false);
  });

  it('只认带标记的主按钮，其他点击不记录', () => {
    const el = renderPrerenderedButtons();
    installRecorder();

    el('dot').click();

    expect(takeLandingEarlyIntent()).toBeNull();
  });

  it('没有记录脚本或记录值不认识时不补执行', () => {
    expect(takeLandingEarlyIntent()).toBeNull();
    for (const value of ['primary:other', 'constructor', '']) {
      (window as unknown as Record<string, unknown>)[LANDING_EARLY_INTENT_KEY] = { take: () => value };
      expect(takeLandingEarlyIntent()).toBeNull();
    }
  });
});
